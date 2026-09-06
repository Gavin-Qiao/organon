/** Synthetic, actual-mount end-to-end comparison. No private-data input port. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { byteSize, COMPONENTS, sha } from "./publication-fence.ts";
import { createFixture, stageRuntime, SCRIPTS, treeHashes } from "./publication-fixture.ts";
import { stageReuseRuntime } from "./parse-reuse-stage.ts";
import { PARSE_CACHE } from "./parse-reuse.ts";
import { summarize } from "./publication-trial.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";

function sizes(root: string, prefix = ""): Record<string, number> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(e => {
    if (e.isSymbolicLink()) throw Error("unsafe generated fixture");
    const path = join(root, e.name), name = prefix + e.name;
    return e.isDirectory() ? Object.entries(sizes(path, name + "/")) : [[name, statSync(path).size]];
  }));
}
function peakBound(before: Record<string, number>, after: Record<string, number>) {
  const maxima = [...new Set([...Object.keys(before), ...Object.keys(after)])].map(k => Math.max(before[k] ?? 0, after[k] ?? 0));
  // Single sequential source/cache temporary, plus conservative lease allowance.
  return maxima.reduce((a,b) => a+b, 0) + Math.max(...maxima) + 1024;
}
function lessCompressible(root: string) {
  const phrase = "Repeated synthetic context about evidence custody, source history and retrieval. ".repeat(16);
  const dictionary = Array.from({ length: 4096 }, (_, i) => "x" + sha(`synthetic-dictionary-${i}`).slice(0, 7));
  let seed = 764089157;
  function padding() {
    return Array.from({ length: 140 }, () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return dictionary[(seed >>> 0) % dictionary.length];
    }).join(" ") + " ";
  }
  for (const name of Object.keys(sizes(join(root, ".promptus"))).sort()) {
    if (!name.endsWith(".md")) continue;
    const path = join(root, ".promptus", name), original = readFileSync(path, "utf8");
    if (original.includes(phrase)) writeFileSync(path, original.replaceAll(phrase, padding));
  }
}
if (import.meta.main) {
  const [parentArg, outputArg] = process.argv.slice(2);
  if (!parentArg || !outputArg || process.argv.length !== 4) throw Error("usage: parse-reuse-trial.ts EXISTING_SCRATCH_PARENT NEW_RESULT.json");
  const parent = resolve(parentArg), output = resolve(outputArg);
  if (!statSync(parent).isDirectory() || existsSync(output)) throw Error("existing scratch parent and new output required");
  const scratch = mkdtempSync(join(parent, "organon-parse-trial-"));
  const sourceBefore = sha(JSON.stringify(treeHashes(SCRIPTS)));
  const baseline = stageRuntime(scratch), candidate = stageReuseRuntime(scratch);
  const fsInfo = spawnSync("findmnt", ["-T", scratch, "-n", "-o", "FSTYPE,TARGET"], { encoding: "utf8" });
  const report: any = { schema: "organon.parse-reuse-trial.v1", started: new Date().toISOString(), bun: Bun.version,
    filesystem: fsInfo.status === 0 ? fsInfo.stdout.trim() : "unverified", sourceRuntimeHash: sourceBefore,
    baselineRuntimeHash: baseline.runtimeHash, candidateRuntimeHash: candidate.runtimeHash,
    candidateInstrumentation: JSON.parse(readFileSync(join(candidate.runtime, "parse-instrumentation.json"), "utf8")),
    codeHashes: Object.fromEntries(["parse-reuse.ts", "parse-reuse-stage.ts", "parse-reuse-trial.ts", "parse-reuse.test.ts", "PARSE-REUSE.md", "publication-fence.ts", "publication-fixture.ts", "publication-cli.ts", "publication-trial.ts"].map(f => [f, sha(readFileSync(join(import.meta.dir, f)))])),
    corpora: {}, limits: [
      "Synthetic parser/I/O experiment, not real-project relevance evidence. The heterogeneous control uses a deterministic 4096-token dictionary, not worst-case entropy.",
      "Five fresh-process samples per arm/operation, alternating arm order; warm/uncontrolled OS cache. No statistical population claim or deployment budget.",
      "Same guarded fence for both arms. Full discovery, lifecycle resolution, tokenization and component serialization remain included. Writer validation remains source-only.",
      "Parser telemetry counts only cache-wrapped collector reads, not every source read or stat performed by writers, exact fetch, hashing or thinker inspection.",
      "Logical peak is a conservative upper bound from per-file before/after maxima plus one largest replacement and 1024 lease bytes; it is not sampled allocated-block or RAM peak.",
      "Steady du allocated-byte output is filesystem-reported only. RAM, power loss, cross-OS behavior and global outside-edit freshness are not certified.",
      "Gzip duplicates raw Markdown-derived text. Its load/compression/full replacement and receipt hashing are charged. No database, model, daemon or watcher.",
    ] };
  for (const corpus of ["repeated", "heterogeneous"]) {
    const arms: Record<string, any> = {};
    for (const arm of ["full", "reuse"]) {
      const runtime = arm === "full" ? baseline : candidate;
      const root = createFixture(scratch, runtime, 512, 4096, 16);
      if (corpus === "heterogeneous") lessCompressible(root);
      const cli = arm === "full" ? join(import.meta.dir, "publication-cli.ts") : candidate.cli;
      const run = (verb: string, args: string[] = []) => {
        const start = performance.now();
        const r = spawnSync(process.execPath, [cli, root, "fenced", verb, ...args], { encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, ORGANON_PUBLICATION_METRICS: "0", ORGANON_PUBLICATION_FAULT: "", ORGANON_PUBLICATION_CRASH: "0" } });
        const ms = performance.now() - start;
        if (r.status !== 0) throw Error(`${corpus}/${arm}/${verb}: ${r.stderr}`);
        const value = JSON.parse(r.stdout);
        const diagnostics = r.stderr + "\n" + (value.diagnostics ?? "");
        const stats = diagnostics.split("\n").filter(s => s.startsWith("PARSE_REUSE ")).map(s => JSON.parse(s.slice(12)));
        return { ms, value, stats };
      };
      const initial = run("index");
      arms[arm] = { root, run, traces: [], initialIndexMs: initial.ms, initialParseStats: initial.stats,
        sourceHashBefore: hashStore(root).hash, initialStoreBytes: byteSize(join(root, ".promptus")) };
    }
    if (arms.full.sourceHashBefore !== arms.reuse.sourceHashBefore) throw Error("starting corpora differ");
    for (let i = 0; i < 5; i++) for (const operation of ["append", "amend"]) {
      for (const arm of (i % 2 ? ["reuse", "full"] : ["full", "reuse"])) {
        const a = arms[arm], before = sizes(join(a.root, ".promptus")), query = operation === "append" ? `traceprobe${i}` : "pageword0";
        const write = operation === "append" ? a.run("add", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", `Trace ${query}`, "--json"])
          : a.run("amend", ["--path", ".promptus/docs/page-0.md", "--substrate", "finding", "--kind", "CLAIM", "--status", i % 2 ? "VALIDATED" : "REFUTED"]);
        const find = a.run("find", [query, "--limit", "1"]);
        const card = find.value.result.output.split("\n").find((s: string) => s.includes(" · "));
        if (!card) throw Error("synthetic hit missing");
        const [, title, path] = card.split(" · ");
        const get = a.run("get", path.includes("#") ? [path, "--title", title] : [path]);
        if (!get.value.result.body.includes(operation === "append" ? "freshquartzsignal" : "pageword0")) throw Error("wrong exact source");
        const writerLine = write.value.diagnostics.split("\n").find((s: string) => s.startsWith("PUBLICATION "));
        a.traces.push({ ordinal: i, operation, writeMs: write.ms, findMs: find.ms, getMs: get.ms, totalMs: write.ms + find.ms + get.ms,
          parseStats: [...write.stats, ...find.stats, ...get.stats], writerMetrics: JSON.parse(writerLine.slice(12)).metrics,
          findMetrics: find.value.metrics, getMetrics: get.value.metrics, fetchedSourceBytes: get.value.result.sourceBytesRead,
          logicalPeakUpperBoundBytes: peakBound(before, sizes(join(a.root, ".promptus"))) });
        process.stderr.write(`${corpus}/${arm}/${operation} ${i + 1}/5 complete\n`);
      }
    }
    const result: any = { pages: 512, ledgerUnitsBefore: 4096, synthetic: true, arms: {} };
    for (const arm of ["full", "reuse"]) {
      const a = arms[arm], navigation = Array.from({ length: 5 }, () => a.run("find", ["pageword0", "--limit", "1"]).ms);
      const components = COMPONENTS.map(f => sha(readFileSync(join(a.root, ".promptus/cache", f))));
      const source = hashStore(a.root).hash;
      const rebuilt = spawnSync(process.execPath, [join(SCRIPTS, "kb-index.ts"), "--root", a.root, "--quiet"], { encoding: "utf8", timeout: 60000 });
      if (rebuilt.status !== 0 || hashStore(a.root).hash !== source || JSON.stringify(components) !== JSON.stringify(COMPONENTS.map(f => sha(readFileSync(join(a.root, ".promptus/cache", f)))))) throw Error("canonical parity failed");
      const derived = join(a.root, ".promptus/cache"), du = spawnSync("du", ["-s", "-B1", derived], { encoding: "utf8" });
      const { root, run, ...saved } = a;
      result.arms[arm] = { ...saved, navigationSamplesMs: navigation, navigation: summarize(navigation),
        append: summarize(a.traces.filter((t: any) => t.operation === "append").map((t: any) => t.totalMs)),
        amend: summarize(a.traces.filter((t: any) => t.operation === "amend").map((t: any) => t.totalMs)),
        sourceHashAfter: source, canonicalParity: true, finalStoreBytes: byteSize(join(a.root, ".promptus")), derivedBytes: byteSize(derived),
        derivedAllocatedBytes: du.status === 0 ? Number(du.stdout.split(/\s/)[0]) : null,
        rawParseCacheBytes: existsSync(join(derived, PARSE_CACHE)) ? statSync(join(derived, PARSE_CACHE)).size : 0,
        ledgerBytes: statSync(join(a.root, ".promptus/ledger/RESEARCH-LEDGER.md")).size };
    }
    report.corpora[corpus] = result;
  }
  report.completed = new Date().toISOString();
  report.productionSourceUnchanged = sha(JSON.stringify(treeHashes(SCRIPTS))) === sourceBefore;
  if (!report.productionSourceUnchanged) throw Error("production source changed");
  report.generatedScratchBytes = byteSize(scratch);
  rmSync(scratch, { recursive: true }); // exact generated synthetic directory, all children complete
  report.generatedScratchRemoved = true;
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, filesystem: report.filesystem, corpora: Object.fromEntries(Object.entries(report.corpora).map(([name, c]: any) => [name, Object.fromEntries(Object.entries(c.arms).map(([arm, a]: any) => [arm, { append: a.append, amend: a.amend, navigation: a.navigation, derivedBytes: a.derivedBytes, rawParseCacheBytes: a.rawParseCacheBytes }]))])), generatedScratchRemoved: true }));
}
