#!/usr/bin/env bun
/** Compare per-write indexing and explicit batch refresh in synthetic stores only. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContinuitySuite, runContinuityBenchmark, assertDisposableWorkspace } from "./promptus-continuity.ts";
import { collectUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output") throw Error("usage: batch-maintenance --output <new receipt>");
const output = resolve(args[1]);
if (existsSync(output) || dirname(output) !== join(import.meta.dir, "results")) throw Error("receipt must be new in benchmarks/results");
const scripts = join(import.meta.dir, "../promptus/scripts"), repeats = 3, writes = 20, filler = 500;
const inputs = [import.meta.path, ...["kb-add.ts", "kb-now.ts", "kb-index.ts", "promptus-check.ts", "promptus-session-doctor.ts"].map(p => join(scripts, p))];
const inputHashes = Object.fromEntries(inputs.map(path => [path, sha(readFileSync(path))]));
const runs: any[] = [];
const bodyHash = (text: string) => sha(text.replace(/<!-- kb:append-point -->\s*$/, "").trimEnd());
for (let repeat = 0; repeat < repeats; repeat++) for (const perWrite of (repeat % 2 ? [false, true] : [true, false])) {
  const suite = loadContinuitySuite(), built: any = runContinuityBenchmark(suite, { keepWorkspace: true });
  const root = built.isolation.workspaceRoot, suiteHash = sha(JSON.stringify(suite)); assertDisposableWorkspace(root, suiteHash);
  for (let i = 0; i < filler; i++) writeFileSync(join(root, `.promptus/docs/inventory-${i}.md`), `---\nid: inventory-${i}\nsubstrate: finding\nkind: CLAIM\nstatus: VALIDATED\nlinks: [northbridge-run-validates-coefficient-seventeen]\n---\n# Inventory ${i}\nSynthetic maintenance ballast item ${i}.\n`);
  const timings: Array<{ command: string; ms: number }> = [];
  const run = (script: string, argv: string[], input = "", timed = true) => {
    assertDisposableWorkspace(root, suiteHash); const start = performance.now();
    const r = spawnSync(process.execPath, [join(scripts, script), ...argv, "--root", root], { input, encoding: "utf8", timeout: 30_000 });
    if (timed) timings.push({ command: script, ms: performance.now() - start });
    if (r.status !== 0) throw Error(`${script}: ${r.stderr || r.stdout}`); return r.stdout;
  };
  run("promptus-check.ts", ["--strict", "--json"], "", false);
  const original = collectUnits(root, loadVocab(root)).map(u => ({ id: u.id, body: bodyHash(u.text) }));
  const start = performance.now();
  for (let i = 0; i < writes; i++) {
    run("kb-add.ts", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", `Batch observation ${i}`], `Synthetic observation batchtoken${i}; no change to the accepted scientific result.\n`);
    if (perWrite) run("kb-index.ts", ["--quiet"]);
  }
  run("kb-now.ts", [], "## NOW\nTwenty synthetic observations recorded.\n## Open frontier\nNo missing batch observations.\n## Next actions\nContinue the declared replication only when authorized.\n## <<< RESUME HERE >>>\nKeep coefficient seventeen and batch limit four; this workload adds no scientific result.\n");
  const health = JSON.parse(run("promptus-check.ts", ["--strict", "--json"]));
  const doctor = JSON.parse(run("promptus-session-doctor.ts", ["--artifacts", "--json"]));
  const elapsedMs = performance.now() - start, current = collectUnits(root, loadVocab(root));
  const retained = original.every(old => current.some(u => u.id === old.id && bodyHash(u.text) === old.body));
  const added = current.filter(u => u.title.startsWith("Batch observation "));
  if (!health.healthy || !doctor.sessionReady || !retained || added.length !== writes || new Set(added.map(u => u.id)).size !== writes) throw Error("batch integrity failed");
  const result = { repeat, mode: perWrite ? "per-write-index" : "explicit-batch", root, initialUnits: original.length, finalUnits: current.length, writes, elapsedMs, timings, healthy: health.healthy, sessionReady: doctor.sessionReady, originalBodiesPreserved: retained, uniqueNewEvents: added.length };
  runs.push(result); console.error(`${result.mode} repeat ${repeat}: ${elapsedMs.toFixed(0)}ms, integrity passed`);
}
const changedInputs = inputs.filter(path => inputHashes[path] !== sha(readFileSync(path)));
const median = (xs: number[]) => [...xs].sort((a,b) => a-b)[Math.floor(xs.length / 2)];
const medians = Object.fromEntries(["per-write-index", "explicit-batch"].map(mode => [mode, median(runs.filter(r => r.mode === mode).map(r => r.elapsedMs))]));
writeFileSync(output, JSON.stringify({ schema: "organon.batch-maintenance.v1", created: new Date().toISOString(), protocol: { repeats, writes, filler, alternatingOrder: true, includes: "writer processes, NOW update, full strict health and artifact session preflight", excludes: "fixture construction, dependency installation and model work" }, inputHashes, changedInputs, mediansMs: medians, runs, passed: !changedInputs.length, limitations: ["Synthetic local Linux fixtures, not live-project timings.", "Per-write arm models the removed indexing cadence, not the hook host-dispatch overhead.", "Authored body comparison excludes terminal append-sentinel framing; exact artifact verification remains enabled."] }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, mediansMs: medians, passed: !changedInputs.length }));
if (changedInputs.length) process.exitCode = 1;
