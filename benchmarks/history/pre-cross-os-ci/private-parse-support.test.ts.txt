import { test, expect, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { stageBudgetedRuntime, privateParent, publicStats, publicCommand, boundedCommand } from "./private-parse-support.ts";
import { createFixture } from "./publication-fixture.ts";
import { controlPath } from "./publication-fence.ts";

const parent = mkdtempSync(join(tmpdir(), "organon-private-parse-test-"));
afterAll(() => rmSync(parent, { recursive: true }));
test("private parent rejects repository and frozen capture roots", () => {
  expect(() => privateParent(join(import.meta.dir, ".."))).toThrow();
  expect(() => privateParent(tmpdir())).toThrow(); expect(privateParent(parent)).toBe(parent);
});
test("zero cache budget stops before cache replacement and before CLEAN publication", () => {
  const runtime = stageBudgetedRuntime(parent, 0), root = createFixture(parent, runtime);
  const result = spawnSync(process.execPath, [runtime.cli, root, "fenced", "index"], { encoding: "utf8" });
  expect(result.status).not.toBe(0); expect(result.stderr).toContain("private-trial-cache-budget");
  expect(existsSync(join(root, ".promptus/cache/raw-parses.json.gz"))).toBe(false);
  expect(JSON.parse(readFileSync(controlPath(root), "utf8")).phase).not.toBe("CLEAN");
});
test("telemetry allowlist never copies private paths, reasons, text or extra fields", () => {
  const secret = "PRIVATE_SOURCE_TITLE_PATH";
  const stats = publicStats(`PARSE_REUSE ${JSON.stringify({ filesParsed: 2, reason: secret, root: secret, text: secret, arbitrary: secret })}`);
  expect(stats).toEqual([{ filesParsed: 2, knownDirtyReuse: false }]);
  expect(JSON.stringify(publicCommand({ ms: 1, code: 1, killed: null, stdout: secret, stderr: secret, sampledTreeRssKiB: 4, maxProcessRssKiB: 5 }))).not.toContain(secret);
});
test("subprocess timeout kills its process group and keeps raw diagnostics private", async () => {
  const log = join(parent, "timeout.json");
  const result = await boundedCommand([process.execPath, "-e", 'console.log("private timeout probe"); setInterval(() => {}, 1000);'], log, { timeoutMs: 150 });
  expect(result.killed).toBe("command-timeout"); expect(result.ms).toBeLessThan(3000);
  expect(readFileSync(log, "utf8")).toContain("private timeout probe");
  expect(JSON.stringify(publicCommand(result))).not.toContain("private timeout probe");
});
