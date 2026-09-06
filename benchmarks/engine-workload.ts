#!/usr/bin/env bun
/** Frozen synthetic workload. No live-project root or network access is supported. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ENGINE_NAMES, openEngine, treeBytes, type EngineName } from "./engine-workload-adapters.ts";
import { inside, summary } from "./promptus-engines.ts";
import type { SearchSourceDocument } from "../promptus/scripts/lib/search.ts";

const REPO = resolve(import.meta.dir, "..");
const SUITE = join(import.meta.dir, "engine-workload-cases.json");
const MARKER = "organon.synthetic-engine-workload.v1";
const PREFIX = "__WORKLOAD_RESULT__";
const HARNESS_FILES = ["engine-workload.ts", "engine-workload-adapters.ts", "engine-workload-qmd.mjs", "../promptus/scripts/lib/search.ts", "promptus-engines.ts"];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Case = { id: string; query: string; relevant: string[]; kind: string };
type Fixture = { schema: string; documents: Array<{ id: string; title: string; text: string; status: string }>; cases: Case[] };

export function validateFixture(value: Fixture): void {
  if (value.schema !== "organon.synthetic-retrieval.v1" || !Array.isArray(value.documents) || !Array.isArray(value.cases)) throw new Error("invalid fixture schema");
  const ids = new Set<string>();
  for (const doc of value.documents) {
    if (!/^u\d{3}$/.test(doc.id) || ids.has(doc.id) || !doc.title || !doc.text || !["VALIDATED", "SUPERSEDED", "REFUTED", "UNTRUSTED"].includes(doc.status)) throw new Error("invalid fixture document");
    ids.add(doc.id);
  }
  const cases = new Set<string>();
  for (const item of value.cases) {
    if (cases.has(item.id) || !item.query || !["semantic", "exact", "contrast", "absence"].includes(item.kind)) throw new Error("invalid fixture case");
    cases.add(item.id);
    if (item.relevant.length !== (item.kind === "absence" ? 0 : 1) || item.relevant.some(id => value.documents.find(doc => doc.id === id)?.status !== "VALIDATED")) throw new Error("invalid relevance label");
  }
}

export function syntheticSources(fixture: Fixture, count: number): SearchSourceDocument[] {
  validateFixture(fixture);
  const active = fixture.documents.filter(doc => doc.status === "VALIDATED");
  if (!Number.isSafeInteger(count) || count < active.length + 1 || count > 20_000) throw new Error("units must fit fixture and be at most 20000");
  const make = (id: string, title: string, text: string): SearchSourceDocument => ({ id, substrate: "finding", status: "VALIDATED", title, text: `# ${title}\n\n${text}\n`, path: `units/${id}.md`, links: [], cold: false });
  const sources = active.map(doc => make(doc.id, doc.title, doc.text));
  const objects = ["weather dial", "ceramic tile", "water tank", "paper lantern", "wooden prism", "copper reel", "sand tray", "glass bead"];
  const actions = ["measured at intake", "stored after inspection", "marked for replacement", "held pending review", "copied into a register", "checked against a template"];
  while (sources.length < count - 1) {
    const n = sources.length, id = `f${String(n).padStart(6, "0")}`;
    const token = sha(`synthetic-pressure-${n}`).slice(0, 12);
    sources.push(make(id, `Synthetic inventory record ${token}`, `Fictional inventory record ${token}: the ${objects[n % objects.length]} was ${actions[Math.floor(n / objects.length) % actions.length]}. Batch ${n} has shelf position ${n % 97} and requires a signed inventory receipt. This invented observation concerns physical inventory only, not the procedures of the named fixture projects. Its next action is a routine inspection by the assigned worker.`));
  }
  sources.push(make("probe", "Synthetic amber orchard inspection", "The amber orchard inspection measures the diameter of apricot branches using a paper gauge. Its distinctive identifier is apricotbranchomega. This is an invented probe for refresh testing."));
  return sources;
}

export function rankingMetrics(rankings: string[][], cases: Case[]) {
  const groups: Record<string, any> = {};
  for (const kind of ["all-positive", "semantic", "exact", "contrast"]) {
    const selected = cases.map((item, index) => ({ item, ranking: rankings[index] })).filter(({ item }) => item.relevant.length && (kind === "all-positive" || item.kind === kind));
    groups[kind] = { cases: selected.length, top1: 0, top5: 0, top10: 0, reciprocalRankSum: 0 };
    for (const { item, ranking } of selected) {
      const position = ranking.indexOf(item.relevant[0]);
      if (position >= 0) { groups[kind].reciprocalRankSum += 1 / (position + 1); for (const k of [1, 5, 10]) if (position < k) groups[kind][`top${k}`]++; }
    }
  }
  return { groups, absence: cases.flatMap((item, i) => item.kind === "absence" ? [{ id: item.id, candidateCount: rankings[i].length, top10: rankings[i].slice(0, 10) }] : []), note: "Absence candidate lists are not false claims or answers. Semantic retrieval is not an abstention classifier." };
}

function dependenciesAt(path: string): string {
  const root = realpathSync(path);
  if (!inside(root, tmpdir()) || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !== "organon-overhaul-engine-trial") throw new Error("dependencies must be a marked OS-temp trial");
  for (const [name, version] of [["@tobilu/qmd", "2.8.3"], ["@zvec/zvec-grep", "0.2.1"], ["node-linux-x64", "24.19.0"]]) {
    if (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version !== version) throw new Error(`unapproved trial version: ${name}`);
  }
  return root;
}

async function coldQuery(name: EngineName, scratch: string, dependencies: string, query: string) {
  const started = performance.now();
  const child = Bun.spawn([process.execPath, import.meta.path, "--cold", name, scratch, dependencies, query], { stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 90_000);
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timeout);
  if (exit) throw new Error(`cold ${name} exited ${exit}: ${stderr.slice(-2000)}`);
  const line = stdout.split("\n").findLast(line => line.startsWith(PREFIX));
  if (!line) throw new Error(`missing cold receipt: ${stdout.slice(-1000)}`);
  return { wallMs: performance.now() - started, ...JSON.parse(line.slice(PREFIX.length)) };
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === "--cold") {
    const [, name, path, deps, query] = args;
    if (args.length !== 5 || !ENGINE_NAMES.includes(name as EngineName)) throw new Error("invalid cold request");
    const scratch = realpathSync(path), dependencies = dependenciesAt(deps);
    if (!inside(scratch, tmpdir()) || readFileSync(join(scratch, "marker"), "utf8") !== MARKER) throw new Error("unmarked cold fixture");
    globalThis.fetch = (async () => { throw new Error("offline trial: network disabled"); }) as typeof fetch;
    const start = performance.now(), engine = await openEngine(name as EngineName, scratch, dependencies);
    try { const ids = await engine.query(query); console.log(PREFIX + JSON.stringify({ openQueryMs: performance.now() - start, ids, rssBytes: process.memoryUsage().rss, workerRssBytes: engine.workerRss() })); }
    finally { await engine.close(); }
    return 0;
  }
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--dependencies", "--units", "--output", "--engines", "--repeats"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || flags[args[i]]) throw new Error(`invalid argument: ${args[i]}`);
    flags[args[i]] = args[i + 1];
  }
  if (!flags["--dependencies"] || !flags["--output"]) throw new Error("--dependencies and --output required");
  const dependencies = dependenciesAt(flags["--dependencies"]), output = resolve(flags["--output"]);
  if (!inside(dirname(output), join(REPO, "benchmarks/results")) && !inside(dirname(output), tmpdir())) throw new Error("output must be benchmarks/results or OS temp");
  if (existsSync(output)) throw new Error("refusing receipt overwrite");
  const names = (flags["--engines"]?.split(",") ?? [...ENGINE_NAMES]) as EngineName[];
  if (!names.length || new Set(names).size !== names.length || names.some(name => !ENGINE_NAMES.includes(name))) throw new Error("invalid engines");
  const repeats = Number(flags["--repeats"] ?? 3);
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("invalid repeats");
  const suiteBytes = readFileSync(SUITE), fixture: Fixture = JSON.parse(suiteBytes.toString()), sources = syntheticSources(fixture, Number(flags["--units"] ?? 500));
  const harnessSha256 = Object.fromEntries(HARNESS_FILES.map(file => [file, sha(readFileSync(join(import.meta.dir, file)))]));
  const modelPaths = ["model-cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf", "models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7/model.safetensors", "models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7/tokenizer/tokenizer.json", "models/model2vec/minishlab--potion-retrieval-32M/6fc8051fab2a1e0ee76689cf08c853792ac285e7/tokenizer/tokenizer_config.json"];
  const modelSha256 = Object.fromEntries(modelPaths.map(file => [file, sha(readFileSync(join(dependencies, file)))]));
  const results: Record<string, any> = {}, originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("offline trial: network disabled"); }) as typeof fetch;
  try {
    for (const name of names) {
      const scratch = mkdtempSync(join(tmpdir(), "organon-engine-workload-")), data = join(scratch, "units");
      let engine: Awaited<ReturnType<typeof openEngine>> | undefined;
      const result: any = results[name] = {};
      try {
        mkdirSync(data); writeFileSync(join(scratch, "marker"), MARKER);
        for (const doc of sources) writeFileSync(join(data, `${doc.id}.md`), doc.text);
        console.error(`${name}: build ${sources.length} units`);
        let start = performance.now(); engine = await openEngine(name, scratch, dependencies);
        result.initialUpdate = await engine.update(sources); result.buildMs = performance.now() - start;
        const samples: number[] = [], rankings: string[][] = [];
        let stable = true;
        for (let repeat = 0; repeat < repeats; repeat++) for (let i = 0; i < fixture.cases.length; i++) {
          start = performance.now(); const ids = await engine.query(fixture.cases[i].query); samples.push(performance.now() - start);
          if (!repeat) rankings[i] = ids; else stable &&= JSON.stringify(rankings[i]) === JSON.stringify(ids);
        }
        result.query = summary(samples); result.rankings = rankings; result.stableAcrossPasses = stable;
        result.metrics = rankingMetrics(rankings, fixture.cases); result.storageBytes = engine.storage();
        result.processRssBytes = process.memoryUsage().rss; result.workerRssBytes = engine.workerRss();
        start = performance.now(); const unchanged = await engine.update(sources); result.unchanged = { ms: performance.now() - start, receipt: unchanged };
        await engine.close(); engine = undefined;
        console.error(`${name}: three fresh-process queries`);
        result.cold = [];
        for (let i = 0; i < 3; i++) result.cold.push(await coldQuery(name, scratch, dependencies, fixture.cases[i].query));
        result.coldMatchesWarm = result.cold.every((receipt: any, i: number) => JSON.stringify(receipt.ids) === JSON.stringify(rankings[i]));
        engine = await openEngine(name, scratch, dependencies);
        const before = await engine.query("apricotbranchomega amber orchard inspection");
        const changed = sources.map(doc => doc.id === "probe" ? { ...doc, title: "Synthetic submarine pressure alarm", text: "# Synthetic submarine pressure alarm\n\nThe fictional undersea capsule uses cobaltpressurezeta to detect excessive water pressure. The pressure alarm closes the titanium hatch before a deep ocean descent.\n" } : doc);
        writeFileSync(join(data, "probe.md"), changed.find(doc => doc.id === "probe")!.text);
        start = performance.now(); const edit = await engine.update(changed); const editMs = performance.now() - start;
        const after = await engine.query("cobaltpressurezeta submarine deep ocean pressure alarm");
        const indexedAfterEdit = await engine.indexedText("probe");
        const inserted = { ...changed.find(doc => doc.id === "probe")!, id: "addition", path: "units/addition.md", title: "Synthetic telescope mirror cleaning", text: "# Synthetic telescope mirror cleaning\n\nThe fictional observatory uses silverspiraltheta to clean its telescope mirror with a soft optical brush. This is an invented addition probe.\n" };
        writeFileSync(join(data, "addition.md"), inserted.text);
        const added = [...changed, inserted];
        start = performance.now(); const add = await engine.update(added); const addMs = performance.now() - start;
        const insertionHits = await engine.query("silverspiraltheta telescope mirror cleaning observatory");
        // Removing an active unit models a validated-to-inactive projection delta;
        // the original fixture bytes remain frozen and are never rewritten.
        const remaining = changed.filter(doc => doc.id !== "probe" && doc.id !== "u001");
        for (const id of ["probe", "addition", "u001"]) unlinkSync(join(data, `${id}.md`));
        start = performance.now(); const deletion = await engine.update(remaining); const deleteMs = performance.now() - start;
        const removedQueries = ["cobaltpressurezeta submarine deep ocean pressure alarm", "silverspiraltheta telescope mirror cleaning observatory", fixture.cases[0].query];
        const afterDeletion = await Promise.all(removedQueries.map(query => engine!.query(query)));
        const removedIndexedContent = await Promise.all(["probe", "addition", "u001"].map(id => engine!.indexedText(id)));
        result.lifecycle = { before: before.slice(0, 10), edit: { ms: editMs, receipt: edit, top10: after.slice(0, 10), indexedText: indexedAfterEdit }, insert: { ms: addMs, receipt: add, top10: insertionHits.slice(0, 10) }, delete: { ms: deleteMs, receipt: deletion, rankings: afterDeletion, indexedText: removedIndexedContent }, assertions: {
          initialProbeTop10: before.slice(0, 10).includes("probe"), editedProbeTop10: after.slice(0, 10).includes("probe"), insertedProbeTop10: insertionHits.slice(0, 10).includes("addition"), deletedIdsAbsent: afterDeletion.flat().every(id => !["probe", "addition", "u001"].includes(id)),
          indexedEditIsCurrent: Boolean(indexedAfterEdit?.includes("cobaltpressurezeta") && !indexedAfterEdit.includes("apricotbranchomega")), deletedIndexedContentAbsent: removedIndexedContent.every(text => text === null),
        } };
        console.error(`${name}: lifecycle ${JSON.stringify(result.lifecycle.assertions)}`);
      } catch (error) { result.error = String(error); console.error(`${name}: ${result.error}`); }
      finally {
        try { await engine?.close(); } catch (error) { result.cleanupError = String(error); }
        // scratch was minted by this process; never a user-selected project root.
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  } finally { globalThis.fetch = originalFetch; }
  for (const semantic of ["qmd-vector", "zvec-hybrid"]) if (results[semantic]?.rankings && results["promptus-lexical"]?.rankings) {
    const rankings = fixture.cases.map((_, i) => [...new Set([...results["promptus-lexical"].rankings[i].slice(0, 5), ...results[semantic].rankings[i].slice(0, 5)])]);
    results[`lexical-plus-${semantic}`] = { metrics: rankingMetrics(rankings, fixture.cases), rankings, policy: "frozen five per route; lexical first, deduplicated; no tuning" };
  }
  const changedInputs = [...HARNESS_FILES.filter(file => sha(readFileSync(join(import.meta.dir, file))) !== harnessSha256[file]), ...(sha(readFileSync(SUITE)) === sha(suiteBytes) ? [] : ["engine-workload-cases.json"]), ...modelPaths.filter(file => sha(readFileSync(join(dependencies, file))) !== modelSha256[file])];
  const report = {
    schema: MARKER, created: new Date().toISOString(), units: sources.length, sourceBytes: sources.reduce((n, doc) => n + Buffer.byteLength(doc.text), 0), sourceSha256: sha(JSON.stringify(sources)),
    suiteSha256: sha(suiteBytes), dependencyLockSha256: sha(readFileSync(join(dependencies, "bun.lock"))), runtime: Bun.version,
    versions: { qmd: "2.8.3", zvecGrep: "0.2.1", node: "24.19.0", qmdModel: "embeddinggemma-300M-Q8_0", zvecModel: "potion-retrieval-32M" },
    harnessSha256, modelSha256, changedInputs,
    stagedDependencyBytes: treeBytes(dependencies),
    limitations: ["Fresh GPT-6-authored synthetic labels, not live-project effectiveness or independently replicated human judgments.", "Filler scale repeats bounded inventory templates; not thousands of diverse papers.", "Fresh-process measurements retain warm OS and model file caches; they are not cold-disk or reboot measurements. Three different questions are each measured once.", "QMD uses an additional Node process; other engines execute in Bun. Parent RSS is cumulative within this run, not isolated peak memory. Cold receipts expose fresh-process RSS and QMD worker RSS separately.", "Pinned models are staged before timing; network fetch disabled. Model/download size is excluded from per-index storage. Fetch override is not an OS network sandbox.", "Status exclusion occurs in the projection; deletion tests exercise backend refresh, not a complete Promptus integration.", "Search candidates cannot prove absence or entailment. Exact syntax controls and cold archive traversal require separate integration tests.", "Promptus rebuilds its JSON projection; SQLite diffs all projected rows; QMD and zvec use their own incremental update APIs. Measurements include each adapter's work but exclude canonical source collection.", "stableAcrossPasses measures one index, not independent builds; zvec ranking variation was observed in earlier receipts.", "Indexed content checks inspect current stored documents/entities (lexical uses body postings). They do not require physically erasing unreachable historical content or independently recompute every embedding."],
    results,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, units: sources.length, results: Object.fromEntries(Object.entries(results).map(([name, r]) => [name, { error: r.error, buildMs: r.buildMs, query: r.query, metrics: r.metrics, lifecycle: r.lifecycle?.assertions }])) }, null, 2));
  return changedInputs.length || Object.values(results).some(result => result.error || result.cleanupError || result.coldMatchesWarm === false || result.lifecycle && Object.values(result.lifecycle.assertions).some(value => !value)) ? 1 : 0;
}

if (import.meta.main) main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => { console.error(String(error)); process.exitCode = 1; });
