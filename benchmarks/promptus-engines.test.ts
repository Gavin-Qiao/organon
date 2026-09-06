import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inside, isActive, main, summary } from "./promptus-engines.ts";

test("engine trial filters epistemically inactive units before candidate generation", () => {
  for (const status of ["SUPERSEDED", "refuted", " RETIRED ", "UNTRUSTED", "↩SUPERSEDED"]) expect(isActive(status)).toBe(false);
  for (const status of ["VALIDATED", "CITE", "OPEN", "CONJECTURED", "CONFOUNDED"]) expect(isActive(status)).toBe(true);
});

test("trial output confinement resolves symlinks and sibling prefixes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "organon-engine-guard-"));
  try {
    const allowed = join(scratch, "allowed");
    const other = join(scratch, "allowed-other");
    mkdirSync(allowed); mkdirSync(other);
    symlinkSync(other, join(allowed, "escape"));
    expect(inside(allowed, allowed)).toBe(true);
    expect(inside(other, allowed)).toBe(false);
    expect(inside(join(allowed, "escape"), allowed)).toBe(false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("engine comparison refuses live-project root overrides before reading dependencies", async () => {
  await expect(main(["--root", "/operator/live/project"])).rejects.toThrow("invalid argument");
});

test("latency receipt keeps a slow query visible in p95", () => {
  expect(summary([1, 2, 3, 4, 100])).toEqual({ count: 5, minMs: 1, medianMs: 3, p95Ms: 100 });
});
