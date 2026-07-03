/**
 * graph.test.ts — the graph-query contract (kb-graph). Two commands over the derived
 * graph.json: `rank` (PageRank surfaces load-bearing units — and must beat raw degree when
 * the link structure says so) and `lint` (dangling [[handles]] with a "did you mean?" by slug
 * similarity, plus orphans). Each test scaffolds a throwaway `.promptus/` project, builds a
 * known little graph with the real scripts, and asserts on the query. Run: `bun test`.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const DEFAULT_VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-graph-"));
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
// edges flow purely through body [[links]] (kb-index extracts them) — no --links, so a
// multi-link note can't leave a comma-joined frontmatter string masquerading as a dangling handle.
const finding = (root: string, title: string, links: string[] = [], body = "x") =>
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", title], `${body} ${links.map((l) => `[[${l}]]`).join(" ")}`);

test("kb-graph rank: PageRank surfaces the hub everything points at", () => {
  const root = scaffold();
  finding(root, "a hub");                       // slug a-hub — the target
  for (const t of ["b one", "c two", "d three"]) finding(root, t, ["a-hub"]); // all link IN to the hub
  index(root);
  const out = graph(root, ["rank"]).stdout;
  const top = out.split(/\r?\n/).find((l) => /^\s*1\./.test(l)) ?? "";
  expect(top).toContain("a-hub"); // the hub ranks first
});

test("kb-graph rank: PageRank beats raw in-degree when the link structure says so", () => {
  const root = scaffold();
  // `authority` has ONE link in — but from `hub`, which 4 leaves point at (so hub carries real mass).
  // `popular` has TWO links in, but only from bare leaves. PageRank must rank authority ABOVE popular:
  // who links to you matters more than how many. A degree count would (wrongly) put popular first.
  finding(root, "authority");
  finding(root, "hub", ["authority"]);                          // hub → authority (authority in=1)
  for (const l of ["la", "lb", "lc", "ld"]) finding(root, l, ["hub"]); // 4 leaves → hub (hub in=4)
  finding(root, "popular");
  for (const l of ["pa", "pb"]) finding(root, l, ["popular"]);  // 2 leaves → popular (popular in=2)
  index(root);
  const order = graph(root, ["rank"]).stdout.split(/\r?\n/).filter((l) => /^\s*\d+\./.test(l));
  const iAuthority = order.findIndex((l) => l.includes("(authority)"));
  const iPopular = order.findIndex((l) => l.includes("(popular)"));
  expect(iAuthority).toBeGreaterThanOrEqual(0);
  expect(iPopular).toBeGreaterThanOrEqual(0);
  expect(iAuthority).toBeLessThan(iPopular);          // ranked higher despite fewer links in…
  expect(order[iAuthority]).toContain("in1");          // …because it has only 1 inbound link…
  expect(order[iPopular]).toContain("in2");            // …while popular has 2 — so this is PageRank, not degree
});

test("kb-graph lint: a dangling [[handle]] is flagged with a 'did you mean?' suggestion", () => {
  const root = scaffold();
  finding(root, "adoption guide");           // slug adoption-guide
  finding(root, "packaging", ["adoption"]);  // links to [[adoption]] — no such unit
  index(root);
  const out = graph(root, ["lint"]).stdout;
  expect(out).toContain("[[adoption]]");                  // the broken handle named
  expect(out).toContain("did you mean: adoption-guide");  // the nearest real slug suggested
});

test("kb-graph lint: an orphan is listed; a connected unit is not", () => {
  const root = scaffold();
  finding(root, "lonely one");                 // nothing in or out — an orphan
  finding(root, "y target");                   // receives a link (in-degree 1) — not an orphan
  finding(root, "x source", ["y-target"]);     // emits a link (out-degree 1) — not an orphan
  index(root);
  const out = graph(root, ["lint"]).stdout;
  expect(out).toContain("lonely-one");
  expect(out).not.toContain("y-target");       // a unit with any edge is not flagged
});

test("kb-graph lint --strict: exits non-zero on a flaw, zero when clean", () => {
  const dirty = scaffold();
  finding(dirty, "island");                    // an orphan
  index(dirty);
  expect(graph(dirty, ["lint", "--strict"]).status).toBe(1);

  const clean = scaffold();
  finding(clean, "anchor");
  finding(clean, "spoke", ["anchor"]);         // anchor in1, spoke out1 — both connected, no dangling
  index(clean);
  const r = graph(clean, ["lint", "--strict"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("clean");
});

test("kb-graph rank --top caps the list and reports how many it held back", () => {
  const root = scaffold();
  finding(root, "a hub");
  for (const t of ["b one", "c two"]) finding(root, t, ["a-hub"]);
  index(root);
  const out = graph(root, ["rank", "--top", "1"]).stdout;
  expect(out.split(/\r?\n/).filter((l) => /^\s*\d+\./.test(l)).length).toBe(1);
  expect(out).toContain("of 3 shown");
});

test("kb-graph with no graph yet asks for an index instead of crashing", () => {
  const r = graph(scaffold(), ["rank"]);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("kb-index");
});

// ---- suggest: latent links (unlinked but related) ----

test("kb-graph suggest: surfaces an unlinked pair that shares distinctive vocabulary", () => {
  const root = scaffold();
  finding(root, "alpha note", [], "the quokkafoo algorithm relies on wobblezinc indexing throughout");
  finding(root, "beta note", [], "wobblezinc indexing pairs naturally with the quokkafoo algorithm");
  finding(root, "filler one", [], "unrelated content about sailing boats and harbours");
  finding(root, "filler two", [], "a different topic entirely concerning baking bread and ovens");
  index(root);
  const out = graph(root, ["suggest"]).stdout;
  const pair = out.split(/\r?\n/).find((l) => l.includes("alpha-note") && l.includes("beta-note")) ?? "";
  expect(pair).not.toBe("");                     // the two related notes are paired
  expect(pair).toMatch(/quokkafoo|wobblezinc/);  // the "why" names the distinctive shared terms, not stopwords
});

test("kb-graph suggest: never proposes a pair that is already linked", () => {
  const root = scaffold();
  finding(root, "alpha note", ["beta-note"], "the quokkafoo algorithm relies on wobblezinc indexing"); // alpha → beta
  finding(root, "beta note", [], "wobblezinc indexing pairs with the quokkafoo algorithm");
  finding(root, "filler one", [], "unrelated sailing boats and harbours");
  index(root);
  const out = graph(root, ["suggest"]).stdout;
  const paired = out.split(/\r?\n/).some((l) => l.includes("alpha-note") && l.includes("beta-note"));
  expect(paired).toBe(false); // already wired — nothing latent to suggest
});

test("kb-graph suggest: pairs two units citing the same source, even with little text overlap", () => {
  const root = scaffold();
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "paper one", "--source", "arXiv:5555#intro"], "discusses zebras and quasars at length");
  add(root, ["--substrate", "lit", "--kind", "PAPER", "--status", "CITE", "--title", "paper two", "--source", "arXiv:5555#results"], "covers entirely different mushrooms and tides");
  finding(root, "filler", [], "noise about spreadsheets and columns");
  index(root);
  const out = graph(root, ["suggest"]).stdout;
  const pair = out.split(/\r?\n/).find((l) => l.includes("paper-one") && l.includes("paper-two")) ?? "";
  expect(pair).not.toBe("");                          // shared source links them despite disjoint prose
  expect(pair).toContain("shared source arXiv:5555"); // and the reason is named
});

test("kb-graph suggest --knn: mutual-KNN prunes a broad doc that is no focused doc's best match", () => {
  // Two tight clusters (each pair shares a distinctive term) plus a `broad` doc that touches BOTH
  // clusters faintly. broad clears the cosine floor against every leaf — so on a tiny corpus it
  // floods in — but it is no leaf's *best* match (each leaf's best is its cluster partner). The
  // mutual-KNN gate (reciprocal top-k) is what removes it, which is the real-corpus flood fix.
  const root = scaffold();
  finding(root, "topic a one", [], "alphaterm alphaterm alphaterm distincta distincta foo");
  finding(root, "topic a two", [], "alphaterm alphaterm alphaterm distincta distincta bar");
  finding(root, "topic b one", [], "betaterm betaterm betaterm distinctb distinctb baz");
  finding(root, "topic b two", [], "betaterm betaterm betaterm distinctb distinctb qux");
  finding(root, "broad", [], "alphaterm alphaterm betaterm betaterm gamma delta");
  index(root);
  // default knn (6): the corpus is tiny, every node sees all its neighbours, so broad still floods in.
  const wide = graph(root, ["suggest"]).stdout;
  expect(wide).toContain("broad"); // without the gate, the broad doc pairs with every leaf
  // knn=1: a pair survives only when each is the other's single best match. broad tops neither
  // cluster, so it is pruned entirely; the within-cluster pairs (mutual-best) survive.
  const tight = graph(root, ["suggest", "--knn", "1"]).stdout;
  expect(tight).not.toContain("broad");                 // the flood source is gone
  expect(tight).toContain("topic-a-one ⟷ topic-a-two"); // the genuine cluster link survives
  expect(tight).toContain("topic-b-one ⟷ topic-b-two");
});

test("kb-graph suggest --soft: Mutual Proximity ranks the genuine cluster pair above the broad hub", () => {
  // Same scaffold as the mutual-KNN test. --soft keeps every edge (no hard prune) but RESCALES by
  // rank-fraction, so the broad hub — high similarity to all, but top of none — sinks below the
  // within-cluster pairs (which are each other's best). The #1 suggestion must be a real cluster pair.
  const root = scaffold();
  finding(root, "topic a one", [], "alphaterm alphaterm alphaterm distincta distincta foo");
  finding(root, "topic a two", [], "alphaterm alphaterm alphaterm distincta distincta bar");
  finding(root, "topic b one", [], "betaterm betaterm betaterm distinctb distinctb baz");
  finding(root, "topic b two", [], "betaterm betaterm betaterm distinctb distinctb qux");
  finding(root, "broad", [], "alphaterm alphaterm betaterm betaterm gamma delta");
  index(root);
  const out = graph(root, ["suggest", "--soft"]).stdout;
  const top = out.split(/\r?\n/).find((l) => /^\s*1\./.test(l)) ?? "";
  expect(top).not.toContain("broad");                                            // the hub is rescaled down, not #1
  expect(top).toMatch(/topic-a-one ⟷ topic-a-two|topic-b-one ⟷ topic-b-two/);   // a within-cluster pair leads
});
