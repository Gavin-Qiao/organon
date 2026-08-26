#!/usr/bin/env bun

/**
 * Consolidate public-safe Promptus maintenance receipts and build the canonical
 * portable-report payload. Raw receipts remain the auditable measurement layer.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Database } from "bun:sqlite";

type Summary = {
  operation: string;
  n: number;
  medianSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  medianUserSeconds: number;
  medianSystemSeconds: number;
  maxRssMiB: number;
};

type Trial = {
  operation: string;
  details?: Record<string, unknown>;
};

type Receipt = {
  generatedAt: string;
  profile: string;
  filesystem: string;
  suite: string;
  cpuList: string;
  environment: Record<string, unknown>;
  sourceReceipt: {
    storeHash: string;
    sourceFiles: number;
    units: number;
    artifactRecords: number;
  };
  trials: Trial[];
  summary: Summary[];
};

const ROOT = resolve(import.meta.dir, "..");
const RESULTS = join(ROOT, "benchmarks", "results");
const DEFAULT_AGGREGATE = join(RESULTS, "maintenance-cross-hardware-v1-2026-08-25.json");
const DEFAULT_ARTIFACT = join(RESULTS, "maintenance-cross-hardware-v1-2026-08-25.artifact.json");

const FILES = {
  windows: "maintenance-mot-windows-9p-2026-08-25.json",
  ext4: "maintenance-mot-ext4-2026-08-25.json",
  tmpfs: "maintenance-mot-tmpfs-2026-08-25.json",
  windowsThinker: "maintenance-mot-windows-9p-thinker-2026-08-25.json",
  ext4Thinker: "maintenance-mot-ext4-thinker-2026-08-25.json",
  tmpfsThinker: "maintenance-mot-tmpfs-thinker-2026-08-25.json",
  ext4OneCpu: "maintenance-mot-ext4-one-cpu-2026-08-25.json",
  organon: "maintenance-organon-windows-9p-2026-08-25.json",
} as const;

const LABELS: Record<string, string> = {
  status: "Current-state status",
  retrieval: "Knowledge retrieval",
  "session-doctor": "Session doctor",
  "collect-units": "Unit collection",
  "hash-store": "Store fingerprint",
  "artifacts-current": "Artifact verification",
  "artifacts-cached-root": "Artifact verification, cached root",
  "artifacts-unique-path": "Artifact verification, unique path",
  index: "Index rebuild",
  "check-no-index": "Whole-store check, no re-index",
  "check-full": "Full check including re-index",
  "kb-add-no-relation": "Gated write, no relation",
  "kb-add-relation-dry-run": "Relation dry run",
  "kb-add-relation": "Gated write with relation",
};

function readReceipt(name: string): Receipt {
  return JSON.parse(readFileSync(join(RESULTS, name), "utf8"));
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function summary(receipt: Receipt, operation: string): Summary {
  const found = receipt.summary.find((value) => value.operation === operation);
  if (!found) throw new Error(`${receipt.profile} has no ${operation} summary`);
  return found;
}

function details(receipt: Receipt, operation: string): Record<string, unknown> {
  const found = receipt.trials.find((value) => value.operation === operation)?.details;
  if (!found) throw new Error(`${receipt.profile} has no ${operation} details`);
  return found;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function speedup(slow: number, fast: number): number {
  return round(slow / fast, 2);
}

function assertSameFrozenCorpus(receipts: Receipt[]): void {
  const expected = JSON.stringify(receipts[0].sourceReceipt);
  for (const receipt of receipts.slice(1)) {
    if (JSON.stringify(receipt.sourceReceipt) !== expected) {
      throw new Error(`frozen-corpus mismatch: ${receipts[0].profile} != ${receipt.profile}`);
    }
  }
}

function sourcePath(path: string): string {
  return relative(ROOT, path).replace(/\\/g, "/");
}

export function buildMaintenanceAggregate(): Record<string, unknown> {
  const windows = readReceipt(FILES.windows);
  const ext4 = readReceipt(FILES.ext4);
  const tmpfs = readReceipt(FILES.tmpfs);
  const windowsThinker = readReceipt(FILES.windowsThinker);
  const ext4Thinker = readReceipt(FILES.ext4Thinker);
  const tmpfsThinker = readReceipt(FILES.tmpfsThinker);
  const ext4OneCpu = readReceipt(FILES.ext4OneCpu);
  const organon = readReceipt(FILES.organon);
  assertSameFrozenCorpus([windows, ext4, tmpfs, windowsThinker, ext4Thinker, tmpfsThinker]);

  const operationNames = windows.summary.map((value) => value.operation);
  const crossHardware = operationNames.map((operation) => {
    const w = summary(windows, operation);
    const e = summary(ext4, operation);
    const t = summary(tmpfs, operation);
    return {
      operation,
      label: LABELS[operation] ?? operation,
      windows9pSeconds: w.medianSeconds,
      ext4Seconds: e.medianSeconds,
      tmpfsSeconds: t.medianSeconds,
      windows9pToExt4Speedup: speedup(w.medianSeconds, e.medianSeconds),
      ext4ToTmpfsRatio: round(e.medianSeconds / t.medianSeconds, 2),
      repetitions: { windows9p: w.n, ext4: e.n, tmpfs: t.n },
      peakRssMiB: {
        windows9p: round(w.maxRssMiB, 1),
        ext4: round(e.maxRssMiB, 1),
        tmpfs: round(t.maxRssMiB, 1),
      },
    };
  });

  const artifactCurrent = details(windows, "artifacts-current") as {
    records: number; uniqueSpecs: number; uniquePaths: number; bytesRead: number; outcomes: Record<string, number>;
  };
  const artifactUnique = details(windows, "artifacts-unique-path") as {
    bytesRead: number; outcomes: Record<string, number>;
  };
  const thinkerCurrent = details(windowsThinker, "thinker-inspect") as {
    rounds: number; issues: number; statuses: Record<string, number>; bindings: number; bindingHash: string;
  };
  const thinkerSingle = details(windowsThinker, "thinker-single-pass") as {
    roundsWithQuarantine: number; findingFilesScanned: number; bindings: number; bindingHash: string;
  };
  if (thinkerCurrent.bindings !== thinkerSingle.bindings || thinkerCurrent.bindingHash !== thinkerSingle.bindingHash) {
    throw new Error("single-pass thinker candidate did not preserve the current binding receipt");
  }
  if (JSON.stringify(artifactCurrent.outcomes) !== JSON.stringify(artifactUnique.outcomes)) {
    throw new Error("unique-path artifact candidate did not preserve verifier outcomes");
  }

  const thinkerProfiles = [
    { filesystem: "wsl-9p", receipt: windowsThinker },
    { filesystem: "ext4", receipt: ext4Thinker },
    { filesystem: "tmpfs", receipt: tmpfsThinker },
  ].map(({ filesystem, receipt }) => {
    const current = details(receipt, "thinker-inspect") as { bindings: number; bindingHash: string };
    const candidate = details(receipt, "thinker-single-pass") as { bindings: number; bindingHash: string };
    if (current.bindings !== candidate.bindings || current.bindingHash !== candidate.bindingHash) {
      throw new Error(`${filesystem} single-pass thinker candidate did not preserve the binding receipt`);
    }
    const currentSeconds = summary(receipt, "thinker-inspect").medianSeconds;
    const candidateSeconds = summary(receipt, "thinker-single-pass").medianSeconds;
    return {
      filesystem,
      currentSeconds,
      candidateSeconds,
      speedup: speedup(currentSeconds, candidateSeconds),
      exactEquivalent: true,
    };
  });
  const artifactProfiles = [
    { filesystem: "wsl-9p", receipt: windows },
    { filesystem: "ext4", receipt: ext4 },
    { filesystem: "tmpfs", receipt: tmpfs },
  ].map(({ filesystem, receipt }) => {
    const current = details(receipt, "artifacts-current") as { outcomes: Record<string, number> };
    const candidate = details(receipt, "artifacts-unique-path") as { outcomes: Record<string, number> };
    if (JSON.stringify(current.outcomes) !== JSON.stringify(candidate.outcomes)) {
      throw new Error(`${filesystem} unique-path artifact candidate did not preserve verifier outcomes`);
    }
    const currentSeconds = summary(receipt, "artifacts-current").medianSeconds;
    const candidateSeconds = summary(receipt, "artifacts-unique-path").medianSeconds;
    return {
      filesystem,
      currentSeconds,
      candidateSeconds,
      speedup: speedup(currentSeconds, candidateSeconds),
      exactEquivalent: true,
    };
  });

  const oneCpuRows = ext4OneCpu.summary.map((value) => {
    const normal = ext4.summary.find((candidate) => candidate.operation === value.operation);
    return {
      operation: value.operation,
      oneCpuSeconds: value.medianSeconds,
      inheritedCpuSeconds: normal?.medianSeconds ?? null,
      oneCpuToInheritedRatio: normal ? round(value.medianSeconds / normal.medianSeconds, 2) : null,
    };
  });

  const rawReceipts = Object.values(FILES).map((name) => ({
    path: `benchmarks/results/${name}`,
    sha256: sha256(join(RESULTS, name)),
  }));
  const generatedAt = [windows, ext4, tmpfs, windowsThinker, ext4Thinker, tmpfsThinker, ext4OneCpu, organon]
    .map((receipt) => receipt.generatedAt)
    .sort()
    .at(-1);

  return {
    schema: "promptus.maintenance-cross-hardware.v1",
    generatedAt,
    benchmarkDate: "2026-08-25",
    question: "Where does Promptus maintenance time go at MoT scale, and which hardware-agnostic software changes reduce work without weakening its integrity contract?",
    frozenCorpus: {
      ...windows.sourceReceipt,
      sourceBytes: 14_619_175,
      ledgerBytes: 4_463_157,
      ledgerUnits: 2_977,
      liveUnits: 5_338,
      coldUnits: 0,
      uniqueArtifactSpecs: artifactCurrent.uniqueSpecs,
      uniqueArtifactPaths: artifactCurrent.uniquePaths,
    },
    environment: {
      ...windows.environment,
      runtime: "WSL2",
      storageProfiles: [
        { id: "windows9p", label: "Windows-mounted WSL path", filesystem: "9p/v9fs" },
        { id: "ext4", label: "WSL native Linux filesystem", filesystem: "ext4" },
        { id: "tmpfs", label: "Memory-backed control", filesystem: "tmpfs" },
      ],
    },
    measurements: { crossHardware },
    diagnostics: {
      sessionDoctorWindows9p: {
        wallSeconds: summary(windows, "session-doctor").medianSeconds,
        internalTimingMs: details(windows, "session-doctor").timingMs,
      },
      thinker: {
        currentInspectSeconds: summary(windowsThinker, "thinker-inspect").medianSeconds,
        currentRefreshSeconds: summary(windowsThinker, "thinker-refresh").medianSeconds,
        singlePassSeconds: summary(windowsThinker, "thinker-single-pass").medianSeconds,
        singlePassSpeedup: speedup(
          summary(windowsThinker, "thinker-inspect").medianSeconds,
          summary(windowsThinker, "thinker-single-pass").medianSeconds,
        ),
        findingFilesScanned: thinkerSingle.findingFilesScanned,
        rounds: thinkerCurrent.rounds,
        adjudicatedRounds: thinkerCurrent.statuses.ADJUDICATED,
        preparedRounds: thinkerCurrent.statuses.PREPARED,
        bindings: thinkerCurrent.bindings,
        bindingHash: thinkerCurrent.bindingHash,
        profiles: thinkerProfiles,
        exactEquivalent: true,
      },
      artifacts: {
        records: artifactCurrent.records,
        uniqueSpecs: artifactCurrent.uniqueSpecs,
        uniquePaths: artifactCurrent.uniquePaths,
        currentSeconds: summary(windows, "artifacts-current").medianSeconds,
        cachedRootSeconds: summary(windows, "artifacts-cached-root").medianSeconds,
        uniquePathSeconds: summary(windows, "artifacts-unique-path").medianSeconds,
        currentBytesRead: artifactCurrent.bytesRead,
        uniquePathBytesRead: artifactUnique.bytesRead,
        byteReductionRate: round(1 - artifactUnique.bytesRead / artifactCurrent.bytesRead, 4),
        wallTimeReductionRate: round(1 - summary(windows, "artifacts-unique-path").medianSeconds / summary(windows, "artifacts-current").medianSeconds, 4),
        outcomes: artifactCurrent.outcomes,
        profiles: artifactProfiles,
        exactEquivalent: true,
      },
    },
    controls: {
      oneCpuExt4: {
        caveat: "The disposable snapshot contained two benchmark-only ledger events by this control; unit count was 5,340 rather than 5,338.",
        rows: oneCpuRows,
      },
      smallStoreWindows9p: {
        corpus: organon.sourceReceipt,
        rows: organon.summary.map((value) => ({ operation: value.operation, seconds: value.medianSeconds })),
      },
    },
    conclusions: {
      observed: [
        "The same full gate took 109.34 seconds on WSL 9p and 3.61 seconds on ext4; this storage contrast exposes metadata-heavy redundant traversal rather than defining a storage-specific solution.",
        "A one-CPU ext4 control tracked the inherited-CPU ext4 timings, so the current hot path is not CPU-throughput limited.",
        "Single-pass thinker binding preserved the exact binding count and digest and was faster on every profile: 10.75× on WSL 9p, 3.33× on ext4, and 3.17× on tmpfs.",
        "Hashing each unique declared artifact path once preserved every verifier outcome and was faster on every profile: 1.62× on WSL 9p, 1.35× on ext4, and 1.53× on tmpfs.",
      ],
      inferred: [
        "The first optimization objective should be fewer source opens, parses, hashes, and derived writes per operation; elapsed time is the validation measure, not the architecture.",
        "A full maintenance command should construct one immutable store snapshot and reuse it for source hashing, indexing, thinker custody, graph checks, and health reporting instead of rescanning between phases.",
        "Global incremental indexing is a later step: exact single-pass traversal, dependency-aware refresh, path-deduplicated hashing, and batching are simpler and already supported by measured evidence.",
        "GPU acceleration is irrelevant to this maintenance path; additional CPU cores will matter only after an explicitly bounded parallel phase exists.",
      ],
    },
    engineeringSequence: [
      {
        priority: 1,
        change: "Create one thinker exchange context: scan findings once, map quarantine IDs to bindings, reuse it for every round, refresh only when thinker inputs or findings change, and avoid rewriting identical derived files.",
        correctnessBoundary: "Every round status, issue, binding, digest, ROUND.md, and INDEX.md must match the current implementation byte-for-byte.",
      },
      {
        priority: 2,
        change: "Refactor full maintenance around one immutable StoreSnapshot that reads and parses each source file once and feeds source hashing, catalog, graph, search, thinker custody, and health checks.",
        correctnessBoundary: "The snapshot is built under the store lock or proves its source generation stayed stable; derived outputs and health results must equal a clean full rebuild.",
      },
      {
        priority: 3,
        change: "Deduplicate artifact content hashing by normalized real path while comparing the one digest against every historical artifact record that references it.",
        correctnessBoundary: "The authoritative full gate remains exact; no stat-only cache may stand in for content hashing.",
      },
      {
        priority: 4,
        change: "Add transactional batch kb-add so one lock, relation-resolution snapshot, dependency-aware refresh, and index serve a bounded set of writes.",
        correctnessBoundary: "All-or-nothing source mutation, unique IDs, and a single authoritative post-batch receipt.",
      },
      {
        priority: 5,
        change: "Add a clearly PARTIAL touched-files checkpoint and a writer-produced change receipt; develop a persistent incremental index only if the earlier work still misses the latency budget.",
        correctnessBoundary: "A partial receipt can never masquerade as whole-store health; full rebuilds must converge byte-for-byte.",
      },
    ],
    workConservationTargets: [
      {
        operation: "Ordinary governed write",
        currentWaste: "Refreshes all thinker rounds and repeatedly scans every finding even when a ledger event cannot affect thinker custody",
        targetWork: "One source mutation, one catalog delta, zero finding-tree scans unless a declared thinker dependency changed",
        acceptance: "Same unit bytes and ID; unrelated writes leave thinker derived bytes unchanged",
      },
      {
        operation: "Authoritative index",
        currentWaste: "Parses the store, then independently rescans findings for each thinker round",
        targetWork: "Read and parse every source file at most once; derive catalog, graph, search, source hash, and thinker bindings from one snapshot",
        acceptance: "All derived files are byte-for-byte equal to a clean reference rebuild",
      },
      {
        operation: "Authoritative full check",
        currentWaste: "Runs the index, fingerprints the store again, reinspects thinker custody, and rehashes repeated artifact paths",
        targetWork: "Reuse the index snapshot and hash each canonical artifact file once while checking every owning record",
        acceptance: "Identical hard failures, archival warnings, graph debt, source hash, and final readiness",
      },
      {
        operation: "Bounded batch write",
        currentWaste: "B writes repeat locks, relation collection, thinker refresh, and maintenance handoffs",
        targetWork: "One lock and resolver snapshot for B all-or-nothing mutations, followed by one dependency-aware refresh and one index receipt",
        acceptance: "Unique IDs, no lost events, rollback on any failed item, and full-rebuild convergence",
      },
      {
        operation: "Fast checkpoint",
        currentWaste: "A whole-store ratchet is the only strong receipt, so inner-loop bookkeeping pays global cost",
        targetWork: "Verify the transaction's touched sources, relations, and new artifacts only",
        acceptance: "Receipt is explicitly PARTIAL and cannot satisfy a full-gate requirement",
      },
    ],
    hardwareGuidance: [
      {
        setting: "All hardware profiles",
        evidence: "Single-pass thinker and unique-path artifact probes improved all three measured filesystems with exact-equivalent outputs",
        design: "Use the same work-conserving algorithms everywhere: one source snapshot, dependency-aware refresh, one hash per artifact path, and batched transactions.",
      },
      {
        setting: "Metadata-expensive mount",
        evidence: "WSL 9p magnified redundant scans: 109.34 s full check and 38.90 s index",
        design: "Use this as the stress profile for file-open and traversal-count regressions, not as a reason for a platform-specific code path.",
      },
      {
        setting: "Fast local storage",
        evidence: "ext4 full check was 3.61 s and tmpfs was 3.68 s",
        design: "Use as the overhead floor: reject optimizations whose cache bookkeeping makes the already-fast case slower or more complex without measured benefit.",
      },
      {
        setting: "Low-memory machine",
        evidence: `Observed full-check peak was ${round(summary(ext4, "check-full").maxRssMiB / 1024, 2)} GiB on ext4`,
        design: "Make source snapshots compact and stream derived serialization before adding parallelism; retain RSS and work counters in benchmark receipts.",
      },
      {
        setting: "Many-core CPU or GPU workstation",
        evidence: "One-CPU ext4 timings were effectively unchanged; GPU was unused",
        design: "Do not require accelerators. Only consider a bounded artifact-hash worker pool after deduplication, with one-worker equivalence as the reference path.",
      },
    ],
    methodology: {
      isolation: "All mutations and full maintenance trials ran against byte-matched snapshots; the live MoT store was read-only.",
      timing: "GNU time wall/user/system/RSS receipts around unmodified Promptus commands plus benchmark-only phase probes.",
      repetitions: "Fast operations used 2-5 repetitions and report the median. Expensive end-to-end operations used one repetition, corroborated by the operator's independent measurements and a live read-only doctor run.",
      cacheState: "Snapshots were staged immediately before measurement, so results characterize a warm working session rather than cold-boot storage.",
      equivalence: "Candidate thinker and artifact phases were accepted only after exact output digests/outcome counts matched current behavior.",
    },
    limitations: [
      "The storage comparison uses one WSL2 host and one large project snapshot; it does not yet measure bare-metal Windows, macOS, NFS, SMB, or slower local disks.",
      "Most expensive operations have n=1 because a complete WSL 9p suite is long; the independent operator timings are consistent but not a substitute for more hosts.",
      "The single-pass thinker and unique-path artifact measurements are isolated prototypes, not implemented end-to-end Promptus patches.",
      "The one-CPU control followed two disposable benchmark writes, a 0.04% unit-count difference; use it as a bottleneck classification control, not an exact release benchmark.",
    ],
    rawReceipts,
  };
}

function findMeasurement(aggregate: any, operation: string): any {
  const found = aggregate.measurements.crossHardware.find((row: any) => row.operation === operation);
  if (!found) throw new Error(`aggregate has no ${operation}`);
  return found;
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function sqliteType(values: unknown[]): "INTEGER" | "REAL" | "TEXT" {
  const populated = values.filter((value) => value != null);
  if (populated.length && populated.every((value) => typeof value === "number" && Number.isInteger(value))) return "INTEGER";
  if (populated.length && populated.every((value) => typeof value === "number")) return "REAL";
  if (populated.length && populated.every((value) => typeof value === "boolean")) return "INTEGER";
  return "TEXT";
}

function loadSqliteRows(db: Database, table: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) throw new Error(`cannot load empty report dataset: ${table}`);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const schema = columns.map((column) => {
    const type = sqliteType(rows.map((row) => row[column]));
    return `${quoteIdentifier(column)} ${type}`;
  }).join(", ");
  db.exec(`CREATE TABLE ${quoteIdentifier(table)} (${schema})`);
  const placeholders = columns.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`);
  const insertAll = db.transaction((values: Array<Record<string, unknown>>) => {
    for (const row of values) {
      insert.run(...columns.map((column) => {
        const value = row[column];
        if (typeof value === "boolean") return value ? 1 : 0;
        return value ?? null;
      }));
    }
  });
  insertAll(rows);
}

export function buildReportArtifact(aggregate: any, aggregatePath: string): Record<string, unknown> {
  const selected = [
    "session-doctor",
    "collect-units",
    "hash-store",
    "artifacts-current",
    "index",
    "check-no-index",
    "check-full",
    "kb-add-no-relation",
    "kb-add-relation",
  ].map((operation) => findMeasurement(aggregate, operation));
  const exactTimes = selected.map((row: any) => ({
    operation: row.label,
    operationId: row.operation,
    windows9pSeconds: row.windows9pSeconds,
    ext4Seconds: row.ext4Seconds,
    tmpfsSeconds: row.tmpfsSeconds,
    speedup: row.windows9pToExt4Speedup,
    windows9pRssMiB: row.peakRssMiB.windows9p,
    ext4RssMiB: row.peakRssMiB.ext4,
    repetitionsWindows9p: row.repetitions.windows9p,
    repetitionsExt4: row.repetitions.ext4,
  }));
  const speedups = exactTimes
    .filter((row: any) => row.speedup >= 2)
    .sort((left: any, right: any) => right.speedup - left.speedup)
    .map((row: any, index: number) => ({ ...row, rank: index + 1 }));
  const fullCheck = findMeasurement(aggregate, "check-full");
  const write = findMeasurement(aggregate, "kb-add-no-relation");
  const relationWrite = findMeasurement(aggregate, "kb-add-relation");
  const index = findMeasurement(aggregate, "index");
  const peakRssGiB = round(fullCheck.peakRssMiB.ext4 / 1024, 2);
  const headline = [{
    units: aggregate.frozenCorpus.units,
    sourceFiles: aggregate.frozenCorpus.sourceFiles,
    ledgerUnits: aggregate.frozenCorpus.ledgerUnits,
    artifactRecords: aggregate.frozenCorpus.artifactRecords,
    fullCheckSpeedup: fullCheck.windows9pToExt4Speedup,
    fullCheckWindowsSeconds: fullCheck.windows9pSeconds,
    fullCheckExt4Seconds: fullCheck.ext4Seconds,
    noRelationWriteSpeedup: write.windows9pToExt4Speedup,
    noRelationWriteWindowsSeconds: write.windows9pSeconds,
    noRelationWriteExt4Seconds: write.ext4Seconds,
    relationWriteSpeedup: relationWrite.windows9pToExt4Speedup,
    relationWriteWindowsSeconds: relationWrite.windows9pSeconds,
    relationWriteExt4Seconds: relationWrite.ext4Seconds,
    indexSpeedup: index.windows9pToExt4Speedup,
    indexWindowsSeconds: index.windows9pSeconds,
    indexExt4Seconds: index.ext4Seconds,
    thinkerSpeedupMin: Math.min(...aggregate.diagnostics.thinker.profiles.map((profile: any) => profile.speedup)),
    thinkerSpeedupMax: Math.max(...aggregate.diagnostics.thinker.profiles.map((profile: any) => profile.speedup)),
    artifactSpeedupMin: Math.min(...aggregate.diagnostics.artifacts.profiles.map((profile: any) => profile.speedup)),
    artifactSpeedupMax: Math.max(...aggregate.diagnostics.artifacts.profiles.map((profile: any) => profile.speedup)),
    peakRssGiB,
  }];
  const diagnosis = [
    {
      phase: "Thinker inspection, current",
      seconds: aggregate.diagnostics.thinker.currentInspectSeconds,
      candidate: "current",
      exactEquivalent: "yes",
      bindings: aggregate.diagnostics.thinker.bindings,
    },
    {
      phase: "Thinker binding scan, single pass",
      seconds: aggregate.diagnostics.thinker.singlePassSeconds,
      candidate: "single-pass prototype",
      exactEquivalent: "yes",
      bindings: aggregate.diagnostics.thinker.bindings,
    },
    {
      phase: "Artifact verification, current",
      seconds: aggregate.diagnostics.artifacts.currentSeconds,
      candidate: "current",
      exactEquivalent: "yes",
      artifactRecords: aggregate.diagnostics.artifacts.records,
    },
    {
      phase: "Artifact verification, unique path",
      seconds: aggregate.diagnostics.artifacts.uniquePathSeconds,
      candidate: "unique-path prototype",
      exactEquivalent: "yes",
      artifactRecords: aggregate.diagnostics.artifacts.records,
    },
  ];
  const softwareGains = [
    ...aggregate.diagnostics.thinker.profiles.map((profile: any) => ({
      mechanism: "Single-pass thinker binding",
      mechanismId: "thinker-single-pass",
      filesystem: profile.filesystem,
      currentSeconds: profile.currentSeconds,
      candidateSeconds: profile.candidateSeconds,
      speedup: profile.speedup,
      exactEquivalent: profile.exactEquivalent ? "yes" : "no",
    })),
    ...aggregate.diagnostics.artifacts.profiles.map((profile: any) => ({
      mechanism: "Unique-path artifact hashing",
      mechanismId: "artifact-unique-path",
      filesystem: profile.filesystem,
      currentSeconds: profile.currentSeconds,
      candidateSeconds: profile.candidateSeconds,
      speedup: profile.speedup,
      exactEquivalent: profile.exactEquivalent ? "yes" : "no",
    })),
  ];

  const softwareContract = aggregate.workConservationTargets as Array<Record<string, unknown>>;
  const sql = {
    headline: "SELECT * FROM headline LIMIT 1",
    speedups: "SELECT * FROM speedups ORDER BY speedup DESC",
    diagnosis: "SELECT * FROM diagnosis ORDER BY seconds DESC",
    softwareGains: "SELECT * FROM software_gains ORDER BY mechanism, filesystem",
    exactTimes: "SELECT * FROM exact_times ORDER BY windows9pSeconds DESC",
    softwareContract: "SELECT * FROM software_contract",
  };
  const db = new Database(":memory:");
  loadSqliteRows(db, "headline", headline);
  loadSqliteRows(db, "speedups", speedups);
  loadSqliteRows(db, "diagnosis", diagnosis);
  loadSqliteRows(db, "software_gains", softwareGains);
  loadSqliteRows(db, "exact_times", exactTimes);
  loadSqliteRows(db, "software_contract", softwareContract);
  const reviewed = {
    headline: db.query(sql.headline).all(),
    speedups: db.query(sql.speedups).all(),
    diagnosis: db.query(sql.diagnosis).all(),
    softwareGains: db.query(sql.softwareGains).all(),
    exactTimes: db.query(sql.exactTimes).all(),
    softwareContract: db.query(sql.softwareContract).all(),
  };
  db.close();

  const commonQuery = {
    engine: "bun:sqlite",
    language: "SQL",
    executed_at: aggregate.generatedAt,
    filters: [
      "Same 5,338-unit frozen MoT corpus for WSL 9p, ext4, and tmpfs headline comparisons",
      "Fast operations report medians; expensive end-to-end operations report their single completed trial",
      "No private unit bodies, prompts, labels, or artifact contents are included",
    ],
  };
  const reportSources = [
    {
      id: "headline_sql",
      label: "Headline benchmark metrics",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.headline,
        description: "Reads the reviewed frozen-corpus headline row loaded from the benchmark aggregate.",
        tables_used: ["headline"],
        metric_definitions: [
          "Speedup = WSL 9p median wall seconds / native ext4 median wall seconds",
          "Peak RSS = maximum resident-set size observed by GNU time for the operation",
        ],
      },
    },
    {
      id: "speedups_sql",
      label: "Cross-filesystem speedup rows",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.speedups,
        description: "Returns reviewed operation-level WSL 9p, ext4, and tmpfs timings ordered by 9p-to-ext4 speedup.",
        tables_used: ["speedups"],
        metric_definitions: ["Speedup = WSL 9p median wall seconds / native ext4 median wall seconds"],
      },
    },
    {
      id: "diagnosis_sql",
      label: "Exact-equivalence phase probes",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.diagnosis,
        description: "Returns current and exact-equivalent prototype phase timings on WSL 9p.",
        tables_used: ["diagnosis"],
        metric_definitions: ["Exact equivalence requires the same thinker binding digest or the same complete artifact outcome counts"],
      },
    },
    {
      id: "software_gains_sql",
      label: "Exact-equivalent software gains across storage profiles",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.softwareGains,
        description: "Returns the two exact-equivalent software probes on WSL 9p, ext4, and tmpfs.",
        tables_used: ["software_gains"],
        metric_definitions: ["Speedup = current phase wall seconds / exact-equivalent candidate wall seconds"],
      },
    },
    {
      id: "exact_times_sql",
      label: "Exact cross-hardware timing table",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.exactTimes,
        description: "Returns the reviewed wall-time comparison ordered by WSL 9p cost.",
        tables_used: ["exact_times"],
        metric_definitions: ["Wall seconds are medians where n > 1 and the completed trial where n = 1"],
      },
    },
    {
      id: "software_contract_sql",
      label: "Hardware-agnostic work-conservation contract",
      path: sourcePath(aggregatePath),
      query: {
        ...commonQuery,
        sql: sql.softwareContract,
        description: "Returns the proposed operation-level work limits and exact correctness acceptance criteria.",
        tables_used: ["software_contract"],
        metric_definitions: [],
      },
    },
  ];

  return {
    surface: "report",
    manifest: {
      version: 1,
      surface: "report",
      title: "Promptus maintenance performance at MoT scale",
      description: "A frozen-corpus diagnosis and hardware-agnostic work-conservation plan.",
      generatedAt: aggregate.generatedAt,
      filters: [],
      cards: [
        {
          id: "corpus_card",
          description: "Lifecycle-live Promptus units in the frozen MoT snapshot.",
          dataset: "headline",
          sourceId: "headline_sql",
          metrics: [{ label: "Live units", field: "units", format: "compact" }],
        },
        {
          id: "thinker_gain_card",
          description: "Exact-equivalent single-pass binding gain across all measured storage profiles.",
          dataset: "headline",
          sourceId: "headline_sql",
          metrics: [
            { label: "Thinker minimum gain (×)", field: "thinkerSpeedupMin", format: "number" },
            { label: "Maximum gain (×)", field: "thinkerSpeedupMax", format: "number" },
          ],
        },
        {
          id: "artifact_gain_card",
          description: "Exact-equivalent unique-path hashing gain across all measured storage profiles.",
          dataset: "headline",
          sourceId: "headline_sql",
          metrics: [
            { label: "Artifact minimum gain (×)", field: "artifactSpeedupMin", format: "number" },
            { label: "Maximum gain (×)", field: "artifactSpeedupMax", format: "number" },
          ],
        },
        {
          id: "memory_card",
          description: "Peak resident memory during the native-ext4 full check.",
          dataset: "headline",
          sourceId: "headline_sql",
          metrics: [{ label: "Peak RSS (GiB)", field: "peakRssGiB", format: "number" }],
        },
      ],
      charts: [
        {
          id: "speedup_chart",
          title: "Storage sensitivity of the current pipeline",
          subtitle: "Diagnostic only: larger values mean repeated deterministic work is more expensive on WSL 9p than ext4.",
          type: "horizontalBar",
          dataset: "speedups",
          sourceId: "speedups_sql",
          valueFormat: "number",
          encodings: {
            x: { field: "operation", type: "nominal", label: "Operation" },
            y: { field: "speedup", type: "quantitative", label: "Speedup", unit: "×" },
            tooltip: [
              { field: "windows9pSeconds", type: "quantitative", label: "WSL 9p", unit: "s", format: "number" },
              { field: "ext4Seconds", type: "quantitative", label: "ext4", unit: "s", format: "number" },
              { field: "tmpfsSeconds", type: "quantitative", label: "tmpfs", unit: "s", format: "number" },
            ],
          },
        },
        {
          id: "diagnosis_chart",
          title: "Software optimization speedup across storage profiles",
          subtitle: "Both probes preserved the exact binding digest or complete verifier outcomes on every profile.",
          type: "bar",
          dataset: "software_gains",
          sourceId: "software_gains_sql",
          valueFormat: "number",
          encodings: {
            x: { field: "mechanism", type: "nominal", label: "Software mechanism" },
            y: { field: "speedup", type: "quantitative", label: "Speedup", unit: "×" },
            color: { field: "filesystem", type: "nominal", label: "Storage profile" },
            tooltip: [
              { field: "currentSeconds", type: "quantitative", label: "Current", unit: "s", format: "number" },
              { field: "candidateSeconds", type: "quantitative", label: "Candidate", unit: "s", format: "number" },
              { field: "exactEquivalent", type: "nominal", label: "Exact-equivalence check" },
            ],
          },
        },
      ],
      tables: [
        {
          id: "timing_table",
          title: "Exact wall-time comparison",
          subtitle: "Medians where repeated; one completed trial for expensive end-to-end operations.",
          dataset: "exact_times",
          sourceId: "exact_times_sql",
          defaultSort: { field: "windows9pSeconds", direction: "desc" },
          columns: [
            { field: "operation", label: "Operation", type: "text" },
            { field: "windows9pSeconds", label: "WSL 9p (s)", type: "number", format: "number" },
            { field: "ext4Seconds", label: "ext4 (s)", type: "number", format: "number" },
            { field: "tmpfsSeconds", label: "tmpfs (s)", type: "number", format: "number" },
            { field: "speedup", label: "9p/ext4 (×)", type: "number", format: "number" },
          ],
        },
        {
          id: "software_contract_table",
          title: "Work-conservation and correctness contract",
          subtitle: "The implementation target is less deterministic work on every machine, with no weaker health semantics.",
          dataset: "software_contract",
          sourceId: "software_contract_sql",
          columns: [
            { field: "operation", label: "Operation", type: "text" },
            { field: "currentWaste", label: "Current repeated work", type: "text" },
            { field: "targetWork", label: "Target work", type: "text" },
            { field: "acceptance", label: "Correctness acceptance", type: "text" },
          ],
        },
      ],
      sources: reportSources.map(({ id, label, path }) => ({ id, label, path })),
      blocks: [
        { id: "title", type: "markdown", body: "# Promptus maintenance performance at MoT scale" },
        {
          id: "technical_summary",
          type: "markdown",
          sourceId: "headline_sql",
          body: `## Technical summary\n\nThe storage comparison is a diagnostic amplifier, not the proposed remedy. On the same 5,338-unit corpus, the full gate ranged from **${fullCheck.ext4Seconds} s on ext4 to ${fullCheck.windows9pSeconds} s on WSL 9p**, exposing how much Promptus pays for repeated opens and scans. Two software-only probes helped on **all** measured profiles while preserving exact outputs: single-pass thinker binding improved 3.17×–10.75×, and unique-path artifact hashing improved 1.35×–1.62×. The engineering target is therefore hardware-agnostic: read, parse, hash, and write each necessary object once per maintenance transaction.`,
        },
        { id: "metrics", type: "metric-strip", cardIds: ["corpus_card", "thinker_gain_card", "artifact_gain_card", "memory_card"] },
        {
          id: "key_findings",
          type: "markdown",
          body: `## Key findings\n\n- **Redundant deterministic work is the actionable defect.** The filesystem merely changes its price.\n- **Thinker bookkeeping is the first code hotspot.** One scan of 1,010 findings reproduced all 12 bindings and the exact digest; it was 10.75× faster on 9p and more than 3× faster even on ext4 and tmpfs.\n- **Artifact deduplication is exact and portable.** One hash per unique declared path preserved all 3,700 outcomes and improved every storage profile.\n- **The full pipeline rereads the same truth.** Indexing parses units, full check fingerprints them again, and thinker custody scans findings again. One immutable store snapshot should feed all consumers.\n- **More compute is not the present answer.** A one-CPU control matched the normal ext4 profile, and the GPU is outside this path.`,
        },
        { id: "diagnosis_visual", type: "chart", chartId: "diagnosis_chart" },
        {
          id: "where_time_goes",
          type: "markdown",
          body: "## Where the time goes\n\nThe current thinker inspector walks the findings tree separately for each adjudicated quarantined round. That repeated work closely accounts for an ordinary 29.44 s gated write and most of the 38.90 s index on 9p. The full gate then performs an index and a second broad verification pass. Artifact verification adds a separate path-and-content cost: 3,700 historical checks refer to 2,237 unique paths, causing 1.29× byte amplification before path-level deduplication.",
        },
        { id: "speedup_visual", type: "chart", chartId: "speedup_chart" },
        { id: "timing_detail", type: "table", tableId: "timing_table" },
        {
          id: "scope",
          type: "markdown",
          sourceId: "headline_sql",
          body: "## Scope, data, and metrics\n\nThe primary comparison uses one byte-matched MoT snapshot: 5,338 live units in 2,600 source Markdown files, 2,977 ledger units, and 3,700 artifact records. Wall, user, system, peak RSS, page-fault, filesystem-I/O, and context-switch receipts were captured with GNU time. Headline comparisons use wall seconds; memory guidance uses peak RSS. The live project was read-only.",
        },
        {
          id: "methodology",
          type: "markdown",
          body: "## Methodology\n\nThe harness first stages `.promptus` plus declared artifact dependencies, then verifies that source Markdown hashes and file counts match. All mutating write/index/check trials run only in the snapshot. Fast operations use two to five repetitions and report medians; expensive end-to-end operations use one completed trial. Candidate optimizations are counted only when their binding digest or complete verifier-outcome vector exactly matches current behavior.",
        },
        {
          id: "limitations",
          type: "markdown",
          body: "## Limitations and robustness\n\nThe benchmark covers one WSL2 machine and one large corpus. Staging warms the working set, so these are active-session rather than cold-boot timings. Expensive 9p operations have one formal trial, although they agree with the operator's independent ~40 s write, ~38 s index, and ~102 s full-gate measurements. The one-CPU control contains two benchmark-only events. NFS, SMB, bare-metal Windows, macOS, low-RAM systems, and slower local disks still require direct validation.",
        },
        {
          id: "engineering_design",
          type: "markdown",
          body: "## Engineering design\n\nBuild a work-conserving maintenance core with no platform branches. A single immutable `StoreSnapshot` should read each authoritative source once and simultaneously produce its digest, parsed units, relation resolver, graph inputs, search inputs, artifact ownership, and thinker binding map. Index and full check then consume that same snapshot rather than walking the store again. Governed writes should declare their dependency delta, so an unrelated ledger event never refreshes thinker surfaces. Artifact contents are hashed once per canonical path, batches share one lock and resolver, and derived files are replaced only when bytes change. A touched-files receipt is useful only when explicitly PARTIAL; the durable full gate remains exact.",
        },
        { id: "software_contract", type: "table", tableId: "software_contract_table" },
        {
          id: "next_steps",
          type: "markdown",
          body: "## Recommended next steps\n\n1. Add work counters—source reads/parses, finding walks, artifact hashes/bytes, and derived rewrites—to the benchmark receipt.\n2. Implement the single-pass thinker context, dependency-aware refresh, and unchanged-output suppression with multi-round equivalence regressions.\n3. Introduce the immutable `StoreSnapshot` API and make index plus full check reuse it.\n4. Deduplicate authoritative artifact hashes by canonical real path.\n5. Add transactional batch writes, rerun all three storage profiles, and develop persistent incremental indexing only if this simpler pipeline still misses the agreed latency budget.",
        },
        {
          id: "further_questions",
          type: "markdown",
          body: "## Further questions\n\n- What inner-loop latency budget should Promptus guarantee on native storage and on metadata-expensive mounts?\n- Can Psi and Probatio reproduce the same thinker/artifact proportions?\n- Which units are legitimately lifecycle-cold, and can their stable derived index be reused without automatic age-based archival?\n- Does a touched-files checkpoint provide enough assurance for ordinary batches while the full ratchet remains reserved for durable boundaries?",
        },
      ],
    },
    snapshot: {
      version: 1,
      generatedAt: aggregate.generatedAt,
      status: "ready",
      datasets: {
        headline: reviewed.headline,
        exact_times: reviewed.exactTimes,
        speedups: reviewed.speedups,
        diagnosis: reviewed.diagnosis,
        software_gains: reviewed.softwareGains,
        software_contract: reviewed.softwareContract,
      },
      accessIssues: [],
    },
    sources: reportSources,
  };
}

function main(): void {
  const aggregatePath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_AGGREGATE;
  const artifactPath = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_ARTIFACT;
  const aggregate = buildMaintenanceAggregate();
  const artifact = buildReportArtifact(aggregate, aggregatePath);
  mkdirSync(dirname(aggregatePath), { recursive: true });
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: "promptus.maintenance-report-build.v1",
    aggregate: sourcePath(aggregatePath),
    aggregateSha256: sha256(aggregatePath),
    artifact: sourcePath(artifactPath),
    artifactSha256: sha256(artifactPath),
  }, null, 2));
}

if (import.meta.main) main();
