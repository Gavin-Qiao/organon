/** Optional local QMD adapter. No default dependencies, downloads, server or source writes. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { collectEffectiveUnits } from "./read-store.ts";
import { loadVocab } from "./vocab.ts";
import { searchResultKey, type SearchOptions, type SearchSourceDocument } from "./search.ts";

export const SEMANTIC_SCHEMA = "promptus.qmd-units.v1";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const INACTIVE = new Set(["SUPERSEDED", "REFUTED", "RETIRED", "UNTRUSTED"]);
const statLink = (path: string) => { try { return lstatSync(path); } catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; } };
export const semanticDatabase = (base: string, config: SemanticConfig) => join(base, `qmd-${sha(JSON.stringify(config))}.sqlite`);
const databaseHasSidecars = (path: string) => ["-wal", "-shm", "-journal"].some(suffix => !!statLink(path + suffix));
const databaseHash = (path: string) => {
  if (databaseHasSidecars(path)) throw new Error("semantic database has interrupted sidecar state; run kb-semantic update");
  return sha(readFileSync(path));
};
export interface SemanticConfig { schema: string; packageRoot: string; node: string; model: string; modelSha256: string }
export interface SemanticDocument extends SearchSourceDocument { key: string; file: string; group: string; aliases: string[]; slug: string | null; relations: Array<{ type: string; target: string }> }
export interface SemanticSnapshot { fingerprint: string; documents: SemanticDocument[] }

export function semanticSnapshot(root: string): SemanticSnapshot {
  const vocab = loadVocab(root), seen = new Set<string>();
  const documents = collectEffectiveUnits(root, vocab).map(unit => {
    const doc = { substrate: unit.substrate, status: unit.status, title: unit.title, path: unit.relPath, id: unit.id, links: unit.links, cold: unit.cold, text: unit.text };
    const key = searchResultKey(doc);
    if (seen.has(key)) throw new Error(`duplicate semantic unit identity: ${key}`);
    seen.add(key);
    const path = realpathSync(join(root, doc.path.split("#")[0])), rel = relative(realpathSync(root), path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("semantic source escapes project root");
    return { ...doc, aliases: unit.aliases, slug: unit.slug, relations: unit.relations, key, file: `${sha(key)}.md`, group: `g${sha(JSON.stringify([doc.substrate, doc.status, doc.cold])).slice(0, 24)}` };
  }).sort((a, b) => a.key.localeCompare(b.key));
  return { fingerprint: sha(JSON.stringify({ schema: SEMANTIC_SCHEMA, vocab, documents })), documents };
}

/** Reject physical indirection on every adapter-owned cache path before reading/writing. */
export function semanticBase(root: string, create = false): string {
  let path = resolve(root);
  for (const segment of [".promptus", "cache", "semantic"]) {
    path = join(path, segment);
    const info = statLink(path);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`unsafe semantic directory: ${path}`);
    if (create && !existsSync(path)) mkdirSync(path);
  }
  return path;
}

function safeTree(path: string): void {
  const info = statLink(path);
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`semantic cache contains a symlink: ${path}`);
  if (!info.isDirectory() && (!info.isFile() || info.nlink !== 1)) throw new Error(`semantic cache contains an unsafe or hard-linked file: ${path}`);
  if (info.isDirectory()) for (const name of readdirSync(path)) safeTree(join(path, name));
}

function validateConfig(config: SemanticConfig): void {
  if (config.schema !== SEMANTIC_SCHEMA || ![config.packageRoot, config.node, config.model].every(path => typeof path === "string" && isAbsolute(path))) throw new Error("invalid local semantic configuration");
  const pkg = JSON.parse(readFileSync(join(config.packageRoot, "package.json"), "utf8"));
  if (pkg.name !== "@tobilu/qmd" || pkg.version !== "2.8.3") throw new Error("semantic adapter requires QMD 2.8.3; install it separately before configuring");
  if (!statSync(config.model).isFile() || !statSync(config.node).isFile() || !existsSync(join(config.packageRoot, "dist/index.js"))) throw new Error("missing local semantic runtime, model or SDK");
}

function exclusive<T>(base: string, action: () => T): T {
  safeTree(base);
  const lock = join(base, "operation.lock");
  try { writeFileSync(lock, JSON.stringify({ pid: process.pid, created: new Date().toISOString() }), { flag: "wx", mode: 0o600 }); }
  catch { throw new Error("semantic operation already active or interrupted; inspect operation.lock and confirm its process stopped before removing it"); }
  try { return action(); } finally { unlinkSync(lock); }
}

function atomicJson(base: string, name: string, value: unknown) {
  const temporary = join(base, `${name}.${process.pid}.tmp`);
  try { writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); renameSync(temporary, join(base, name)); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export function configureSemantic(root: string, options: { packageRoot: string; node: string; model: string }) {
  const config: SemanticConfig = { schema: SEMANTIC_SCHEMA, packageRoot: realpathSync(options.packageRoot), node: realpathSync(options.node), model: realpathSync(options.model), modelSha256: sha(readFileSync(options.model)) };
  validateConfig(config);
  const version = spawnSync(config.node, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (version.status !== 0 || Number(/^v(\d+)\./.exec(version.stdout)?.[1] ?? 0) < 22) throw new Error("semantic worker requires a local Node runtime >=22");
  const base = semanticBase(root, true);
  return exclusive(base, () => {
    // Configuration changes invalidate the published receipt even before refresh.
    if (existsSync(join(base, "receipt.json"))) unlinkSync(join(base, "receipt.json"));
    atomicJson(base, "config.json", config);
    return { configured: true, next: "kb-semantic update", modelSha256: config.modelSha256 };
  });
}

function configured(base: string): SemanticConfig {
  const config = JSON.parse(readFileSync(join(base, "config.json"), "utf8")); validateConfig(config); return config;
}

function worker(base: string, config: SemanticConfig, request: object, timeout: number): any {
  const exchange = mkdtempSync(join(base, "request-"));
  try {
    const input = join(exchange, "request.json"), response = join(exchange, "response.json");
    writeFileSync(input, JSON.stringify({ ...request, config, dbPath: semanticDatabase(base, config), response }), { mode: 0o600 });
    const child = spawnSync(config.node, [join(import.meta.dir, "semantic-worker.mjs"), input], {
      cwd: base, encoding: "utf8", timeout, maxBuffer: 1024 * 1024,
      // QMD's chunk tokenizer also consults the global embedding model. Bind
      // both paths explicitly: a per-store model alone can reach an unstaged default.
      env: { ...process.env, QMD_FORCE_CPU: "1", QMD_EMBED_MODEL: config.model, NODE_LLAMA_CPP_SKIP_DOWNLOAD: "true", XDG_CACHE_HOME: join(base, "runtime-cache") },
    });
    const result = existsSync(response) ? JSON.parse(readFileSync(response, "utf8")) : undefined;
    if (child.status !== 0 || !result || result.error) throw new Error(result?.error ?? `semantic worker failed: ${child.error?.message ?? child.stderr.slice(-1000)}`);
    return result.result;
  } finally { rmSync(exchange, { recursive: true, force: true }); }
}

export function updateSemantic(root: string) {
  const base = semanticBase(root, true);
  return exclusive(base, () => {
    const config = configured(base), snapshot = semanticSnapshot(root), configHash = sha(JSON.stringify(config));
    if (sha(readFileSync(config.model)) !== config.modelSha256) throw new Error("semantic model changed; configure the intended model again");
    const receiptPath = join(base, "receipt.json");
    const db = semanticDatabase(base, config);
    let reusable = false;
    if (existsSync(receiptPath)) {
      let previous: any;
      try { previous = JSON.parse(readFileSync(receiptPath, "utf8")); } catch { /* Disposable receipt is unverified: rebuild. */ }
      reusable = previous?.schema === SEMANTIC_SCHEMA && previous.configHash === configHash && existsSync(db) && !databaseHasSidecars(db) && previous.databaseHash === databaseHash(db);
      if (reusable && previous.fingerprint === snapshot.fingerprint) return { unchanged: true, units: snapshot.documents.length };
      unlinkSync(receiptPath);
    }
    // Without a receipt no partial database is trusted, even if it opens cleanly.
    // Rebuild only this configuration's disposable generation.
    if (!reusable) {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) if (existsSync(db + suffix)) unlinkSync(db + suffix);
    }
    const units = join(base, "units"); mkdirSync(units, { recursive: true });
    const wanted = new Set(snapshot.documents.map(doc => `${doc.group}/${doc.file}`));
    for (const group of readdirSync(units)) {
      if (!/^g[a-f0-9]{24}$/.test(group) || !statSync(join(units, group)).isDirectory()) throw new Error("unexpected semantic projection directory");
      for (const name of readdirSync(join(units, group))) {
        if (!/^[a-f0-9]{64}\.md$/.test(name)) throw new Error("unexpected semantic projection file");
        if (!wanted.has(`${group}/${name}`)) unlinkSync(join(units, group, name));
      }
    }
    const collections: Record<string, { path: string; pattern: string }> = {};
    for (const doc of snapshot.documents) {
      const directory = join(units, doc.group); mkdirSync(directory, { recursive: true });
      collections[doc.group] = { path: directory, pattern: "*.md" };
      const path = join(directory, doc.file), text = `# ${doc.title}\n\n${doc.text}`;
      if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeFileSync(path, text, { mode: 0o600 });
    }
    // QMD's SDK collection removal deletes configuration, not document rows.
    // Scan emptied collections once so its updater deactivates their old rows.
    const retiredGroups = readdirSync(units).filter(group => !(group in collections));
    for (const group of retiredGroups) collections[group] = { path: join(units, group), pattern: "*.md" };
    const result = worker(base, config, { action: "update", collections, retiredGroups }, 20 * 60_000);
    if (semanticSnapshot(root).fingerprint !== snapshot.fingerprint) throw new Error("source changed during semantic refresh; rerun update");
    if (sha(readFileSync(config.model)) !== config.modelSha256) throw new Error("semantic model changed during refresh; configure and update again");
    atomicJson(base, "receipt.json", { schema: SEMANTIC_SCHEMA, fingerprint: snapshot.fingerprint, configHash, databaseHash: databaseHash(semanticDatabase(base, config)), units: snapshot.documents.length, updated: new Date().toISOString() });
    return { unchanged: false, units: snapshot.documents.length, result };
  });
}

export function semanticCandidates(root: string, snapshot: SemanticSnapshot, query: string, options: SearchOptions & { limit: number }): SemanticDocument[] {
  const base = semanticBase(root);
  if (!existsSync(join(base, "config.json"))) throw new Error("semantic retrieval is not configured; use kb-semantic configure");
  return exclusive(base, () => {
    const config = configured(base), receipt = JSON.parse(readFileSync(join(base, "receipt.json"), "utf8"));
    if (receipt.schema !== SEMANTIC_SCHEMA || receipt.fingerprint !== snapshot.fingerprint || receipt.configHash !== sha(JSON.stringify(config))) throw new Error("semantic index is stale; run kb-semantic update");
    const db = semanticDatabase(base, config);
    if (!existsSync(db) || receipt.databaseHash !== databaseHash(db)) throw new Error("semantic database is missing or changed; run kb-semantic update");
    if (sha(readFileSync(config.model)) !== config.modelSha256) throw new Error("semantic model changed; configure and update again");
    const eligible = snapshot.documents.filter(doc => (options.history || !doc.cold) && (!options.substrate || options.substrate === doc.substrate) && (!options.status || options.status === doc.status)
      && (options.status || options.history || options.includeInactive || !INACTIVE.has(doc.status.toUpperCase())));
    if (!eligible.length) return [];
    const groups = [...new Set(eligible.map(doc => doc.group))];
    const collections = Object.fromEntries(snapshot.documents.map(doc => [doc.group, { path: join(base, "units", doc.group), pattern: "*.md" }]));
    const hits = worker(base, config, { action: "query", query, groups, collections, limit: options.limit }, 60_000);
    if (semanticSnapshot(root).fingerprint !== snapshot.fingerprint) throw new Error("source changed during semantic query");
    if (sha(readFileSync(config.model)) !== config.modelSha256) throw new Error("semantic model changed during query; configure and update again");
    const byFile = new Map(eligible.map(doc => [`qmd://${doc.group}/${doc.file}`, doc])), seen = new Set<string>();
    if (!Array.isArray(hits)) throw new Error("invalid semantic response");
    const candidates = hits.flatMap((hit: { filepath: string }) => {
      const doc = byFile.get(hit?.filepath);
      if (!doc) throw new Error("semantic response contains an unexpected unit identifier");
      if (seen.has(doc.key)) return [];
      seen.add(doc.key); return [doc];
    });
    // QMD may update its own query cache. Certify it only after checking source,
    // model, response identity and fully closed SQLite state.
    const updatedHash = databaseHash(db);
    if (updatedHash !== receipt.databaseHash) atomicJson(base, "receipt.json", { ...receipt, databaseHash: updatedHash });
    return candidates;
  });
}
