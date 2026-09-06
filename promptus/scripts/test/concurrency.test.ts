/** Regression contract for multi-agent STORE concurrency. */
import { afterAll, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ledgerEntries } from "../lib/units.ts";
import { atomicStoreWrite, isStoreLockContention, withStoreLock } from "../lib/store-lock.ts";

const PROMPTUS = join(import.meta.dir, "..", "..");
const ADD = join(PROMPTUS, "scripts", "kb-add.ts");
const INDEX = join(PROMPTUS, "scripts", "kb-index.ts");
const VOCAB = join(PROMPTUS, "templates", "schema", "kb-vocab.json");
const roots: string[] = [];

afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("Windows lock-open aliases remain contention while POSIX permission errors stay hard", () => {
  expect(isStoreLockContention("EEXIST", "linux")).toBe(true);
  expect(isStoreLockContention("EPERM", "win32")).toBe(true);
  expect(isStoreLockContention("EACCES", "win32")).toBe(true);
  expect(isStoreLockContention("EPERM", "linux")).toBe(false);
});

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

test("concurrent kb-amend writers preserve every independently added alias", async () => {
  const root = scaffold();
  const path = ".promptus/docs/shared.md";
  writeFileSync(join(root, path), "---\nid: finding-shared\n---\n# Shared\n\nUntouched body.\n");
  const results = await Promise.all(Array.from({ length: 12 }, (_, ordinal) => new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [join(PROMPTUS, "scripts", "kb-amend.ts"), "--root", root, "--path", path,
      "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED", "--alias", `legacy-${ordinal}`], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", resolve);
  })));
  expect(results).toEqual(Array(12).fill(0));
  const text = readFileSync(join(root, path), "utf8");
  for (let ordinal = 0; ordinal < 12; ordinal++) expect(text).toMatch(new RegExp(`legacy-${ordinal}(?:,|\\])`));
  expect(text).toContain("id: finding-shared\n");
  expect(text.endsWith("# Shared\n\nUntouched body.\n")).toBe(true);
  expect(existsSync(join(root, ".promptus/cache/.locks/store.lock"))).toBe(false);
});

test("a terminated writer preserves source and fails closed until its exact lease is cleared", async () => {
  const root = scaffold(), ledger = join(root, ".promptus/ledger/RESEARCH-LEDGER.md");
  const before = readFileSync(ledger, "utf8"), lock = join(root, ".promptus/cache/.locks/store.lock");
  const code = `import {withStoreLock} from ${JSON.stringify(join(PROMPTUS, "scripts/lib/store-lock.ts"))};
    withStoreLock(${JSON.stringify(root)}, () => { process.stdout.write("acquired\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000); });`;
  const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  let closed = false;
  const terminal = new Promise<void>((resolve) => child.on("close", () => { closed = true; resolve(); }));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("test writer never acquired lease")), 3000);
      child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
    });
    expect(JSON.parse(readFileSync(lock, "utf8")).pid).toBe(child.pid);
    child.kill("SIGKILL"); await terminal; // exact newly spawned fixture process, now confirmed terminal
    expect(readFileSync(ledger, "utf8")).toBe(before);
    expect(() => withStoreLock(root, () => atomicStoreWrite(root, ledger, "must not write"), { timeoutMs: 20 })).toThrow("timed out");
    expect(readFileSync(ledger, "utf8")).toBe(before);
    unlinkSync(lock); // explicit recovery only after the owning process is terminal
    withStoreLock(root, () => atomicStoreWrite(root, ledger, before + "\nRecovered fixture write.\n"));
    expect(readFileSync(ledger, "utf8")).toBe(before + "\nRecovered fixture write.\n");
    expect(existsSync(lock)).toBe(false);
  } finally { if (!closed) { child.kill("SIGKILL"); await terminal; } }
});
