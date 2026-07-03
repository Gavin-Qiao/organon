/**
 * adversarial.test.ts — a pre-release pass that tries to BREAK the retrieve+graph layer, not
 * confirm it. Each test asserts the honest/correct behaviour, so a failure is a real bug found:
 * silent mis-fetch (wrong --title), structural corruption (a fenced head splitting the log),
 * and the numeric/degenerate edges of the graph math (empty bodies, identical docs, self-loops,
 * sourceless pairs). Run: `bun test`.
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
  const root = mkdtempSync(join(tmpdir(), "promptus-adv-"));
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
const graph = (root: string, args: string[]) => run("kb-graph.ts", ["--root", root, ...args]);
const get = (root: string, args: string[]) => run("kb-get.ts", ["--root", root, ...args]);
const writeLedger = (root: string, text: string) => writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), text);
const finding = (root: string, title: string, links: string[] = [], body = "x") =>
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", title], `${body} ${links.map((l) => `[[${l}]]`).join(" ")}`);

// ── 1. Silent mis-fetch: a --title that matches nothing at a shared anchor must be an honest error ──
test("kb-get: a wrong --title at a same-second anchor errors honestly — it does not return a different entry", () => {
  const root = scaffold();
  writeLedger(root, "# L\n\n### [2026-06-29 12:00:00] RESULT/VALIDATED — first twin\nbody of FIRST\n\n### [2026-06-29 12:00:00] RESULT/VALIDATED — second twin\nbody of SECOND\n\n<!-- kb:append-point -->\n");
  const r = get(root, [".promptus/ledger/RESEARCH-LEDGER.md#2026-06-29T12:00:00", "--title", "no such title here"]);
  expect(r.status).toBe(1);                 // honest: the asked-for title isn't there
  expect(r.stdout).not.toContain("body of FIRST");  // must NOT silently hand back a twin
  expect(r.stdout).not.toContain("body of SECOND");
  expect(r.stderr.toLowerCase()).toContain("title"); // and it says why, naming candidates
});

test("kb-get: a redundant --title (only one entry at the anchor) still resolves", () => {
  const root = scaffold();
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "solo entry"], "the only body here");
  index(root);
  const p = (run("kb-find.ts", ["--root", root, "solo"]).stdout.split(/\r?\n/).find((l) => l.includes(" · ")) ?? "").split(" · ")[2]?.trim() ?? "";
  const r = get(root, [p, "--title", "mismatched title"]); // wrong title, but only one entry at this anchor
  expect(r.status).toBe(0);                       // unambiguous → resolves anyway
  expect(r.stdout).toContain("the only body here");
});

// ── 2. Structural corruption: a fenced "### [ts]" inside an entry body must not split the log ──
test("ledger: a fenced ### [ts] example inside an entry body does not spawn a phantom unit", () => {
  const root = scaffold();
  const fenced = [
    "# L", "",
    "### [2026-06-29 12:00:00] RESULT/VALIDATED — real outer entry",
    "Here is the ledger format, quoted as an example:",
    "```",
    "### [2099-01-01 00:00:00] FAKE/PHANTOM — not a real entry",
    "```",
    "and the outer entry continues after the fence.",
    "", "<!-- kb:append-point -->", "",
  ].join("\n");
  writeLedger(root, fenced);
  index(root);
  const cat = run("kb-find.ts", ["--root", root, "", "--substrate", "ledger"]).stdout;
  expect(cat).toContain("real outer entry");
  expect(cat).not.toContain("not a real entry"); // the fenced line is an example, not a unit
});

test("ledger: a fenced ↳ relation example in an entry body is not parsed as a real edge", () => {
  const root = scaffold();
  const t = [
    "# L", "",
    "### [2026-06-29 12:00:00] DECISION/VALIDATED — real entry",
    "Typed relations are written like this:",
    "```",
    "↳ supersedes some-other-id",
    "```",
    "end of the entry.", "", "<!-- kb:append-point -->", "",
  ].join("\n");
  writeLedger(root, t);
  index(root);
  const g = JSON.parse(readFileSync(join(root, ".promptus", "cache", "graph.json"), "utf8"));
  expect(g.relations.some((e: { type: string }) => e.type === "supersedes")).toBe(false); // fenced = example, not edge
});

// ── 3-8. Degenerate graph inputs: must not crash, NaN, or divide by zero ──
test("kb-graph rank: a single node and a self-loop produce a finite rank, no NaN", () => {
  const root = scaffold();
  finding(root, "lonely loop", ["lonely-loop"]); // links to itself
  index(root);
  const r = graph(root, ["rank"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("lonely-loop");
  expect(r.stdout.toLowerCase()).not.toContain("nan");
});

test("kb-graph lint: a self-loop node is neither an orphan nor a dangling handle", () => {
  const root = scaffold();
  finding(root, "selfish", ["selfish"]);          // self-link
  finding(root, "anchor"); finding(root, "spoke", ["anchor"]); // a normal connected pair
  index(root);
  const out = graph(root, ["lint"]).stdout;
  expect(out).not.toContain("[[selfish]]"); // it resolves (selfish is a node) — not dangling
  // selfish has a self-edge, so it is not "nothing links in or out"
  const orphanLine = out.split(/\r?\n/).find((l) => l.trim() === "selfish");
  expect(orphanLine).toBeUndefined();
});

test("kb-graph suggest: identical-body units pair at a high score without crashing", () => {
  const root = scaffold();
  finding(root, "twin a", [], "the quokkafoo wobblezinc indexing scheme");
  finding(root, "twin b", [], "the quokkafoo wobblezinc indexing scheme");
  finding(root, "filler", [], "unrelated sailing harbours");
  index(root);
  const r = graph(root, ["suggest"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toMatch(/twin-a.*twin-b|twin-b.*twin-a/);
  expect(r.stdout.toLowerCase()).not.toContain("nan");
});

test("kb-graph suggest: an all-stopword / tiny body does not divide by zero", () => {
  const root = scaffold();
  finding(root, "empty-ish", [], "the a an of to in on it is"); // nothing survives tokenisation
  finding(root, "normal one", [], "distinctive zebracorn taxonomy notes");
  index(root);
  const r = graph(root, ["suggest"]);
  expect(r.status).toBe(0);                        // no crash, no NaN from a zero vector
  expect(r.stdout.toLowerCase()).not.toContain("nan");
});

test("kb-graph suggest: two sourceless units are never paired by 'shared source'", () => {
  const root = scaffold();
  finding(root, "alpha", [], "the quokkafoo wobblezinc indexing scheme repeated");
  finding(root, "beta", [], "the quokkafoo wobblezinc indexing scheme repeated");
  index(root);
  const out = graph(root, ["suggest"]).stdout;
  expect(out).not.toContain("shared source"); // empty source must not equal empty source
});

test("kb-get: a path escaping the project root is refused (not read off disk)", () => {
  const root = scaffold();
  // on Unix this would otherwise resolve to a real /etc/hosts — kb-get must refuse, deterministically, cross-OS
  const r = get(root, ["../../../../../../etc/hosts"]);
  expect(r.status).toBe(1);
  expect(r.stderr.toLowerCase()).toContain("outside the project root");
});
