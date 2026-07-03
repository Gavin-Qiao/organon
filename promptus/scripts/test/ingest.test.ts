/**
 * ingest.test.ts — kb-ingest: the CURATE verb that gives deep-research notes the
 * provenance the `lit` substrate requires, deriving `source` only from what is already
 * recorded (a ledger run-id, the note's own citation) and FLAGGING — never inventing —
 * when nothing is recoverable. Two axes: backfill (add lit frontmatter in place, body
 * byte-preserved, idempotent, the run-id false-positive guard) and promote (reclassify a
 * finding into the lit store, fixing the links the move breaks). Run: `bun test`.
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

function run(script: string, args: string[]) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const ingest = (root: string, args: string[]) => run("kb-ingest.ts", [...args, "--root", root]);
const read = (root: string, p: string) => readFileSync(join(root, p), "utf8");
const exists = (root: string, p: string) => existsSync(join(root, p));

/** A migrated repo with a populated lit store + a ledger that maps some notes to run-ids. */
function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-ing-"));
  tmps.push(root);
  const P = join(root, ".promptus");
  mkdirSync(join(P, "docs", "lit"), { recursive: true });
  mkdirSync(join(P, "ledger"), { recursive: true });
  mkdirSync(join(P, "schema"), { recursive: true });
  writeFileSync(join(P, "schema", "kb-vocab.json"), readFileSync(DEFAULT_VOCAB, "utf8"));
  // a note whose slug the ledger maps to a real run-id — AND a decoy line with an English w-word.
  writeFileSync(
    join(P, "ledger", "RESEARCH-LEDGER.md"),
    "# Ledger\n\n### [2026-06-23 17:45] RESEARCH/VERDICT — witnessed k-distance precedent → `docs/lit/boundary.md`\n" +
      "### [2026-06-23 23:59] RESEARCH/VERDICT — separation deep-research (`wa4o723kz`, 107 agents) → `docs/lit/boundary.md`\n\n<!-- kb:append-point -->\n",
  );
  // a paper note carrying its own citation section
  writeFileSync(join(P, "docs", "lit", "dbscan.md"), "# DBSCAN\n\n## 1. Citation\nEster, Kriegel, Sander, Xu. KDD-96 (1996).\n\n## 2. TL;DR\ndensity-connected points.\n");
  // a deep-research note (no citation section); provenance is the ledger run-id
  writeFileSync(join(P, "docs", "lit", "boundary.md"), "# Boundary construction\n\nforeground/void duality.\n");
  // a synthesis note with neither — must be FLAGGED, not invented
  writeFileSync(join(P, "docs", "lit", "synthesis.md"), "# A synthesis\n\nour own cross-paper synthesis.\n");
  return root;
}

// ──────────────────────────── backfill ────────────────────────────

test("backfill: a note with its own citation gets lit:BACKGROUND + source from that citation, body intact", () => {
  const root = scaffold();
  const before = read(root, ".promptus/docs/lit/dbscan.md");
  const r = ingest(root, ["backfill", "--apply"]);
  expect(r.status).toBe(0);
  const after = read(root, ".promptus/docs/lit/dbscan.md");
  expect(after).toMatch(/^---\n[\s\S]*substrate: lit[\s\S]*status: BACKGROUND/);
  expect(after).toContain("kind: PAPER");
  expect(after).toContain("Ester, Kriegel, Sander, Xu"); // source lifted from the citation
  expect(after.slice(after.indexOf("# DBSCAN"))).toBe(before); // the body is byte-identical, just prefixed
});

test("backfill: a note mapped by a ledger run-id gets source=deep-research:<id>", () => {
  const root = scaffold();
  ingest(root, ["backfill", "--apply"]);
  const after = read(root, ".promptus/docs/lit/boundary.md");
  expect(after).toContain("source: \"deep-research:wa4o723kz\""); // the real run-id
  expect(after).toContain("kind: NOTE");
});

test("backfill: the run-id guard rejects an English w-word (no digit) — no `witnessed` source", () => {
  const root = scaffold();
  ingest(root, ["backfill", "--apply"]);
  const after = read(root, ".promptus/docs/lit/boundary.md");
  expect(after).not.toContain("witnessed"); // the decoy line must not become the source
});

test("backfill: a note with no recoverable source is FLAGGED (frontmatter without source), never invented", () => {
  const root = scaffold();
  const r = ingest(root, ["backfill", "--apply"]);
  expect(r.stdout).toContain("FLAGGED");
  const after = read(root, ".promptus/docs/lit/synthesis.md");
  expect(after).toContain("status: BACKGROUND");
  expect(after).not.toContain("source:"); // no fabricated provenance
});

test("backfill: dry-run writes nothing", () => {
  const root = scaffold();
  const before = read(root, ".promptus/docs/lit/dbscan.md");
  const r = ingest(root, ["backfill"]);
  expect(r.stdout).toContain("No files were touched");
  expect(read(root, ".promptus/docs/lit/dbscan.md")).toBe(before);
});

test("backfill: idempotent — a second run skips already-curated notes", () => {
  const root = scaffold();
  ingest(root, ["backfill", "--apply"]);
  const once = read(root, ".promptus/docs/lit/dbscan.md");
  ingest(root, ["backfill", "--apply"]);
  expect(read(root, ".promptus/docs/lit/dbscan.md")).toBe(once); // not double-prefixed
  // only one frontmatter fence pair at the top
  expect(once.match(/^---$/gm)?.length).toBe(2);
});

// ──────────────────────────── promote ────────────────────────────

test("promote: a finding is moved into the lit store with lit frontmatter + the given source", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "deep-research.md"), "# Deep Research\n\nsee [research-ledger.md](research-ledger.md) and [telos.md](telos.md) and [thesis.md](thesis.md).\n");
  const r = ingest(root, ["promote", ".promptus/docs/deep-research.md", "--source", "sweeps D22/D75", "--apply"]);
  expect(r.status).toBe(0);
  expect(exists(root, ".promptus/docs/lit/deep-research.md")).toBe(true); // moved into lit
  expect(exists(root, ".promptus/docs/deep-research.md")).toBe(false);    // removed from finding store
  const out = read(root, ".promptus/docs/lit/deep-research.md");
  expect(out).toContain("substrate: lit");
  expect(out).toContain('source: "sweeps D22/D75"');
});

test("promote: rewrites the relative links the docs/ → docs/lit/ move would break", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "deep-research.md"), "# Deep Research\n\n[ledger](research-ledger.md) · [telos](telos.md) · [sib](thesis.md).\n");
  ingest(root, ["promote", ".promptus/docs/deep-research.md", "--source", "x", "--apply"]);
  const out = read(root, ".promptus/docs/lit/deep-research.md");
  expect(out).toContain("](../../ledger/RESEARCH-LEDGER.md)"); // ledger re-pathed
  expect(out).toContain("](../../TELOS.md)");                  // telos re-pathed
  expect(out).toContain("](../thesis.md)");                    // bare sibling now one dir up
});

test("promote: dry-run moves nothing", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "deep-research.md"), "# Deep Research\n\nbody.\n");
  const r = ingest(root, ["promote", ".promptus/docs/deep-research.md", "--source", "x"]);
  expect(r.stdout).toContain("No files were touched");
  expect(exists(root, ".promptus/docs/deep-research.md")).toBe(true);
  expect(exists(root, ".promptus/docs/lit/deep-research.md")).toBe(false);
});

// ──────────────── adversarial regressions (found by the audit) ────────────────

test("promote: a file that already has frontmatter is re-stamped, not double-stacked", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "already.md"), "---\nid: finding-x\nsubstrate: finding\nstatus: VALIDATED\n---\n# Already\n\nbody.\n");
  ingest(root, ["promote", ".promptus/docs/already.md", "--source", "s", "--apply"]);
  const out = read(root, ".promptus/docs/lit/already.md");
  expect(out.match(/^---$/gm)?.length).toBe(2); // exactly one frontmatter block, not two
  expect(out).toContain("substrate: lit");
  expect(out).not.toContain("substrate: finding"); // the old block is replaced, not dumped into the body
});

test("backfill: a `## Source of …` content heading is NOT mistaken for the citation (no false provenance)", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "lit", "over.md"), "# Over\n\n## Source of the wall\nnot a citation.\n\n## Citation\nReal, A. (2021).\n");
  ingest(root, ["backfill", "--apply"]);
  const out = read(root, ".promptus/docs/lit/over.md");
  const source = (out.match(/^source: (.*)$/m) ?? [])[1] ?? "";
  expect(source).toContain("Real, A. (2021)");   // the source is the actual citation
  expect(source).not.toContain("not a citation"); // NOT the content heading's text
  expect(out).toContain("## Source of the wall"); // the body itself is preserved verbatim
});

test("promote: an UPPERCASE TELOS.md link is re-pathed correctly (case-insensitive)", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "dr.md"), "# DR\n\n[t](TELOS.md)\n");
  ingest(root, ["promote", ".promptus/docs/dr.md", "--source", "x", "--apply"]);
  const out = read(root, ".promptus/docs/lit/dr.md");
  expect(out).toContain("](../../TELOS.md)");  // moved to .promptus/TELOS.md
  expect(out).not.toContain("](../TELOS.md)"); // the wrong one-level path
});

test("promote: an off-vocab --kind is refused with the allowed set, writing nothing", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "g.md"), "# G\n\nx.\n");
  const r = ingest(root, ["promote", ".promptus/docs/g.md", "--source", "s", "--kind", "BOGUS", "--apply"]);
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("not allowed for lit");
  expect(exists(root, ".promptus/docs/lit/g.md")).toBe(false); // nothing written
});
