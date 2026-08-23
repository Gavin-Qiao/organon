/** Regression contract for multi-agent STORE concurrency. */
import { afterAll, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ledgerEntries } from "../lib/units.ts";

const PROMPTUS = join(import.meta.dir, "..", "..");
const ADD = join(PROMPTUS, "scripts", "kb-add.ts");
const INDEX = join(PROMPTUS, "scripts", "kb-index.ts");
const VOCAB = join(PROMPTUS, "templates", "schema", "kb-vocab.json");
const roots: string[] = [];

afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-concurrency-"));
  roots.push(root);
  for (const path of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(root, ".promptus", path), { recursive: true });
  copyFileSync(VOCAB, join(root, ".promptus", "schema", "kb-vocab.json"));
  writeFileSync(join(root, ".promptus", "TELOS.md"), "# Telos\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "# Ledger\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(root, ".promptus", "memory", "MEMORY.md"), "# Memory\n\n<!-- kb:append-point -->\n");
  return root;
}

function addConcurrent(root: string, ordinal: number): Promise<{ status: number; output: string }> {
  return new Promise((resolve) => {
    const input = join(root, `concurrent-input-${ordinal}.txt`);
    writeFileSync(input, `concurrent-body-${ordinal}`);
    const inputFd = openSync(input, "r");
    const child = spawn(process.execPath, [
      ADD, "--root", root, "--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED",
      "--title", "Concurrent shared-title event",
    ], { stdio: [inputFd, "pipe", "pipe"] });
    closeSync(inputFd);
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => resolve({ status: code ?? -1, output }));
  });
}

test("concurrent kb-add writers lose no events and mint unique IDs", async () => {
  const root = scaffold();
  const count = 24;
  const results = await Promise.all(Array.from({ length: count }, (_, index) => addConcurrent(root, index)));
  expect(results.filter((result) => result.status !== 0)).toEqual([]);

  const ledger = join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
  const entries = ledgerEntries(ledger);
  expect(entries).toHaveLength(count);
  expect(new Set(entries.map((entry) => entry.anchor)).size).toBe(count);
  const ids = entries.map((entry) => /^<!-- kb:id (\S+) -->$/m.exec(entry.text)?.[1]);
  expect(ids.every(Boolean)).toBe(true);
  expect(new Set(ids).size).toBe(count);
  for (let index = 0; index < count; index++) expect(readFileSync(ledger, "utf8")).toContain(`concurrent-body-${index}`);

  const indexed = spawnSync(process.execPath, [INDEX, "--root", root], { encoding: "utf8" });
  expect(indexed.status).toBe(0);
  const catalog = readFileSync(join(root, ".promptus", "cache", "CATALOG.md"), "utf8");
  const cards = catalog.split(/\r?\n/).filter((line) => line.includes("Concurrent shared-title event"));
  expect(cards).toHaveLength(count);
  expect(new Set(cards.map((line) => /id:(\S+)/.exec(line)?.[1]))).toEqual(new Set(ids));
  expect(existsSync(join(root, ".promptus", "cache", ".locks", "store.lock"))).toBe(false);
});
