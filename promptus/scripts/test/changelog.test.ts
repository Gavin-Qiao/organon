/**
 * changelog.test.ts — the release-note gate's contract, including the optional
 * per-plugin changelog path the monorepo release flow passes (e.g.
 * `changelog.ts check 0.1.0 editio/CHANGELOG.md`). Runs the real script through
 * the bun binary against fixture changelogs; the last test reads the actual
 * promptus CHANGELOG so the default (script-relative) path stays honest.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..", "..");
const SCRIPT = join(REPO, "promptus", "scripts", "changelog.ts");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function run(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "organon-changelog-test-"));
  tmps.push(dir);
  const p = join(dir, "CHANGELOG.md");
  writeFileSync(p, content);
  return p;
}

const SAMPLE = `# Changelog — sample

## [Unreleased]

## [1.2.3] - 2026-07-02

### Added

- a real entry

## [1.2.2] - 2026-07-01

### Fixed

- an older entry

[1.2.3]: https://example.test/compare/x-v1.2.2...x-v1.2.3
`;

test("extract prints one version's section body from an explicit changelog path", () => {
  const p = fixture(SAMPLE);
  const r = run(["extract", "1.2.3", p]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("- a real entry");
  expect(r.stdout).not.toContain("an older entry");
  expect(r.stdout).not.toContain("[Unreleased]");
});

test("check accepts a leading v on the version (tags are <plugin>-vX.Y.Z)", () => {
  const p = fixture(SAMPLE);
  expect(run(["check", "v1.2.3", p]).status).toBe(0);
});

test("a missing section fails the gate and names the file", () => {
  const p = fixture(SAMPLE);
  const r = run(["check", "9.9.9", p]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('no "## [9.9.9]" section');
  expect(r.stderr).toContain(p);
});

test("an empty section fails the gate", () => {
  const p = fixture(`# Changelog\n\n## [2.0.0] - 2026-07-02\n\n## [1.0.0] - 2026-01-01\n\n- old\n`);
  const r = run(["check", "2.0.0", p]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('section "## [2.0.0]" is empty');
});

test("without a path argument it reads this plugin's own CHANGELOG.md", () => {
  // 0.5.2 is shipped history in promptus/CHANGELOG.md — a stable anchor.
  const r = run(["check", "0.5.2"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("[0.5.2] is present and non-empty");
});
