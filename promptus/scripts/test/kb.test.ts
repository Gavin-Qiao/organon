/**
 * kb.test.ts — the round-trip contract for the store spine. Each test scaffolds a
 * throwaway project (a `.promptus/` namespace with the four stores + a copy of the
 * vocab), runs the real scripts through the bun binary, and asserts on what they
 * wrote. The derived index lives at `.promptus/cache/`. Run: `bun test`.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync,
  writeFileSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const DEFAULT_VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-test-"));
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
const amend = (root: string, args: string[]) => run("kb-amend.ts", ["--root", root, ...args]);
const index = (root: string, args: string[] = []) => run("kb-index.ts", ["--root", root, ...args]);
const find = (root: string, args: string[]) => run("kb-find.ts", ["--root", root, ...args]);
const read = (root: string, ...p: string[]) => readFileSync(join(root, ...p), "utf8");
// The four stores live under .promptus/; the derived catalog under .promptus/cache/.
const ledger = (root: string) => read(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
const catalog = (root: string) => read(root, ".promptus", "cache", "CATALOG.md");

test("kb-add round-trips a ledger unit, and kb-index lists it with substrate:status", () => {
  const root = scaffold();
  const r = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Chose bun over node"], "We picked bun for bun:sqlite.");
  expect(r.status).toBe(0);
  expect(ledger(root)).toMatch(/### \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] RESULT\/VALIDATED — Chose bun over node/);
  const id = /\(id (event-[^)]+)\)/.exec(r.stdout)?.[1];
  expect(id).toBeTruthy();
  expect(ledger(root)).toContain("<!-- kb:id " + id + " -->");
  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("ledger:VALIDATED · Chose bun over node");
});

test("kb-add --links round-trips a ledger unit exactly through authoritative reindexing", () => {
  const root = scaffold();
  expect(add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Psi provenance target"], "target").status).toBe(0);
  const written = add(root, [
    "--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED",
    "--title", "Connect Psi provenance", "--links", "psi-provenance-target",
  ], "The body deliberately carries no wikilink; --links is the only source of this edge.");
  expect(written.status).toBe(0);
  expect(ledger(root)).toContain("Related: [[psi-provenance-target]]");
  const before = catalog(root).split(/\r?\n/).find((line) => line.includes("Connect Psi provenance"));
  expect(before).toContain("[[psi-provenance-target]]");
  expect(index(root).status).toBe(0);
  const after = catalog(root).split(/\r?\n/).find((line) => line.includes("Connect Psi provenance"));
  expect(after).toBe(before);
});

test("kb-add preserves JavaScript replacement-token bytes in ledger prose", () => {
  const root = scaffold();
  const body = "Keep `$` and `$n > 0$`; also keep $&, $', and $$ literally.";
  const r = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Literal replacement tokens"], body);
  expect(r.status).toBe(0);
  const text = ledger(root);
  expect(text).toContain(body);
  expect(text.split("# Research Ledger — test")).toHaveLength(2);
  expect(text.split("<!-- kb:append-point -->")).toHaveLength(2);
});

test("kb-add writes finding → .promptus/docs/<slug>.md and lit → .promptus/docs/lit/<slug>.md", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Header beats vector at this scale"], "Because the corpus is small.");
  expect(existsSync(join(root, ".promptus", "docs", "header-beats-vector-at-this-scale.md"))).toBe(true);
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "KAG 2024", "--source", "arXiv:2409.13731#abstract"], "Mutual indexing.");
  const lit = join(root, ".promptus", "docs", "lit", "kag-2024.md");
  expect(existsSync(lit)).toBe(true);
  expect(readFileSync(lit, "utf8")).toContain("arXiv:2409.13731#abstract");
});

test("kb-amend classifies an existing page through the gate and mints its missing id", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "legacy.md"), "# Legacy note\n\nPreserve this body exactly.\n");
  const r = amend(root, ["--path", ".promptus/docs/legacy.md", "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED"]);
  expect(r.status).toBe(0);
  const text = read(root, ".promptus", "docs", "legacy.md");
  expect(text).toContain("id: finding-");
  expect(text).toContain("substrate: finding");
  expect(text).toContain("kind: CONCEPT");
  expect(text).toContain("status: VALIDATED");
  expect(text).toContain("Preserve this body exactly.");
  expect(catalog(root)).toContain("finding:VALIDATED · Legacy note");
});

test("kb-amend is dry-run-safe and refuses off-vocab status", () => {
  const root = scaffold();
  const path = join(root, ".promptus", "docs", "legacy.md");
  writeFileSync(path, "# Legacy note\n");
  const before = readFileSync(path, "utf8");
  const dry = amend(root, ["--path", ".promptus/docs/legacy.md", "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED", "--dry-run"]);
  expect(dry.status).toBe(0);
  expect(readFileSync(path, "utf8")).toBe(before);
  const bad = amend(root, ["--path", ".promptus/docs/legacy.md", "--substrate", "finding", "--kind", "CONCEPT", "--status", "OPEN"]);
  expect(bad.status).toBe(1);
  expect(readFileSync(path, "utf8")).toBe(before);
});

test("kb-amend adds compatibility aliases without changing identity or body", () => {
  const root = scaffold();
  const path = ".promptus/docs/current.md";
  const body = "# Current\r\n\r\nKeep exact bytes: $& and [[source]].\r\n";
  writeFileSync(join(root, path), "---\nid: finding-current\naliases: [first-name]\n---\n" + body);
  const args = ["--path", path, "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED"];
  expect(amend(root, [...args, "--alias", "old-name", "--alias", "first-name"]).status).toBe(0);
  const text = read(root, path);
  expect(text).toContain("id: finding-current\n");
  expect(text).toContain("aliases: [first-name, old-name]\n");
  expect(text.slice(text.indexOf("# Current"))).toBe(body);
  expect(catalog(root)).toContain("alias:old-name");
  expect(existsSync(join(root, ".promptus/cache/.locks/store.lock"))).toBe(false);
});

test("kb-amend rejects ambiguous aliases and unknown arguments without mutation", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus/docs/other.md"), "---\nid: finding-other\naliases: [other-alias]\n---\n# Other\n");
  const path = ".promptus/docs/current.md";
  writeFileSync(join(root, path), "# Current\n");
  const args = ["--path", path, "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED"];
  for (const extra of [["--alias", "finding-other"], ["--alias", "other"], ["--alias", "other-alias"], ["--alias", "bad,handle"], ["--aliases", "typo"], ["--source", "one\ntwo"], ["--status", "REFUTED"]]) {
    expect(amend(root, [...args, ...extra]).status).toBe(1);
    expect(read(root, path)).toBe("# Current\n");
    expect(existsSync(join(root, ".promptus/cache/.locks/store.lock"))).toBe(false);
  }
});

test("kb-amend dry-run alias validation leaves source and cache absent or unchanged", () => {
  const root = scaffold();
  const path = ".promptus/docs/current.md";
  writeFileSync(join(root, path), "# Current\n");
  const result = amend(root, ["--path", path, "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED", "--alias", "legacy", "--dry-run"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("aliases: [legacy]");
  expect(read(root, path)).toBe("# Current\n");
  expect(existsSync(join(root, ".promptus/cache"))).toBe(false);
});

test("kb-amend refuses symlinked files and stores outside its physical boundary", () => {
  const root = scaffold();
  const outside = scaffold();
  const target = join(outside, ".promptus/docs/external.md");
  writeFileSync(target, "# External\n");
  symlinkSync(target, join(root, ".promptus/docs/link.md"));
  symlinkSync(join(outside, ".promptus/docs"), join(root, ".promptus/docs/linked-store"));
  for (const path of [".promptus/docs/link.md", ".promptus/docs/linked-store/external.md"]) {
    const result = amend(root, ["--path", path, "--substrate", "finding", "--kind", "CONCEPT", "--status", "VALIDATED"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("symlink");
    expect(readFileSync(target, "utf8")).toBe("# External\n");
  }
});

test("kb-add rejects an unknown --status on a STRICT substrate, printing the allowed set", () => {
  const r = add(scaffold(), ["--substrate", "finding", "--kind", "CLAIM", "--status", "BOGUS", "--title", "x"]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("allowed:");
  expect(r.stderr).toContain("VALIDATED");
});

test("kb-add WARNS but writes an off-vocab status on the PERMISSIVE ledger", () => {
  const root = scaffold();
  const r = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "SURPRISING", "--title", "Odd result"], "huh");
  expect(r.status).toBe(0);
  expect(r.stderr).toContain("warning");
  expect(r.stderr).toContain("SURPRISING");
  expect(ledger(root)).toMatch(/RESULT\/SURPRISING — Odd result/);
});

test("kb-add rejects a lit unit with no --source", () => {
  const r = add(scaffold(), ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "No source paper"]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("requires --source");
});

test("kb-add rejects an empty --title", () => {
  const r = add(scaffold(), ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "   "]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("empty title");
});

test("kb-add --dry-run writes nothing but prints a well-formed unit", () => {
  const root = scaffold();
  const before = ledger(root);
  const r = add(root, ["--substrate", "ledger", "--kind", "DECISION", "--status", "VALIDATED", "--title", "Dry one", "--dry-run"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("[dry-run]");
  expect(r.stdout).toMatch(/### \[.*\] DECISION\/VALIDATED — Dry one/);
  expect(ledger(root)).toBe(before);
  expect(existsSync(join(root, ".promptus", "cache", "CATALOG.md"))).toBe(false);
});

test("kb-add --supersedes + kb-index marks the prior finding SUPERSEDED", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Old claim"], "v1");
  const id = /id:\s*(\S+)/.exec(read(root, ".promptus", "docs", "old-claim.md"))![1];
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "New claim", "--supersedes", id], "v2");
  index(root);
  expect(catalog(root)).toContain("finding:SUPERSEDED · Old claim");
});

test("memory supersession round-trips as a relation and retires only the derived old card", () => {
  const root = scaffold();
  expect(add(root, ["--substrate", "memory", "--kind", "project", "--status", "validated", "--title", "Old retrieval rule"], "Keep the old rule bytes.").status).toBe(0);
  const oldPath = join(root, ".promptus", "memory", "old-retrieval-rule.md");
  const oldBefore = readFileSync(oldPath);
  const oldId = /^id:\s*(\S+)$/m.exec(oldBefore.toString("utf8"))![1];
  expect(add(root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated",
    "--title", "New retrieval rule", "--supersedes", oldId,
  ], "Use the replacement rule.").status).toBe(0);
  const newPath = join(root, ".promptus", "memory", "new-retrieval-rule.md");
  const newBefore = readFileSync(newPath);
  expect(newBefore.toString("utf8")).toContain(`relations: ["supersedes:${oldId}"]`);

  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("memory:retired · Old retrieval rule");
  expect(catalog(root)).toContain("memory:validated · New retrieval rule");
  const graph = JSON.parse(read(root, ".promptus", "cache", "graph.json"));
  expect(graph.relations.some((edge: { type: string; to: string; resolved: boolean }) =>
    edge.type === "supersedes" && edge.to === oldId && edge.resolved)).toBe(true);
  expect(readFileSync(oldPath)).toEqual(oldBefore);
  expect(readFileSync(newPath)).toEqual(newBefore);
});

test("illegal substrate lifecycle mapping rejects writes and reindex before unit bytes change", () => {
  const root = scaffold();
  expect(add(root, ["--substrate", "memory", "--kind", "project", "--status", "validated", "--title", "Lifecycle old"], "old body").status).toBe(0);
  const oldPath = join(root, ".promptus", "memory", "lifecycle-old.md");
  const oldId = /^id:\s*(\S+)$/m.exec(readFileSync(oldPath, "utf8"))![1];
  expect(add(root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated",
    "--title", "Lifecycle new", "--supersedes", oldId,
  ], "new body").status).toBe(0);
  expect(index(root).status).toBe(0);
  const newPath = join(root, ".promptus", "memory", "lifecycle-new.md");
  const oldBefore = readFileSync(oldPath);
  const newBefore = readFileSync(newPath);
  const catalogBefore = catalog(root);
  const graphBefore = read(root, ".promptus", "cache", "graph.json");
  const vocabPath = join(root, ".promptus", "schema", "kb-vocab.json");
  const vocab = JSON.parse(readFileSync(vocabPath, "utf8"));
  vocab.relations.supersedes.inverse_status_by_substrate.memory = "SUPERSEDED";
  writeFileSync(vocabPath, JSON.stringify(vocab, null, 2) + "\n");

  const refused = add(root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated",
    "--title", "Lifecycle third", "--supersedes", oldId,
  ], "must not land");
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain('inverse status "SUPERSEDED" for memory');
  expect(existsSync(join(root, ".promptus", "memory", "lifecycle-third.md"))).toBe(false);

  const rejectedIndex = index(root);
  expect(rejectedIndex.status).not.toBe(0);
  expect(rejectedIndex.stderr).toContain('inverse status "SUPERSEDED" for memory');
  expect(readFileSync(oldPath)).toEqual(oldBefore);
  expect(readFileSync(newPath)).toEqual(newBefore);
  expect(catalog(root)).toBe(catalogBefore);
  expect(read(root, ".promptus", "cache", "graph.json")).toBe(graphBefore);
});

test("kb-add persists ledger ids so ledger-to-ledger supersession is authoritative", () => {
  const root = scaffold();
  const old = add(root, ["--substrate", "ledger", "--kind", "DECISION", "--status", "OPEN", "--title", "Choose the storage layout"], "Operator decision pending.");
  const oldId = /\(id (event-[^)]+)\)/.exec(old.stdout)?.[1];
  expect(oldId).toBeTruthy();
  const next = add(root, ["--substrate", "ledger", "--kind", "DECISION", "--status", "RESOLVED", "--title", "Use one repository", "--supersedes", oldId!], "Operator chose the monorepo.");
  expect(next.status).toBe(0);
  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("ledger:SUPERSEDED · Choose the storage layout");
  expect(catalog(root)).toContain("ledger:RESOLVED · Use one repository");
  const graph = JSON.parse(read(root, ".promptus", "cache", "graph.json"));
  expect(graph.relations.some((e: { type: string; to: string }) => e.type === "supersedes" && e.to === oldId)).toBe(true);
});

test("kb-index resolves legacy ledger relation ids by their minted title slug", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), [
    "# Ledger", "",
    "### [2026-07-02 17:37:08] DECISION/OPEN — Open: split the plugin?",
    "Pending.", "",
    "### [2026-07-02 17:54:20] DECISION/RESOLVED — Split the plugins",
    "Resolved.",
    "↳ supersedes event-20260702T213708Z-open-split-the-plugin", "",
    "<!-- kb:append-point -->", "",
  ].join("\n"));
  expect(index(root).status).toBe(0);
  expect(catalog(root)).toContain("ledger:SUPERSEDED · Open: split the plugin?");
});

test("kb-index rebuilds CATALOG.md + graph.json idempotently", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "A thing", "--links", "other-thing"], "links to [[other-thing]]");
  index(root);
  const c1 = catalog(root);
  index(root);
  expect(catalog(root)).toBe(c1);
  expect(existsSync(join(root, ".promptus", "cache", "graph.json"))).toBe(true);
});

test("kb-index leaves byte-identical derived projections untouched", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Stable projection"], "same bytes");
  expect(index(root).status).toBe(0);
  const old = new Date("2001-02-03T04:05:06.000Z");
  const paths = ["CATALOG.md", "graph.json", "search.json"].map((name) => join(root, ".promptus", "cache", name));
  for (const path of paths) utimesSync(path, old, old);

  expect(index(root).status).toBe(0);
  for (const path of paths) expect(statSync(path).mtimeMs).toBe(old.getTime());
});

test("kb-index flags a deliberately broken [[link]] and a true orphan", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Lonely"], "no links");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Points nowhere", "--links", "does-not-exist"], "see [[does-not-exist]]");
  const r = index(root);
  expect(r.stdout).toContain("unresolved");
  expect(r.stdout).toContain("does-not-exist");
  expect(r.stdout).toContain("orphan");
  expect(r.stdout).toContain("lonely");
});

test("kb-find returns the right units with substrate:status + path", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Bun was chosen"], "we use bun");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "CONJECTURED", "--title", "Maybe rust later"], "unrelated");
  index(root);
  const r = find(root, ["bun"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("finding:VALIDATED · Bun was chosen");
  expect(r.stdout).not.toContain("Maybe rust later");
});

test("kb-find retrieves a ledger entry and slices by status (anchor stays parseable)", () => {
  const root = scaffold();
  // DEADEND is now a KIND (the act of abandoning), not a STATUS (the claim's epistemic state)
  add(root, ["--substrate", "ledger", "--kind", "DEADEND", "--status", "REFUTED", "--title", "Graph DB overkill"], "dropped it");
  add(root, ["--substrate", "ledger", "--kind", "DECISION", "--status", "VALIDATED", "--title", "Chose header-first"], "picked it");
  index(root);
  const dead = find(root, ["", "--status", "REFUTED"]);
  expect(dead.stdout).toContain("ledger:REFUTED · Graph DB overkill");
  expect(dead.stdout).not.toContain("Chose header-first");
  const all = find(root, ["", "--substrate", "ledger"]);
  expect(all.stdout).toContain("Graph DB overkill"); // both events show even if
  expect(all.stdout).toContain("Chose header-first"); // they share a same-second timestamp
});

test("kb-add records a typed relation; kb-index graphs it; kb-export emits CiTO JSON-LD", () => {
  const root = scaffold();
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Base claim"], "base");
  const id = /id:\s*(\S+)/.exec(read(root, ".promptus", "docs", "base-claim.md"))![1];
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Refuter", "--rel", `refutes:${id}`], "nope");
  expect(read(root, ".promptus", "docs", "refuter.md")).toContain(`refutes:${id}`);
  index(root);
  const g = JSON.parse(read(root, ".promptus", "cache", "graph.json"));
  expect(g.relations.some((e: { type: string; cito?: string }) => e.type === "refutes" && e.cito === "cito:refutes")).toBe(true);
  const ex = run("kb-export.ts", ["--root", root]);
  expect(ex.status).toBe(0);
  expect(ex.stdout).toContain("cito:refutes");
  expect(ex.stdout).toContain("@graph");
});

test("kb-find handles a free-form compound status with spaces (the psi case)", () => {
  const root = scaffold();
  // a permissive-ledger entry whose status has spaces, e.g. psi's "CORRECTION + RESULT"
  const r = add(root, ["--substrate", "ledger", "--kind", "MISTAKE", "--status", "CORRECTION + RESULT", "--title", "compound status entry"], "body");
  expect(r.status).toBe(0); // permissive: warns but writes
  index(root);
  expect(catalog(root)).toContain("ledger:CORRECTION + RESULT · compound status entry");
  const found = find(root, ["compound"]);
  expect(found.stdout).toContain("compound status entry");
  const sliced = find(root, ["", "--status", "CORRECTION + RESULT"]);
  expect(sliced.stdout).toContain("compound status entry");
});

test("kb-index supports a non-default layout: a custom ledger path, root found via the schema", () => {
  const root = mkdtempSync(join(tmpdir(), "promptus-probatio-"));
  tmps.push(root);
  // No .promptus/TELOS.md — only the schema marks the root (a project whose direction lives elsewhere).
  mkdirSync(join(root, ".promptus", "schema"), { recursive: true });
  const vocab = JSON.parse(readFileSync(DEFAULT_VOCAB, "utf8"));
  vocab.substrates.ledger.store = ".promptus/docs/research-ledger.md";
  vocab.substrates.finding.store = ".promptus/docs";
  writeFileSync(join(root, ".promptus", "schema", "kb-vocab.json"), JSON.stringify(vocab));
  mkdirSync(join(root, ".promptus", "docs"), { recursive: true });
  writeFileSync(join(root, ".promptus", "docs", "research-ledger.md"), "# Ledger\n\n### [2026-06-19 18:50] DECISION/BUILT — a thing\nbody\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(root, ".promptus", "docs", "a-finding.md"), "---\nstatus: VALIDATED\n---\n# A finding\nbody\n");
  const r = index(root);
  expect(r.status).toBe(0);
  const cat = read(root, ".promptus", "cache", "CATALOG.md");
  expect(cat).toContain("ledger:BUILT · a thing");        // ledger parsed via the log path
  expect(cat).toContain("finding:VALIDATED · A finding"); // a real finding is indexed
  expect(cat).not.toContain("finding:? · Ledger");        // the ledger file is NOT double-indexed as a page
});

test("kb-add memory → one file per fact + a MEMORY.md index pointer", () => {
  const root = scaffold();
  const r = add(root, ["--substrate", "memory", "--kind", "preference", "--status", "validated", "--title", "Prefers bun", "--desc", "uses bun + uv"], "The operator prefers bun and uv.");
  expect(r.status).toBe(1); // 'preference' is not an allowed memory kind
  const ok = add(root, ["--substrate", "memory", "--kind", "feedback", "--status", "validated", "--title", "Prefers bun", "--desc", "uses bun + uv"], "The operator prefers bun and uv.");
  expect(ok.status).toBe(0);
  expect(existsSync(join(root, ".promptus", "memory", "prefers-bun.md"))).toBe(true);
  expect(read(root, ".promptus", "memory", "prefers-bun.md")).toContain("type: feedback");
  expect(read(root, ".promptus", "memory", "MEMORY.md")).toContain("- [Prefers bun](prefers-bun.md) — uses bun + uv");
});

test("kb-add with a missing vocab re-seeds the template instead of hard-failing (the hand-append trap)", () => {
  const root = scaffold();
  rmSync(join(root, ".promptus", "schema", "kb-vocab.json")); // fresh-clone / repo-split state: Telos marks the root, the vocab is gone
  const r = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "gate survives a missing vocab"], "written through the re-seeded gate");
  expect(r.status).toBe(0);
  expect(r.stderr).toContain("re-seeded the template vocab");
  expect(existsSync(join(root, ".promptus", "schema", "kb-vocab.json"))).toBe(true);
  expect(read(root, ".promptus", "ledger", "RESEARCH-LEDGER.md")).toContain("gate survives a missing vocab");
  // and the next write is quiet — the marker is back
  const again = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "second write is quiet"], "no warning now");
  expect(again.status).toBe(0);
  expect(again.stderr).not.toContain("re-seeded");
});

test("kb-find --help names the flags that already existed (discoverability, not new machinery)", () => {
  const r = run("kb-find.ts", ["--help"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("--substrate");
  expect(r.stdout).toContain("--status");
  expect(r.stdout).toContain("--snippet");
  expect(r.stdout).toContain("kb-get");
});
