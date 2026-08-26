#!/usr/bin/env bun

/**
 * Benchmark a disposable SQLite projection of a Promptus Markdown store.
 *
 * This is deliberately benchmark-only. Markdown remains authoritative, the live
 * project is never mutated, and SQLite uses the exact existing lexical postings
 * and ranking function rather than substituting FTS ranking.
 */

import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectUnits, type Unit } from "../promptus/scripts/kb-index.ts";
import { parseArtifactSpec } from "../promptus/scripts/lib/artifacts.ts";
import { extractLinks } from "../promptus/scripts/lib/links.ts";
import { createRelationResolver, inverseLifecycleStatus } from "../promptus/scripts/lib/relation-lifecycle.ts";
import {
  buildSearchIndex,
  SEARCH_INDEX_SCHEMA,
  searchIndex,
  searchResultKey,
  searchTokens,
  type SearchDocument,
  type SearchHit,
  type SearchIndex,
  type SearchOptions,
  type SearchSourceDocument,
} from "../promptus/scripts/lib/search.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";
import { ledgerHeads, unitText } from "../promptus/scripts/lib/units.ts";
import { loadVocab, type Vocab } from "../promptus/scripts/lib/vocab.ts";

type Args = Record<string, string | boolean>;

type SourceFileState = {
  path: string;
  bytes: number;
  mtimeNs: string;
  sha256: string;
};

type CanonicalUnitRecord = {
  unitKey: string;
  sourcePath: string;
  substrate: string;
  status: string;
  title: string;
  slug: string | null;
  relPath: string;
  id: string | null;
  cold: boolean;
  aliases: string[];
  links: string[];
  relations: Array<{ type: string; target: string }>;
  artifacts: string[];
  textBytes: number;
  textSha256: string;
};

type ProcessReceipt = {
  elapsedSeconds: number;
  userSeconds: number;
  systemSeconds: number;
  maxRssKiB: number;
  majorFaults: number;
  minorFaults: number;
  fsInputs: number;
  fsOutputs: number;
  exitStatus: number;
  stdoutBytes: number;
  stdoutSha256: string;
};

type BuildReceipt = {
  schema: "promptus.sqlite-shadow-build.v1";
  storeHash: string;
  sourceFiles: number;
  sourceBytes: number;
  units: number;
  liveUnits: number;
  coldUnits: number;
  documents: number;
  postings: number;
  aliases: number;
  links: number;
  relations: number;
  artifacts: number;
  logicalDigest: string;
  manifestDigest: string;
  searchDigest: string;
  currentSearchDigest: string | null;
  exactCurrentSearch: boolean | null;
  databaseBytes: number;
  sqliteVersion: string;
  timingsMs: Record<string, number>;
};

type QueryCase = {
  query: string;
  options: SearchOptions;
};

type QueryComparison = {
  queryHash: string;
  optionsHash: string;
  jsonDigest: string;
  sqliteDigest: string;
  hits: number;
  exact: boolean;
};

type TimingSummary = {
  n: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

const REPO_ROOT = resolve(import.meta.dir, "..");
const SCRIPT_ROOT = join(REPO_ROOT, "promptus", "scripts");
const THIS_FILE = fileURLToPath(import.meta.url);
const PREREGISTRATION = join(REPO_ROOT, "benchmarks", "promptus-sqlite-preregistered.json");
const TIME_MARKER = "__PROMPTUS_SQLITE_TIME__";
const TIME_FORMAT = `${TIME_MARKER} elapsed=%e user=%U system=%S rss=%M major=%F minor=%R inputs=%I outputs=%O exit=%x`;

const HELP = `promptus-sqlite — benchmark-only disposable SQLite projection
usage:
  promptus-sqlite build --root <snapshot> --db <sqlite> [--replace]
  promptus-sqlite query --root <snapshot> --db <sqlite> --query <text>
  promptus-sqlite run --root <verified-snapshot> --work-root <scratch-parent> --output <public-safe.json>

The run command mutates only bounded temporary copies beneath --work-root. Never
point it at a live project: first copy .promptus and verify the canonical store hash.`;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = "help", ...rest] = argv;
  const args: Args = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index++;
    } else args[key] = true;
  }
  return { command, args };
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`--${key} is required`);
  return value;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableObject(item)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableObject(value));
}

function cloneUnit(unit: Unit): Unit {
  return {
    ...unit,
    links: [...unit.links],
    aliases: [...unit.aliases],
    relations: unit.relations.map((relation) => ({ ...relation })),
    artifacts: [...unit.artifacts],
  };
}

/** Apply exactly the inverse-lifecycle projection used by kb-index. */
export function collectProjectedUnits(root: string, vocab: Vocab = loadVocab(root)): Unit[] {
  const units = collectUnits(root, vocab).map(cloneUnit);
  const live = units.filter((unit) => !unit.cold);
  const resolver = createRelationResolver(live);
  for (const unit of live) {
    for (const relation of unit.relations) {
      const target = resolver.resolve(relation.target);
      const status = target ? inverseLifecycleStatus(vocab, relation, target) : undefined;
      if (target && status) target.status = status;
    }
  }
  return units;
}

export function unitKey(unit: Pick<Unit, "id" | "relPath" | "title">): string {
  return searchResultKey({ id: unit.id, path: unit.relPath, title: unit.title });
}

function sourcePathOf(unit: Pick<Unit, "relPath">): string {
  return unit.relPath.split("#", 1)[0];
}

export function canonicalUnitRecord(unit: Unit): CanonicalUnitRecord {
  return {
    unitKey: unitKey(unit),
    sourcePath: sourcePathOf(unit),
    substrate: unit.substrate,
    status: unit.status,
    title: unit.title,
    slug: unit.slug,
    relPath: unit.relPath,
    id: unit.id ?? null,
    cold: unit.cold,
    aliases: [...unit.aliases],
    links: [...unit.links],
    relations: unit.relations.map((relation) => ({ type: relation.type, target: relation.target })),
    artifacts: [...unit.artifacts],
    textBytes: Buffer.byteLength(unit.text),
    textSha256: sha256(unit.text),
  };
}

function digestRecordJson(records: Array<{ key: string; record: string }>): string {
  const hash = createHash("sha256");
  for (const item of [...records].sort((left, right) => binaryCompare(left.key, right.key))) {
    hash.update(item.record);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function logicalUnitDigest(units: Unit[]): string {
  const records = units
    .map((unit) => ({ key: unitKey(unit), record: stableJson(canonicalUnitRecord(unit)) }));
  return digestRecordJson(records);
}

function sourceFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "cache" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFilesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function authoritativeSourcePaths(root: string): string[] {
  const base = join(root, ".promptus");
  return sourceFilesUnder(base).filter((path) => {
    const rel = relative(base, path).replace(/\\/g, "/");
    return rel !== "thinker/INDEX.md" && !/^thinker\/rounds\/[^/]+\/ROUND\.md$/.test(rel);
  }).sort(binaryCompare);
}

function stateForFile(root: string, path: string): SourceFileState {
  const stat = statSync(path, { bigint: true });
  const rel = relative(join(root, ".promptus"), path).replace(/\\/g, "/");
  return {
    path: rel,
    bytes: Number(stat.size),
    mtimeNs: stat.mtimeNs.toString(),
    sha256: sha256(readFileSync(path)),
  };
}

export function sourceFileStates(root: string): SourceFileState[] {
  return authoritativeSourcePaths(root).map((path) => stateForFile(root, path));
}

export function sourceManifestDigest(states: SourceFileState[]): string {
  const hash = createHash("sha256");
  for (const state of [...states].sort((left, right) => binaryCompare(left.path, right.path))) {
    hash.update(state.path);
    hash.update("\0");
    hash.update(String(state.bytes));
    hash.update("\0");
    hash.update(state.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function catalogHash(root: string): string {
  const catalog = readFileSync(join(root, ".promptus", "cache", "CATALOG.md"), "utf8");
  return sha256(catalog);
}

function searchSources(units: Unit[]): SearchSourceDocument[] {
  return units.map((unit) => ({
    substrate: unit.substrate,
    status: unit.status,
    title: unit.title,
    path: unit.relPath,
    text: unit.text,
    ...(unit.id ? { id: unit.id } : {}),
    links: unit.links,
    cold: unit.cold,
  }));
}

function searchDigest(index: SearchIndex): string {
  return sha256(JSON.stringify(index));
}

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE source_files (
      path TEXT PRIMARY KEY,
      bytes INTEGER NOT NULL,
      mtime_ns TEXT NOT NULL,
      sha256 TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE units (
      unit_key TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      substrate TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT,
      rel_path TEXT NOT NULL,
      stable_id TEXT,
      cold INTEGER NOT NULL,
      aliases_json TEXT NOT NULL,
      links_json TEXT NOT NULL,
      relations_json TEXT NOT NULL,
      artifacts_json TEXT NOT NULL,
      text_sha256 TEXT NOT NULL,
      record_json TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE documents (
      doc_id INTEGER PRIMARY KEY,
      document_key TEXT NOT NULL UNIQUE,
      ordinal INTEGER NOT NULL,
      substrate TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT NOT NULL,
      stable_id TEXT,
      links_json TEXT NOT NULL,
      cold INTEGER NOT NULL,
      length INTEGER NOT NULL
    );
    CREATE TABLE terms (
      term_id INTEGER PRIMARY KEY,
      term TEXT NOT NULL UNIQUE
    );
    CREATE TABLE postings (
      term_id INTEGER NOT NULL,
      doc_id INTEGER NOT NULL,
      body_tf INTEGER NOT NULL,
      title_tf INTEGER NOT NULL,
      path_tf INTEGER NOT NULL,
      PRIMARY KEY (term_id, doc_id)
    ) WITHOUT ROWID;
    CREATE TABLE aliases (
      alias TEXT NOT NULL,
      unit_key TEXT NOT NULL,
      PRIMARY KEY (alias, unit_key)
    ) WITHOUT ROWID;
    CREATE TABLE links (
      from_key TEXT NOT NULL,
      target TEXT NOT NULL,
      resolved_key TEXT,
      PRIMARY KEY (from_key, target)
    ) WITHOUT ROWID;
    CREATE TABLE relations (
      from_key TEXT NOT NULL,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      resolved_key TEXT,
      PRIMARY KEY (from_key, type, target)
    ) WITHOUT ROWID;
    CREATE TABLE artifacts (
      owner_key TEXT NOT NULL,
      role TEXT NOT NULL,
      path TEXT NOT NULL,
      sha256 TEXT,
      status TEXT NOT NULL,
      PRIMARY KEY (owner_key, role, path, sha256)
    ) WITHOUT ROWID;
  `);
}

type InsertStatements = ReturnType<typeof insertStatements>;

function insertStatements(db: Database) {
  return {
    meta: db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)"),
    source: db.prepare("INSERT OR REPLACE INTO source_files(path, bytes, mtime_ns, sha256) VALUES (?, ?, ?, ?)"),
    unit: db.prepare(`INSERT OR REPLACE INTO units(
      unit_key, source_path, substrate, status, title, slug, rel_path, stable_id, cold,
      aliases_json, links_json, relations_json, artifacts_json, text_sha256, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    document: db.prepare(`INSERT OR REPLACE INTO documents(
      doc_id, document_key, ordinal, substrate, status, title, path, stable_id, links_json, cold, length
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    term: db.prepare("INSERT OR IGNORE INTO terms(term) VALUES (?)"),
    termId: db.prepare("SELECT term_id AS termId FROM terms WHERE term = ?"),
    posting: db.prepare("INSERT OR REPLACE INTO postings(term_id, doc_id, body_tf, title_tf, path_tf) VALUES (?, ?, ?, ?, ?)"),
    alias: db.prepare("INSERT OR IGNORE INTO aliases(alias, unit_key) VALUES (?, ?)"),
    link: db.prepare("INSERT OR IGNORE INTO links(from_key, target, resolved_key) VALUES (?, ?, ?)"),
    relation: db.prepare("INSERT OR IGNORE INTO relations(from_key, type, target, resolved_key) VALUES (?, ?, ?, ?)"),
    artifact: db.prepare("INSERT OR IGNORE INTO artifacts(owner_key, role, path, sha256, status) VALUES (?, ?, ?, ?, ?)"),
  };
}

function finalizeStatements(statements: InsertStatements): void {
  for (const statement of Object.values(statements)) statement.finalize();
}

function insertUnitFacts(
  statements: InsertStatements,
  unit: Unit,
  resolver?: ReturnType<typeof createRelationResolver<Unit>>,
): { aliases: number; links: number; relations: number; artifacts: number } {
  const key = unitKey(unit);
  const record = canonicalUnitRecord(unit);
  statements.unit.run(
    key,
    record.sourcePath,
    unit.substrate,
    unit.status,
    unit.title,
    unit.slug,
    unit.relPath,
    unit.id ?? null,
    unit.cold ? 1 : 0,
    JSON.stringify(unit.aliases),
    JSON.stringify(unit.links),
    JSON.stringify(unit.relations),
    JSON.stringify(unit.artifacts),
    record.textSha256,
    stableJson(record),
  );
  for (const alias of unit.aliases) statements.alias.run(alias, key);
  for (const target of unit.links) {
    const resolved = resolver?.resolve(target);
    statements.link.run(key, target, resolved ? unitKey(resolved) : null);
  }
  for (const relation of unit.relations) {
    const resolved = resolver?.resolve(relation.target);
    statements.relation.run(key, relation.type, relation.target, resolved ? unitKey(resolved) : null);
  }
  for (const raw of unit.artifacts) {
    const artifact = parseArtifactSpec(raw);
    statements.artifact.run(key, artifact.role, artifact.path, artifact.sha256 ?? null, unit.status);
  }
  return {
    aliases: unit.aliases.length,
    links: unit.links.length,
    relations: unit.relations.length,
    artifacts: unit.artifacts.length,
  };
}

function insertSearchIndex(
  db: Database,
  statements: InsertStatements,
  index: SearchIndex,
  options: {
    ordinalByKey?: Map<string, number>;
    docIdByKey?: Map<string, number>;
  } = {},
): number {
  const existingMaximum = Number((db.query("SELECT COALESCE(MAX(doc_id), 0) AS value FROM documents").get() as { value: number }).value);
  const retainedMaximum = options.docIdByKey?.size ? Math.max(...options.docIdByKey.values()) : 0;
  let nextDocId = Math.max(existingMaximum, retainedMaximum) + 1;
  const docIdByKey = new Map<string, number>();
  for (let ordinal = 0; ordinal < index.documents.length; ordinal++) {
    const document = index.documents[ordinal];
    const docId = options.docIdByKey?.get(document.key) ?? nextDocId++;
    const canonicalOrdinal = options.ordinalByKey?.get(document.key) ?? ordinal;
    docIdByKey.set(document.key, docId);
    statements.document.run(
      docId,
      document.key,
      canonicalOrdinal,
      document.substrate,
      document.status,
      document.title,
      document.path,
      document.id ?? null,
      JSON.stringify(document.links),
      document.cold ? 1 : 0,
      document.length,
    );
  }
  let postings = 0;
  for (const [term, rows] of Object.entries(index.postings)) {
    statements.term.run(term);
    const termId = Number((statements.termId.get(term) as { termId: number }).termId);
    for (const [documentIndex, bodyTf, titleTf, pathTf] of rows) {
      const docId = docIdByKey.get(index.documents[documentIndex].key);
      if (docId === undefined) throw new Error(`missing document id for ${index.documents[documentIndex].key}`);
      statements.posting.run(termId, docId, bodyTf, titleTf, pathTf);
      postings++;
    }
  }
  return postings;
}

function metaSet(db: Database, key: string, value: string | number): void {
  db.run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [key, String(value)]);
}

function metaGet(db: Database, key: string): string {
  const row = db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value?: string } | null;
  if (!row?.value) throw new Error(`SQLite shadow cache is missing meta.${key}`);
  return row.value;
}

export function databaseLogicalDigest(db: Database): string {
  const rows = db.query("SELECT unit_key AS key, record_json AS record FROM units ORDER BY unit_key").all() as Array<{ key: string; record: string }>;
  return digestRecordJson(rows);
}

function databaseManifestDigest(db: Database): string {
  const states = db.query("SELECT path, bytes, mtime_ns AS mtimeNs, sha256 FROM source_files ORDER BY path").all() as SourceFileState[];
  return sourceManifestDigest(states);
}

export function buildShadowDatabase(rootInput: string, dbInput: string, replace = false): BuildReceipt {
  const root = resolve(rootInput);
  const dbPath = resolve(dbInput);
  if (!existsSync(join(root, ".promptus", "TELOS.md"))) throw new Error(`not a Promptus root: ${root}`);
  if (existsSync(dbPath) && !replace) throw new Error(`database exists (pass --replace): ${dbPath}`);
  mkdirSync(dirname(dbPath), { recursive: true });
  const tempPath = `${dbPath}.tmp-${process.pid}-${Date.now()}`;
  if (existsSync(tempPath)) unlinkSync(tempPath);

  const overall = performance.now();
  const collectStarted = performance.now();
  const vocab = loadVocab(root);
  const units = collectProjectedUnits(root, vocab);
  const collectMs = performance.now() - collectStarted;

  const manifestStarted = performance.now();
  const sourceStates = sourceFileStates(root);
  const manifestDigest = sourceManifestDigest(sourceStates);
  const canonicalStore = hashStore(root);
  const manifestMs = performance.now() - manifestStarted;

  const searchStarted = performance.now();
  const currentCatalogHash = catalogHash(root);
  const derivedSearch = buildSearchIndex(searchSources(units), currentCatalogHash);
  const derivedSearchDigest = searchDigest(derivedSearch);
  const currentSearchPath = join(root, ".promptus", "cache", "search.json");
  let currentSearchDigest: string | null = null;
  let exactCurrentSearch: boolean | null = null;
  if (existsSync(currentSearchPath)) {
    const currentSearch = JSON.parse(readFileSync(currentSearchPath, "utf8")) as SearchIndex;
    currentSearchDigest = searchDigest(currentSearch);
    exactCurrentSearch = currentSearchDigest === derivedSearchDigest;
  }
  const searchMs = performance.now() - searchStarted;

  const sqliteStarted = performance.now();
  const db = new Database(tempPath, { create: true, strict: true });
  let statements: InsertStatements | null = null;
  let postingCount = 0;
  let aliasCount = 0;
  let linkCount = 0;
  let relationCount = 0;
  let artifactCount = 0;
  let sqliteVersion = "";
  let logicalDigest = "";
  try {
    try {
      db.exec("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=OFF;");
      createSchema(db);
      statements = insertStatements(db);
      const resolver = createRelationResolver(units.filter((unit) => !unit.cold));
      const transaction = db.transaction(() => {
        for (const state of sourceStates) statements!.source.run(state.path, state.bytes, state.mtimeNs, state.sha256);
        for (const unit of units) {
          const counts = insertUnitFacts(statements!, unit, resolver);
          aliasCount += counts.aliases;
          linkCount += counts.links;
          relationCount += counts.relations;
          artifactCount += counts.artifacts;
        }
        postingCount = insertSearchIndex(db, statements!, derivedSearch);
        const totalLength = derivedSearch.documents.reduce((sum, document) => sum + document.length, 0);
        const digest = logicalUnitDigest(units);
        const metadata: Record<string, string | number> = {
          schema: "promptus.sqlite-shadow.v1",
          canonical_store_hash: canonicalStore.hash,
          source_file_count: sourceStates.length,
          manifest_digest: manifestDigest,
          logical_digest: digest,
          search_digest: derivedSearchDigest,
          catalog_hash: currentCatalogHash,
          document_count: derivedSearch.documents.length,
          total_length: totalLength,
          average_length: derivedSearch.averageLength,
          generation: 0,
        };
        for (const [key, value] of Object.entries(metadata)) statements!.meta.run(key, String(value));
      });
      transaction();
      db.exec(`
        CREATE INDEX units_source_path ON units(source_path);
        CREATE INDEX units_lifecycle ON units(cold, status, substrate);
        CREATE INDEX documents_lifecycle ON documents(cold, status, substrate);
        CREATE INDEX documents_ordinal ON documents(ordinal);
        CREATE INDEX postings_document ON postings(doc_id);
        CREATE INDEX links_target ON links(target);
        CREATE INDEX links_resolved ON links(resolved_key);
        CREATE INDEX relations_target ON relations(target);
        CREATE INDEX relations_resolved ON relations(resolved_key);
        CREATE INDEX artifacts_path ON artifacts(path);
      `);
      const integrity = db.query("PRAGMA integrity_check").get() as { integrity_check?: string };
      if (integrity.integrity_check !== "ok") throw new Error(`SQLite integrity_check: ${stableJson(integrity)}`);
      sqliteVersion = (db.query("SELECT sqlite_version() AS version").get() as { version: string }).version;
      logicalDigest = metaGet(db, "logical_digest");
    } finally {
      if (statements) finalizeStatements(statements);
      db.close(true);
    }
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
  renameSync(tempPath, dbPath);
  const databaseBytes = statSync(dbPath).size;

  return {
    schema: "promptus.sqlite-shadow-build.v1",
    storeHash: canonicalStore.hash,
    sourceFiles: sourceStates.length,
    sourceBytes: sourceStates.reduce((sum, state) => sum + state.bytes, 0),
    units: units.length,
    liveUnits: units.filter((unit) => !unit.cold).length,
    coldUnits: units.filter((unit) => unit.cold).length,
    documents: derivedSearch.documents.length,
    postings: postingCount,
    aliases: aliasCount,
    links: linkCount,
    relations: relationCount,
    artifacts: artifactCount,
    logicalDigest,
    manifestDigest,
    searchDigest: derivedSearchDigest,
    currentSearchDigest,
    exactCurrentSearch,
    databaseBytes,
    sqliteVersion,
    timingsMs: {
      collect: round(collectMs),
      sourceManifestAndCanonicalHash: round(manifestMs),
      exactSearchBuildAndComparison: round(searchMs),
      sqliteLoadAndIntegrity: round(performance.now() - sqliteStarted),
      total: round(performance.now() - overall),
    },
  };
}

export class SqliteSearcher {
  readonly db: Database;
  readonly documents: SearchDocument[];
  readonly documentIndex: Map<string, number>;
  readonly documentIndexById: Map<number, number>;
  readonly averageLength: number;
  readonly catalogHash: string;
  private readonly postings;

  private readonly root: string;

  constructor(root: string, path: string) {
    this.root = root;
    this.db = new Database(path, { readonly: true, strict: true });
    const rows = this.db.query(`SELECT
      doc_id AS docId, document_key AS key, substrate, status, title, path, stable_id AS id,
      links_json AS linksJson, cold, length
      FROM documents ORDER BY ordinal`).all() as Array<{
        docId: number; key: string; substrate: string; status: string; title: string; path: string;
        id: string | null; linksJson: string; cold: number; length: number;
      }>;
    this.documents = rows.map((row) => ({
      key: row.key,
      substrate: row.substrate,
      status: row.status,
      title: row.title,
      path: row.path,
      ...(row.id ? { id: row.id } : {}),
      links: JSON.parse(row.linksJson),
      cold: Boolean(row.cold),
      length: row.length,
    }));
    this.documentIndex = new Map(this.documents.map((document, index) => [document.key, index]));
    this.documentIndexById = new Map(rows.map((row, index) => [row.docId, index]));
    this.averageLength = Number(metaGet(this.db, "average_length"));
    this.catalogHash = metaGet(this.db, "catalog_hash");
    this.postings = this.db.prepare(`SELECT
      p.doc_id AS docId, p.body_tf AS bodyTf, p.title_tf AS titleTf, p.path_tf AS pathTf
      FROM terms t
      JOIN postings p ON p.term_id = t.term_id
      JOIN documents d ON d.doc_id = p.doc_id
      WHERE t.term = ? ORDER BY d.ordinal`);
  }

  search(query: string, options: SearchOptions): SearchHit[] {
    const postings: SearchIndex["postings"] = {};
    for (const term of new Set(searchTokens(query))) {
      const rows = this.postings.all(term) as Array<{ docId: number; bodyTf: number; titleTf: number; pathTf: number }>;
      postings[term] = rows.map((row) => {
        const index = this.documentIndexById.get(row.docId);
        if (index === undefined) throw new Error(`posting names missing document id ${row.docId}`);
        return [index, row.bodyTf, row.titleTf, row.pathTf];
      });
    }
    const index: SearchIndex = {
      schema: SEARCH_INDEX_SCHEMA,
      catalogHash: this.catalogHash,
      averageLength: this.averageLength,
      documents: this.documents,
      postings,
    };
    return searchIndex(index, query, options, (document) => unitText(this.root, document.path, document.title));
  }

  close(): void {
    this.postings.finalize();
    this.db.close(true);
  }
}

function hitDigest(hits: SearchHit[]): string {
  return sha256(JSON.stringify(hits.map((hit) => ({
    key: hit.document.key,
    score: hit.score.toString(),
    matchedTerms: hit.matchedTerms,
  }))));
}

export function queryCases(index: SearchIndex): QueryCase[] {
  const active = index.documents.filter((document) => !document.cold).sort((left, right) => left.key.localeCompare(right.key));
  const phraseCandidates = active
    .map((document) => searchTokens(document.title).filter((term) => term.length >= 4))
    .filter((tokens) => tokens.length >= 2)
    .slice(0, 3)
    .map((tokens) => `"${tokens.slice(0, 2).join(" ")}"`);
  const status = active.find((document) => document.status)?.status;
  const substrate = active.find((document) => document.substrate)?.substrate;
  return [
    { query: "proof validation", options: {} },
    { query: "experiment result", options: {} },
    { query: "conjecture evidence", options: {} },
    { query: "+proof +result", options: {} },
    { query: "proof result", options: { all: true } },
    { query: "failure history", options: { history: true, includeInactive: true } },
    { query: "", options: {} },
    ...(substrate ? [{ query: "evidence", options: { substrate } }] : []),
    ...(status ? [{ query: "result", options: { status } }] : []),
    ...phraseCandidates.map((query) => ({ query, options: {} })),
  ];
}

export function compareQueries(root: string, index: SearchIndex, units: Unit[], dbPath: string): { comparisons: QueryComparison[]; suiteDigest: string } {
  const texts = new Map(units.map((unit) => [unitKey(unit), unit.text]));
  const searcher = new SqliteSearcher(root, dbPath);
  const comparisons: QueryComparison[] = [];
  try {
    for (const item of queryCases(index)) {
      const jsonHits = searchIndex(index, item.query, item.options, (document) => texts.get(document.key) ?? "");
      const sqliteHits = searcher.search(item.query, item.options);
      const jsonDigest = hitDigest(jsonHits);
      const sqliteDigest = hitDigest(sqliteHits);
      comparisons.push({
        queryHash: sha256(item.query),
        optionsHash: sha256(stableJson(item.options)),
        jsonDigest,
        sqliteDigest,
        hits: jsonHits.length,
        exact: jsonDigest === sqliteDigest,
      });
    }
  } finally {
    searcher.close();
  }
  return { comparisons, suiteDigest: sha256(stableJson(comparisons)) };
}

function timingSummary(values: number[]): TimingSummary {
  if (!values.length) throw new Error("timing summary requires values");
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    n: values.length,
    medianMs: round(median),
    p95Ms: round(percentile(0.95)),
    minMs: round(sorted[0]),
    maxMs: round(sorted.at(-1)!),
  };
}

function queryTimings(root: string, dbPath: string, iterations = 20): Record<string, TimingSummary> {
  const searchPath = join(root, ".promptus", "cache", "search.json");
  const parsed = JSON.parse(readFileSync(searchPath, "utf8")) as SearchIndex;
  const units = collectProjectedUnits(root);
  const texts = new Map(units.map((unit) => [unitKey(unit), unit.text]));
  const cases = queryCases(parsed);
  const sqlite = new SqliteSearcher(root, dbPath);
  const persistentJson: number[] = [];
  const persistentSqlite: number[] = [];
  const freshJsonSuite: number[] = [];
  const freshSqliteSuite: number[] = [];
  const freshJsonOneQuery: number[] = [];
  const freshSqliteOneQuery: number[] = [];
  const runJson = (index: SearchIndex) => {
    for (const item of cases) searchIndex(index, item.query, item.options, (document) => texts.get(document.key) ?? "");
  };
  const runSqlite = (searcher: SqliteSearcher) => {
    for (const item of cases) searcher.search(item.query, item.options);
  };
  runJson(parsed);
  runSqlite(sqlite);
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (iteration % 2 === 0) {
      let started = performance.now(); runJson(parsed); persistentJson.push(performance.now() - started);
      started = performance.now(); runSqlite(sqlite); persistentSqlite.push(performance.now() - started);
    } else {
      let started = performance.now(); runSqlite(sqlite); persistentSqlite.push(performance.now() - started);
      started = performance.now(); runJson(parsed); persistentJson.push(performance.now() - started);
    }
  }
  sqlite.close();

  const freshIterations = Math.max(5, Math.ceil(iterations / 2));
  for (let iteration = 0; iteration < freshIterations; iteration++) {
    let started = performance.now();
    const freshIndex = JSON.parse(readFileSync(searchPath, "utf8")) as SearchIndex;
    runJson(freshIndex);
    freshJsonSuite.push(performance.now() - started);

    started = performance.now();
    const freshSearcher = new SqliteSearcher(root, dbPath);
    runSqlite(freshSearcher);
    freshSearcher.close();
    freshSqliteSuite.push(performance.now() - started);
  }
  const oneQueryIterations = 5;
  for (let iteration = 0; iteration < oneQueryIterations; iteration++) {
    for (const item of cases) {
      let started = performance.now();
      const freshIndex = JSON.parse(readFileSync(searchPath, "utf8")) as SearchIndex;
      searchIndex(freshIndex, item.query, item.options, (document) => texts.get(document.key) ?? "");
      freshJsonOneQuery.push(performance.now() - started);

      started = performance.now();
      const freshSearcher = new SqliteSearcher(root, dbPath);
      freshSearcher.search(item.query, item.options);
      freshSearcher.close();
      freshSqliteOneQuery.push(performance.now() - started);
    }
  }
  return {
    persistentJsonSuite: timingSummary(persistentJson),
    persistentSqliteSuite: timingSummary(persistentSqlite),
    freshJsonSuite: timingSummary(freshJsonSuite),
    freshSqliteSuite: timingSummary(freshSqliteSuite),
    freshJsonOneQuery: timingSummary(freshJsonOneQuery),
    freshSqliteOneQuery: timingSummary(freshSqliteOneQuery),
  };
}

function parseTime(stderr: string): Omit<ProcessReceipt, "stdoutBytes" | "stdoutSha256"> {
  const line = stderr.split(/\r?\n/).findLast((item) => item.startsWith(TIME_MARKER));
  if (!line) throw new Error(`missing ${TIME_MARKER} from timed command`);
  const fields = Object.fromEntries(line.slice(TIME_MARKER.length).trim().split(/\s+/).map((field) => {
    const split = field.indexOf("=");
    return [field.slice(0, split), Number(field.slice(split + 1))];
  }));
  return {
    elapsedSeconds: fields.elapsed,
    userSeconds: fields.user,
    systemSeconds: fields.system,
    maxRssKiB: fields.rss,
    majorFaults: fields.major,
    minorFaults: fields.minor,
    fsInputs: fields.inputs,
    fsOutputs: fields.outputs,
    exitStatus: fields.exit,
  };
}

function timedCommand(argv: string[], cwd: string, input?: string): { receipt: ProcessReceipt; stdout: string } {
  const result = spawnSync("/usr/bin/time", ["-f", TIME_FORMAT, ...argv], {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const receipt = {
    ...parseTime(result.stderr ?? ""),
    stdoutBytes: Buffer.byteLength(stdout),
    stdoutSha256: sha256(stdout),
  };
  if (result.status !== 0 || receipt.exitStatus !== 0) {
    throw new Error(`command failed (${argv.slice(0, 3).join(" ")}): ${result.stderr}`);
  }
  return { receipt, stdout };
}

function timedBuild(root: string, dbPath: string): { process: ProcessReceipt; build: BuildReceipt } {
  const result = timedCommand(["bun", THIS_FILE, "build", "--root", root, "--db", dbPath, "--replace"], REPO_ROOT);
  return { process: result.receipt, build: JSON.parse(result.stdout) as BuildReceipt };
}

function cacheBytes(root: string): Record<string, number> {
  const dir = join(root, ".promptus", "cache");
  const result: Record<string, number> = {};
  for (const name of ["CATALOG.md", "graph.json", "search.json"]) {
    const path = join(dir, name);
    result[name] = existsSync(path) ? statSync(path).size : 0;
  }
  result.total = Object.values(result).reduce((sum, value) => sum + value, 0);
  return result;
}

function currentSearch(root: string): SearchIndex {
  return JSON.parse(readFileSync(join(root, ".promptus", "cache", "search.json"), "utf8")) as SearchIndex;
}

function singleSourceState(root: string, sourcePath: string): SourceFileState {
  return stateForFile(root, join(root, ".promptus", sourcePath.replace(/^\.promptus\//, "")));
}

function updateDatabaseMetadata(db: Database, sourceState?: SourceFileState): void {
  if (sourceState) {
    db.run(
      "INSERT OR REPLACE INTO source_files(path, bytes, mtime_ns, sha256) VALUES (?, ?, ?, ?)",
      [sourceState.path, sourceState.bytes, sourceState.mtimeNs, sourceState.sha256],
    );
  }
  const totals = db.query("SELECT COUNT(*) AS count, COALESCE(SUM(length), 0) AS total FROM documents").get() as { count: number; total: number };
  metaSet(db, "document_count", totals.count);
  metaSet(db, "total_length", totals.total);
  metaSet(db, "average_length", totals.count ? totals.total / totals.count : 1);
  metaSet(db, "logical_digest", databaseLogicalDigest(db));
  metaSet(db, "manifest_digest", databaseManifestDigest(db));
  metaSet(db, "canonical_store_hash", "unverified-after-governed-write");
  metaSet(db, "generation", Number(metaGet(db, "generation")) + 1);
}

function deleteUnitKeys(db: Database, keys: string[]): void {
  const statements = [
    db.prepare("DELETE FROM postings WHERE doc_id IN (SELECT doc_id FROM documents WHERE document_key = ?)"),
    db.prepare("DELETE FROM documents WHERE document_key = ?"),
    db.prepare("DELETE FROM aliases WHERE unit_key = ?"),
    db.prepare("DELETE FROM links WHERE from_key = ?"),
    db.prepare("DELETE FROM relations WHERE from_key = ?"),
    db.prepare("DELETE FROM artifacts WHERE owner_key = ?"),
    db.prepare("DELETE FROM units WHERE unit_key = ?"),
  ];
  try {
    for (const key of keys) for (const statement of statements) statement.run(key);
  } finally {
    for (const statement of statements) statement.finalize();
  }
}

function insertUnitBatch(
  db: Database,
  units: Unit[],
  ordinalByKey?: Map<string, number>,
  docIdByKey?: Map<string, number>,
): { postings: number } {
  const statements = insertStatements(db);
  try {
    for (const unit of units) insertUnitFacts(statements, unit);
    const localIndex = buildSearchIndex(searchSources(units), "incremental");
    return { postings: insertSearchIndex(db, statements, localIndex, { ordinalByKey, docIdByKey }) };
  } finally {
    finalizeStatements(statements);
  }
}

export function applyKnownDelta(
  dbPath: string,
  root: string,
  changedUnits: Unit[],
  canonicalOrdinals?: Map<string, number>,
): { elapsedMs: number; changedUnits: number; newUnits: number; postings: number; logicalDigest: string } {
  const started = performance.now();
  const db = new Database(dbPath, { strict: true });
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=OFF;");
  let postings = 0;
  try {
    const existing = db.query("SELECT doc_id AS docId, ordinal FROM documents WHERE document_key = ?");
    const existingRows = changedUnits.map((unit) => existing.get(unitKey(unit)) as { docId: number; ordinal: number } | null);
    const existingByKey = new Map<string, { docId: number; ordinal: number }>();
    changedUnits.forEach((unit, index) => {
      const row = existingRows[index];
      if (row) existingByKey.set(unitKey(unit), row);
    });
    const newCount = changedUnits.length - existingByKey.size;
    const existingOrdinals = [...existingByKey.values()].map((row) => row.ordinal);
    const boundary = existingOrdinals.length ? Math.max(...existingOrdinals) : -1;
    const ordinalByKey = new Map<string, number>();
    const docIdByKey = new Map<string, number>();
    for (const unit of changedUnits) {
      const key = unitKey(unit);
      const existing = existingByKey.get(key);
      if (existing) docIdByKey.set(key, existing.docId);
      const ordinal = canonicalOrdinals?.get(key) ?? existing?.ordinal;
      if (ordinal !== undefined) ordinalByKey.set(key, ordinal);
    }
    const transaction = db.transaction(() => {
      if (newCount && boundary >= 0) db.run("UPDATE documents SET ordinal = ordinal + ? WHERE ordinal > ?", [newCount, boundary]);
      deleteUnitKeys(db, [...existingByKey.keys()]);
      postings = insertUnitBatch(db, changedUnits, ordinalByKey, docIdByKey).postings;
      updateDatabaseMetadata(db, singleSourceState(root, sourcePathOf(changedUnits[0])));
    });
    transaction();
    return {
      elapsedMs: round(performance.now() - started),
      changedUnits: changedUnits.length,
      newUnits: newCount,
      postings,
      logicalDigest: databaseLogicalDigest(db),
    };
  } finally {
    db.close(true);
  }
}

function parseLedgerForBenchmark(root: string, relPath: string): Unit[] {
  const file = join(root, relPath);
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const heads = ledgerHeads(text);
  return heads.map((head, index) => {
    const body = text.slice(head.idx, index + 1 < heads.length ? heads[index + 1].idx : undefined);
    const prose = body.replace(/```[\s\S]*?```/g, "\n");
    return {
      substrate: "ledger",
      status: head.kindStatus.split("/").pop()!.replace(/^[★⚠↩]/, "").trim(),
      title: head.title,
      slug: null,
      relPath: `${relPath}#${head.anchor}`,
      links: extractLinks(body),
      aliases: [],
      relations: [...prose.matchAll(/^↳ (\S+) (.+)$/gm)].map((match) => ({ type: match[1], target: match[2].trim() })),
      artifacts: [...prose.matchAll(/^<!-- kb:artifact (.+) -->$/gm)].map((match) => match[1].trim()),
      text: body,
      cold: false,
      id: /^<!-- kb:id (\S+) -->$/m.exec(prose)?.[1],
    };
  });
}

export function applyChangedLedger(dbPath: string, root: string, ledgerPath: string): {
  elapsedMs: number; parseMs: number; replacedUnits: number; postings: number; logicalDigest: string;
} {
  const db = new Database(dbPath, { strict: true });
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=OFF;");
  const oldStatusRows = db.query(`SELECT
    u.unit_key AS unitKey, u.status, d.doc_id AS docId, d.ordinal
    FROM units u JOIN documents d ON d.document_key = u.unit_key
    WHERE u.source_path = ? ORDER BY d.ordinal`).all(ledgerPath) as Array<{ unitKey: string; status: string; docId: number; ordinal: number }>;
  const oldStatuses = new Map(oldStatusRows.map((row) => [row.unitKey, row.status]));
  const oldDocIds = new Map(oldStatusRows.map((row) => [row.unitKey, row.docId]));
  const parseStarted = performance.now();
  const ledgerUnits = parseLedgerForBenchmark(root, ledgerPath);
  const parseMs = performance.now() - parseStarted;
  for (const unit of ledgerUnits) {
    const previous = oldStatuses.get(unitKey(unit));
    if (previous) unit.status = previous;
  }
  const started = performance.now();
  let postings = 0;
  try {
    const ordinals = new Map(ledgerUnits.map((unit, index) => [unitKey(unit), index]));
    const retainedDocIds = new Map(ledgerUnits.flatMap((unit) => {
      const id = oldDocIds.get(unitKey(unit));
      return id === undefined ? [] : [[unitKey(unit), id] as [string, number]];
    }));
    const delta = ledgerUnits.length - oldStatusRows.length;
    const transaction = db.transaction(() => {
      deleteUnitKeys(db, [...oldStatuses.keys()]);
      if (delta) db.run("UPDATE documents SET ordinal = ordinal + ? WHERE ordinal >= ?", [delta, oldStatusRows.length]);
      postings = insertUnitBatch(db, ledgerUnits, ordinals, retainedDocIds).postings;
      updateDatabaseMetadata(db, singleSourceState(root, ledgerPath));
    });
    transaction();
    return {
      elapsedMs: round(performance.now() - started + parseMs),
      parseMs: round(parseMs),
      replacedUnits: ledgerUnits.length,
      postings,
      logicalDigest: databaseLogicalDigest(db),
    };
  } finally {
    db.close(true);
  }
}

function governedWrites(root: string, count: number): { elapsedMs: number[]; ids: string[] } {
  const elapsedMs: number[] = [];
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const title = `SQLite shadow benchmark ${count} write ${index + 1}`;
    const body = "Disposable benchmark observation. This unit exists only in an isolated snapshot.";
    const started = performance.now();
    const result = spawnSync("bun", [
      join(SCRIPT_ROOT, "kb-add.ts"),
      "--root", root,
      "--substrate", "ledger",
      "--kind", "RUN",
      "--status", "OBSERVED",
      "--title", title,
      "--json",
    ], { input: body, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    elapsedMs.push(performance.now() - started);
    if (result.status !== 0) throw new Error(`governed benchmark write failed: ${result.stderr}`);
    ids.push((JSON.parse(result.stdout) as { id: string }).id);
  }
  return { elapsedMs, ids };
}

function changedUnitsAgainstDatabase(dbPath: string, units: Unit[]): Unit[] {
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const rows = db.query("SELECT unit_key AS unitKey, record_json AS recordJson FROM units").all() as Array<{ unitKey: string; recordJson: string }>;
    const records = new Map(rows.map((row) => [row.unitKey, row.recordJson]));
    return units.filter((unit) => records.get(unitKey(unit)) !== stableJson(canonicalUnitRecord(unit)));
  } finally {
    db.close(true);
  }
}

function scratchDirectory(parent: string, prefix: string): string {
  const root = resolve(parent);
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, prefix));
}

function safeTemporaryCleanup(path: string, parent: string): void {
  const resolved = resolve(path);
  const scratch = resolve(parent);
  if (!resolved.startsWith(scratch + "/promptus-sqlite-")) throw new Error(`refusing temporary cleanup outside bounded prefix: ${resolved}`);
  rmSync(resolved, { recursive: true, force: true });
}

function mutationScenario(baseRoot: string, baseDb: string, count: number, scratchRoot: string): Record<string, unknown> {
  const scenarioRoot = scratchDirectory(scratchRoot, `promptus-sqlite-${count}-write-`);
  try {
    cpSync(join(baseRoot, ".promptus"), join(scenarioRoot, ".promptus"), { recursive: true, preserveTimestamps: true });
    const knownDb = join(scenarioRoot, `known-${count}.sqlite`);
    const fileDb = join(scenarioRoot, `file-${count}.sqlite`);
    copyFileSync(baseDb, knownDb);
    copyFileSync(baseDb, fileDb);

    const writes = governedWrites(scenarioRoot, count);
    const canonicalUnits = collectProjectedUnits(scenarioRoot);
    const byId = new Map(canonicalUnits.filter((unit) => unit.id).map((unit) => [unit.id!, unit]));
    const newUnits = writes.ids.map((id) => {
      const unit = byId.get(id);
      if (!unit) throw new Error(`new governed unit missing from Markdown projection: ${id}`);
      return unit;
    });
    const changedUnits = changedUnitsAgainstDatabase(knownDb, canonicalUnits);
    const canonicalOrdinals = new Map(canonicalUnits.map((unit, index) => [unitKey(unit), index]));
    const canonicalDigest = logicalUnitDigest(canonicalUnits);
    const ledgerPath = sourcePathOf(newUnits[0]);
    const known = applyKnownDelta(knownDb, scenarioRoot, changedUnits, canonicalOrdinals);
    const changedFile = applyChangedLedger(fileDb, scenarioRoot, ledgerPath);

    const currentIndex = timedCommand(["bun", join(SCRIPT_ROOT, "kb-index.ts"), "--root", scenarioRoot, "--quiet"], REPO_ROOT).receipt;
    const index = currentSearch(scenarioRoot);
    const knownQueries = compareQueries(scenarioRoot, index, canonicalUnits, knownDb);
    const fileQueries = compareQueries(scenarioRoot, index, canonicalUnits, fileDb);
    return {
      writes: count,
      governedWriteTotalMs: round(writes.elapsedMs.reduce((sum, value) => sum + value, 0)),
      governedWriteMedianMs: timingSummary(writes.elapsedMs).medianMs,
      currentFullIndex: currentIndex,
      canonicalLogicalDigest: canonicalDigest,
      writerKnownDelta: {
        ...known,
        exactLogicalDigest: known.logicalDigest === canonicalDigest,
        exactQuerySuite: knownQueries.comparisons.every((item) => item.exact),
        querySuiteDigest: knownQueries.suiteDigest,
        speedupVsFullIndex: round((currentIndex.elapsedSeconds * 1000) / known.elapsedMs, 2),
      },
      changedLedgerRefresh: {
        ...changedFile,
        exactLogicalDigest: changedFile.logicalDigest === canonicalDigest,
        exactQuerySuite: fileQueries.comparisons.every((item) => item.exact),
        querySuiteDigest: fileQueries.suiteDigest,
        speedupVsFullIndex: round((currentIndex.elapsedSeconds * 1000) / changedFile.elapsedMs, 2),
      },
    };
  } finally {
    safeTemporaryCleanup(scenarioRoot, scratchRoot);
  }
}

function statManifestCheck(root: string, db: Database): { fresh: boolean; checked: number; elapsedMs: number } {
  const started = performance.now();
  const expectedRows = db.query("SELECT path, bytes, mtime_ns AS mtimeNs FROM source_files ORDER BY path").all() as Array<{ path: string; bytes: number; mtimeNs: string }>;
  const actualPaths = authoritativeSourcePaths(root);
  if (actualPaths.length !== expectedRows.length) return { fresh: false, checked: actualPaths.length, elapsedMs: round(performance.now() - started) };
  let fresh = true;
  for (let index = 0; index < expectedRows.length; index++) {
    const path = actualPaths[index];
    const rel = relative(join(root, ".promptus"), path).replace(/\\/g, "/");
    const stat = statSync(path, { bigint: true });
    const expected = expectedRows[index];
    if (rel !== expected.path || Number(stat.size) !== expected.bytes || stat.mtimeNs.toString() !== expected.mtimeNs) fresh = false;
  }
  return { fresh, checked: expectedRows.length, elapsedMs: round(performance.now() - started) };
}

function contentManifestCheck(root: string, db: Database): { fresh: boolean; checked: number; bytes: number; elapsedMs: number } {
  const started = performance.now();
  const expectedRows = db.query("SELECT path, bytes, sha256 FROM source_files ORDER BY path").all() as Array<{ path: string; bytes: number; sha256: string }>;
  const actualPaths = authoritativeSourcePaths(root);
  if (actualPaths.length !== expectedRows.length) return { fresh: false, checked: actualPaths.length, bytes: 0, elapsedMs: round(performance.now() - started) };
  let fresh = true;
  let bytes = 0;
  for (let index = 0; index < expectedRows.length; index++) {
    const path = actualPaths[index];
    const rel = relative(join(root, ".promptus"), path).replace(/\\/g, "/");
    const raw = readFileSync(path);
    bytes += raw.byteLength;
    const expected = expectedRows[index];
    if (rel !== expected.path || raw.byteLength !== expected.bytes || sha256(raw) !== expected.sha256) fresh = false;
  }
  return { fresh, checked: expectedRows.length, bytes, elapsedMs: round(performance.now() - started) };
}

function staleCacheScenario(baseRoot: string, scratchRoot: string): Record<string, unknown> {
  const staleRoot = scratchDirectory(scratchRoot, "promptus-sqlite-stale-");
  try {
    cpSync(join(baseRoot, ".promptus"), join(staleRoot, ".promptus"), { recursive: true, preserveTimestamps: true });
    const dbPath = join(staleRoot, "shadow.sqlite");
    buildShadowDatabase(staleRoot, dbPath, true);
    const db = new Database(dbPath, { strict: true });
    try {
      const baselineStat = statManifestCheck(staleRoot, db);
      const baselineContent = contentManifestCheck(staleRoot, db);
      const storeBefore = hashStore(staleRoot);
      const generationBefore = metaGet(db, "generation");
      const ledger = join(staleRoot, ".promptus", "ledger", "RESEARCH-LEDGER.md");
      appendFileSync(ledger, "\n<!-- sqlite-shadow-stale-probe -->\n");
      const markerStarted = performance.now();
      const generationAfter = metaGet(db, "generation");
      const markerMs = performance.now() - markerStarted;
      const afterStat = statManifestCheck(staleRoot, db);
      const afterContent = contentManifestCheck(staleRoot, db);
      const hashStarted = performance.now();
      const storeAfter = hashStore(staleRoot);
      const canonicalHashMs = performance.now() - hashStarted;
      return {
        baseline: {
          statFresh: baselineStat.fresh,
          contentFresh: baselineContent.fresh,
        },
        outOfBandEdit: {
          generationReceiptChanged: generationBefore !== generationAfter,
          generationReceiptCheckMs: round(markerMs),
          statManifestDetected: !afterStat.fresh,
          statManifestCheckMs: afterStat.elapsedMs,
          contentManifestDetected: !afterContent.fresh,
          contentManifestCheckMs: afterContent.elapsedMs,
          contentBytesRead: afterContent.bytes,
          canonicalStoreHashDetected: storeBefore.hash !== storeAfter.hash,
          canonicalStoreHashCheckMs: round(canonicalHashMs),
        },
      };
    } finally {
      db.close(true);
    }
  } finally {
    safeTemporaryCleanup(staleRoot, scratchRoot);
  }
}

function databaseAnalyticProbe(dbPath: string): Record<string, unknown> {
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const operations: Array<[string, string]> = [
      ["active-unit-count", "SELECT COUNT(*) AS value FROM units WHERE cold = 0 AND status NOT IN ('SUPERSEDED', 'REFUTED', 'RETIRED')"],
      ["unique-artifact-path-count", "SELECT COUNT(DISTINCT path) AS value FROM artifacts"],
      ["resolved-relation-count", "SELECT COUNT(*) AS value FROM relations WHERE resolved_key IS NOT NULL"],
      ["distillation-candidate-count", "SELECT COUNT(*) AS value FROM units WHERE cold = 0 AND substrate = 'ledger' AND status IN ('OBSERVED', 'PROVISIONAL', 'CONJECTURED')"],
    ];
    const result: Record<string, unknown> = {};
    for (const [name, sql] of operations) {
      const statement = db.query(sql);
      statement.get();
      const values: number[] = [];
      let value = 0;
      for (let iteration = 0; iteration < 200; iteration++) {
        const started = performance.now();
        value = Number((statement.get() as { value: number }).value);
        values.push(performance.now() - started);
      }
      result[name] = { value, timing: timingSummary(values) };
    }
    return result;
  } finally {
    db.close(true);
  }
}

function filesystemType(path: string): string {
  const result = spawnSync("stat", ["-f", "-c", "%T", path], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function runExperiment(rootInput: string, outputInput: string, scratchInput = tmpdir()): Record<string, unknown> {
  const root = resolve(rootInput);
  const output = resolve(outputInput);
  const scratchRoot = resolve(scratchInput);
  const prereg = JSON.parse(readFileSync(PREREGISTRATION, "utf8")) as any;
  const initialStore = hashStore(root);
  if (initialStore.hash !== prereg.corpus.snapshot_store_sha256 || initialStore.files !== prereg.corpus.source_files) {
    throw new Error(`snapshot does not match preregistration: ${initialStore.hash}/${initialStore.files}`);
  }
  const work = scratchDirectory(scratchRoot, "promptus-sqlite-experiment-");
  try {
    const currentIndexRuns: ProcessReceipt[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      currentIndexRuns.push(timedCommand(["bun", join(SCRIPT_ROOT, "kb-index.ts"), "--root", root, "--quiet"], REPO_ROOT).receipt);
    }
    const currentCacheBytes = cacheBytes(root);
    const projectedUnits = collectProjectedUnits(root);
    const canonicalLogicalDigest = logicalUnitDigest(projectedUnits);
    const canonicalSearch = currentSearch(root);

    const builds: Array<{ process: ProcessReceipt; build: BuildReceipt }> = [];
    const databasePaths: string[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      const dbPath = join(work, `shadow-${iteration + 1}.sqlite`);
      databasePaths.push(dbPath);
      builds.push(timedBuild(root, dbPath));
    }
    const logicalDigests = builds.map((item) => item.build.logicalDigest);
    const searchDigests = builds.map((item) => item.build.searchDigest);
    const query = compareQueries(root, canonicalSearch, projectedUnits, databasePaths[0]);
    const queryTiming = queryTimings(root, databasePaths[0]);
    const oneWrite = mutationScenario(root, databasePaths[0], 1, scratchRoot);
    const tenWrites = mutationScenario(root, databasePaths[0], 10, scratchRoot);
    const stale = staleCacheScenario(root, scratchRoot);
    const analytics = databaseAnalyticProbe(databasePaths[0]);

    const sqliteFresh = queryTiming.freshSqliteOneQuery.medianMs;
    const jsonFresh = queryTiming.freshJsonOneQuery.medianMs;
    const oneKnown = (oneWrite.writerKnownDelta as any);
    const tenKnown = (tenWrites.writerKnownDelta as any);
    const correctness = {
      currentSearchExactOnEveryCleanBuild: builds.every((item) => item.build.exactCurrentSearch === true),
      cleanLogicalDigestExact: logicalDigests.every((digest) => digest === canonicalLogicalDigest),
      deleteAndRebuildLogicalDigestExact: new Set(logicalDigests).size === 1,
      deleteAndRebuildSearchDigestExact: new Set(searchDigests).size === 1,
      querySuiteExact: query.comparisons.every((item) => item.exact),
      oneWriteKnownDeltaExact: oneKnown.exactLogicalDigest && oneKnown.exactQuerySuite,
      tenWriteKnownDeltaExact: tenKnown.exactLogicalDigest && tenKnown.exactQuerySuite,
      oneWriteFileRefreshExact: (oneWrite.changedLedgerRefresh as any).exactLogicalDigest && (oneWrite.changedLedgerRefresh as any).exactQuerySuite,
      tenWriteFileRefreshExact: (tenWrites.changedLedgerRefresh as any).exactLogicalDigest && (tenWrites.changedLedgerRefresh as any).exactQuerySuite,
      outOfBandEditDetectedExactly: (stale.outOfBandEdit as any).contentManifestDetected && (stale.outOfBandEdit as any).canonicalStoreHashDetected,
      sourceUnchanged: false,
    };
    const finalStore = hashStore(root);
    correctness.sourceUnchanged = finalStore.hash === initialStore.hash && finalStore.files === initialStore.files;
    const everyCorrect = Object.values(correctness).every(Boolean);
    const thresholds = {
      everyCorrectnessInvariant: everyCorrect,
      oneWriteKnownDeltaAtLeast5x: oneKnown.speedupVsFullIndex >= 5,
      tenWriteKnownDeltaAtLeast5x: tenKnown.speedupVsFullIndex >= 5,
      freshSqliteNoSlowerThanFreshJson: sqliteFresh <= jsonFresh,
      failClosedOutOfBandStrategyIdentified: (stale.outOfBandEdit as any).contentManifestDetected === true
        && (stale.outOfBandEdit as any).generationReceiptChanged === false,
    };
    const decisionPass = Object.values(thresholds).every(Boolean);
    const indexTimes = currentIndexRuns.map((item) => item.elapsedSeconds * 1000);
    const buildTimes = builds.map((item) => item.process.elapsedSeconds * 1000);
    const result = {
      schema: "promptus.sqlite-shadow-experiment.v1",
      executedAt: new Date().toISOString(),
      preregistrationSha256: sha256(readFileSync(PREREGISTRATION)),
      corpus: {
        project: "MoT",
        storeHash: initialStore.hash,
        sourceFiles: initialStore.files,
        sourceBytes: builds[0].build.sourceBytes,
        units: builds[0].build.units,
        liveUnits: builds[0].build.liveUnits,
        coldUnits: builds[0].build.coldUnits,
        canonicalLogicalDigest,
      },
      environment: {
        bun: Bun.version,
        sqlite: builds[0].build.sqliteVersion,
        sourceFilesystem: filesystemType(root),
        scratchFilesystem: filesystemType(scratchRoot),
        duckdbCliAvailable: Boolean(spawnSync("sh", ["-c", "command -v duckdb"], { encoding: "utf8" }).stdout?.trim()),
      },
      current: {
        indexRuns: currentIndexRuns,
        indexTimingMs: timingSummary(indexTimes),
        derivedCacheBytes: currentCacheBytes,
      },
      sqlite: {
        builds,
        buildTimingMs: timingSummary(buildTimes),
        databaseBytes: builds[0].build.databaseBytes,
        sizeRatioVsCurrentIndexFiles: round(builds[0].build.databaseBytes / currentCacheBytes.total, 3),
        cleanLogicalDigests: logicalDigests,
        cleanSearchDigests: searchDigests,
        query: {
          cases: query.comparisons.length,
          comparisons: query.comparisons,
          suiteDigest: query.suiteDigest,
          exact: query.comparisons.every((item) => item.exact),
          timing: queryTiming,
          freshConnectionSpeedupVsJsonParse: round(jsonFresh / sqliteFresh, 2),
        },
        structuredQueries: analytics,
      },
      mutations: {
        oneWrite,
        tenWrites,
      },
      staleCache: stale,
      correctness,
      preregisteredThresholds: thresholds,
      decision: {
        pass: decisionPass,
        meaning: decisionPass
          ? "The evidence supports a narrow disposable-SQLite development branch; it does not authorize adoption, release, or authority transfer from Markdown."
          : "The disposable-SQLite candidate did not meet every preregistered requirement and should not advance unchanged.",
      },
      limitations: [
        "The storage profile is native ext4; earlier maintenance experiments already measured the same corpus class on WSL 9p and tmpfs.",
        "The append-only ledger delta uses governed no-relation writes. Status-changing relations require dependency-aware invalidation before a production implementation.",
        "A generation receipt is fast for governed writers but cannot detect an out-of-band edit. Exact content verification remains part of authoritative doctor/check paths.",
        "SQLite FTS5 and DuckDB were not benchmarked because replacing the current ranking or adding an analytics engine would change the question and workload contract.",
      ],
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    safeTemporaryCleanup(work, scratchRoot);
  }
}

function main(argv: string[]): number {
  const { command, args } = parseArgs(argv);
  if (command === "help" || args.help === true) {
    console.log(HELP);
    return 0;
  }
  if (command === "build") {
    const receipt = buildShadowDatabase(required(args, "root"), required(args, "db"), args.replace === true);
    console.log(JSON.stringify(receipt));
    return 0;
  }
  if (command === "query") {
    const searcher = new SqliteSearcher(required(args, "root"), required(args, "db"));
    try {
      const hits = searcher.search(required(args, "query"), {});
      console.log(JSON.stringify({ hits: hits.length, digest: hitDigest(hits) }));
    } finally {
      searcher.close();
    }
    return 0;
  }
  if (command === "run") {
    const result = runExperiment(
      required(args, "root"),
      required(args, "output"),
      typeof args["work-root"] === "string" ? args["work-root"] : tmpdir(),
    );
    console.log(JSON.stringify({
      schema: result.schema,
      decision: result.decision,
      outputSha256: sha256(readFileSync(resolve(required(args, "output")))),
    }, null, 2));
    return 0;
  }
  console.error(HELP);
  return 1;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`promptus-sqlite: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  }
}
