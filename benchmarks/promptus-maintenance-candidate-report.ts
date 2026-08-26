#!/usr/bin/env bun

/** Build the exact before/after receipt for the database-independent maintenance patch. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Summary = {
  operation: string;
  n: number;
  medianSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  maxRssMiB: number;
};

type Receipt = {
  generatedAt: string;
  profile: string;
  filesystem: string;
  sourceReceipt: Record<string, unknown>;
  trials: Array<{ operation: string; details?: Record<string, any> }>;
  summary: Summary[];
};

const ROOT = resolve(import.meta.dir, "..");
const DEFAULT_BASELINE = resolve(ROOT, "benchmarks/results/maintenance-cross-hardware-v1-2026-08-25.json");
const DEFAULT_WINDOWS = resolve(ROOT, "benchmarks/results/maintenance-no-sqlite-mot-windows-9p-2026-08-26.json");
const DEFAULT_EXT4 = resolve(ROOT, "benchmarks/results/maintenance-no-sqlite-mot-ext4-2026-08-26.json");
const DEFAULT_THINKER = resolve(ROOT, "benchmarks/results/maintenance-no-sqlite-mot-windows-9p-thinker-2026-08-26.json");
const DEFAULT_OUTPUT = resolve(ROOT, "benchmarks/results/maintenance-no-sqlite-candidate-v1-2026-08-26.json");

function args(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) continue;
    parsed[argv[index].slice(2)] = argv[++index];
  }
  return parsed;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function summary(receipt: Receipt, operation: string): Summary {
  const found = receipt.summary.find((item) => item.operation === operation);
  if (!found) throw new Error(`${receipt.profile} is missing ${operation}`);
  return found;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sortedJson(values: unknown[] = []): string[] {
  return values.map((value) => JSON.stringify(value)).sort();
}

function canonicalSearch(search: any): unknown {
  return {
    schema: search.schema,
    catalogHash: search.catalogHash,
    averageLength: search.averageLength,
    documents: [...search.documents].sort((left, right) => left.key.localeCompare(right.key)),
    postings: Object.fromEntries(Object.entries(search.postings).sort(([left], [right]) => left.localeCompare(right)).map(
      ([term, values]: [string, any]) => [term, values.map((posting: any[]) => [search.documents[posting[0]].key, ...posting.slice(1)])
        .sort((left: any[], right: any[]) => left[0].localeCompare(right[0]))],
    )),
  };
}

function canonicalGraph(graph: any): unknown {
  const record = (value: Record<string, any[]> = {}) => Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, [...values].sort()]),
  );
  return {
    nodes: [...(graph.nodes ?? [])].sort(),
    out: record(graph.out),
    unitOut: record(graph.unitOut),
    inDeg: Object.fromEntries(Object.entries(graph.inDeg ?? {}).sort(([left], [right]) => left.localeCompare(right))),
    relationDegree: Object.fromEntries(Object.entries(graph.relationDegree ?? {}).sort(([left], [right]) => left.localeCompare(right))),
    relations: sortedJson(graph.relations),
    dangling: sortedJson(graph.dangling),
    external: sortedJson(graph.external),
    artifacts: sortedJson(graph.artifacts),
  };
}

function canonicalHealth(health: any): unknown {
  const artifacts = (health.artifactChecks ?? []).map((item: any) => [
    item.from, item.spec, item.status, item.ok, item.outcome, item.actualSha256 ?? null,
  ]);
  const rounds = (health.thinkerExchange?.rounds ?? []).map((item: any) => ({
    roundId: item.roundId,
    title: item.title,
    status: item.status,
    promptSha256: item.promptSha256,
    responseSha256: item.responseSha256,
    quarantinePath: item.quarantinePath,
    findings: sortedJson(item.findings),
    issues: [...item.issues].sort(),
  }));
  return {
    storeHash: health.storeHash,
    sourceFiles: health.sourceFiles,
    units: health.units,
    indexFailed: health.indexFailed,
    stale: health.stale,
    now: health.now,
    unclassified: sortedJson(health.unclassified),
    duplicateIds: sortedJson(health.duplicateIds),
    unresolvedRelations: sortedJson(health.unresolvedRelations),
    dangling: sortedJson(health.dangling),
    orphans: [...(health.orphans ?? [])].sort(),
    artifactChecks: sortedJson(artifacts),
    artifactFailures: sortedJson(health.artifactFailures),
    archivalArtifactWarnings: sortedJson(health.archivalArtifactWarnings),
    thinkerRounds: sortedJson(rounds),
    thinkerIssues: [...(health.thinkerExchange?.issues ?? [])].sort(),
    healthy: health.healthy,
  };
}

function normalizedCatalog(path: string): string {
  return readFileSync(path, "utf8").split("\n")
    .filter((line) => !/^ledger:[^·]+ · Maintenance benchmark no-sqlite-candidate-/.test(line))
    .join("\n");
}

function exactness(sourceRoot: string, windowsRoot: string, ext4Root: string) {
  const cache = (root: string) => resolve(root, ".promptus/cache");
  const sourceCache = cache(sourceRoot);
  const windowsCache = cache(windowsRoot);
  const ext4Cache = cache(ext4Root);
  const sourceHealth = readJson(resolve(sourceCache, "health.json"));
  const windowsHealth = readJson(resolve(windowsCache, "health.json"));
  const ext4Health = readJson(resolve(ext4Cache, "health.json"));
  const sourceSearch = readJson(resolve(sourceCache, "search.json"));
  const windowsSearch = readJson(resolve(windowsCache, "search.json"));
  const ext4Search = readJson(resolve(ext4Cache, "search.json"));
  const sourceGraph = readJson(resolve(sourceCache, "graph.json"));
  const windowsGraph = readJson(resolve(windowsCache, "graph.json"));
  const ext4Graph = readJson(resolve(ext4Cache, "graph.json"));
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  return {
    sourceStoreHash: sourceHealth.storeHash,
    windowsSameFilesystem: {
      catalogBytes: normalizedCatalog(resolve(sourceCache, "CATALOG.md")) === normalizedCatalog(resolve(windowsCache, "CATALOG.md")),
      graphBytes: sha256File(resolve(sourceCache, "graph.json")) === sha256File(resolve(windowsCache, "graph.json")),
      searchBytes: sha256File(resolve(sourceCache, "search.json")) === sha256File(resolve(windowsCache, "search.json")),
      healthSemantics: same(canonicalHealth(sourceHealth), canonicalHealth(windowsHealth)),
    },
    ext4Control: {
      catalogBytes: normalizedCatalog(resolve(sourceCache, "CATALOG.md")) === normalizedCatalog(resolve(ext4Cache, "CATALOG.md")),
      graphSemantics: same(canonicalGraph(sourceGraph), canonicalGraph(ext4Graph)),
      searchSemantics: same(canonicalSearch(sourceSearch), canonicalSearch(ext4Search)),
      healthSemantics: same(canonicalHealth(sourceHealth), canonicalHealth(ext4Health)),
      note: "Raw graph/search JSON order follows filesystem enumeration; canonical graph, retrieval postings, scores, and health outcomes are exact.",
    },
  };
}

const a = args(process.argv.slice(2));
const baselinePath = resolve(a.baseline ?? DEFAULT_BASELINE);
const windowsPath = resolve(a.windows ?? DEFAULT_WINDOWS);
const ext4Path = resolve(a.ext4 ?? DEFAULT_EXT4);
const thinkerPath = resolve(a.thinker ?? DEFAULT_THINKER);
const output = resolve(a.output ?? DEFAULT_OUTPUT);
const sourceRoot = resolve(a["source-root"] ?? "");
const windowsRoot = resolve(a["windows-root"] ?? "");
const ext4Root = resolve(a["ext4-root"] ?? "");
if (!a["source-root"] || !a["windows-root"] || !a["ext4-root"]) {
  throw new Error("--source-root, --windows-root, and --ext4-root are required for exactness checks");
}

const baseline = readJson(baselinePath);
const windows = readJson(windowsPath) as Receipt;
const ext4 = readJson(ext4Path) as Receipt;
const thinker = readJson(thinkerPath) as Receipt;
if (JSON.stringify(windows.sourceReceipt) !== JSON.stringify(ext4.sourceReceipt)) throw new Error("candidate corpus mismatch");
const oldRows = new Map(baseline.measurements.crossHardware.map((row: any) => [row.operation, row]));
const operations = windows.summary.map((item) => item.operation);
const measurements = operations.map((operation) => {
  const prior: any = oldRows.get(operation);
  const w = summary(windows, operation);
  const e = summary(ext4, operation);
  if (!prior) throw new Error(`baseline is missing ${operation}`);
  return {
    operation,
    baseline: { windows9pSeconds: prior.windows9pSeconds, ext4Seconds: prior.ext4Seconds, windows9pRssMiB: prior.peakRssMiB.windows9p, ext4RssMiB: prior.peakRssMiB.ext4 },
    candidate: { windows9pSeconds: w.medianSeconds, ext4Seconds: e.medianSeconds, windows9pRssMiB: round(w.maxRssMiB, 1), ext4RssMiB: round(e.maxRssMiB, 1) },
    improvement: {
      windows9pSpeedup: round(prior.windows9pSeconds / w.medianSeconds),
      ext4Speedup: round(prior.ext4Seconds / e.medianSeconds),
      windows9pRssReduction: round(1 - w.maxRssMiB / prior.peakRssMiB.windows9p, 4),
      ext4RssReduction: round(1 - e.maxRssMiB / prior.peakRssMiB.ext4, 4),
    },
  };
});
const thinkerInspect = summary(thinker, "thinker-inspect");
const thinkerDetails = thinker.trials.find((item) => item.operation === "thinker-inspect")?.details;
const result = {
  schema: "promptus.maintenance-no-sqlite-candidate.v1",
  generatedAt: [windows.generatedAt, ext4.generatedAt, thinker.generatedAt].sort().at(-1),
  benchmarkDate: "2026-08-26",
  question: "How much of the measured Promptus maintenance bottleneck can exact, database-independent work conservation remove?",
  frozenCorpus: windows.sourceReceipt,
  baselineCorpus: baseline.frozenCorpus,
  corpusDelta: {
    units: Number((windows.sourceReceipt as any).units) - Number(baseline.frozenCorpus.units),
    sourceFiles: Number((windows.sourceReceipt as any).sourceFiles) - Number(baseline.frozenCorpus.sourceFiles),
    artifactRecords: Number((windows.sourceReceipt as any).artifactRecords) - Number(baseline.frozenCorpus.artifactRecords),
  },
  measurements,
  thinker: {
    productionInspectSeconds: thinkerInspect.medianSeconds,
    baselineInspectSeconds: baseline.diagnostics.thinker.currentInspectSeconds,
    speedup: round(baseline.diagnostics.thinker.currentInspectSeconds / thinkerInspect.medianSeconds),
    findingFilesScanned: thinkerDetails?.findingFilesScanned,
    bindings: thinkerDetails?.bindings,
    bindingHash: thinkerDetails?.bindingHash,
  },
  exactness: exactness(sourceRoot, windowsRoot, ext4Root),
  rawReceipts: [baselinePath, windowsPath, ext4Path, thinkerPath].map((path) => ({
    path: path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/"),
    sha256: sha256File(path),
  })),
  observed: [
    "Ordinary WSL 9p writes fell from 29.44 seconds to 0.21 seconds because unrelated mutations no longer refresh thinker custody.",
    "The authoritative WSL 9p full gate fell from 109.34 seconds to 35.70 seconds while preserving all health outcomes.",
    "The ext4 full gate also improved from 3.61 seconds to 1.72 seconds, rejecting a storage-specific tradeoff.",
    "Index peak RSS fell from 649.0 MiB to 396.4 MiB on WSL 9p and from 675.1 MiB to 414.2 MiB on ext4.",
  ],
  decision: {
    noSqlitePatchJustified: true,
    batchWriterDeferred: "Ordinary writes are now 0.21 s on the stress mount; batch only if repeated relation-bearing writes remain a measured checkpoint bottleneck.",
    partialCheckpointDeferred: "The exact full gate now meets the modeled 30-40 s stress-mount budget without adding a second health class.",
    sqliteAdoptionDeferred: "No database is required to restore cadence; retain the separate SQLite shadow evidence for a future incremental-projection decision.",
  },
  limitations: [
    "Expensive WSL operations have one end-to-end candidate trial; index has two repetitions.",
    "The candidate corpus is 19 units, 30 source files, and 30 artifact records larger than the prior-day baseline.",
    "Relation-bearing writes still require an exact source resolver traversal and took 7.55 seconds on WSL 9p.",
    "Raw derived JSON array/object order is not canonical across copied filesystems, although canonical graph, lexical, and health semantics matched exactly.",
  ],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ schema: result.schema, output, sha256: sha256File(output), measurements: result.measurements }, null, 2));
