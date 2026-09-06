/** Private frozen-copy trial; public receipt contains aggregates only. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { assertSnapshot, digest, manifest } from "./local-retrieval-snapshot.ts";
import { stageRuntime, SCRIPTS, treeHashes } from "./publication-fixture.ts";
import { COMPONENTS, sha } from "./publication-fence.ts";
import { collectUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
import { queryCases } from "./promptus-sqlite.ts";
import { LIMITS, privateParent, cloneFrozen, stageBudgetedRuntime, boundedCommand, publicCommand, publicStats, fileSizes, sumBytes, replacementBound } from "./private-parse-support.ts";

function summary(samples: number[]) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a,b) => a-b);
  return { n: samples.length, medianMs: sorted[Math.floor(sorted.length / 2)], meanMs: samples.reduce((a,b) => a+b, 0) / samples.length, minMs: sorted[0], maxMs: sorted.at(-1) };
}
function queryArgs(item: ReturnType<typeof queryCases>[number]) {
  const args = [item.query, "--limit", "5"];
  for (const key of ["substrate", "status"]) if ((item.options as any)[key]) args.push(`--${key}`, String((item.options as any)[key]));
  for (const [key, flag] of [["all", "--all"], ["history", "--history"], ["includeInactive", "--include-inactive"]]) if ((item.options as any)[key]) args.push(flag);
  return args;
}
if (import.meta.main) {
  const [parentArg, notesArg, psiArg, motArg, outputArg] = process.argv.slice(2);
  if (process.argv.length !== 7 || !outputArg) throw Error("usage: private-parse-trial.ts PRIVATE_PARENT PRIVATE_NOTES PSI_SNAPSHOT MOT_SNAPSHOT NEW_PUBLIC_RESULT");
  const parent = privateParent(parentArg), notes = privateParent(notesArg), output = resolve(outputArg);
  if (!notes.startsWith("/tmp/") || !output.startsWith(resolve(import.meta.dir, "results") + "/") || existsSync(output)) throw Error("unsafe-receipt-path");
  const originals = [assertSnapshot(psiArg), assertSnapshot(motArg)];
  if (originals[0].label !== "psi" || originals[1].label !== "mot") throw Error("wrong-capture-labels");
  const codeFiles = ["private-parse-trial.ts", "private-parse-support.ts", "private-parse-support.test.ts", "PRIVATE-PARSE-REUSE.md", "parse-reuse.ts", "parse-reuse-stage.ts", "publication-fence.ts", "publication-fixture.ts", "publication-cli.ts", "local-retrieval-snapshot.ts", "promptus-sqlite.ts"];
  const codeHashes = Object.fromEntries(codeFiles.map(f => [f, sha(readFileSync(join(import.meta.dir, f)))]));
  const sourceRuntimeHash = sha(JSON.stringify(treeHashes(SCRIPTS)));
  const runtimesDir = mkdtempSync(join(notes, "runtimes-")), full = stageRuntime(runtimesDir), reuse = stageBudgetedRuntime(runtimesDir);
  const fs = spawnSync("findmnt", ["-T", parent, "-n", "-o", "FSTYPE"], { encoding: "utf8" });
  const report: any = { schema: "organon.private-parse-trial.v1", started: new Date().toISOString(), bun: Bun.version, filesystem: fs.status === 0 ? fs.stdout.trim() : "unverified",
    limits: LIMITS, sourceRuntimeHash, codeHashes, runtimeHashes: { full: full.runtimeHash, reuse: reuse.runtimeHash }, projects: [],
    limitations: ["Frozen September 5 source-only copies, not latest-live-state or external-artifact certification.", "10 clean reads per write is a controlled scenario; 100:1 is reweighting, not an observed session trace. Actual agent ratios are unknown.", "Three samples per operation, alternating arms; fresh processes with warm/uncontrolled OS caches. Not relevance evidence or a population estimate.", "All remaining full traversal, lifecycle projection, tokenization and index writes remain in latency. No new database, model, GPU or network.", "The 16 MiB compressed cache guard runs before cache write. RSS sampled every 100 ms sums process RSS (shared pages may be double-counted); scratch is checked between phases, not instantaneous hard-capped.", "Runtime copies live in OS temp for both arms; private source/index copies live on the reported filesystem. GNU time max RSS is a per-process high water, not simultaneous whole-system RAM.", "Logical peak bounds allow a largest sequential replacement; filesystem allocation/journal peaks and power-loss behavior are not measured.", "Public reports exclude private paths, titles, query text and raw diagnostics. Private logs are retained separately."] };
  let logNumber = 0;
  const saved = () => writeFileSync(join(notes, "progress.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  function checkScratch() {
    const bytes = sumBytes(fileSizes(parent)); report.peakObservedScratchBytes = Math.max(report.peakObservedScratchBytes ?? 0, bytes);
    if (bytes > LIMITS.scratchBytes) throw Error("scratch-budget");
  }
  for (const [ordinal, snapshot] of [psiArg, motArg].entries()) {
    const captured = originals[ordinal], label = captured.label, roots: string[] = [];
    const p: any = { label, captureHash: captured.manifestHash, captured: captured.completed, sourceFiles: captured.files, sourceBytes: captured.bytes, arms: {}, passed: false };
    report.projects.push(p);
    try {
      const units = collectUnits(snapshot, loadVocab(snapshot));
      p.units = units.length; p.coldUnits = units.filter(u => u.cold).length; p.ledgerUnits = units.filter(u => u.substrate === "ledger").length;
      const armData: Record<string, any> = {};
      for (const arm of ["full", "reuse"]) {
        const runtime = arm === "full" ? full : reuse;
        const root = cloneFrozen(snapshot, parent, runtime); roots.push(root); checkScratch();
        const cli = arm === "full" ? join(import.meta.dir, "publication-cli.ts") : reuse.cli;
        const raw = async (argv: string[]) => {
          const r = await boundedCommand(argv, join(notes, `command-${String(++logNumber).padStart(5, "0")}.json`));
          if (r.code !== 0) throw Error(r.killed ?? (r.stderr.includes("private-trial-cache-budget") ? "cache-budget" : "subprocess-failed"));
          return r;
        };
        const run = async (verb: string, args: string[] = []) => {
          const r = await raw([process.execPath, cli, root, "fenced", verb, ...args]);
          let value: any; try { value = JSON.parse(r.stdout); } catch { throw Error("invalid-cli-envelope"); }
          return { value, metrics: publicCommand(r), parse: publicStats(r.stderr + "\n" + (value.diagnostics ?? "")) };
        };
        p.arms[arm] = { traces: [], clean: [], initialIndex: null };
        console.error(`${label}/${arm}: initial index`);
        const index = await run("index"); p.arms[arm].initialIndex = { ...index.metrics, parse: index.parse }; checkScratch(); saved();
        const added = await run("add", ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Organon private parse synthetic probe", "--json"]);
        const probe = JSON.parse(added.value.output);
        await run("find", ["freshquartzsignal"]); // setup publication is not a measured amendment
        const cases = queryCases(JSON.parse(readFileSync(join(root, ".promptus/cache/search.json"), "utf8"))).filter(c => c.query);
        armData[arm] = { root, run, raw, probe, cases };
        p.arms[arm].queryCases = cases.length;
        p.arms[arm].sourcePreparedHash = digest(JSON.stringify(manifest(root)));
      }
      for (let i = 0; i < 3; i++) for (const operation of ["append", "amend"]) {
        for (const arm of (i % 2 ? ["reuse", "full"] : ["full", "reuse"])) {
          const a = armData[arm], out = p.arms[arm], before = fileSizes(join(a.root, ".promptus"));
          const query = operation === "append" ? `privateparsetrace${i}` : "freshquartzsignal";
          const write = operation === "append"
            ? await a.run("add", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", `Synthetic probe ${query}`, "--json"])
            : await a.run("amend", ["--path", a.probe.path, "--substrate", "finding", "--kind", "CLAIM", "--status", i % 2 ? "VALIDATED" : "REFUTED"]);
          const find = await a.run("find", [query, "--limit", "5"]);
          let target: { path: string; title: string };
          if (operation === "append") target = { path: JSON.parse(write.value.output).path, title: `Synthetic probe ${query}` };
          else target = { path: a.probe.path, title: a.probe.title };
          const line = find.value.result.output.split("\n").find((s: string) => s.includes(` · ${target.title} · `));
          if (!line) throw Error("new-source-not-visible");
          const path = line.split(" · ")[2];
          const get = await a.run("get", path.includes("#") ? [path, "--title", target.title] : [path]);
          if (!get.value.result.body.includes("freshquartzsignal")) throw Error("exact-fetch-mismatch");
          if (operation === "amend" && !get.value.result.body.includes(`status: ${i % 2 ? "VALIDATED" : "REFUTED"}`)) throw Error("amend-status-mismatch");
          const clean = [];
          for (let k = 0; k < 10; k++) {
            const caseOrdinal = (i * 20 + (operation === "amend" ? 10 : 0) + k) % a.cases.length;
            const result = await a.run("find", queryArgs(a.cases[caseOrdinal]));
            if (result.value.metrics.rebuilds !== 0) throw Error("unexpected-clean-rebuild");
            clean.push({ caseOrdinal, ...result.metrics });
          }
          out.clean.push(...clean);
          const workflowMs = write.metrics.ms + find.metrics.ms + get.metrics.ms;
          out.traces.push({ ordinal: i, operation, write: write.metrics, find: find.metrics, get: get.metrics,
            parse: [...write.parse, ...find.parse, ...get.parse], workflowMs, tenReadMs: clean.reduce((sum: number, x: any) => sum+x.ms, 0),
            totalMs: workflowMs + clean.reduce((sum: number, x: any) => sum+x.ms, 0), logicalPeakBoundBytes: replacementBound(before, fileSizes(join(a.root, ".promptus"))) });
          checkScratch(); saved(); console.error(`${label}/${arm}/${operation}: ${i + 1}/3 complete`);
        }
      }
      for (const arm of ["full", "reuse"]) {
        const a = armData[arm], out = p.arms[arm], hashes = COMPONENTS.map(f => sha(readFileSync(join(a.root, ".promptus/cache", f))));
        const beforeOracle = digest(JSON.stringify(manifest(a.root)));
        const cachedQueries = [];
        for (const c of a.cases) cachedQueries.push(sha((await a.run("find", queryArgs(c))).value.result.output));
        if (arm === "reuse") {
          const raw = JSON.parse(gunzipSync(readFileSync(join(a.root, ".promptus/cache/raw-parses.json.gz"))).toString()).entries.flatMap((e: any) => e.units);
          out.rawUnitsExact = JSON.stringify(raw) === JSON.stringify(JSON.parse(JSON.stringify(collectUnits(a.root, loadVocab(a.root)))));
          if (!out.rawUnitsExact) throw Error("raw-unit-parity");
        }
        await a.raw([process.execPath, join(SCRIPTS, "kb-index.ts"), "--root", a.root, "--quiet"]);
        out.canonicalComponentsExact = JSON.stringify(hashes) === JSON.stringify(COMPONENTS.map(f => sha(readFileSync(join(a.root, ".promptus/cache", f)))));
        if (!out.canonicalComponentsExact || beforeOracle !== digest(JSON.stringify(manifest(a.root)))) throw Error("canonical-parity");
        for (const [i, c] of a.cases.entries()) {
          const result = await a.raw([process.execPath, join(SCRIPTS, "kb-find.ts"), "--root", a.root, ...queryArgs(c)]);
          if (sha(result.stdout) !== cachedQueries[i]) throw Error("query-parity");
        }
        out.queryOutputsExact = true;
        const actual = manifest(a.root), initial = new Map(captured.manifest.map((e: any) => [e.path, e.sha256]));
        const ledger = loadVocab(a.root).substrates.ledger.store.replace(/^\.promptus\//, ""), probe = a.probe.path.replace(/^\.promptus\//, "");
        out.unrelatedSourcePreserved = actual.every(e => [ledger, probe].includes(e.path) || initial.get(e.path) === e.sha256) && captured.manifest.every((e: any) => actual.some(x => x.path === e.path));
        if (!out.unrelatedSourcePreserved) throw Error("unrelated-source-change");
        const derived = join(a.root, ".promptus/cache"), sizes = fileSizes(join(a.root, ".promptus")), du = spawnSync("du", ["-s", "-B1", derived], { encoding: "utf8" });
        out.derivedBytes = sumBytes(fileSizes(derived)); out.storeBytes = sumBytes(sizes);
        out.cacheBytes = existsSync(join(derived, "raw-parses.json.gz")) ? statSync(join(derived, "raw-parses.json.gz")).size : 0;
        out.derivedAllocatedBytes = du.status === 0 ? Number(du.stdout.split(/\s/)[0]) : null;
        out.cleanSummary = summary(out.clean.map((x: any) => x.ms));
        out.summary = Object.fromEntries(["append", "amend"].map(operation => {
          const traces = out.traces.filter((x: any) => x.operation === operation);
          return [operation, { workflow: summary(traces.map((x: any) => x.workflowMs)), tenReadScenario: summary(traces.map((x: any) => x.totalMs)),
            hundredReadScenarioEstimatedMs: traces.reduce((s: number, x: any) => s+x.workflowMs, 0) / traces.length + 100*out.cleanSummary.meanMs }];
        }));
      }
      p.frozenInputPreserved = assertSnapshot(snapshot).manifestHash === captured.manifestHash;
      p.passed = p.frozenInputPreserved;
    } catch (error) {
      const allowed = ["scratch-budget", "rss-budget", "command-timeout", "cache-budget", "subprocess-failed", "output-budget", "invalid-cli-envelope", "new-source-not-visible", "exact-fetch-mismatch", "amend-status-mismatch", "unexpected-clean-rebuild", "raw-unit-parity", "canonical-parity", "query-parity", "unrelated-source-change"];
      p.failure = allowed.includes((error as Error).message) ? (error as Error).message : "trial-precondition-failed";
      writeFileSync(join(notes, `${label}-failure.txt`), String(error), { flag: "wx", mode: 0o600 });
      try { p.frozenInputPreserved = assertSnapshot(snapshot).manifestHash === captured.manifestHash; } catch { p.frozenInputPreserved = false; }
      console.error(`${label}: stopped (${p.failure})`);
    } finally {
      p.removedWorkingBytes = roots.reduce((sum, root) => sum + sumBytes(fileSizes(root)), 0);
      for (const root of roots) rmSync(root, { recursive: true }); // exact generated children only; raw logs and original captures retained
      p.workingCopiesRemoved = true; saved();
    }
  }
  report.codeUnchanged = codeFiles.every(f => sha(readFileSync(join(import.meta.dir, f))) === codeHashes[f]);
  report.productionSourceUnchanged = sha(JSON.stringify(treeHashes(SCRIPTS))) === sourceRuntimeHash;
  report.passed = report.projects.every((p: any) => p.passed) && report.codeUnchanged && report.productionSourceUnchanged;
  report.completed = new Date().toISOString(); saved();
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, passed: report.passed, projects: report.projects.map((p: any) => ({ label: p.label, passed: p.passed, failure: p.failure ?? null, frozenInputPreserved: p.frozenInputPreserved, workingCopiesRemoved: p.workingCopiesRemoved })) }));
  process.exitCode = report.passed ? 0 : 1;
}
