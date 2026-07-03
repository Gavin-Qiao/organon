/**
 * robustness.test.ts — hardening beyond the happy-path contract (kb.test.ts).
 * Four axes: substrate fidelity (the deterministic anti-hallucination guardrails —
 * the scripts never list a unit that isn't on disk, drop one silently, or mangle a
 * status), cross-OS encoding (CRLF, forward-slash paths, non-ASCII), path
 * resolution (relative root, a subdirectory, spaces, cwd fallback), and corruption
 * resilience (bad vocab, a missing sentinel, broken frontmatter, a corrupt cache).
 * Run: `bun test`.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const DEFAULT_VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function mkTmp(prefix = "promptus-rob-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmps.push(d);
  return d;
}

function scaffold(prefix?: string): string {
  const root = mkTmp(prefix);
  const P = join(root, ".promptus");
  mkdirSync(join(P, "ledger"), { recursive: true });
  mkdirSync(join(P, "docs", "lit"), { recursive: true });
  mkdirSync(join(P, "memory"), { recursive: true });
  mkdirSync(join(P, "schema"), { recursive: true });
  writeFileSync(join(P, "TELOS.md"), "# Telos — test\n");
  writeFileSync(join(P, "ledger", "RESEARCH-LEDGER.md"), "# Research Ledger — test\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(P, "memory", "MEMORY.md"), "# Memory — test\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(P, "schema", "kb-vocab.json"), readFileSync(DEFAULT_VOCAB, "utf8"));
  return root;
}

/** run a script; `cwd` lets the path-resolution tests exercise relative roots. */
function run(script: string, args: string[], opts: { stdin?: string; cwd?: string } = {}) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    input: opts.stdin ?? "", encoding: "utf8", cwd: opts.cwd,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const add = (root: string, args: string[], body = "body") => run("kb-add.ts", ["--root", root, ...args], { stdin: body });
const index = (root: string) => run("kb-index.ts", ["--root", root]);
const find = (root: string, args: string[]) => run("kb-find.ts", ["--root", root, ...args]);
const read = (root: string, ...p: string[]) => readFileSync(join(root, ...p), "utf8");
const catalog = (root: string) => read(root, ".promptus", "cache", "CATALOG.md");
const ledgerFile = (root: string) => join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");

// ---- Substrate fidelity: the deterministic anti-hallucination guardrails ----
// The scripts can't "hallucinate" — but they must be an honest substrate: never surface a
// unit that isn't on disk, never drop one silently, and preserve status verbatim so the
// model's calibration source is trustworthy.

test("fidelity: a deleted unit disappears from the catalog and from kb-find on reindex (no phantom)", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "alpha one"], "a");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "beta two"], "b");
  index(root);
  expect(catalog(root)).toContain("alpha one");
  rmSync(join(root, ".promptus", "docs", "alpha-one.md"));
  index(root);
  expect(catalog(root)).not.toContain("alpha one"); // gone, not a phantom
  expect(catalog(root)).toContain("beta two");       // the survivor stays
  expect(find(root, ["alpha"]).stdout).not.toContain("alpha one");
});

test("fidelity: every path kb-find returns resolves to a file on disk", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "real finding"], "x");
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "real paper", "--source", "arXiv:1"], "y");
  index(root);
  const paths = find(root, ["real"]).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.split(" · ")[2]).filter(Boolean);
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) expect(existsSync(join(root, p.split("#")[0]))).toBe(true);
});

test("fidelity: a glyph status (CONFOUNDED) is preserved verbatim as the calibration source", () => {
  const root = scaffold();
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "CONFOUNDED", "--title", "muddy result"], "confounds");
  index(root);
  // the ⚠ glyph is display-only; the status the model calibrates on must read CONFOUNDED
  expect(catalog(root)).toContain("ledger:CONFOUNDED · muddy result");
  expect(find(root, ["", "--status", "CONFOUNDED"]).stdout).toContain("muddy result");
});

test("fidelity: a query that matches nothing says so, it does not invent a hit", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "alpha"], "a");
  index(root);
  const r = find(root, ["zzqqxx-nothing"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("no matches");
  expect(r.stdout).not.toContain("alpha");
});

// ---- Recursion: notes in subdirectories are indexed, with no double-index ----

test("recursion: a finding in a docs/ subdirectory is indexed (the subdir blind spot)", () => {
  const root = scaffold();
  mkdirSync(join(root, ".promptus", "docs", "positioning"), { recursive: true });
  writeFileSync(join(root, ".promptus", "docs", "positioning", "audit.md"), "# Positioning audit\n\nneedle qzx987.\n");
  index(root);
  expect(catalog(root)).toContain("Positioning audit");                   // indexed, not skipped
  expect(find(root, ["qzx987"]).stdout).toContain("positioning/audit.md"); // and retrievable
});

test("recursion: the lit store is not double-indexed when the finding walk recurses into it", () => {
  const root = scaffold();
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "solo paper", "--source", "arXiv:9"], "z");
  index(root);
  const lines = catalog(root).split(/\r?\n/).filter((l) => l.includes("solo-paper.md"));
  expect(lines.length).toBe(1);                    // exactly once, not also as a finding
  expect(lines[0].startsWith("lit:")).toBe(true);  // owned by the more-specific lit store
});

test("recursion: a README in a store dir is navigation, not an indexed unit", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "README.md"), "# Findings index\n\njust a pointer.\n");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "real one"], "r");
  index(root);
  expect(catalog(root)).toContain("real one");
  expect(catalog(root)).not.toContain("Findings index"); // README skipped
});

test("recursion: an archive/ subdir is cold storage and stays unindexed (no bloat re-entry)", () => {
  const root = scaffold();
  mkdirSync(join(root, ".promptus", "docs", "ledger", "archive"), { recursive: true });
  writeFileSync(join(root, ".promptus", "docs", "ledger", "archive", "old.md"), "# Retired continuation\n\nold stuff.\n");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "active note"], "a");
  index(root);
  expect(catalog(root)).toContain("active note");
  expect(catalog(root)).not.toContain("Retired continuation"); // archive/ is left cold
});

// ---- De-noise: unit-scoped matching, --limit, --snippet ----

test("denoise: a ledger body term matches only the entry that holds it, not its file-mates", () => {
  const root = scaffold();
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "alpha entry"], "body with zentinel42 token");
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "beta entry"], "an unrelated body");
  add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "gamma entry"], "another unrelated body");
  index(root);
  const out = find(root, ["zentinel42"]).stdout;
  const hits = out.split(/\r?\n/).filter((l) => l.includes(" · "));
  expect(hits.length).toBe(1);              // the de-noise — not all 3 entries sharing the file
  expect(out).toContain("alpha entry");
  expect(out).not.toContain("beta entry");  // the old whole-file grep returned these too
});

test("--limit caps the result and reports how many it held back", () => {
  const root = scaffold();
  for (const t of ["one", "two", "three"]) add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", `shared ${t}`], "x");
  index(root);
  const out = find(root, ["shared", "--limit", "1"]).stdout;
  expect(out.split(/\r?\n/).filter((l) => l.includes(" · ")).length).toBe(1);
  expect(out).toContain("of 3 shown"); // no silent truncation
});

test("--snippet attaches the matched line so relevance is judged header-first", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "a finding"], "the magic token wobble9 lives in the body");
  index(root);
  const out = find(root, ["wobble9", "--snippet"]).stdout;
  expect(out).toContain("↳");       // the snippet marker
  expect(out).toContain("wobble9"); // the matched line, not just the header
});

// ---- Cross-OS / encoding ----

test("cross-os: a CRLF ledger still parses (Windows autocrlf must not drop entries)", () => {
  const root = scaffold();
  const crlf = "# Research Ledger\r\n\r\n### [2026-06-19 18:50:00] DECISION/VALIDATED — crlf entry\r\nbody line\r\n\r\n<!-- kb:append-point -->\r\n";
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), crlf);
  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("ledger:VALIDATED · crlf entry"); // not dropped, no stray \r
});

test("cross-os: catalog paths are forward-slashed regardless of platform", () => {
  const root = scaffold();
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "slashes", "--source", "arXiv:2"], "z");
  index(root);
  const cat = catalog(root);
  expect(cat).toContain(".promptus/docs/lit/slashes.md");
  expect(cat).not.toContain("\\"); // no backslashes leak into the index
});

test("cross-os: a non-ASCII title is kept verbatim while the slug is ascii-folded", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Café résumé findings"], "u");
  index(root);
  expect(existsSync(join(root, ".promptus", "docs", "cafe-resume-findings.md"))).toBe(true); // folded slug
  expect(catalog(root)).toContain("Café résumé findings");                                   // title kept verbatim
});

// ---- Path resolution (no absolute path required) ----

test("paths: a relative --root . resolves against cwd", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "rel root"], "r");
  expect(run("kb-index.ts", ["--root", "."], { cwd: root }).status).toBe(0);
  expect(catalog(root)).toContain("rel root");
});

test("paths: the root is found from a subdirectory by walking up", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "deep"], "d");
  const sub = join(root, ".promptus", "docs"); // an existing nested dir, below the root
  expect(run("kb-index.ts", [], { cwd: sub }).status).toBe(0); // no --root; cwd is below root
  expect(catalog(root)).toContain("deep");
});

test("paths: a project directory containing spaces works", () => {
  const root = scaffold("promptus rob spaces ");
  expect(root).toContain(" ");
  expect(add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "spaced home"], "s").status).toBe(0);
  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("spaced home");
});

test("paths: no --root falls back to cwd", () => {
  const root = scaffold();
  const a = run("kb-add.ts", ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "cwd add"], { stdin: "c", cwd: root });
  expect(a.status).toBe(0);
  expect(run("kb-index.ts", [], { cwd: root }).status).toBe(0);
  expect(catalog(root)).toContain("cwd add");
});

// ---- Corruption resilience / error paths ----

test("corruption: kb-add into a ledger with no sentinel errors clearly and leaves the file untouched", () => {
  const root = scaffold();
  const lp = join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
  writeFileSync(lp, "# Ledger with no append point\n");
  const before = readFileSync(lp, "utf8");
  const r = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "lost"], "nope");
  expect(r.status).not.toBe(0);
  expect(r.stderr.toLowerCase()).toContain("sentinel");
  expect(readFileSync(lp, "utf8")).toBe(before); // not corrupted
});

test("corruption: a malformed vocab yields a clear error, not a crash", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "schema", "kb-vocab.json"), "{ this is not json");
  const r = index(root);
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("malformed vocab");
});

test("corruption: a unit with broken frontmatter does not crash kb-index", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "broken.md"), "---\nstatus: [unterminated\nweird line no colon\n---\n# Broken but indexable\nbody\n");
  const r = index(root);
  expect(r.status).toBe(0); // resilient: indexes what it can
  expect(catalog(root)).toContain("Broken but indexable");
});

test("corruption: kb-find with no catalog yet asks for an index instead of crashing", () => {
  const root = scaffold();
  const r = find(root, ["anything"]);
  expect(r.status).toBe(1);
  expect(r.stderr.toLowerCase()).toContain("no catalog");
});

test("corruption: kb-index rebuilds a hand-corrupted cache cleanly (derived & disposable)", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "rebuildable"], "x");
  index(root);
  const gp = join(root, ".promptus", "cache", "graph.json");
  writeFileSync(gp, "}{ totally corrupt not json");
  expect(index(root).status).toBe(0); // heals, does not choke on its own stale output
  expect(() => JSON.parse(readFileSync(gp, "utf8"))).not.toThrow();
  expect(catalog(root)).toContain("rebuildable");
});

// ---- kb-now: the gated NOW-header writer (determinism over a freehand header) ----
// The script owns what a model gets wrong — the date stamp, the placement, the structure —
// so the header can't drift (wrong date) or break (missing section), and the write is bounded.

const HEADER_LEDGER = `# Research Ledger — test

**Updated:** 1999-01-01 (stale)  ·  **Operator:** t  ·  **Agent:** t
**Timezone:** America/Montreal (UTC-4) — local.

## Guardrails
- never bends

<!-- now:start -->
## NOW
old now content

## Open frontier
- [ ] thing

## Next actions
1. do it

## <<< RESUME HERE AFTER COMPACTION >>>
pick up here
<!-- now:end -->

## Glossary
- term — def

## Log

<!-- kb:append-point -->
### [2026-06-19 10:00:00] DECISION/VALIDATED — an existing entry
body
`;

const HEADER_BODY = "## NOW\nfresh now\n\n## Open frontier\n- [ ] x\n\n## Next actions\n1. y\n\n## <<< RESUME HERE AFTER COMPACTION >>>\nresume here";

test("kb-now: stamps Updated from the clock (not from input), preserving the Operator/Agent tail", () => {
  const root = scaffold();
  writeFileSync(ledgerFile(root), HEADER_LEDGER);
  const r = run("kb-now.ts", ["--root", root, "--note", "v9"], { stdin: HEADER_BODY });
  expect(r.status).toBe(0);
  const led = readFileSync(ledgerFile(root), "utf8");
  expect(led).toMatch(/\*\*Updated:\*\* \d{4}-\d{2}-\d{2} \(v9\)/); // a script-stamped ISO date + the note
  expect(led).not.toContain("1999-01-01");                         // the stale hand-typed date is gone
  expect(led).toContain("**Operator:** t");                   // the tail is preserved
  expect(led).toContain("fresh now");                         // the new prose is placed
  expect(led).not.toContain("old now content");               // the old region is replaced
});

test("kb-now: the write is bounded — the log and the static framing are untouched", () => {
  const root = scaffold();
  writeFileSync(ledgerFile(root), HEADER_LEDGER);
  run("kb-now.ts", ["--root", root], { stdin: HEADER_BODY });
  const led = readFileSync(ledgerFile(root), "utf8");
  expect(led).toContain("### [2026-06-19 10:00:00] DECISION/VALIDATED — an existing entry"); // log intact
  expect(led).toContain("- never bends");                                                    // framing intact
  expect(led).toContain("<!-- kb:append-point -->");                                         // append point intact
});

test("kb-now: refuses a header missing a required section, naming it", () => {
  const root = scaffold();
  writeFileSync(ledgerFile(root), HEADER_LEDGER);
  const noFrontier = "## NOW\nn\n\n## Next actions\n1. y\n\n## <<< RESUME HERE AFTER COMPACTION >>>\nr";
  const r = run("kb-now.ts", ["--root", root], { stdin: noFrontier });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("Open frontier");
});

test("kb-now: refuses a ledger that has no now sentinels", () => {
  const root = scaffold();
  writeFileSync(ledgerFile(root), "# L\n\n**Updated:** 2000-01-01\n\n## NOW\nx\n\n<!-- kb:append-point -->\n");
  const r = run("kb-now.ts", ["--root", root], { stdin: HEADER_BODY });
  expect(r.status).toBe(1);
  expect(r.stderr.toLowerCase()).toContain("now:start");
});

test("kb-now: --dry-run prints the result but does not touch the ledger", () => {
  const root = scaffold();
  writeFileSync(ledgerFile(root), HEADER_LEDGER);
  const before = readFileSync(ledgerFile(root), "utf8");
  const r = run("kb-now.ts", ["--root", root, "--dry-run"], { stdin: HEADER_BODY });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("[dry-run]");
  expect(readFileSync(ledgerFile(root), "utf8")).toBe(before);
});
