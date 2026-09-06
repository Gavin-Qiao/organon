/** Actual-mount synthetic trial. No live project or private snapshot input port. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { byteSize, COMPONENTS, sha } from "./publication-fence.ts";
import { createFixture, stageRuntime, SCRIPTS, treeHashes } from "./publication-fixture.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";

export function summarize(samples: number[]) {
  const sorted = [...samples].sort((a,b) => a-b);
  return { n: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1) };
}
function sizes(root: string, prefix = ""): Record<string, number> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(e => {
    const path = join(root, e.name), rel = prefix + e.name;
    if (e.isSymbolicLink()) throw Error("unsafe generated fixture");
    return e.isDirectory() ? Object.entries(sizes(path, rel + "/")) : [[rel, statSync(path).size]];
  }));
}
function peakBound(before: Record<string, number>, after: Record<string, number>) {
  const maxima = [...new Set([...Object.keys(before), ...Object.keys(after)])].map(k => Math.max(before[k] ?? 0, after[k] ?? 0));
  // One replacement temporary at a time; extra allowance bounds the tiny lease.
  return maxima.reduce((a,b) => a+b, 0) + Math.max(...maxima) + 1024;
}
if (import.meta.main) {
  const [parentArg, outputArg] = process.argv.slice(2);
  if (!parentArg || !outputArg || process.argv.length !== 4) throw Error("usage: publication-trial.ts EXISTING_SCRATCH_PARENT NEW_RESULT.json");
  const parent = resolve(parentArg), output = resolve(outputArg);
  if (!statSync(parent).isDirectory() || existsSync(output)) throw Error("existing scratch parent and new output required");
  const scratch = mkdtempSync(join(parent, "organon-publication-trial-"));
  const sourceBefore = sha(JSON.stringify(treeHashes(SCRIPTS)));
  const runtime = stageRuntime(scratch);
  const fsInfo = spawnSync("findmnt", ["-T", scratch, "-n", "-o", "FSTYPE,TARGET"], { encoding: "utf8" });
  const cli = join(import.meta.dir, "publication-cli.ts");
  const report: any = { schema: "organon.publication-trial.v1", started: new Date().toISOString(), filesystem: fsInfo.status === 0 ? fsInfo.stdout.trim() : "unverified", bun: Bun.version,
    corpus: { pages: 512, ledgerUnits: 4096, ballastRepeats: 16, synthetic: true }, originalRuntimeHash: sourceBefore, instrumentedRuntimeHash: runtime.runtimeHash, hooks: runtime.hashes,
    codeHashes: Object.fromEntries(["publication-fence.ts", "publication-fixture.ts", "publication-cli.ts", "publication-trial.ts", "publication-fence.test.ts", "PUBLICATION-FENCE.md"].map(f => [f, sha(readFileSync(join(import.meta.dir, f)))])), arms: {},
    limits: ["Synthetic repeated text is not representative real-project relevance or worst-case postings entropy.", "Fresh CLI, warm/uncontrolled OS page cache; no power-loss or cross-OS certification.", "Latency runs disable recursive peak sampling. Separate instrumented trace measures logical file-byte high water, not filesystem allocated blocks, RAM or journal internals.", "Component-byte hashing is measured; canonical traversal/parse/source reads inside reused scripts are not individually instrumented. Rebuild time includes those phases without pretending they disappeared.", "Full canonical rebuilding, not persistent sparse parsing. No SQLite, semantic model, watcher or daemon.", "Fence timeout is 1 second for bounded tests, not a chosen production policy.", "No operator-approved adoption budget. End-to-end wrapper latency includes child startup and receipt serialization."] };
  for (const arm of ["baseline", "fenced"]) {
    const root = createFixture(scratch, runtime, 512, 4096, 16);
    function run(verb: string, args: string[] = [], detailed = false) {
      const start = performance.now();
      const r = spawnSync(process.execPath, [cli, root, arm, verb, ...args], { encoding: "utf8", timeout: 60000,
        env: { ...process.env, ORGANON_PUBLICATION_METRICS: detailed ? "1" : "0", ORGANON_PUBLICATION_FAULT: "", ORGANON_PUBLICATION_CRASH: "0" } });
      const ms = performance.now() - start;
      if (r.status !== 0) throw Error(`${arm} ${verb}: ${r.stderr}`);
      return { ms, value: JSON.parse(r.stdout) };
    }
    run("index");
    const initialSizes = sizes(join(root, ".promptus"));
    const traces: any[] = [];
    for (let i = 0; i < 5; i++) for (const operation of ["append", "amend"]) {
      const beforeSizes = sizes(join(root, ".promptus"));
      const query = operation === "append" ? `traceprobe${i}` : "pageword0";
      const write = operation === "append"
        ? run("add", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", `Trace ${query}`, "--json"])
        : run("amend", ["--path", ".promptus/docs/page-0.md", "--substrate", "finding", "--kind", "CLAIM", "--status", i % 2 ? "VALIDATED" : "REFUTED"]);
      // kb-amend already indexes inside the existing lease; don't bill it twice.
      const maintenance = arm === "baseline" && operation === "append" ? run("index") : null;
      const find = run("find", [query, "--limit", "1"]);
      const printed = arm === "baseline" ? find.value.output : find.value.result.output;
      const card = printed.split("\n").find((line: string) => line.includes(" · "));
      if (!card) throw Error("expected synthetic hit absent");
      const [, title, path] = card.split(" · ");
      const get = run("get", path.includes("#") ? [path, "--title", title] : [path]);
      const body = arm === "baseline" ? get.value.output : get.value.result.body;
      if (!body.includes(operation === "append" ? "freshquartzsignal" : "pageword0")) throw Error("wrong exact source fetched");
      const publicationLine = write.value.diagnostics?.split("\n").find((line: string) => line.startsWith("PUBLICATION "));
      const writer = publicationLine ? JSON.parse(publicationLine.slice(12)) : null;
      traces.push({ operation, ordinal: i, writeMs: write.ms, maintenanceMs: maintenance?.ms ?? 0, findMs: find.ms, getMs: get.ms,
        totalMs: write.ms + (maintenance?.ms ?? 0) + find.ms + get.ms,
        writerMetrics: writer?.metrics ?? null, findMetrics: find.value.metrics ?? null, getMetrics: get.value.metrics ?? null,
        sourceBytesFetched: get.value.result?.sourceBytesRead ?? null, logicalPeakUpperBoundBytes: peakBound(beforeSizes, sizes(join(root, ".promptus"))) });
      process.stderr.write(`${arm} ${operation} ${i + 1}/5 complete\n`);
    }
    const navigation = Array.from({ length: 5 }, () => run("find", ["pageword0", "--limit", "1"]).ms);
    const projected = COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))));
    const source = hashStore(root).hash;
    const rebuilt = spawnSync(process.execPath, [join(SCRIPTS, "kb-index.ts"), "--root", root, "--quiet"], { encoding: "utf8" });
    if (rebuilt.status !== 0 || hashStore(root).hash !== source || JSON.stringify(projected) !== JSON.stringify(COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f)))))) throw Error("full canonical parity failed");
    // Separate peak-sampling trace; never mix its recursive scans into latency samples.
    const profiledWrite = run("add", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Profile only traceprofile", "--json"], true);
    if (arm === "baseline") run("index", [], true);
    const profiledRead = run("find", ["traceprofile"], true);
    const writeReceipt = profiledWrite.value.diagnostics?.split("\n").find((s: string) => s.startsWith("PUBLICATION "));
    report.arms[arm] = { traces, navigationSamplesMs: navigation, navigation: summarize(navigation),
      append: summarize(traces.filter(t => t.operation === "append").map(t => t.totalMs)), amend: summarize(traces.filter(t => t.operation === "amend").map(t => t.totalMs)),
      sourceHashAfterMeasuredTraces: source, canonicalParity: true, initialStoreBytes: Object.values(initialSizes).reduce((a,b) => a+b, 0), finalStoreBytes: byteSize(join(root, ".promptus")),
      finalDerivedBytes: byteSize(join(root, ".promptus/cache")), finalLedgerBytes: statSync(join(root, ".promptus/ledger/RESEARCH-LEDGER.md")).size,
      instrumentedPeakTrace: { writer: writeReceipt ? JSON.parse(writeReceipt.slice(12)).metrics : null, reader: profiledRead.value.metrics ?? null } };
  }
  report.completed = new Date().toISOString();
  report.productionSourceUnchanged = sha(JSON.stringify(treeHashes(SCRIPTS))) === sourceBefore;
  if (!report.productionSourceUnchanged) throw Error("production source changed during trial");
  report.generatedScratchBytes = byteSize(scratch);
  rmSync(scratch, { recursive: true }); // only this invocation's generated synthetic scratch
  report.generatedScratchRemoved = true;
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, filesystem: report.filesystem, arms: Object.fromEntries(Object.entries(report.arms).map(([arm, r]: any) => [arm, { append: r.append, amend: r.amend, navigation: r.navigation, derivedBytes: r.finalDerivedBytes }])), generatedScratchRemoved: true }));
}
