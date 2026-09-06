#!/usr/bin/env bun
/** Real SDK verification in a newly generated synthetic store; never a project-root argument. */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runContinuityBenchmark, loadContinuitySuite, assertDisposableWorkspace } from "./promptus-continuity.ts";
import { inside } from "./promptus-engines.ts";
import { configureSemantic, updateSemantic, semanticSnapshot, semanticCandidates, semanticBase, semanticDatabase, type SemanticConfig } from "../promptus/scripts/lib/semantic.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repo = resolve(import.meta.dir, ".."), scripts = join(repo, "promptus/scripts");
const args = process.argv.slice(2), flags: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--dependencies", "--output"].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error("invalid trial arguments");
  flags[args[i]] = args[i + 1];
}
const dependencies = realpathSync(flags["--dependencies"]), output = resolve(flags["--output"]);
if (!inside(dependencies, tmpdir()) || JSON.parse(readFileSync(join(dependencies, "package.json"), "utf8")).name !== "organon-overhaul-engine-trial") throw new Error("unmarked dependencies");
if (existsSync(output) || !(inside(dirname(output), tmpdir()) || inside(dirname(output), join(repo, "benchmarks/results")))) throw new Error("unsafe or existing output");
const files = ["lib/semantic.ts", "lib/semantic-worker.mjs", "lib/read-store.ts", "kb-find.ts", "kb-semantic.ts"];
const sourceHashes = Object.fromEntries(files.map(file => [file, sha(readFileSync(join(scripts, file)))]));
const harnessHash = sha(readFileSync(import.meta.path));
const suite = loadContinuitySuite(), report: any = runContinuityBenchmark(suite, { keepWorkspace: true });
const root = report.isolation.workspaceRoot;
assertDisposableWorkspace(root, sha(JSON.stringify(suite)));
const before = hashStore(root), steps: any[] = [];
let failed = false;
const step = (name: string, action: () => unknown) => { const start = performance.now(); const result = action(); steps.push({ name, ms: performance.now() - start, result }); console.error(`${name}: passed`); return result; };
const run = (file: string, args: string[], input = "") => {
  const result = spawnSync(process.execPath, [join(scripts, file), "--root", root, ...args], { input, encoding: "utf8", timeout: 65_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};
let readOnlyAfter;
const storedRows = () => {
  const base = semanticBase(root), config: SemanticConfig = JSON.parse(readFileSync(join(base, "config.json"), "utf8"));
  // SQLite's readonly WAL opens may still create sidecars. Inspect a byte copy,
  // never alter the published adapter generation as part of measurement.
  const scratch = mkdtempSync(join(tmpdir(), "organon-qmd-inspect-")), snapshot = join(scratch, "snapshot.sqlite");
  copyFileSync(semanticDatabase(base, config), snapshot);
  const db = new Database(snapshot, { readonly: true });
  try { return db.query("SELECT d.collection,d.path,d.hash,c.doc, (SELECT count(*) FROM content_vectors v WHERE v.hash=d.hash) AS chunks FROM documents d JOIN content c ON c.hash=d.hash WHERE d.active=1").all() as Array<{ collection: string; path: string; hash: string; doc: string; chunks: number }>; }
  finally { db.close(); rmSync(scratch, { recursive: true, force: true }); }
};
try {
  step("configure", () => configureSemantic(root, { packageRoot: join(dependencies, "node_modules/@tobilu/qmd"), node: join(dependencies, "node_modules/node-linux-x64/bin/node"), model: join(dependencies, "model-cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf") }));
  step("update", () => updateSemantic(root));
  step("current-query", () => {
    const docs = semanticCandidates(root, semanticSnapshot(root), "What coefficient should the calibration use now?", { limit: 5 });
    if (!docs.some(doc => doc.title === "Northbridge run validates coefficient seventeen") || docs.some(doc => ["SUPERSEDED", "REFUTED", "UNTRUSTED"].includes(doc.status))) throw new Error("current-query contract failed");
    return docs.map(({ id, status, title, path }) => ({ id, status, title, path }));
  });
  step("history-status-query", () => {
    const docs = semanticCandidates(root, semanticSnapshot(root), "old coefficient", { limit: 5, status: "SUPERSEDED", history: true });
    if (docs.length !== 1 || docs[0].status !== "SUPERSEDED") throw new Error("status-filter contract failed");
    return docs.map(({ id, status }) => ({ id, status }));
  });
  step("fresh-cli-query", () => {
    const result = run("kb-find.ts", ["coefficient", "--semantic", "--limit", "3"]);
    if (result.status !== 0 || !result.stdout.includes("route:qmd")) throw new Error(JSON.stringify(result));
    return result;
  });
  step("unchanged-update", () => { const result = updateSemantic(root); if (!result.unchanged) throw new Error("unchanged refresh rebuilt"); return result; });
  readOnlyAfter = hashStore(root);
  if (readOnlyAfter.hash !== before.hash) throw new Error("read-only phase changed source");
  step("gated-add", () => {
    const result = run("kb-add.ts", ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Synthetic submarine pressure alarm"], "The synthetic submarine pressure alarm uses cobaltpressurezeta to close the hatch. Fictional test evidence only.\n");
    if (result.status !== 0) throw new Error(JSON.stringify(result)); return result;
  });
  step("stale-fallback", () => {
    const result = run("kb-find.ts", ["cobaltpressurezeta", "--semantic"]);
    if (result.status !== 0 || !result.stdout.includes("lexical-fallback") || !result.stdout.includes("synthetic-submarine-pressure-alarm.md")) throw new Error(JSON.stringify(result)); return result;
  });
  step("incremental-refresh", () => updateSemantic(root));
  step("fresh-post-mutation-query", () => {
    const result = run("kb-find.ts", ["submarine pressure alarm", "--semantic", "--limit", "1"]);
    if (result.status !== 0 || !result.stdout.includes("route:qmd") || !result.stdout.includes("synthetic-submarine-pressure-alarm.md")) throw new Error(JSON.stringify(result)); return result;
  });
  const rel = ".promptus/docs/synthetic-submarine-pressure-alarm.md", path = join(root, rel);
  const alarm = semanticSnapshot(root).documents.find(doc => doc.path === rel)!;
  step("same-id-body-edit", () => {
    // Controlled synthetic fault/edit injection; never accepts an existing project root.
    assertDisposableWorkspace(root, sha(JSON.stringify(suite)));
    writeFileSync(path, readFileSync(path, "utf8").replace("The synthetic submarine pressure alarm uses cobaltpressurezeta to close the hatch.", "The orchard irrigation controller uses amberorchardeta to water fruit trees when soil is dry."));
    const stale = run("kb-find.ts", ["amberorchardeta", "--semantic"]);
    if (!stale.stdout.includes("lexical-fallback")) throw new Error("edit did not invalidate retrieval");
    updateSemantic(root);
    const current = semanticSnapshot(root).documents.find(doc => doc.id === alarm.id)!;
    const row = storedRows().find(row => row.collection === current.group && row.path === current.file);
    if (!row || row.doc !== `# ${current.title}\n\n${current.text}` || row.doc.includes("cobaltpressurezeta") || row.chunks < 1) throw new Error("edited body is not current embedded content");
    const query = run("kb-find.ts", ["orchard irrigation watering fruit trees", "--semantic", "--limit", "1"]);
    if (query.status !== 0 || !query.stdout.includes("route:qmd") || !query.stdout.includes(rel)) throw new Error(JSON.stringify(query));
    return { id: current.id, contentHash: row.hash, embeddedChunks: row.chunks, query };
  });
  step("gated-lifecycle-transition", () => {
    const amendment = run("kb-amend.ts", ["--path", rel, "--substrate", "finding", "--kind", "CLAIM", "--status", "REFUTED"]);
    if (amendment.status !== 0) throw new Error(JSON.stringify(amendment));
    updateSemantic(root);
    if (semanticCandidates(root, semanticSnapshot(root), "orchard irrigation", { limit: 20 }).some(doc => doc.id === alarm.id)) throw new Error("refuted unit leaked into default semantic scope");
    const historical = semanticCandidates(root, semanticSnapshot(root), "orchard irrigation", { limit: 20, status: "REFUTED" });
    if (!historical.some(doc => doc.id === alarm.id && doc.status === "REFUTED")) throw new Error("explicit refuted retrieval lost identity");
    if (storedRows().some(row => row.collection === alarm.group && row.path === alarm.file)) throw new Error("old lifecycle collection retains active row");
    return { id: alarm.id, status: "REFUTED", explicitHits: historical.map(doc => doc.id) };
  });
  const archive = join(root, ".promptus/docs/archive/synthetic-submarine-pressure-alarm.md");
  step("archive-movement-and-restart", () => {
    mkdirSync(dirname(archive), { recursive: true }); renameSync(path, archive); updateSemantic(root);
    if (semanticCandidates(root, semanticSnapshot(root), "orchard irrigation", { limit: 20, status: "REFUTED" }).some(doc => doc.id === alarm.id)) throw new Error("archive leaked without history");
    const query = run("kb-find.ts", ["orchard irrigation", "--semantic", "--history", "--status", "REFUTED", "--limit", "10"]);
    if (query.status !== 0 || !query.stdout.includes("route:qmd") || !query.stdout.includes("docs/archive/synthetic-submarine-pressure-alarm.md")) throw new Error(JSON.stringify(query));
    return query;
  });
  step("deletion-and-restart", () => {
    const archived = semanticSnapshot(root).documents.find(doc => doc.id === alarm.id)!;
    unlinkSync(archive); updateSemantic(root);
    const hits = semanticCandidates(root, semanticSnapshot(root), "orchard irrigation", { limit: 20, history: true });
    if (hits.some(doc => doc.id === alarm.id) || storedRows().some(row => row.collection === archived.group && row.path === archived.file)) throw new Error("deleted unit remains current");
    const query = run("kb-find.ts", ["orchard irrigation", "--semantic", "--history", "--limit", "20"]);
    if (query.status !== 0 || query.stdout.includes("synthetic-submarine-pressure-alarm.md")) throw new Error(JSON.stringify(query));
    return { deletedId: alarm.id, query };
  });
} catch (error) {
  failed = true; steps.push({ name: "failure", error: String(error) });
  steps.push({ name: "fallback-after-failure", result: run("kb-find.ts", ["coefficient", "--semantic", "--limit", "3"]) });
}
const after = hashStore(root), changedCode = files.filter(file => sourceHashes[file] !== sha(readFileSync(join(scripts, file))));
if (harnessHash !== sha(readFileSync(import.meta.path))) changedCode.push("benchmark harness");
writeFileSync(output, JSON.stringify({ schema: "promptus.semantic-adapter-trial.v2", created: new Date().toISOString(), fixture: root, harnessHash, sourceHashes, changedCode, before, readOnlyAfter, after, passed: !failed && !changedCode.length, steps, limitations: ["Real pinned SDK/model on a synthetic store, not live-project effectiveness.", "Read-only phase preserves source bytes; subsequent gated addition/status amendment and controlled body/archive/delete injections mutate only the newly minted fixture.", "Stored-content hashes and embedding rows are checked; no independent embedding recomputation or physical erasure guarantee.", "Fixture is retained for independent inspection; no installed cache or global dependency changes."] }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, root, passed: !failed && !changedCode.length, steps: steps.map(step => step.name) }));
if (failed || changedCode.length) process.exitCode = 1;
