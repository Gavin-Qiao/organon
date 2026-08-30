import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTINUITY_RESPONSES_SCHEMA,
  assertDisposableWorkspace,
  loadContinuitySuite,
  runContinuityBenchmark,
  scoreReplayResponses,
  type ReplayResponses,
} from "./promptus-continuity.ts";

const temporary: string[] = [];
afterAll(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

test("synthetic continuity suite passes in a removed temporary fixture", () => {
  const suite = loadContinuitySuite();
  const report = runContinuityBenchmark(suite) as any;
  expect(report.suite.classification).toBe("synthetic");
  expect(report.isolation.acceptsProjectRoot).toBe(false);
  expect(report.isolation.liveProjectRootsRead).toEqual([]);
  expect(report.isolation.liveProjectRootsWritten).toEqual([]);
  expect(report.isolation.workspaceRoot).toBeNull();
  expect(report.isolation.workspaceRemoved).toBe(true);
  expect(report.fixture.strictGatePassed).toBe(true);
  expect(report.fixture.sessionReady).toBe(true);
  expect(report.deterministic.passed).toBe(report.deterministic.total);
  expect(report.deterministic.total).toBe(8);
  expect(report.agentReplay.status).toBe("not-run");
  expect(report.packets).toHaveLength(7);
});

test("replay scoring requires both the right choice and the required evidence", () => {
  const suite = loadContinuitySuite();
  const responses: ReplayResponses = {
    schema: CONTINUITY_RESPONSES_SCHEMA,
    responses: suite.cases.filter((item) => item.expectedAnswer).map((item) => ({
      caseId: item.id,
      answer: item.expectedAnswer!,
      evidence: item.expectedEvidence ?? [],
      abstained: item.expectedAnswer === "ABSTAIN",
    })),
  };
  const perfect = scoreReplayResponses(suite, responses) as any;
  expect(perfect.metrics.answerAccuracy).toBe(1);
  expect(perfect.metrics.evidenceCompleteness).toBe(1);
  expect(perfect.metrics.traceableAccuracy).toBe(1);

  responses.responses.find((item) => item.caseId === "action-grounding")!.evidence = [];
  const unsupported = scoreReplayResponses(suite, responses) as any;
  expect(unsupported.metrics.answerAccuracy).toBe(1);
  expect(unsupported.metrics.traceableAccuracy).toBeLessThan(1);
});

test("CLI rejects project-root input without changing the named store", () => {
  const decoy = mkdtempSync(join(tmpdir(), "promptus-live-decoy-"));
  temporary.push(decoy);
  mkdirSync(join(decoy, ".promptus"), { recursive: true });
  const sentinel = join(decoy, ".promptus", "DO-NOT-TOUCH.txt");
  writeFileSync(sentinel, "live bytes must remain exact\n");
  const before = readFileSync(sentinel);
  const result = spawnSync(process.execPath, [join(import.meta.dir, "promptus-continuity.ts"), "--root", decoy], {
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--root is not supported");
  expect(readFileSync(sentinel)).toEqual(before);
});

test("CLI refuses report output inside a Promptus store", () => {
  const decoy = mkdtempSync(join(tmpdir(), "promptus-output-decoy-"));
  temporary.push(decoy);
  mkdirSync(join(decoy, ".promptus"), { recursive: true });
  const sentinel = join(decoy, ".promptus", "DO-NOT-TOUCH.txt");
  writeFileSync(sentinel, "output guard bytes\n");
  const before = readFileSync(sentinel);
  const result = spawnSync(process.execPath, [
    join(import.meta.dir, "promptus-continuity.ts"),
    "--output", join(decoy, ".promptus", "report.json"),
  ], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("cannot be written into a .promptus store");
  expect(readFileSync(sentinel)).toEqual(before);
});

test("CLI refuses report output through a symlink into a Promptus store", () => {
  const decoy = mkdtempSync(join(tmpdir(), "promptus-output-symlink-decoy-"));
  temporary.push(decoy);
  const store = join(decoy, ".promptus");
  mkdirSync(store, { recursive: true });
  const sentinel = join(store, "DO-NOT-TOUCH.txt");
  writeFileSync(sentinel, "symlink guard bytes\n");
  const before = readFileSync(sentinel);
  const alias = join(decoy, "output-alias");
  symlinkSync(store, alias, process.platform === "win32" ? "junction" : "dir");
  const report = join(alias, "report.json");
  const result = spawnSync(process.execPath, [
    join(import.meta.dir, "promptus-continuity.ts"),
    "--output", report,
  ], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("cannot be written into a .promptus store");
  expect(existsSync(join(store, "report.json"))).toBe(false);
  expect(readFileSync(sentinel)).toEqual(before);
});

test("workspace guard rejects an unmarked temporary directory", () => {
  const unmarked = mkdtempSync(join(tmpdir(), "promptus-unmarked-"));
  temporary.push(unmarked);
  expect(() => assertDisposableWorkspace(unmarked, "0".repeat(64))).toThrow("marker is missing");
});
