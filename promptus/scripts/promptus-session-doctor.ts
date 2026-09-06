#!/usr/bin/env bun
/**
 * promptus-session-doctor.ts — read-only preflight for a resuming agent.
 *
 * Unlike promptus-check, this command never rebuilds an index or writes a receipt. It compares
 * the live Markdown store with the disposable cache, validates the NOW handoff directly, and
 * emits a bounded report that is safe to run before any retrieval in a large project.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkArtifacts, parseArtifactSpec, type ArtifactSpec } from "./lib/artifacts.ts";
import { derivedDir, findProjectRoot, storePath } from "./lib/paths.ts";
import { ledgerEntriesFromText, type Entry } from "./lib/units.ts";
import { loadVocab, type Vocab } from "./lib/vocab.ts";
import { inspectThinkerExchange } from "./lib/thinker.ts";
import { SEARCH_INDEX_SCHEMA } from "./lib/search.ts";
import { collectUnits, type Unit } from "./kb-index.ts";
import { recoveryFor } from "./lib/diagnostics.ts";

type Severity = "error" | "warning" | "info";

interface Issue {
  severity: Severity;
  code: string;
  message: string;
  surface: string;
  paths: string[];
  recovery: string;
  automaticRepair: boolean;
}

interface CatalogCard {
  substrate: string;
  status: string;
  title: string;
  path: string;
  id?: string;
}

interface SearchDocument {
  key?: string;
  title?: string;
  path?: string;
  id?: string;
  cold?: boolean;
}

interface GraphDocument {
  nodes?: string[];
  out?: Record<string, string[]>;
  inDeg?: Record<string, number>;
  relationDegree?: Record<string, number>;
  dangling?: Array<{ from: string; target: string; reason?: string }>;
  relations?: Array<{ from?: string; type?: string; to?: string; rawTo?: string; resolved?: boolean }>;
  artifacts?: Array<{ from: string; spec: string; status?: string }>;
}

const HELP = `promptus-session-doctor — read-only preflight for a resuming agent
usage: promptus-session-doctor [--json] [--artifacts] [--root <dir>]
  --json       emit one bounded machine-readable report
  --artifacts  re-hash artifact dependencies named by the current cached graph

The command reads Markdown, any governed thinker exchange, and disposable cache files only. It
never reindexes, repairs, records a baseline, refreshes NOW, or writes a health receipt. Exit 0
means the handoff and retrieval cache are current enough to resume; exit 1 means stop and report
the named defects.`;

const fwd = (value: string) => value.replace(/\\/g, "/");

function arg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf("--" + name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : undefined;
}

function readJSON(path: string): any | null {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function filesUnder(dir: string, skipCache = false): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || (skipCache && entry.name === "cache")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function sourceFingerprint(root: string, sourceBytes?: Map<string, Buffer>): {
  hash: string;
  files: number;
  bytes: number;
  newest: { path: string; modifiedAt: string } | null;
} {
  const base = join(root, ".promptus");
  const paths = filesUnder(base, true).filter((path) => {
    const rel = fwd(relative(base, path));
    return rel !== "thinker/INDEX.md" && !/^thinker\/rounds\/[^/]+\/ROUND\.md$/.test(rel);
  }).sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  let bytes = 0;
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const path of paths) {
    const body = readFileSync(path);
    sourceBytes?.set(path, body);
    const mtimeMs = statSync(path).mtimeMs;
    bytes += body.byteLength;
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path: fwd(relative(root, path)), mtimeMs };
    hash.update(fwd(relative(base, path)));
    hash.update("\0");
    hash.update(body);
    hash.update("\0");
  }
  return {
    hash: hash.digest("hex"),
    files: paths.length,
    bytes,
    newest: newest ? { path: newest.path, modifiedAt: new Date(newest.mtimeMs).toISOString() } : null,
  };
}

function parseCatalog(text: string): { cards: CatalogCard[]; delimiterCollisions: Array<{ title: string; path: string }> } {
  const cards: CatalogCard[] = [];
  const delimiterCollisions: Array<{ title: string; path: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const firstDelimiter = line.indexOf(" · ");
    if (firstDelimiter < 0) continue;
    const head = line.slice(0, firstDelimiter);
    const split = head.indexOf(":");
    if (split < 1) continue;
    const body = line.slice(firstDelimiter + 3);
    // A title is free prose and may itself contain the catalog's visual separator. Locate the
    // canonical project-relative path from the right instead of blindly splitting every field.
    const record = /^(.*) · (\.promptus\/\S+)(?: · (.*))?$/.exec(body);
    if (!record) continue;
    const [, title, path, metadata = ""] = record;
    const naivePath = line.split(" · ")[2];
    if (naivePath !== path) delimiterCollisions.push({ title, path });
    cards.push({
      substrate: head.slice(0, split),
      status: head.slice(split + 1).trim(),
      title,
      path,
      id: /(?:^|\s)id:(\S+)/.exec(metadata)?.[1],
    });
  }
  return { cards, delimiterCollisions };
}

function entryId(entry: Entry): string | undefined {
  return /^<!-- kb:id (\S+) -->$/m.exec(entry.text)?.[1];
}

interface CoverageUnit { title: string; path: string; id?: string }

function sourceUnit(unit: Unit): CoverageUnit {
  return { title: unit.title, path: unit.relPath, ...(unit.id ? { id: unit.id } : {}) };
}

function coverage(
  sourceUnits: CoverageUnit[],
  indexedUnits: Array<{ title?: string; path?: string; id?: string }>,
): {
  missing: number;
  identityMismatches: number;
  extra: number;
  missingSample: CoverageUnit[];
  mismatchSample: Array<{ source: CoverageUnit; indexed: Array<{ title?: string; path?: string; id?: string }> }>;
  extraSample: Array<{ title?: string; path?: string; id?: string }>;
} {
  const exact = new Map<string, number[]>();
  const byId = new Map<string, number[]>();
  const byPathTitle = new Map<string, number[]>();
  const exactKey = (unit: { title?: string; path?: string; id?: string }) =>
    `${unit.id ? `id:${unit.id}` : "legacy"}\0${unit.path ?? ""}\0${unit.title ?? ""}`;
  const pathTitleKey = (unit: { title?: string; path?: string }) => `${unit.path ?? ""}\0${unit.title ?? ""}`;
  indexedUnits.forEach((unit, index) => {
    exact.set(exactKey(unit), [...(exact.get(exactKey(unit)) ?? []), index]);
    if (unit.id) byId.set(unit.id, [...(byId.get(unit.id) ?? []), index]);
    byPathTitle.set(pathTitleKey(unit), [...(byPathTitle.get(pathTitleKey(unit)) ?? []), index]);
  });
  const used = new Set<number>();
  const missing: CoverageUnit[] = [];
  const mismatches: Array<{ source: CoverageUnit; indexed: Array<{ title?: string; path?: string; id?: string }> }> = [];
  for (const source of sourceUnits) {
    const match = (exact.get(exactKey(source)) ?? []).find((index) => !used.has(index));
    if (match !== undefined) { used.add(match); continue; }
    const related = [
      ...(source.id ? byId.get(source.id) ?? [] : []),
      ...(byPathTitle.get(pathTitleKey(source)) ?? []),
    ].filter((index, position, all) => !used.has(index) && all.indexOf(index) === position);
    if (related.length) mismatches.push({ source, indexed: related.slice(0, 3).map((index) => indexedUnits[index]) });
    else missing.push(source);
  }
  const extra = indexedUnits.filter((_unit, index) => !used.has(index));
  return {
    missing: missing.length,
    identityMismatches: mismatches.length,
    extra: extra.length,
    missingSample: missing.slice(-5),
    mismatchSample: mismatches.slice(-5),
    extraSample: extra.slice(0, 5),
  };
}

function namedSection(text: string, names: RegExp): { heading: string; body: string } | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    return Boolean(heading && names.test(heading[2].trim()));
  });
  if (start < 0) return null;
  const level = /^#+/.exec(lines[start])![0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const heading = /^(#+)\s+/.exec(lines[index]);
    if (heading && heading[1].length <= level) { end = index; break; }
  }
  return {
    heading: /^(?:#{1,4})\s+(.+)$/.exec(lines[start])![1].trim(),
    body: lines.slice(start + 1, end)
    .filter((line) => !/^<!-- kb:(?:now-through|id) /.test(line.trim()))
    .join("\n").trim(),
  };
}

function headingsSection(text: string, names: RegExp): string {
  return namedSection(text, names)?.body ?? "";
}

function firstParagraph(value: string): string {
  return value.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)?.replace(/\s+/g, " ") ?? "";
}

function firstAction(value: string): string {
  const line = value.split("\n").map((item) => item.trim()).find((item) => /^(?:[-*]|\d+[.)])\s+/.test(item));
  return (line ?? firstParagraph(value)).replace(/^(?:[-*]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s*/, "").trim();
}

function occurrences(text: string, needle: string): number {
  let count = 0;
  let at = 0;
  while ((at = text.indexOf(needle, at)) >= 0) { count++; at += needle.length; }
  return count;
}

function latestKey(entries: Entry[]): string {
  const latest = entries.at(-1);
  if (!latest) return "EMPTY";
  return entryId(latest) ?? `anchor:${latest.anchor}`;
}

function facetTerms(value: any, facet: "kinds" | "statuses"): string[] {
  return [...(value?.[facet]?.core ?? []), ...(value?.[facet]?.extended ?? [])];
}

function vocabCompatibility(vocab: Vocab, template: Vocab) {
  const missing: string[] = [];
  const custom: string[] = [];
  for (const [name, expected] of Object.entries(template.substrates ?? {})) {
    const actual = vocab.substrates?.[name];
    if (!actual) { missing.push(`substrate:${name}`); continue; }
    for (const facet of ["kinds", "statuses"] as const) {
      const wanted = facetTerms(expected, facet);
      const found = facetTerms(actual, facet);
      for (const term of wanted) if (!found.includes(term)) missing.push(`${name}.${facet}:${term}`);
      for (const term of found) if (!wanted.includes(term)) custom.push(`${name}.${facet}:${term}`);
    }
  }
  const expectedRelations = Object.keys(template.relations ?? {});
  const actualRelations = Object.keys(vocab.relations ?? {});
  for (const relation of expectedRelations) if (!actualRelations.includes(relation)) missing.push(`relation:${relation}`);
  for (const relation of actualRelations) if (!expectedRelations.includes(relation)) custom.push(`relation:${relation}`);
  return {
    version: vocab.version,
    templateVersion: template.version,
    versionBehind: vocab.version < template.version,
    compatible: missing.length === 0,
    missing,
    customCount: custom.length,
    customSample: custom.slice(0, 12),
  };
}

function extraTrees(root: string, recognized: Set<string> = new Set()): Array<{ path: string; files: number }> {
  const namespace = join(root, ".promptus");
  const canonical = new Set(["schema", "ledger", "docs", "memory", "cache"]);
  if (!existsSync(namespace)) return [];
  return readdirSync(namespace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !canonical.has(entry.name) && !recognized.has(entry.name) && entry.name !== ".git")
    .map((entry) => ({ path: `.promptus/${entry.name}/`, files: filesUnder(join(namespace, entry.name)).length }));
}

function countOrphans(graph: GraphDocument): number {
  const nodes = graph.nodes ?? [];
  const out = graph.out ?? {};
  return nodes.filter((node) =>
    (graph.inDeg?.[node] ?? 0) === 0 && (out[node] ?? []).length === 0 && (graph.relationDegree?.[node] ?? 0) === 0,
  ).length;
}

function slugOf(path: string | undefined): string | undefined {
  if (!path || path.includes("#")) return undefined;
  return path.split("/").pop()?.replace(/\.md$/, "");
}

function aliasRegistrySummary(root: string, searchDocuments: SearchDocument[], graph: GraphDocument) {
  const path = join(root, ".promptus", "schema", "kb-link-aliases.json");
  if (!existsSync(path)) return {
    path: null, present: false, valid: true, aliases: 0, collisions: 0,
    missingTargets: 0, recoverableDangling: 0, sample: [] as Array<{ alias: string; target: string }>,
  };
  const document = readJSON(path);
  const aliases = document?.aliases && typeof document.aliases === "object" && !Array.isArray(document.aliases)
    ? Object.entries(document.aliases).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    : [];
  const valid = Boolean(document && typeof document.version === "number" && aliases.length === Object.keys(document?.aliases ?? {}).length);
  const known = new Set<string>();
  for (const item of searchDocuments) {
    if (item.id) known.add(item.id);
    const slug = slugOf(item.path);
    if (slug) known.add(slug);
  }
  const collisions = aliases.filter(([alias]) => known.has(alias));
  const missingTargets = aliases.filter(([, target]) => !known.has(target));
  const aliasMap = new Map(aliases);
  const recoverable = (graph.dangling ?? []).filter((edge) => {
    const target = aliasMap.get(edge.target);
    return Boolean(target && known.has(target));
  });
  return {
    path: fwd(relative(root, path)), present: true, valid, aliases: aliases.length,
    collisions: collisions.length, missingTargets: missingTargets.length,
    recoverableDangling: recoverable.length,
    sample: aliases.slice(0, 8).map(([alias, target]) => ({ alias, target })),
  };
}

function lengthOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function outcomeCounts(values: Array<{ outcome?: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const outcome = value.outcome ?? "unknown";
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}

const isArchivalArtifactStatus = (status: string | undefined) => {
  const normalized = String(status ?? "").replace(/^[★⚠↩]/, "").trim().toUpperCase();
  return normalized === "SUPERSEDED" || normalized === "RETIRED";
};

function relationCounts(values: NonNullable<GraphDocument["relations"]>): Record<string, { resolved: number; unresolved: number }> {
  const counts: Record<string, { resolved: number; unresolved: number }> = {};
  for (const value of values) {
    const type = value.type ?? "unknown";
    counts[type] ??= { resolved: 0, unresolved: 0 };
    counts[type][value.resolved === false ? "unresolved" : "resolved"]++;
  }
  return counts;
}

function searchKeySummary(documents: SearchDocument[]) {
  const groups = new Map<string, SearchDocument[]>();
  const missing = documents.filter((document) => typeof document.key !== "string" || !document.key);
  for (const document of documents) {
    if (!document.key) continue;
    groups.set(document.key, [...(groups.get(document.key) ?? []), document]);
  }
  const collisions = [...groups].filter(([, matches]) => matches.length > 1);
  const liveCollisions = collisions.filter(([, matches]) => matches.filter((document) => !document.cold).length > 1);
  const historyOnlyCollisions = collisions.filter(([key]) => !liveCollisions.some(([liveKey]) => liveKey === key));
  const sample = (values: typeof collisions) => values.slice(0, 8).map(([key, matches]) => ({
    key,
    documents: matches.slice(0, 5).map((document) => ({
      title: document.title,
      path: document.path,
      cold: Boolean(document.cold),
      id: document.id,
    })),
  }));
  return {
    missing: missing.length,
    missingSample: missing.slice(0, 8),
    collisions: collisions.length,
    liveCollisions: liveCollisions.length,
    historyOnlyCollisions: historyOnlyCollisions.length,
    collisionSample: sample(collisions),
  };
}

function fileReceipt(root: string, path: string) {
  if (!existsSync(path)) return { path: fwd(relative(root, path)), present: false, bytes: 0, modifiedAt: null };
  const stat = statSync(path);
  return {
    path: fwd(relative(root, path)),
    present: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const started = performance.now();
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const vocab = loadVocab(root);
  const template = readJSON(join(import.meta.dir, "..", "templates", "schema", "kb-vocab.json")) as Vocab | null;
  if (!template) throw new Error("cannot read the Promptus template vocab");

  const issues: Issue[] = [];
  const addIssue = (severity: Severity, code: string, message: string) => {
    const recovery = recoveryFor(code, root);
    if (recovery.surface === "handoff") recovery.paths = [storePath(root, vocab, "ledger")];
    issues.push({ severity, code, message, ...recovery });
  };
  const fingerprintStarted = performance.now();
  const sourceBytes = new Map<string, Buffer>();
  const source = sourceFingerprint(root, sourceBytes);
  const fingerprintMs = Math.round((performance.now() - fingerprintStarted) * 10) / 10;

  const telosPath = join(root, ".promptus", "TELOS.md");
  const ledgerPath = storePath(root, vocab, "ledger");
  const telos = (sourceBytes.get(telosPath)?.toString("utf8") ?? readFileSync(telosPath, "utf8")).replace(/\r\n/g, "\n");
  const ledger = (sourceBytes.get(ledgerPath)?.toString("utf8") ?? readFileSync(ledgerPath, "utf8")).replace(/\r\n/g, "\n");
  const entries = ledgerEntriesFromText(ledger);
  const sourceUnits = collectUnits(root, vocab, sourceBytes);
  const liveSourceUnits = sourceUnits.filter((unit) => !unit.cold).map(sourceUnit);
  const coldSourceUnits = sourceUnits.filter((unit) => unit.cold).map(sourceUnit);
  const sentinelPattern = new RegExp(`^${vocab.sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "gm");
  const sentinelLines = [...ledger.matchAll(sentinelPattern)].map((match) => ledger.slice(0, match.index).split("\n").length);
  const ledgerStructureReady = sentinelLines.length === 1;
  const expected = latestKey(entries);
  const startCount = occurrences(ledger, "<!-- now:start -->");
  const endCount = occurrences(ledger, "<!-- now:end -->");
  const nowStart = ledger.indexOf("<!-- now:start -->");
  const nowEnd = ledger.indexOf("<!-- now:end -->");
  const configured = startCount === 1 && endCount === 1 && nowEnd > nowStart;
  const live = configured ? ledger.slice(nowStart, nowEnd) : "";
  const markers = [...live.matchAll(/<!-- kb:now-through (\S+) -->/g)].map((match) => match[1]);
  const nowFresh = configured && markers.length === 1 && markers[0] === expected;
  const canonicalNorthStar = namedSection(telos, /^(?:North star|Mandate)$/i);
  const legacyNorthStar = canonicalNorthStar ? null : namedSection(telos, /^(?:The end|Purpose|Goal|Mission|Direction|Objective|End state)$/i);
  const northStarSection = canonicalNorthStar ?? legacyNorthStar;
  const orientation = {
    project: /^#\s+(.+)$/m.exec(telos)?.[1] ?? root.split(/[\\/]/).pop(),
    northStar: firstParagraph(northStarSection?.body ?? ""),
    now: firstParagraph(headingsSection(live, /^NOW$/i)),
    blocker: firstAction(headingsSection(live, /^Open frontier$/i)),
    next: firstAction(headingsSection(live, /^Next actions$/i)),
    resume: firstParagraph(headingsSection(live, /RESUME HERE/i)),
  };
  const missingOrientation = Object.entries(orientation)
    .filter(([name, value]) => name !== "project" && !value)
    .map(([name]) => name);

  if (!configured) addIssue("error", "HANDOFF_MARKERS_INVALID", `expected one ordered now:start/now:end pair; found ${startCount}/${endCount}`);
  else if (!nowFresh) addIssue("error", "HANDOFF_STALE", `NOW marker ${markers[0] ?? "missing"} does not name latest ledger unit ${expected}`);
  if (legacyNorthStar) addIssue("warning", "TELOS_NORTH_STAR_LEGACY_HEADING", `using legacy Telos heading "${legacyNorthStar.heading}" as the durable north star; rename it to "North star" when the operator next revises Telos`);
  if (missingOrientation.length) addIssue("error", "HANDOFF_INCOMPLETE", `missing orientation fields: ${missingOrientation.join(", ")}`);
  if (!ledgerStructureReady) addIssue("error", "LEDGER_SENTINEL_INVALID", `expected exactly one append sentinel; found ${sentinelLines.length} at line(s) ${sentinelLines.join(", ") || "none"}`);

  const cache = derivedDir(root);
  const catalogPath = join(cache, "CATALOG.md");
  const searchPath = join(cache, "search.json");
  const graphPath = join(cache, "graph.json");
  const healthPath = join(cache, "health.json");
  const baselinePath = join(root, ".promptus", "schema", "health-baseline.json");
  const catalogText = existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "";
  const parsedCatalog = catalogText ? parseCatalog(catalogText) : { cards: [], delimiterCollisions: [] };
  const catalog = parsedCatalog.cards;
  const search = readJSON(searchPath);
  const graphDocument = readJSON(graphPath);
  const graph = (graphDocument ?? {}) as GraphDocument;
  const health = readJSON(healthPath);
  const baseline = readJSON(baselinePath);
  const catalogHash = catalogText ? createHash("sha256").update(catalogText).digest("hex") : null;
  const searchDocuments = (Array.isArray(search?.documents) ? search.documents : []) as SearchDocument[];
  const liveSearchDocuments = searchDocuments.filter((document) => !document.cold);
  const coldSearchDocuments = searchDocuments.filter((document) => document.cold);
  const searchKeys = searchKeySummary(searchDocuments);
  const catalogCoverage = coverage(liveSourceUnits, catalog);
  const searchCoverage = coverage(liveSourceUnits, liveSearchDocuments);
  const coldSearchCoverage = coverage(coldSourceUnits, coldSearchDocuments);
  const healthFresh = Boolean(health && health.storeHash === source.hash);
  const searchSchemaValid = search?.schema === SEARCH_INDEX_SCHEMA;
  const searchMatchesCatalog = Boolean(search && catalogHash && search.catalogHash === catalogHash);
  const requiredCache = [catalogPath, searchPath, graphPath, healthPath];
  const missingCache = requiredCache.filter((path) => !existsSync(path)).map((path) => fwd(relative(root, path)));
  const unreadableCache = [
    ...(!search && existsSync(searchPath) ? [fwd(relative(root, searchPath))] : []),
    ...(!graphDocument && existsSync(graphPath) ? [fwd(relative(root, graphPath))] : []),
    ...(!health && existsSync(healthPath) ? [fwd(relative(root, healthPath))] : []),
  ];

  if (missingCache.length) addIssue("error", "CACHE_MISSING", `missing derived files: ${missingCache.join(", ")}`);
  if (unreadableCache.length) addIssue("error", "CACHE_UNREADABLE", `invalid JSON in derived files: ${unreadableCache.join(", ")}`);
  if (health && !healthFresh) addIssue("error", "CACHE_STALE", "the live Markdown fingerprint differs from the last health receipt");
  if (!health) addIssue("error", "HEALTH_RECEIPT_MISSING", "no readable cache/health.json can bind the cache to the Markdown source");
  if (search && !searchSchemaValid) addIssue("error", "SEARCH_SCHEMA_INVALID", `expected ${SEARCH_INDEX_SCHEMA}, found ${String(search.schema ?? "missing")}`);
  if (search && !searchMatchesCatalog) addIssue("error", "SEARCH_CATALOG_MISMATCH", "search.json was not derived from the current CATALOG.md bytes");
  if (searchKeys.missing) addIssue("error", "SEARCH_KEY_MISSING", `${searchKeys.missing} search document(s) have no deterministic result key`);
  if (searchKeys.liveCollisions) addIssue("error", "SEARCH_KEY_COLLISION", `${searchKeys.liveCollisions} key(s) collide across live search documents; kb-find can silently discard a result`);
  if (searchKeys.historyOnlyCollisions) addIssue("error", "SEARCH_HISTORY_KEY_COLLISION", `${searchKeys.historyOnlyCollisions} key(s) collide only when cold history is included; kb-find --history can silently discard a result`);
  if (catalogCoverage.missing) addIssue("error", "CATALOG_SOURCE_LAG", `${catalogCoverage.missing} live Markdown unit(s) are absent from CATALOG.md`);
  if (searchCoverage.missing) addIssue("error", "SEARCH_SOURCE_LAG", `${searchCoverage.missing} live Markdown unit(s) are absent from search.json`);
  if (coldSearchCoverage.missing) addIssue("error", "SEARCH_COLD_SOURCE_LAG", `${coldSearchCoverage.missing} cold-history Markdown unit(s) are absent from search.json`);
  if (catalogCoverage.identityMismatches) addIssue("error", "CATALOG_IDENTITY_MISMATCH", `${catalogCoverage.identityMismatches} catalog unit(s) disagree with the live stable ID/path/title triple`);
  if (searchCoverage.identityMismatches) addIssue("error", "SEARCH_IDENTITY_MISMATCH", `${searchCoverage.identityMismatches} search unit(s) disagree with the live stable ID/path/title triple`);
  if (coldSearchCoverage.identityMismatches) addIssue("error", "SEARCH_COLD_IDENTITY_MISMATCH", `${coldSearchCoverage.identityMismatches} cold search unit(s) disagree with the source stable ID/path/title triple`);
  if (catalogCoverage.extra) addIssue("error", "CATALOG_SOURCE_EXTRA", `${catalogCoverage.extra} live-catalog unit(s) have no exact Markdown source unit`);
  if (searchCoverage.extra) addIssue("error", "SEARCH_SOURCE_EXTRA", `${searchCoverage.extra} live search document(s) have no exact Markdown source unit`);
  if (coldSearchCoverage.extra) addIssue("error", "SEARCH_COLD_SOURCE_EXTRA", `${coldSearchCoverage.extra} cold search document(s) have no exact archived Markdown source unit`);
  if (parsedCatalog.delimiterCollisions.length) {
    addIssue("warning", "CATALOG_DELIMITER_COLLISION", `${parsedCatalog.delimiterCollisions.length} catalog title(s) contain the visual field separator; search.json is safe, but split-based catalog fallback is not`);
  }

  const schema = vocabCompatibility(vocab, template);
  if (!schema.compatible) addIssue("warning", "VOCAB_COMPATIBILITY_GAP", `missing current template terms: ${schema.missing.slice(0, 8).join(", ")}`);
  const thinkerExchange = inspectThinkerExchange(root, sourceBytes);
  const thinkerReady = !thinkerExchange.present || !thinkerExchange.markerValid || thinkerExchange.governed;
  if (thinkerExchange.present && thinkerExchange.markerValid && !thinkerExchange.governed) {
    addIssue("error", "THINKER_EXCHANGE_INVALID", `${thinkerExchange.issues.length} thinker custody issue(s): ${thinkerExchange.issues.slice(0, 3).join("; ")}`);
  }
  const extras = extraTrees(root, thinkerExchange.markerValid ? new Set(["thinker"]) : new Set());
  for (const tree of extras) addIssue("warning", "UNGOVERNED_TREE", `${tree.path} contains ${tree.files} file(s) outside the four stores`);

  const cached = {
    present: Boolean(health),
    authoritative: healthFresh,
    checkedAt: typeof health?.checkedAt === "string" ? health.checkedAt : null,
    recordedFingerprint: typeof health?.storeHash === "string" ? health.storeHash : null,
    sourceFingerprintMatches: healthFresh,
    healthy: typeof health?.healthy === "boolean" ? health.healthy : null,
    indexFailed: Boolean(health?.indexFailed),
    indexError: typeof health?.indexError === "string" ? health.indexError.slice(0, 500) : "",
    staleFlag: Boolean(health?.stale),
    units: typeof health?.units === "number" ? health.units : null,
    sourceFiles: typeof health?.sourceFiles === "number" ? health.sourceFiles : null,
    unclassified: lengthOf(health?.unclassified),
    duplicateIds: lengthOf(health?.duplicateIds),
    unresolvedRelations: lengthOf(health?.unresolvedRelations),
    dangling: lengthOf(health?.dangling),
    orphans: lengthOf(health?.orphans),
    artifactChecks: lengthOf(health?.artifactChecks),
    artifactFailures: lengthOf(health?.artifactFailures),
    archivalArtifactWarnings: lengthOf(health?.archivalArtifactWarnings),
    artifactOutcomes: outcomeCounts(Array.isArray(health?.artifactChecks) ? health.artifactChecks : []),
    artifactFailureSample: Array.isArray(health?.artifactFailures) ? health.artifactFailures.slice(0, 8) : [],
    archivalArtifactWarningSample: Array.isArray(health?.archivalArtifactWarnings) ? health.archivalArtifactWarnings.slice(0, 8) : [],
    ratchetNewDebt: {
      unclassified: lengthOf(health?.ratchet?.newDebt?.unclassified),
      dangling: lengthOf(health?.ratchet?.newDebt?.dangling),
      orphans: lengthOf(health?.ratchet?.newDebt?.orphans),
    },
  };
  if (cached.indexFailed) addIssue(healthFresh ? "error" : "warning", "HEALTH_INDEX_FAILED", `the health run recorded an index failure${cached.indexError ? `: ${cached.indexError.split(/\r?\n/)[0]}` : ""}${healthFresh ? "" : " (receipt is stale)"}`);
  if (cached.staleFlag) addIssue("error", "HEALTH_RECEIPT_STALE_FLAG", "the health receipt itself records source/index drift");
  const countDivergences = [
    ...(cached.units !== null && cached.units !== catalog.length
      ? [{ field: "health.units/catalog", recorded: cached.units, observed: catalog.length }] : []),
    ...(cached.units !== null && cached.units !== liveSearchDocuments.length
      ? [{ field: "health.units/search.live", recorded: cached.units, observed: liveSearchDocuments.length }] : []),
    ...(cached.sourceFiles !== null && cached.sourceFiles !== source.files
      ? [{ field: "health.sourceFiles/source", recorded: cached.sourceFiles, observed: source.files }] : []),
    ...(cached.artifactChecks !== lengthOf(graph.artifacts)
      ? [{ field: "health.artifactChecks/graph.artifacts", recorded: cached.artifactChecks, observed: lengthOf(graph.artifacts) }] : []),
  ];
  if (countDivergences.length) addIssue(healthFresh ? "error" : "warning", "CACHE_COUNT_DIVERGENCE", `${countDivergences.length} health/catalog/search/graph count(s) disagree${healthFresh ? "" : " (receipt is stale)"}`);
  const baselinePresent = existsSync(baselinePath);
  const baselineValid = baseline?.schema === "promptus.health-baseline.v1"
    && Array.isArray(baseline?.unclassified) && Array.isArray(baseline?.dangling) && Array.isArray(baseline?.orphans);
  const inherited = (values: string[], allowed: unknown) =>
    values.filter((value) => !(Array.isArray(allowed) ? allowed : []).includes(value));
  const currentDebt = {
    unclassified: (Array.isArray(health?.unclassified) ? health.unclassified : []).map((item: any) => String(item.path ?? item)),
    dangling: (Array.isArray(health?.dangling) ? health.dangling : []).map((item: any) => `${String(item.from)}→${String(item.target)}`),
    orphans: (Array.isArray(health?.orphans) ? health.orphans : []).map(String),
  };
  const computedNewDebt = baselineValid ? {
    unclassified: inherited(currentDebt.unclassified, baseline.unclassified),
    dangling: inherited(currentDebt.dangling, baseline.dangling),
    orphans: inherited(currentDebt.orphans, baseline.orphans),
  } : { unclassified: [] as string[], dangling: [] as string[], orphans: [] as string[] };
  const computedNewDebtCount = computedNewDebt.unclassified.length + computedNewDebt.dangling.length + computedNewDebt.orphans.length;
  const receiptNewDebt = cached.ratchetNewDebt.unclassified + cached.ratchetNewDebt.dangling + cached.ratchetNewDebt.orphans;
  const ratchet = {
    baselinePath: fwd(relative(root, baselinePath)),
    baselinePresent,
    baselineValid,
    recordedAt: typeof baseline?.recordedAt === "string" ? baseline.recordedAt : null,
    receiptEnabled: Boolean(health?.ratchet?.enabled),
    receiptBaselineMissing: Boolean(health?.ratchet?.baselineMissing),
    authoritative: healthFresh,
    currentDebt: Object.fromEntries(Object.entries(currentDebt).map(([name, values]) => [name, values.length])),
    newDebt: Object.fromEntries(Object.entries(computedNewDebt).map(([name, values]) => [name, { count: values.length, sample: values.slice(0, 8) }])),
  };
  if (!baselinePresent) addIssue("info", "RATCHET_NOT_ESTABLISHED", "no health debt baseline is recorded; inherited versus new classification/graph debt cannot be distinguished");
  else if (!baselineValid) addIssue("warning", "HEALTH_BASELINE_INVALID", `${ratchet.baselinePath} does not match promptus.health-baseline.v1`);
  if (healthFresh && baselineValid && computedNewDebtCount) addIssue("error", "RATCHET_NEW_DEBT", `${computedNewDebtCount} current classification/graph defect(s) exceed the recorded baseline`);
  if (healthFresh && health?.ratchet?.baselineMissing) addIssue("error", "RATCHET_BASELINE_MISSING", "the current health receipt was requested with ratcheting but found no valid baseline");
  if (cached.duplicateIds || cached.unresolvedRelations) {
    addIssue(healthFresh ? "error" : "warning", "CACHED_HARD_INTEGRITY_FAILURE", `health receipt names ${cached.duplicateIds} duplicate id(s) and ${cached.unresolvedRelations} unresolved relation(s)${healthFresh ? "" : " (receipt is stale)"}`);
  }
  if (receiptNewDebt) addIssue(healthFresh ? "error" : "warning", "RATCHET_DEBT", `health receipt names ${receiptNewDebt} post-baseline classification/graph defect(s)${healthFresh ? "" : " (receipt is stale)"}`);
  if (cached.dangling || cached.orphans) addIssue("warning", "GRAPH_DEBT", `cached graph names ${cached.dangling} dangling link(s) and ${cached.orphans} orphan(s)${healthFresh ? "" : " (receipt is stale)"}`);
  if (cached.artifactFailures) addIssue(healthFresh ? "error" : "warning", "ARTIFACT_DEBT", `health receipt names ${cached.artifactFailures}/${cached.artifactChecks} failed artifact dependencies${healthFresh ? "" : " (receipt is stale)"}`);
  if (cached.archivalArtifactWarnings) addIssue("warning", "ARCHIVAL_ARTIFACT_DRIFT", `health receipt names ${cached.archivalArtifactWarnings} failed artifact dependency record(s) owned by superseded or retired units; active evidence remains unaffected${healthFresh ? "" : " (receipt is stale)"}`);

  const cachedGraph = {
    authoritative: healthFresh,
    nodes: lengthOf(graph.nodes),
    relations: lengthOf(graph.relations),
    relationsByType: relationCounts(graph.relations ?? []),
    unresolvedRelations: (graph.relations ?? []).filter((edge) => edge.resolved === false).length,
    dangling: lengthOf(graph.dangling),
    danglingByReason: outcomeCounts((graph.dangling ?? []).map((edge) => ({ outcome: edge.reason ?? "unknown" }))),
    danglingSample: (graph.dangling ?? []).slice(0, 8),
    orphans: countOrphans(graph),
    artifactRecords: lengthOf(graph.artifacts),
    uniqueArtifactSpecs: new Set((graph.artifacts ?? []).map((record) => record.spec)).size,
    unresolvedSample: (graph.relations ?? []).filter((edge) => edge.resolved === false).slice(0, 8),
  };
  if (cachedGraph.artifactRecords === 0) addIssue("info", "NO_ARTIFACT_DEPENDENCIES", "the store declares no artifact dependencies; zero failures means nothing was checked, not that provenance is complete");
  const aliasRegistry = aliasRegistrySummary(root, searchDocuments, graph);
  if (aliasRegistry.present && !aliasRegistry.valid) addIssue("error", "ALIAS_REGISTRY_INVALID", `${aliasRegistry.path} is not a versioned string-to-string alias map`);
  if (aliasRegistry.collisions || aliasRegistry.missingTargets) addIssue("error", "ALIAS_REGISTRY_BROKEN", `${aliasRegistry.collisions} alias collision(s) and ${aliasRegistry.missingTargets} missing canonical target(s)`);
  if (aliasRegistry.recoverableDangling) addIssue("warning", "ALIAS_REGISTRY_NOT_APPLIED", `${aliasRegistry.recoverableDangling} cached dangling edge(s) have valid compatibility aliases that the current graph did not resolve`);
  if (!aliasRegistry.present && cachedGraph.dangling) addIssue("info", "ALIAS_REGISTRY_UNAVAILABLE", `${cachedGraph.dangling} cached dangling edge(s) cannot be tested against an optional compatibility-alias registry`);

  const deepArtifacts = argv.includes("--artifacts");
  const artifactStarted = performance.now();
  let artifactChecks: Array<{ from: string; spec: string; status?: string; ok: boolean; outcome: string }> = [];
  if (deepArtifacts) {
    const records = graph.artifacts ?? [];
    const parsed: Array<{ index: number; spec: ArtifactSpec }> = [];
    const invalid = new Map<number, string>();
    for (const [index, record] of records.entries()) {
      try { parsed.push({ index, spec: parseArtifactSpec(record.spec) }); }
      catch (error) { invalid.set(index, `invalid-spec: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const verified = checkArtifacts(root, parsed.map((item) => item.spec));
    const verifiedByRecord = new Map(parsed.map((item, index) => [item.index, verified[index]]));
    artifactChecks = records.map((record, index) => {
      const checked = verifiedByRecord.get(index);
      return {
        from: record.from,
        spec: record.spec,
        status: record.status,
        ok: checked?.ok ?? false,
        outcome: invalid.get(index) ?? checked?.outcome ?? "invalid-spec",
      };
    });
    const failures = artifactChecks.filter((check) => !check.ok && !isArchivalArtifactStatus(check.status));
    const archivalWarnings = artifactChecks.filter((check) => !check.ok && isArchivalArtifactStatus(check.status));
    if (failures.length) addIssue("error", "ARTIFACTS_FAIL_NOW", `${failures.length} current artifact dependencies fail a live read-only check`);
    const artifactKey = (check: { from: string; spec: string }) => `${check.from}\0${check.spec}`;
    const cachedArchivalKeys = new Set(
      (Array.isArray(health?.archivalArtifactWarnings) ? health.archivalArtifactWarnings : []).map(artifactKey),
    );
    const liveArchivalKeys = new Set(archivalWarnings.map(artifactKey));
    const archivalChanged = cachedArchivalKeys.size !== liveArchivalKeys.size
      || [...liveArchivalKeys].some((key) => !cachedArchivalKeys.has(key));
    if (archivalWarnings.length && (!healthFresh || archivalChanged)) {
      addIssue("warning", "ARCHIVAL_ARTIFACT_DRIFT_NOW", `${archivalWarnings.length} superseded- or retired-unit artifact dependencies fail a live read-only check`);
    }
    if (!healthFresh && artifactChecks.length) addIssue("warning", "ARTIFACT_COVERAGE_STALE", "live artifact checks cover only dependencies in a stale graph cache");
  } else if (cachedGraph.artifactRecords) {
    addIssue("info", "ARTIFACTS_NOT_RECHECKED", `pass --artifacts to re-hash ${cachedGraph.artifactRecords} cached dependencies without writing`);
  }
  const artifactMs = Math.round((performance.now() - artifactStarted) * 10) / 10;

  const completeCoverage = (value: ReturnType<typeof coverage>) =>
    value.missing === 0 && value.identityMismatches === 0 && value.extra === 0;
  const searchKeyReady = searchKeys.missing === 0 && searchKeys.collisions === 0;
  const historyRetrievalReady = completeCoverage(coldSearchCoverage) && searchKeys.historyOnlyCollisions === 0;
  const cacheReady = missingCache.length === 0 && unreadableCache.length === 0 && healthFresh
    && searchSchemaValid && searchMatchesCatalog && searchKeyReady
    && completeCoverage(catalogCoverage) && completeCoverage(searchCoverage) && historyRetrievalReady
    && (healthFresh ? countDivergences.length === 0 : true);
  const orientationReady = configured && nowFresh && missingOrientation.length === 0 && ledgerStructureReady;
  const retrievalReady = cacheReady;
  const graphTraversalReady = healthFresh && cachedGraph.unresolvedRelations === 0 && aliasRegistry.recoverableDangling === 0;
  const graphTraversalComplete = graphTraversalReady && cachedGraph.dangling === 0;
  const artifactFailuresNow = artifactChecks.filter((check) => !check.ok && !isArchivalArtifactStatus(check.status));
  const archivalArtifactWarningsNow = artifactChecks.filter((check) => !check.ok && isArchivalArtifactStatus(check.status));
  const hardIntegrityReady = healthFresh && cached.duplicateIds === 0 && cached.unresolvedRelations === 0
    && cached.artifactFailures === 0 && artifactFailuresNow.length === 0 && (!baselineValid || computedNewDebtCount === 0)
    && !health?.ratchet?.baselineMissing && !cached.indexFailed && !cached.staleFlag && thinkerReady;
  const sessionReady = orientationReady && retrievalReady && graphTraversalReady && hardIntegrityReady;
  const integrityReceiptReady = healthFresh && cached.duplicateIds === 0 && cached.unresolvedRelations === 0
    && cached.unclassified === 0 && cached.artifactFailures === 0
    && (!baselineValid || computedNewDebtCount === 0);
  const result = {
    schema: "promptus.session-doctor.v1",
    root: fwd(root),
    readOnly: true,
    sessionReady,
    orientationReady,
    retrievalReady,
    historyRetrievalReady,
    graphTraversalReady,
    graphTraversalComplete,
    hardIntegrityReady,
    integrityReceiptReady,
    orientation,
    orientationSource: {
      northStarHeading: northStarSection?.heading ?? null,
      canonicalNorthStarHeading: Boolean(canonicalNorthStar),
    },
    handoff: {
      configured,
      startMarkers: startCount,
      endMarkers: endCount,
      markers,
      expected,
      fresh: nowFresh,
      missingFields: missingOrientation,
      appendSentinels: { count: sentinelLines.length, lines: sentinelLines },
    },
    scale: {
      sourceFiles: source.files,
      sourceBytes: source.bytes,
      ledgerBytes: Buffer.byteLength(ledger),
      ledgerUnits: entries.length,
      liveSourceUnits: liveSourceUnits.length,
      coldSourceUnits: coldSourceUnits.length,
      catalogUnits: catalog.length,
      searchDocuments: searchDocuments.length,
      liveSearchDocuments: liveSearchDocuments.length,
      coldSearchDocuments: coldSearchDocuments.length,
    },
    source: {
      fingerprint: source.hash,
      files: source.files,
      bytes: source.bytes,
      newest: source.newest,
    },
    healthReceipt: cached,
    cache: {
      ready: cacheReady,
      missing: missingCache,
      unreadable: unreadableCache,
      files: [catalogPath, searchPath, graphPath, healthPath].map((path) => fileReceipt(root, path)),
      healthFingerprintMatches: healthFresh,
      searchSchema: search?.schema ?? null,
      searchSchemaValid,
      catalogHash,
      recordedSearchCatalogHash: search?.catalogHash ?? null,
      searchCatalogHashMatches: searchMatchesCatalog,
      countDivergences,
      searchKeys,
      catalogPolicy: "CATALOG.md contains live units; search.json may additionally contain cold-history units.",
      delimiterCollisions: {
        count: parsedCatalog.delimiterCollisions.length,
        sample: parsedCatalog.delimiterCollisions.slice(0, 5),
      },
      catalogCoverage,
      searchCoverage,
      coldSearchCoverage,
    },
    schemaCompatibility: schema,
    thinkerExchange,
    extraTrees: extras,
    aliasRegistry,
    ratchet,
    cachedGraph,
    graphPolicy: "Unresolved typed relations and known-but-unapplied compatibility aliases block traversal; ordinary dangling concept handles remain visible debt and make traversal incomplete without blocking lexical retrieval.",
    artifacts: {
      checkedNow: deepArtifacts,
      checked: artifactChecks.length,
      uniqueChecked: new Set(artifactChecks.map((check) => check.spec)).size,
      failures: artifactFailuresNow.length,
      archivalWarnings: archivalArtifactWarningsNow.length,
      outcomes: outcomeCounts(artifactChecks),
      sample: artifactFailuresNow.slice(0, 8),
      archivalSample: archivalArtifactWarningsNow.slice(0, 8),
    },
    issues,
    timingMs: {
      fingerprint: fingerprintMs,
      artifacts: artifactMs,
      total: Math.round((performance.now() - started) * 10) / 10,
    },
    performance: {
      rssBytes: process.memoryUsage().rss,
    },
    guarantee: "No files were written, rebuilt, repaired, refreshed, or baselined.",
  };

  if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.filter((issue) => issue.severity === "warning").length;
    console.log(`promptus-session-doctor: ${fwd(root)}`);
    console.log(`  ${sessionReady ? "READY" : "STOP "} session · ${errors} error(s) · ${warnings} warning(s) · read-only`);
    console.log(`  scale: ${liveSourceUnits.length} live + ${coldSourceUnits.length} cold units (${entries.length} ledger) · ${catalog.length} catalog units · ${source.files} source files · ${(source.bytes / 1024 / 1024).toFixed(1)} MiB`);
    console.log(`  ${orientationReady ? "ok  " : "FAIL"} handoff: ${markers[0] ?? "missing"} / expected ${expected}${missingOrientation.length ? ` · missing ${missingOrientation.join(", ")}` : ""}`);
    console.log(`  ${retrievalReady ? "ok  " : "FAIL"} retrieval: source receipt ${healthFresh ? "current" : "STALE"} · catalog missing/mismatch/extra ${catalogCoverage.missing}/${catalogCoverage.identityMismatches}/${catalogCoverage.extra} · live search ${searchCoverage.missing}/${searchCoverage.identityMismatches}/${searchCoverage.extra} · cold search ${coldSearchCoverage.missing}/${coldSearchCoverage.identityMismatches}/${coldSearchCoverage.extra}`);
    console.log(`  ${graphTraversalReady ? "ok  " : "FAIL"} graph traversal gate (${graphTraversalComplete ? "complete" : "incomplete"}): ${cachedGraph.unresolvedRelations} unresolved relation(s) · ${aliasRegistry.recoverableDangling} recoverable alias edge(s) unapplied · ${cachedGraph.dangling} dangling handle(s)`);
    console.log(`  ${hardIntegrityReady ? "ok  " : "FLAG"} cached integrity (${healthFresh ? "current" : "STALE — not authoritative"}): ${cached.duplicateIds} duplicate · ${cached.unresolvedRelations} relation · ${cached.unclassified} unclassified · ${cached.artifactFailures} current artifact failure(s) · ${cached.archivalArtifactWarnings} archival warning(s)`);
    if (thinkerExchange.present && thinkerExchange.markerValid) console.log(`  ${thinkerReady ? "ok  " : "FAIL"} thinker exchange: ${thinkerExchange.rounds.length} round(s)`);
    for (const issue of issues) {
      console.log(`  ${issue.severity.toUpperCase().padEnd(7)} ${issue.code}: ${issue.message}`);
      if (issue.severity === "error") console.log(`    ${issue.surface}: ${issue.recovery}`);
    }
    console.log(`  ${result.guarantee}`);
  }
  return sessionReady ? 0 : 1;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ready: false, issues: [{ severity: "error", code: "PREFLIGHT_UNAVAILABLE", message,
    ...recoveryFor("PREFLIGHT_UNAVAILABLE", arg(process.argv, "root") ?? process.cwd()) }], guarantee: "No repair was attempted." }));
  else console.error(`promptus-session-doctor: ${message}`);
  process.exit(2);
}
