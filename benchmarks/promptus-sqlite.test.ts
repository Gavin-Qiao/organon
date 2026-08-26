import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyKnownDelta,
  buildShadowDatabase,
  collectProjectedUnits,
  compareQueries,
  databaseLogicalDigest,
  logicalUnitDigest,
  unitKey,
} from "./promptus-sqlite.ts";

const REPO = join(import.meta.dir, "..");
const SCRIPTS = join(REPO, "promptus", "scripts");
const VOCAB = join(REPO, "promptus", "templates", "schema", "kb-vocab.json");
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-sqlite-test-"));
  roots.push(root);
  const promptus = join(root, ".promptus");
  mkdirSync(join(promptus, "ledger"), { recursive: true });
  mkdirSync(join(promptus, "docs", "lit"), { recursive: true });
  mkdirSync(join(promptus, "memory"), { recursive: true });
  mkdirSync(join(promptus, "schema"), { recursive: true });
  writeFileSync(join(promptus, "TELOS.md"), "# Telos — SQLite fixture\n");
  writeFileSync(join(promptus, "ledger", "RESEARCH-LEDGER.md"), "# Research Ledger — SQLite fixture\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(promptus, "memory", "MEMORY.md"), "# Memory — SQLite fixture\n\n<!-- kb:append-point -->\n");
  copyFileSync(VOCAB, join(promptus, "schema", "kb-vocab.json"));
  return root;
}

function run(script: string, args: string[], stdin = "") {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    input: stdin,
    encoding: "utf8",
  });
}

function add(root: string, title: string): string {
  const result = run("kb-add.ts", [
    "--root", root,
    "--substrate", "ledger",
    "--kind", "RESULT",
    "--status", "VALIDATED",
    "--title", title,
    "--json",
  ], `Evidence for ${title}.`);
  expect(result.status).toBe(0);
  return (JSON.parse(result.stdout) as { id: string }).id;
}

function index(root: string): void {
  const result = run("kb-index.ts", ["--root", root, "--quiet"]);
  expect(result.status).toBe(0);
}

test("the SQLite shadow rebuilds exactly and a writer-known ledger delta updates its predecessor", () => {
  const root = scaffold();
  const firstId = add(root, "First exact SQLite unit");
  index(root);
  const baseUnits = collectProjectedUnits(root);
  const baseDb = join(root, "base.sqlite");
  const base = buildShadowDatabase(root, baseDb);
  expect(base.exactCurrentSearch).toBeTrue();
  expect(base.logicalDigest).toBe(logicalUnitDigest(baseUnits));
  const opened = new Database(baseDb, { readonly: true });
  expect(databaseLogicalDigest(opened)).toBe(base.logicalDigest);
  opened.close();

  const secondId = add(root, "Second exact SQLite unit");
  const changedUnits = collectProjectedUnits(root);
  const changedLedger = changedUnits.filter((unit) => unit.id === firstId || unit.id === secondId);
  expect(changedLedger).toHaveLength(2); // the old tail's text boundary changes when the next head is inserted
  const ordinals = new Map(changedUnits.map((unit, ordinal) => [unitKey(unit), ordinal]));
  const delta = applyKnownDelta(baseDb, root, changedLedger, ordinals);
  expect(delta.changedUnits).toBe(2);
  expect(delta.newUnits).toBe(1);
  expect(delta.logicalDigest).toBe(logicalUnitDigest(changedUnits));

  index(root);
  const search = JSON.parse(readFileSync(join(root, ".promptus", "cache", "search.json"), "utf8"));
  const comparison = compareQueries(root, search, changedUnits, baseDb);
  expect(comparison.comparisons.every((item) => item.exact)).toBeTrue();

  const rebuiltDb = join(root, "rebuilt.sqlite");
  const rebuilt = buildShadowDatabase(root, rebuiltDb);
  expect(rebuilt.logicalDigest).toBe(delta.logicalDigest);
  expect(rebuilt.searchDigest).toBe(rebuilt.currentSearchDigest);
});
