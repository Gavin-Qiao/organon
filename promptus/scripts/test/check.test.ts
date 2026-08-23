/**
 * check.test.ts — the whole-store health contract.
 */
import { afterAll, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PROMPTUS = join(import.meta.dir, "..", "..");
const CHECK = join(PROMPTUS, "scripts", "promptus-check.ts");
const VOCAB = join(PROMPTUS, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];

afterAll(() => {
  for (const path of tmps) {
    try { rmSync(path, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-check-"));
  tmps.push(root);
  mkdirSync(join(root, ".promptus", "schema"), { recursive: true });
  mkdirSync(join(root, ".promptus", "ledger"), { recursive: true });
  mkdirSync(join(root, ".promptus", "docs"), { recursive: true });
  copyFileSync(VOCAB, join(root, ".promptus", "schema", "kb-vocab.json"));
  writeFileSync(join(root, ".promptus", "TELOS.md"), "# Telos\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "# Ledger\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(root, ".promptus", "docs", "alpha.md"), [
    "---", "id: finding-alpha", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "links: [beta]", "---",
    "# Alpha", "", "See [[beta]].", "",
  ].join("\n"));
  writeFileSync(join(root, ".promptus", "docs", "beta.md"), [
    "---", "id: finding-beta", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "links: [alpha]", "---",
    "# Beta", "", "See [[alpha]].", "",
  ].join("\n"));
  return root;
}

function run(root: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [CHECK, "--root", root, ...args], { encoding: "utf8" });
  return { status: result.status ?? -1, out: String(result.stdout || "") + String(result.stderr || "") };
}

test("a classified, linked store passes strict health and writes a derived receipt", () => {
  const root = scaffold();
  const result = run(root, ["--strict"]);
  expect(result.status).toBe(0);
  expect(result.out).toContain("duplicate ids: 0");
  expect(result.out).toContain("unclassified units: 0");
  expect(existsSync(join(root, ".promptus", "cache", "health.json"))).toBe(true);
});

test("strict health rejects an unclassified unit", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "legacy.md"), "# Legacy note\n");
  const result = run(root, ["--strict"]);
  expect(result.status).toBe(1);
  expect(result.out).toContain("unclassified units: 1");
  expect(result.out).toContain("legacy.md");
});

test("duplicate ids and unresolved relation targets are hard failures", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "duplicate.md"), [
    "---", "id: finding-alpha", "substrate: finding", "kind: CLAIM", "status: VALIDATED",
    "relations: [supports:missing-target]", "---", "# Duplicate", "",
  ].join("\n"));
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.out).toContain("duplicate ids: 1");
  expect(result.out).toContain("unresolved relation targets: 1");
});

test("--no-index detects source drift against the last health receipt", () => {
  const root = scaffold();
  expect(run(root, ["--strict"]).status).toBe(0);
  writeFileSync(join(root, ".promptus", "docs", "alpha.md"), readFileSync(join(root, ".promptus", "docs", "alpha.md"), "utf8") + "\nchanged\n");
  const result = run(root, ["--no-index", "--strict"]);
  expect(result.status).toBe(1);
  expect(result.out).toContain("FAIL source/index freshness");
});

test("ratchet accepts inherited dangling and orphan debt and fails only newly introduced debt", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "alpha.md"), [
    "---", "id: finding-alpha", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "links: [missing-old]", "---",
    "# Alpha", "", "See [[missing-old]].", "",
  ].join("\n"));
  writeFileSync(join(root, ".promptus", "docs", "orphan-old.md"), [
    "---", "id: finding-orphan-old", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "---",
    "# Orphan old", "",
  ].join("\n"));
  expect(run(root, ["--record-baseline"]).status).toBe(0);
  expect(run(root, ["--ratchet"]).status).toBe(0);
  writeFileSync(join(root, ".promptus", "docs", "gamma.md"), [
    "---", "id: finding-gamma", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "links: [missing-new]", "---",
    "# Gamma", "", "See [[missing-new]].", "",
  ].join("\n"));
  writeFileSync(join(root, ".promptus", "docs", "orphan-new.md"), [
    "---", "id: finding-orphan-new", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "---",
    "# Orphan new", "",
  ].join("\n"));
  const result = run(root, ["--ratchet"]);
  expect(result.status).toBe(1);
  expect(result.out).toContain("new dangling");
  expect(result.out).toContain("missing-new");
  expect(result.out).toContain("new orphans");
  expect(result.out).toContain("orphan-new");
});

test("graph debt is visible without blocking the normal strict profile", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "alpha.md"), [
    "---", "id: finding-alpha", "substrate: finding", "kind: CLAIM", "status: VALIDATED", "links: [missing-concept]", "---",
    "# Alpha", "", "See [[missing-concept]].", "",
  ].join("\n"));
  expect(run(root, ["--strict"]).status).toBe(0);
  const graphStrict = run(root, ["--strict", "--strict-graph"]);
  expect(graphStrict.status).toBe(1);
  expect(graphStrict.out).toContain("dangling links: 1");
});
