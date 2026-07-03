/**
 * get.test.ts — the body-fetch contract (kb-get). kb-find says WHICH unit; kb-get returns
 * that unit's text without opening the whole ledger file. Two invariants matter: a ledger
 * path returns ONLY its own slice (the de-noise carried into fetch), and kb-get is an honest
 * substrate — it never invents a body and names precisely what it could not find. Each test
 * scaffolds a throwaway `.promptus/` project and drives the real scripts. Run: `bun test`.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const DEFAULT_VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-get-"));
  tmps.push(root);
  const P = join(root, ".promptus");
  mkdirSync(join(P, "ledger"), { recursive: true });
  mkdirSync(join(P, "docs", "lit"), { recursive: true });
  mkdirSync(join(P, "memory"), { recursive: true });
  mkdirSync(join(P, "schema"), { recursive: true });
  writeFileSync(join(P, "TELOS.md"), "# Telos — test\n");
  writeFileSync(join(P, "ledger", "RESEARCH-LEDGER.md"), "# Research Ledger — test\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(P, "memory", "MEMORY.md"), "# Memory — test\n\n<!-- kb:append-point -->\n");
  copyFileSync(DEFAULT_VOCAB, join(P, "schema", "kb-vocab.json"));
  return root;
}

function run(script: string, args: string[], stdin = "") {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { input: stdin, encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const add = (root: string, args: string[], body = "body") => run("kb-add.ts", ["--root", root, ...args], body);
const index = (root: string) => run("kb-index.ts", ["--root", root]);
const find = (root: string, args: string[]) => run("kb-find.ts", ["--root", root, ...args]);
const get = (root: string, args: string[]) => run("kb-get.ts", ["--root", root, ...args]);
// the third ` · ` column of a kb-find hit is the catalog path — exactly what kb-get takes
const pathOf = (root: string, query: string) =>
  (find(root, [query]).stdout.split(/\r?\n/).find((l) => l.includes(" · ")) ?? "").split(" · ")[2]?.trim() ?? "";

test("kb-get returns a page unit's full text — title, body, and kept frontmatter", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Header beats vector"], "Because the corpus is small and dense.");
  const r = get(root, [".promptus/docs/header-beats-vector.md"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("# Header beats vector");               // the h1
  expect(r.stdout).toContain("Because the corpus is small and dense"); // the body
});

test("kb-get keeps a lit unit's source — the evidence lives in the frontmatter, not stripped", () => {
  const root = scaffold();
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "KAG 2024", "--source", "arXiv:2409.13731#abstract"], "Mutual indexing.");
  const r = get(root, [".promptus/docs/lit/kag-2024.md"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("arXiv:2409.13731#abstract"); // source returned, the unit's evidence
  expect(r.stdout).toContain("Mutual indexing.");
});

test("kb-get returns ONE ledger entry's slice, not the whole file (the de-noise, carried into fetch)", () => {
  const root = scaffold();
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "alpha entry"], "the alpha body marker991");
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "beta entry"], "the beta body marker992");
  index(root);
  const p = pathOf(root, "marker991"); // ledger/RESEARCH-LEDGER.md#<anchor>, found via the de-noised grep
  expect(p).toContain("#");
  const r = get(root, [p, "--title", "alpha entry"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("alpha entry");   // the slice's head
  expect(r.stdout).toContain("marker991");      // its body
  expect(r.stdout).not.toContain("marker992");  // NOT the file-mate's body — the whole point
  expect(r.stdout).not.toContain("beta entry");
});

test("kb-get disambiguates two same-second ledger entries by --title", () => {
  const root = scaffold();
  const led = "# Ledger\n\n### [2026-06-29 12:00:00] RESULT/VALIDATED — first twin\nbody of FIRST twin\n\n### [2026-06-29 12:00:00] RESULT/VALIDATED — second twin\nbody of SECOND twin\n\n<!-- kb:append-point -->\n";
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), led);
  const p = ".promptus/ledger/RESEARCH-LEDGER.md#2026-06-29T12:00:00";
  const first = get(root, [p, "--title", "first twin"]);
  expect(first.stdout).toContain("body of FIRST twin");
  expect(first.stdout).not.toContain("body of SECOND twin");
  const second = get(root, [p, "--title", "second twin"]);
  expect(second.stdout).toContain("body of SECOND twin");
  expect(second.stdout).not.toContain("body of FIRST twin");
});

test("kb-get errors on a path that resolves to nothing — no phantom body", () => {
  const root = scaffold();
  const r = get(root, [".promptus/docs/does-not-exist.md"]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("no such file");
  expect(r.stdout.trim()).toBe("");
});

test("kb-get errors on an unknown ledger anchor, naming the entry it could not find", () => {
  const root = scaffold();
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "real entry"], "x");
  index(root);
  const file = pathOf(root, "real entry").split("#")[0];
  const r = get(root, [`${file}#2026-06-29T09:09:09`]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("no entry");
});

test("kb-get fetches several units in one call, fenced by a divider", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "first finding"], "alpha body");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "second finding"], "beta body");
  const r = get(root, [".promptus/docs/first-finding.md", ".promptus/docs/second-finding.md"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("alpha body");
  expect(r.stdout).toContain("beta body");
  expect(r.stdout).toContain("==>"); // the divider only appears for a multi-fetch
});

test("kb-get with one good and one missing path prints the good one but still exits 1", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "present"], "present body");
  const r = get(root, [".promptus/docs/present.md", ".promptus/docs/absent.md"]);
  expect(r.status).toBe(1);                  // honest: asked for 2, got 1
  expect(r.stdout).toContain("present body");  // the found one is still returned
  expect(r.stderr).toContain("absent.md");     // the missing one is named
});

test("kb-get with no path prints usage and exits 1", () => {
  const r = get(scaffold(), []);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("usage");
});
