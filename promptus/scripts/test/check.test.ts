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

test("superseded artifact drift warns while current artifact drift remains a hard failure", () => {
  const root = scaffold();
  const badHash = "0".repeat(64);
  writeFileSync(join(root, "historical-evidence.txt"), "historical bytes\n");
  writeFileSync(join(root, ".promptus", "docs", "historical.md"), [
    "---", "id: finding-historical", "substrate: finding", "kind: RESULT", "status: VALIDATED",
    `artifacts: [evidence|historical-evidence.txt|${badHash}]`, "---", "# Historical evidence", "",
  ].join("\n"));
  writeFileSync(join(root, ".promptus", "docs", "replacement.md"), [
    "---", "id: finding-replacement", "substrate: finding", "kind: RESULT", "status: VALIDATED",
    "relations: [supersedes:finding-historical]", "---", "# Replacement evidence", "",
  ].join("\n"));

  const archival = run(root);
  expect(archival.status).toBe(0);
  expect(archival.out).toContain("WARN archival artifact drift: 1");
  let health = JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8"));
  expect(health.artifactFailures).toHaveLength(0);
  expect(health.archivalArtifactWarnings).toHaveLength(1);
  expect(health.healthy).toBe(true);

  writeFileSync(join(root, "current-evidence.txt"), "current bytes\n");
  writeFileSync(join(root, ".promptus", "docs", "current.md"), [
    "---", "id: finding-current", "substrate: finding", "kind: RESULT", "status: VALIDATED",
    `artifacts: [evidence|current-evidence.txt|${badHash}]`, "---", "# Current evidence", "",
  ].join("\n"));
  const current = run(root);
  expect(current.status).toBe(1);
  expect(current.out).toContain("FAIL current artifact dependencies");
  health = JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8"));
  expect(health.artifactFailures).toHaveLength(1);
  expect(health.archivalArtifactWarnings).toHaveLength(1);
  expect(health.healthy).toBe(false);
});

test("retired memory artifact drift warns while active memory drift remains a hard failure", () => {
  const root = scaffold();
  const badHash = "0".repeat(64);
  mkdirSync(join(root, ".promptus", "memory"), { recursive: true });
  writeFileSync(join(root, "memory-evidence.txt"), "changed memory evidence\n");
  writeFileSync(join(root, ".promptus", "memory", "retired-evidence.md"), [
    "---", "id: memory-retired-evidence", "name: retired-evidence", "type: project", "status: validated",
    `artifacts: [evidence|memory-evidence.txt|${badHash}]`, "---", "# Retired evidence", "",
  ].join("\n"));
  writeFileSync(join(root, ".promptus", "memory", "replacement-evidence.md"), [
    "---", "id: memory-replacement-evidence", "name: replacement-evidence", "type: project", "status: validated",
    "relations: [supersedes:memory-retired-evidence]", "---", "# Replacement evidence", "",
  ].join("\n"));

  const archival = run(root);
  expect(archival.status).toBe(0);
  expect(archival.out).toContain("WARN archival artifact drift: 1");
  let health = JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8"));
  expect(health.artifactFailures).toHaveLength(0);
  expect(health.archivalArtifactWarnings).toHaveLength(1);
  expect(health.archivalArtifactWarnings[0].status).toBe("retired");
  expect(health.healthy).toBe(true);

  writeFileSync(join(root, ".promptus", "memory", "active-evidence.md"), [
    "---", "id: memory-active-evidence", "name: active-evidence", "type: project", "status: validated",
    `artifacts: [evidence|memory-evidence.txt|${badHash}]`, "---", "# Active evidence", "",
  ].join("\n"));
  const active = run(root);
  expect(active.status).toBe(1);
  expect(active.out).toContain("FAIL current artifact dependencies");
  health = JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8"));
  expect(health.artifactFailures).toHaveLength(1);
  expect(health.artifactFailures[0].status).toBe("validated");
  expect(health.archivalArtifactWarnings).toHaveLength(1);
  expect(health.healthy).toBe(false);
});
