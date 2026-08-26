import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArtifact, checkArtifacts, hashArtifactFile } from "../lib/artifacts.ts";

const tmps: string[] = [];

afterAll(() => {
  for (const path of tmps) {
    try { rmSync(path, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-artifacts-"));
  tmps.push(root);
  return root;
}

test("streaming SHA-256 is exact across deliberately small buffers", () => {
  const root = fixture();
  const path = join(root, "evidence.bin");
  const bytes = Buffer.from("bounded memory must preserve every byte\0across chunk boundaries");
  writeFileSync(path, bytes);
  expect(hashArtifactFile(path, 7)).toBe(createHash("sha256").update(bytes).digest("hex"));
});

test("grouped verification preserves owner order and per-spec outcomes across canonical aliases", () => {
  const root = fixture();
  const bytes = Buffer.from("one artifact, several owners\n");
  const expected = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(root, "evidence.txt"), bytes);
  symlinkSync(join(root, "evidence.txt"), join(root, "alias.txt"));

  const checks = checkArtifacts(root, [
    { role: "proof", path: "evidence.txt", sha256: expected },
    { role: "receipt", path: "alias.txt", sha256: expected },
    { role: "historical", path: "evidence.txt", sha256: "0".repeat(64) },
    { role: "existence", path: "alias.txt" },
  ]);
  expect(checks.map((check) => check.role)).toEqual(["proof", "receipt", "historical", "existence"]);
  expect(checks.map((check) => check.outcome)).toEqual(["ok", "ok", "hash-mismatch", "ok"]);
  expect(checks[0].actualSha256).toBe(expected);
  expect(checks[1].actualSha256).toBe(expected);
  expect(checks[3].actualSha256).toBeUndefined();
  expect(checkArtifact(root, { role: "proof", path: "evidence.txt", sha256: expected })).toEqual(checks[0]);
});
