/**
 * status.test.ts — the grounding layer's contract: editio-status reports every
 * section's claim tally, resolves grounds handles against the promptus store
 * (file units by slug, ledger entries by slugified title), lists ungraded spans
 * at file:line, and the --gate actually gates (ungraded / unsourced / overclaim /
 * unknown grounds fail; an in-span override passes on the record). Also covers
 * the cwd-proof CLI behavior and render's --concat/--help (same fixture).
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS = join(import.meta.dir, "..");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function run(script: string, args: string[], cwd?: string) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", cwd });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, stdout: r.stdout ?? "" };
}

/** A workspace with a stub store: one strong unit, one superseded, one lit, one ledger entry. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "editio-status-test-"));
  tmps.push(root);
  const w = (rel: string, content: string) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  };
  w(".promptus/docs/strong-finding.md", "---\nsubstrate: finding\nstatus: VALIDATED\n---\n# Strong\n");
  w(".promptus/docs/old-claim.md", "---\nsubstrate: finding\nstatus: SUPERSEDED\n---\n# Old\n");
  w(".promptus/docs/lit/cited-thing.md", "---\nsubstrate: lit\nstatus: CITE\n---\n# Cited\n");
  w(".promptus/ledger/RESEARCH-LEDGER.md", "# Ledger\n\n### [2026-07-03 10:00:00] RESULT/VALIDATED — Ledger Backed Thing\nBody.\n\n<!-- kb:append-point -->\n");
  // main.tex puts methods BEFORE intro — the report and --concat must follow build order
  w(".editio/paper/main.tex", "\\InputIfFileExists{sections/methods}{}{}\n\\InputIfFileExists{sections/intro}{}{}\n");
  w(".editio/paper/sections/intro.md", [
    "---", "class: deo:Introduction", "status: drafting", "grounds: [strong-finding, missing-handle]", "---",
    "# Intro", "",
    "[good]{.claim .validated grounds=strong-finding} and [iffy]{.claim .conjectured} and",
    "[bare]{.claim} plus [none]{.claim .unsourced}.", "",
    "```latex", "[not a claim]{.claim}", "```", "",
  ].join("\n"));
  w(".editio/paper/sections/methods.md", [
    "---", "class: deo:Methods", "status: drafting", "grounds: []", "---",
    "# Methods", "",
    "[overclaimed]{.claim .validated grounds=old-claim} and",
    "[unknown-backed]{.claim .validated grounds=nope} and",
    "[ledgered]{.claim .validated grounds=ledger-backed-thing} and",
    '[excused]{.claim .validated override="holds for our corpus"}.', "",
  ].join("\n"));
  return root;
}

test("status: per-section tallies in build order, fence claims excluded, grounds resolved", () => {
  const root = fixture();
  const r = run("editio-status.ts", ["--root", root]);
  expect(r.status).toBe(0); // report never gates by itself
  expect(r.out).toContain("2 section(s)");
  expect(r.out.indexOf("methods")).toBeLessThan(r.out.indexOf("intro")); // main.tex order, not alphabetical
  expect(r.out).toContain("claims 1V 1C 1U 1G"); // the latex-fence span did NOT count
  expect(r.out).toContain("1 ungraded, 1 unsourced");
  expect(r.out).toContain("weak    old-claim = finding:SUPERSEDED");
  expect(r.out).toContain("unknown nope");
  expect(r.out).toContain("unknown missing-handle");
});

test("status --claims lists each ungraded/unsourced span at file:line", () => {
  const r = run("editio-status.ts", ["--root", fixture(), "--claims"]);
  expect(r.out).toContain("ungraded  sections/intro.md:");
  expect(r.out).toContain("unsourced sections/intro.md:");
  expect(r.out).toContain("[bare]");
});

test("the gate fails on ungraded, unsourced, overclaim, and unknown grounds — override passes", () => {
  const r = run("editio-status.ts", ["--root", fixture(), "--gate"]);
  expect(r.status).toBe(1);
  expect(r.out).toContain("GATE FAILED — 4 violation(s)");
  expect(r.out).toContain("ungraded claim at sections/intro.md");
  expect(r.out).toContain("unsourced claim at sections/intro.md");
  expect(r.out).toContain("overclaim: .validated over old-claim = finding:SUPERSEDED");
  expect(r.out).toContain("only unknown grounds (nope)");
  expect(r.out).not.toContain("excused"); // the on-the-record override is respected
});

test("a clean paper passes the gate", () => {
  const root = mkdtempSync(join(tmpdir(), "editio-status-clean-"));
  tmps.push(root);
  mkdirSync(join(root, ".promptus", "docs"), { recursive: true });
  mkdirSync(join(root, ".editio", "paper", "sections"), { recursive: true });
  writeFileSync(join(root, ".promptus", "docs", "g.md"), "---\nsubstrate: finding\nstatus: VALIDATED\n---\n# G\n");
  writeFileSync(join(root, ".editio", "paper", "sections", "intro.md"), "---\nclass: deo:Introduction\nstatus: final\ngrounds: [g]\n---\n# Intro\n\n[solid]{.claim .validated grounds=g} and [hedged]{.claim .conjectured grounds=g}.\n");
  const r = run("editio-status.ts", ["--root", root, "--gate"]);
  expect(r.status).toBe(0);
  expect(r.out).toContain("publish-clean");
});

test("render --concat concatenates sections in build order; --help exists; cwd-proof root", () => {
  const root = fixture();
  const cat = run("editio-render.ts", ["--root", root, "--concat"]);
  expect(cat.status).toBe(0);
  expect(cat.stdout.indexOf("sections/methods.md")).toBeLessThan(cat.stdout.indexOf("sections/intro.md"));
  const help = run("editio-render.ts", ["--help"]);
  expect(help.status).toBe(0);
  expect(help.out).toContain("usage");
  // run from INSIDE .editio/paper with no --root: findRoot walks up instead of nesting
  const inside = run("editio-render.ts", ["--all"], join(root, ".editio", "paper"));
  expect(inside.status).toBe(0);
  expect(inside.out).toContain("intro.tex");
});

// ──────────── audit hardening: override boundary + drafted-words signal ────────────

test("AUDIT: an unsourced claim with an override passes ON THE RECORD; ungraded never does", () => {
  const root = mkdtempSync(join(tmpdir(), "editio-status-override-"));
  tmps.push(root);
  mkdirSync(join(root, ".promptus", "docs"), { recursive: true });
  mkdirSync(join(root, ".editio", "paper", "sections"), { recursive: true });
  writeFileSync(join(root, ".editio", "paper", "sections", "intro.md"), [
    "---", "class: deo:Introduction", "---", "# Intro", "",
    '[folk knowledge in the field]{.claim .unsourced override="author accepts; standard result"}', "",
  ].join("\n"));
  const pass = run("editio-status.ts", ["--root", root, "--gate"]);
  expect(pass.status).toBe(0);
  expect(pass.out).toContain('on the record: "author accepts; standard result"');
  expect(pass.out).toContain("1 override(s) on the record");

  writeFileSync(join(root, ".editio", "paper", "sections", "intro.md"), [
    "---", "class: deo:Introduction", "---", "# Intro", "",
    '[never audited]{.claim override="cannot excuse this"}', "",
  ].join("\n"));
  const fail = run("editio-status.ts", ["--root", root, "--gate"]);
  expect(fail.status).toBe(1);
  expect(fail.out).toContain("override does not apply to ungraded");
  expect(fail.out).toContain("never an ungraded one"); // the remediation states the boundary
});

test("AUDIT: the report shows drafted words per section (vs budget) — a skeleton reads 0", () => {
  const root = fixture();
  const r = run("editio-status.ts", ["--root", root]);
  expect(r.out).toMatch(/intro\s.*words \d+/);
  expect(r.out).toContain("words drafted");
  // a fresh stub with budget frontmatter reads 0/800
  writeFileSync(join(root, ".editio", "paper", "sections", "stub.md"),
    "---\nclass: deo:Conclusion\nstatus: drafting\nbudget: 800\n---\n# Stub\n");
  const r2 = run("editio-status.ts", ["--root", root]);
  expect(r2.out).toMatch(/stub\s.*words 0\/800/);
});
