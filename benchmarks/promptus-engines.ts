#!/usr/bin/env bun
/** Public Organon development comparison. Never accepts a live-project root. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { collectUnits } from "../promptus/scripts/kb-index.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
import { createRelationResolver, inverseLifecycleStatus } from "../promptus/scripts/lib/relation-lifecycle.ts";
import { buildSearchIndex, searchIndex, searchResultKey, searchTokens, type SearchSourceDocument } from "../promptus/scripts/lib/search.ts";
import { evaluateRankings, lifecycleAwareCandidateUnion } from "./promptus-retrieval.ts";

const REPO = resolve(import.meta.dir, "..");
const INACTIVE = new Set(["SUPERSEDED", "REFUTED", "RETIRED", "UNTRUSTED"]);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const isActive = (status: string) => !INACTIVE.has(status.replace(/^[★⚠↩]/, "").trim().toUpperCase());

export function inside(path: string, root: string): boolean {
  const rel = relative(realpathSync(root), realpathSync(path));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"));
}

export function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, minMs: sorted[0], medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] };
}

function bytes(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  return stat.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + bytes(join(path, name)), 0) : stat.size;
}

function corpus() {
  const vocab = loadVocab(REPO);
  const units = collectUnits(REPO, vocab).filter(unit => !unit.cold);
  const resolver = createRelationResolver(units);
  for (const unit of units) for (const relation of unit.relations) {
    const target = resolver.resolve(relation.target);
    const status = target ? inverseLifecycleStatus(vocab, relation, target) : undefined;
    if (target && status) target.status = status;
  }
  return units.map(unit => ({
    substrate: unit.substrate, status: unit.status, title: unit.title,
    path: unit.relPath, id: unit.id, links: unit.links, cold: unit.cold,
    text: `# ${unit.title}\n\n${unit.text}`,
  } satisfies SearchSourceDocument));
}

interface Engine {
  query(query: string): Promise<string[]>;
  update?(): Promise<unknown>;
  close(): Promise<void>;
  storage(): number;
}

export async function main(args: string[]): Promise<number> {
  if (args.includes("--help")) {
    console.log("promptus-engines --dependencies <isolated trial directory> [--repeats 3] [--output <report.json>]\nReads only Organon's own store. Generates disposable unit files in OS temp.\nUses pinned QMD and zvec-grep packages, with local cached Potion embeddings.\nThe historical public cases are development evidence, not a fresh holdout.");
    return 0;
  }
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--dependencies", "--repeats", "--output"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`invalid argument: ${args[i]}`);
    flags[args[i]] = args[i + 1];
  }
  if (!flags["--dependencies"]) throw new Error("--dependencies is required");
  const dependencies = realpathSync(flags["--dependencies"]);
  if (!inside(dependencies, tmpdir()) || JSON.parse(readFileSync(join(dependencies, "package.json"), "utf8")).name !== "organon-overhaul-engine-trial") throw new Error("dependencies must be a marked OS-temp trial");
  const versions = Object.fromEntries(["@zvec/zvec-grep", "@tobilu/qmd"].map(name => [name, JSON.parse(readFileSync(join(dependencies, "node_modules", name, "package.json"), "utf8")).version]));
  if (versions["@zvec/zvec-grep"] !== "0.2.1" || versions["@tobilu/qmd"] !== "2.8.3") throw new Error("this protocol requires zvec-grep 0.2.1 and QMD 2.8.3");
  const repeats = Number(flags["--repeats"] ?? 3);
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 20) throw new Error("repeats must be 1–20");
  const output = flags["--output"] ? resolve(flags["--output"]) : undefined;
  if (output && (!inside(dirname(output), join(REPO, "benchmarks", "results")) && !inside(dirname(output), tmpdir()))) throw new Error("output must be in benchmarks/results or OS temp");
  if (output && existsSync(output)) throw new Error("report already exists; choose a new filename");
  const potion = join(dependencies, "models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7");
  for (const path of [join(potion, "model.safetensors"), join(potion, "tokenizer/tokenizer.json"), join(potion, "tokenizer/tokenizer_config.json")]) {
    if (!existsSync(path)) throw new Error(`offline trial requires staged model artifact: ${path}`);
  }
  const documents = corpus();
  const sources = documents.filter(document => isActive(document.status));
  const byKey = new Map(sources.map(document => [searchResultKey(document), document]));
  const filenameToKey = new Map(sources.map(document => [`${sha(searchResultKey(document))}.md`, searchResultKey(document)]));
  const casesFile = join(import.meta.dir, "retrieval-cases-v2.json");
  const rawCases = JSON.parse(readFileSync(casesFile, "utf8")).cases as Array<{ query: string; relevant: string[] }>;
  const excludedCases: unknown[] = [];
  const cases = rawCases.flatMap((item, index) => {
    const keys: string[] = [];
    const reasons: string[] = [];
    for (const target of item.relevant) {
      const matches = documents.filter(document => [searchResultKey(document), document.id, document.path, document.title].includes(target));
      if (matches.length !== 1) reasons.push(`${target}: ${matches.length} matches`);
      else if (!isActive(matches[0].status)) reasons.push(`${target}: ${matches[0].status}`);
      else keys.push(searchResultKey(matches[0]));
    }
    if (reasons.length) { excludedCases.push({ index, query: item.query, reasons }); return []; }
    return [{ query: item.query, relevant: new Set(keys) }];
  });
  if (!cases.length) throw new Error("no currently valid development cases");
  const scratch = mkdtempSync(join(tmpdir(), "organon-engine-run-"));
  const data = join(scratch, "units");
  const results: Record<string, any> = {};
  const engines = new Map<string, Engine>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("engine benchmark is offline; stage models explicitly first"); }) as typeof fetch;
  const measureBuild = async (name: string, make: () => Promise<Engine>) => {
    const started = performance.now();
    try { engines.set(name, await make()); results[name] = { buildMs: performance.now() - started }; }
    catch (error) { results[name] = { error: String(error) }; console.error(`${name}: ${String(error)}`); }
  };
  try {
    mkdirSync(data);
    for (const [filename, key] of filenameToKey) writeFileSync(join(data, filename), byKey.get(key)!.text);
    await measureBuild("promptus-lexical", async () => {
      const index = buildSearchIndex(sources, sha(JSON.stringify(sources)));
      return { query: async query => searchIndex(index, query, {}, doc => byKey.get(doc.key)!.text).map(hit => hit.document.key), close: async () => {}, storage: () => Buffer.byteLength(JSON.stringify(index)) };
    });
    await measureBuild("sqlite-fts5", async () => {
      const file = join(scratch, "fts.sqlite");
      const db = new Database(file);
      db.exec("CREATE VIRTUAL TABLE units USING fts5(key UNINDEXED, title, path, body, tokenize='unicode61 remove_diacritics 2')");
      const insert = db.prepare("INSERT INTO units VALUES (?, ?, ?, ?)");
      db.transaction(() => { for (const [key, document] of byKey) insert.run(key, document.title, document.path, document.text); })();
      return { query: async query => {
        const match = [...new Set(searchTokens(query))].map(term => `\"${term.replaceAll('"', '""')}\"`).join(" OR ");
        return match ? (db.prepare("SELECT key FROM units WHERE units MATCH ? ORDER BY bm25(units, 0, 2.5, 0.5, 1) LIMIT 100").all(match) as { key: string }[]).map(row => row.key) : [];
      }, close: async () => { db.close(); }, storage: () => bytes(file) };
    });
    await measureBuild("qmd-lexical", async () => {
      const { createStore } = await import(pathToFileURL(join(dependencies, "node_modules/@tobilu/qmd/dist/index.js")).href);
      const file = join(scratch, "qmd.sqlite");
      const store = await createStore({ dbPath: file, config: { collections: { units: { path: data, pattern: "**/*.md" } } } });
      try { await store.update(); } catch (error) { await store.close(); throw error; }
      return { query: async query => (await store.searchLex(query, { limit: 100 })).map((hit: any) => filenameToKey.get(basename(hit.filepath))).filter(Boolean), update: () => store.update(), close: () => store.close(), storage: () => bytes(file) + bytes(`${file}-wal`) };
    });
    await measureBuild("qmd-vector-embeddinggemma300m", async () => {
      const model = join(dependencies, "model-cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf");
      if (!existsSync(model)) throw new Error("stage QMD's embedding model before the offline trial");
      const file = join(scratch, "qmd-vector.sqlite");
      const worker = spawn(join(dependencies, "node_modules/node-linux-x64/bin/node"), [join(import.meta.dir, "qmd-engine-worker.mjs")], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env, QMD_FORCE_CPU: "1", XDG_CACHE_HOME: join(dependencies, "model-cache") },
      });
      let sequence = 0;
      let fatal: Error | undefined;
      const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
      const fail = (error: Error) => {
        fatal = error;
        for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
        pending.clear();
      };
      const lines = createInterface({ input: worker.stdout });
      lines.on("line", line => {
        try {
          const message = JSON.parse(line);
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (waiter) clearTimeout(waiter.timer);
          if (message.error) waiter?.reject(new Error(message.error)); else waiter?.resolve(message.result);
        } catch { fail(new Error("invalid worker response")); }
      });
      worker.on("error", fail);
      worker.on("exit", code => fail(new Error(`QMD worker exited ${code}`)));
      worker.stdin.on("error", fail);
      worker.stdout.on("error", fail);
      const send = (action: string, args: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
        if (fatal) { reject(fatal); return; }
        const id = ++sequence;
        const timer = setTimeout(() => { fail(new Error(`QMD worker timed out during ${action}`)); worker.kill(); }, action === "open" ? 300_000 : 30_000);
        pending.set(id, { resolve, reject, timer });
        worker.stdin.write(JSON.stringify({ id, action, ...args }) + "\n", error => { if (error) fail(error); });
      });
      try { await send("open", { dependencies, corpus: data, dbPath: file, model }); }
      catch (error) { lines.close(); worker.kill(); throw error; }
      return {
        query: async query => (await send("query", { query })).map((hit: any) => filenameToKey.get(basename(hit.filepath))).filter(Boolean),
        update: () => send("update"),
        close: async () => { try { await send("close"); } finally { worker.stdin.end(); lines.close(); worker.kill(); } },
        storage: () => bytes(file) + bytes(`${file}-wal`),
      };
    });
    await measureBuild("zvec-hybrid-potion32m", async () => {
      const { createZvecGrep } = await import(pathToFileURL(join(dependencies, "node_modules/@zvec/zvec-grep/dist/index.js")).href);
      const store = await createZvecGrep({ root: data, home: join(scratch, "zg-state"), modelCacheDir: join(dependencies, "models"), embedding: "local/potion-retrieval-32m", device: "cpu" });
      try { await store.index(); } catch (error) { await store.close(); throw error; }
      return { query: async query => [...new Set<string>((await store.context({ query, limit: 100, autoUpdate: false })).items.map((hit: any) => filenameToKey.get(basename(hit.file.relativePath))).filter(Boolean))], update: () => store.index(), close: () => store.close(), storage: () => bytes(join(data, ".zvec-grep")) };
    });
    for (const [name, engine] of engines) {
      console.error(`querying ${name}: ${cases.length} cases × ${repeats} passes`);
      const samples: number[] = [];
      let rankings: string[][] = [];
      let stable = true;
      for (let pass = 0; pass < repeats; pass++) {
        const current: string[][] = [];
        for (const item of cases) {
          const start = performance.now();
          current.push(await engine.query(item.query));
          samples.push(performance.now() - start);
        }
        if (pass === 0) rankings = current;
        else stable &&= JSON.stringify(rankings) === JSON.stringify(current);
      }
      results[name] = { ...results[name], query: summary(samples), stableAcrossPasses: stable, storageBytes: engine.storage(), metrics: evaluateRankings(rankings, cases.map(item => item.relevant), byKey), rankings };
      if (engine.update) {
        const start = performance.now();
        const receipt = await engine.update();
        results[name].unchangedUpdate = { ms: performance.now() - start, receipt };
      }
    }
    if (results["zvec-hybrid-potion32m"].rankings) {
      const rankings = cases.map((_, index) => lifecycleAwareCandidateUnion(results["promptus-lexical"].rankings[index], results["zvec-hybrid-potion32m"].rankings[index], byKey));
      results["promptus-plus-zvec-candidates"] = { metrics: evaluateRankings(rankings, cases.map(item => item.relevant), byKey), rankings, note: "Fixed existing five-per-route candidate policy; zvec route itself is hybrid. No tuning on these cases." };
    }
    if (results["qmd-vector-embeddinggemma300m"].rankings) {
      const rankings = cases.map((_, index) => lifecycleAwareCandidateUnion(results["promptus-lexical"].rankings[index], results["qmd-vector-embeddinggemma300m"].rankings[index], byKey));
      results["promptus-plus-qmd-candidates"] = { metrics: evaluateRankings(rankings, cases.map(item => item.relevant), byKey), rankings, note: "Fixed existing five-per-route candidate policy; no query expansion or reranker." };
    }
    const report = {
      schema: "promptus.engine-comparison.v1", created: new Date().toISOString(), runtime: Bun.version, versions, dependencyLockSha256: sha(readFileSync(join(dependencies, "bun.lock"), "utf8")),
      harnessSha256: Object.fromEntries(["promptus-engines.ts", "qmd-engine-worker.mjs"].map(file => [file, sha(readFileSync(join(import.meta.dir, file), "utf8"))])),
      corpus: { project: "public Organon only", totalUnits: documents.length, activeUnits: sources.length, sha256: sha(JSON.stringify(sources)), projection: "One file per unit, opaque SHA-256 filename, title plus exact source unit. Lifecycle filtering occurs before indexing." },
      suite: { sha256: sha(readFileSync(casesFile, "utf8")), originalCases: rawCases.length, evaluatedCases: cases.length, excludedCases },
      limitations: ["Historical development cases, not a fresh holdout or real-project effectiveness result.", "Current corpus differs from the August frozen corpus; do not compare percentages directly.", "QMD lexical uses AND semantics on full natural-language questions; this is an API-fit diagnostic, not an assessment of its hybrid query product.", "QMD vector uses a persistent Node worker on CPU; expansion and reranking remain unevaluated. Other routes use Bun.", "Warm persistent-process queries include the first query; model downloads excluded after smoke preparation. Global fetch is disabled during the trial.", "Current lifecycle hygiene is guaranteed by projection; migration and refresh lifecycle correctness still require integration tests.", "Cold-process startup, write/delete refresh, and larger synthetic scale remain separate trials."],
      results,
    };
    if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...report, results: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, { ...value, rankings: undefined }])) }, null, 2));
    return Object.values(results).some(result => result.error) ? 1 : 0;
  } finally {
    try {
      const closed = await Promise.allSettled([...engines.values()].map(engine => engine.close()));
      const failures = closed.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), "engine cleanup failed");
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { console.error(String(error)); process.exitCode = 1; });
