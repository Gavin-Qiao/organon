import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTimeReceipt, sha256FileStreaming, summarizeTrials, type Trial } from "./promptus-maintenance.ts";
import { buildMaintenanceAggregate, buildReportArtifact } from "./promptus-maintenance-report.ts";

function trial(seconds: number): Trial {
  return {
    profile: "test",
    filesystem: "tmpfs",
    operation: "index",
    iteration: 1,
    elapsedSeconds: seconds,
    userSeconds: seconds / 2,
    systemSeconds: seconds / 4,
    maxRssKiB: 1024,
    majorFaults: 0,
    minorFaults: 1,
    fsInputs: 0,
    fsOutputs: 0,
    voluntaryContextSwitches: 0,
    involuntaryContextSwitches: 0,
    exitStatus: 0,
    stdoutBytes: 0,
    stdoutSha256: "0".repeat(64),
  };
}

describe("promptus maintenance benchmark", () => {
  test("streaming artifact hashing is byte-exact across small read buffers", () => {
    const root = mkdtempSync(join(tmpdir(), "promptus-stream-hash-"));
    try {
      const path = join(root, "artifact.bin");
      const bytes = Buffer.from("bounded-memory hashing must preserve every byte\0across chunks");
      writeFileSync(path, bytes);
      expect(sha256FileStreaming(path, 7)).toBe(createHash("sha256").update(bytes).digest("hex"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("parses GNU time receipts", () => {
    const parsed = parseTimeReceipt("noise\n__PROMPTUS_TIME__ elapsed=1.25 user=0.5 system=0.25 rss=2048 major=1 minor=2 inputs=3 outputs=4 voluntary=5 involuntary=6 exit=0\n");
    expect(parsed).toEqual({
      elapsedSeconds: 1.25,
      userSeconds: 0.5,
      systemSeconds: 0.25,
      maxRssKiB: 2048,
      majorFaults: 1,
      minorFaults: 2,
      fsInputs: 3,
      fsOutputs: 4,
      voluntaryContextSwitches: 5,
      involuntaryContextSwitches: 6,
      exitStatus: 0,
    });
  });

  test("summarizes repeated wall times without dropping extrema", () => {
    const summary = summarizeTrials([trial(3), trial(1), trial(2)])[0];
    expect(summary.operation).toBe("index");
    expect(summary.n).toBe(3);
    expect(summary.medianSeconds).toBe(2);
    expect(summary.minSeconds).toBe(1);
    expect(summary.maxSeconds).toBe(3);
    expect(summary.maxRssMiB).toBe(1);
  });

  test("accepts software probes only when every hardware profile is exact-equivalent", () => {
    const aggregate: any = buildMaintenanceAggregate();
    expect(aggregate.frozenCorpus.units).toBe(5338);
    expect(aggregate.diagnostics.thinker.profiles.map((value: any) => value.filesystem)).toEqual(["wsl-9p", "ext4", "tmpfs"]);
    expect(aggregate.diagnostics.thinker.profiles.every((value: any) => value.exactEquivalent)).toBeTrue();
    expect(aggregate.diagnostics.artifacts.profiles.every((value: any) => value.exactEquivalent)).toBeTrue();
    expect(aggregate.diagnostics.thinker.profiles.map((value: any) => value.speedup)).toEqual([10.75, 3.33, 3.17]);
    expect(aggregate.diagnostics.artifacts.profiles.map((value: any) => value.speedup)).toEqual([1.62, 1.35, 1.53]);
  });

  test("builds a ready report from actually executed SQL-backed datasets", () => {
    const aggregate: any = buildMaintenanceAggregate();
    const artifact: any = buildReportArtifact(aggregate, "benchmarks/results/maintenance-cross-hardware-v1-2026-08-25.json");
    expect(artifact.snapshot.status).toBe("ready");
    expect(artifact.snapshot.datasets.software_gains).toHaveLength(6);
    const sources = new Map(artifact.sources.map((source: any) => [source.id, source]));
    for (const item of [...artifact.manifest.cards, ...artifact.manifest.charts, ...artifact.manifest.tables]) {
      expect(sources.has(item.sourceId)).toBeTrue();
      expect(sources.get(item.sourceId).query.sql).toMatch(/^SELECT\b/);
    }
  });
});
