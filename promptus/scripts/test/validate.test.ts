/**
 * validate.test.ts — the marketplace-aware validator's contract. Each test
 * scaffolds a throwaway marketplace repo (root marketplace.json + plugin dirs),
 * runs the real validate-plugin.ts through the bun binary with --root, and
 * asserts on the exit code + findings. The last test validates the actual repo,
 * so the tree the tests ship in can never drift out of its own gate.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..", "..");
const SCRIPT = join(REPO, "promptus", "scripts", "validate-plugin.ts");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function run(root?: string) {
  const args = root ? [SCRIPT, "--root", root] : [SCRIPT];
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** A minimal valid marketplace repo: root manifest + one plugin per entry. */
function scaffold(plugins: Array<{ name: string; source: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "organon-validate-test-"));
  tmps.push(root);
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "test-mkt", owner: { name: "t" }, plugins }, null, 2),
  );
  return root;
}

function plugin(root: string, dir: string, manifest: Record<string, unknown>): string {
  const p = join(root, dir);
  mkdirSync(join(p, ".claude-plugin"), { recursive: true });
  writeFileSync(join(p, ".claude-plugin", "plugin.json"), JSON.stringify(manifest, null, 2));
  return p;
}

const MANIFEST = { name: "alpha", version: "1.0.0", description: "a test plugin" };

test("a valid two-plugin marketplace passes", () => {
  const root = scaffold([
    { name: "alpha", source: "./alpha" },
    { name: "beta", source: "./beta" },
  ]);
  const a = plugin(root, "alpha", MANIFEST);
  plugin(root, "beta", { ...MANIFEST, name: "beta" });
  // Give alpha real components so the frontmatter checks run.
  mkdirSync(join(a, "skills", "greet"), { recursive: true });
  writeFileSync(join(a, "skills", "greet", "SKILL.md"), "---\nname: greet\ndescription: says hi\n---\n# greet\n");
  mkdirSync(join(a, "commands"), { recursive: true });
  writeFileSync(join(a, "commands", "hello.md"), "---\ndescription: hello command\n---\n# hello\n");
  const r = run(root);
  expect(r.status).toBe(0);
  expect(r.out).toContain("All marketplace + plugin checks passed.");
  expect(r.out).toContain("alpha/skills/greet/SKILL.md");
});

test("a marketplace source that does not resolve fails", () => {
  const root = scaffold([{ name: "ghost", source: "./ghost" }]);
  const r = run(root);
  expect(r.status).toBe(1);
  expect(r.out).toContain('source "./ghost" does not resolve');
});

test("a non-semver plugin version fails", () => {
  const root = scaffold([{ name: "alpha", source: "./alpha" }]);
  plugin(root, "alpha", { ...MANIFEST, version: "1.0" });
  const r = run(root);
  expect(r.status).toBe(1);
  expect(r.out).toContain('version "1.0" is not semver');
});

test("a skill directory without a SKILL.md fails", () => {
  const root = scaffold([{ name: "alpha", source: "./alpha" }]);
  const a = plugin(root, "alpha", MANIFEST);
  mkdirSync(join(a, "skills", "empty"), { recursive: true });
  const r = run(root);
  expect(r.status).toBe(1);
  expect(r.out).toContain("alpha/skills/empty/ has no SKILL.md");
});

test("a marketplace manifest without a name fails", () => {
  const root = mkdtempSync(join(tmpdir(), "organon-validate-test-"));
  tmps.push(root);
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ owner: { name: "t" }, plugins: [] }, null, 2),
  );
  const r = run(root);
  expect(r.status).toBe(1);
  expect(r.out).toContain('marketplace.json missing "name"');
  expect(r.out).toContain("marketplace.json has no plugins[]");
});

test("hooks.json referencing a missing script fails", () => {
  const root = scaffold([{ name: "alpha", source: "./alpha" }]);
  const a = plugin(root, "alpha", MANIFEST);
  mkdirSync(join(a, "hooks"), { recursive: true });
  writeFileSync(
    join(a, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'bun "${CLAUDE_PLUGIN_ROOT}/hooks/gone.ts"' }] }] } }, null, 2),
  );
  const r = run(root);
  expect(r.status).toBe(1);
  expect(r.out).toContain("references missing hooks/gone.ts");
});

test("the real Organon repo validates (no --root: the script's own tree)", () => {
  const r = run();
  expect(r.status).toBe(0);
  expect(r.out).toContain("marketplace.json (organon: 2 plugin(s))");
  expect(r.out).toContain("promptus/.claude-plugin/plugin.json (promptus v");
  expect(r.out).toContain("editio/.claude-plugin/plugin.json (editio v");
});
