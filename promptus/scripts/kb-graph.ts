#!/usr/bin/env bun
/**
 * kb-graph.ts — query the [[link]] graph kb-index already built. No embeddings: the links
 * ARE the graph, centrality is plain graph math (PageRank, as HippoRAG does it but without
 * the vectors), and a dangling handle is found by string match. Reads the derived
 * .promptus/cache/graph.json (+ CATALOG.md for titles); rerun kb-index if they are stale.
 *
 * Usage:
 *   kb-graph lint  [--strict]     structural health — dangling [[handles]] (with a "did you
 *                                 mean?" by slug similarity) + orphans (nothing links in or out).
 *                                 --strict exits non-zero when anything is flagged (gates a checkpoint).
 *   kb-graph rank  [--top <n>]    load-bearing units by PageRank over the page-link graph,
 *                                 with in/out degree alongside. [default --top 20]
 *   kb-graph suggest [--top <n>] [--knn <k>] [--soft]
 *                                 latent links — unit pairs that are unlinked but probably related
 *                                 (IDF-weighted shared vocabulary + a shared source). A broad "hub" note
 *                                 is tamed by reciprocal best-match pruning (mutual-KNN), or by Mutual
 *                                 Proximity rescaling with --soft (rank hubs down, don't delete edges).
 *                                 Suggest-only, with the "why"; you draw the [[link]] if apt. [--top 15 --knn 6]
 *   kb-graph [--root <dir>]       (defaults to `lint`)
 *
 * PageRank runs over page units (the durable [[link]] web — findings/lit/memory); in-degree is
 * the raw count of resolved incoming links, which also counts a ledger entry that cites a page.
 * `suggest` is Roam/Obsidian "unlinked references" without the ML: lexical match is the script's
 * job, judging whether the link is real stays the human's (the same discipline as the de-noise).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { readCached } from "./lib/units.ts";

interface Graph { nodes: string[]; out: Record<string, string[]>; inDeg: Record<string, number> }

const slugOf = (path: string) => path.split("#")[0].split("/").pop()!.replace(/\.md$/, "");

/** slug → "substrate:status · title", parsed from the card-catalog so output reads in plain language. */
function labels(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  const f = join(dir, "CATALOG.md");
  if (!existsSync(f)) return m;
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const p = raw.trim().split(" · ");
    if (p.length < 3 || p[0].indexOf(":") < 1) continue;
    if (!p[2].includes("#")) m.set(slugOf(p[2]), `${p[0]}  ${p[1]}`); // page units only (no anchor)
  }
  return m;
}

// ── String similarity for "did you mean?" — token Jaccard, whole-slug containment, and edit
// distance, maxed. Catches the three ways a handle drifts: a missing word (adoption →
// adoption-guide), a contained typo, and a near-miss spelling. No embeddings needed. ──
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function similar(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const jac = ta.size + tb.size ? inter / new Set([...ta, ...tb]).size : 0;
  const contain = a.includes(b) || b.includes(a) ? 0.6 : 0;
  const edit = 1 - lev(a, b) / Math.max(a.length, b.length);
  return Math.max(jac, contain, edit);
}
function nearest(handle: string, nodes: string[]): string {
  let best = "", score = 0;
  for (const n of nodes) { const s = similar(handle, n); if (s > score) (score = s), (best = n); }
  return score >= 0.5 ? best : "";
}

/** PageRank over the page-link subgraph (edges between nodes only). Power iteration, damping 0.85. */
function pageRank(nodes: string[], out: Record<string, string[]>): Map<string, number> {
  const set = new Set(nodes), N = nodes.length;
  const adj = new Map(nodes.map((n) => [n, (out[n] ?? []).filter((t) => set.has(t) && t !== n)]));
  let pr = new Map(nodes.map((n) => [n, 1 / N]));
  const d = 0.85;
  for (let it = 0; it < 60; it++) {
    const next = new Map(nodes.map((n) => [n, (1 - d) / N]));
    let sink = 0;
    for (const n of nodes) {
      const outs = adj.get(n)!;
      if (outs.length) { const share = (d * pr.get(n)!) / outs.length; for (const t of outs) next.set(t, next.get(t)! + share); }
      else sink += (d * pr.get(n)!) / N; // a node with no intra-graph out-link spreads its mass evenly
    }
    if (sink) for (const n of nodes) next.set(n, next.get(n)! + sink);
    pr = next;
  }
  return pr;
}

function lint(g: Graph, lab: Map<string, string>, strict: boolean): number {
  const set = new Set(g.nodes);
  const dangling: Array<{ from: string; to: string; hint: string }> = [];
  for (const [from, tos] of Object.entries(g.out)) for (const to of tos) if (!set.has(to)) dangling.push({ from: slugOf(from), to, hint: nearest(to, g.nodes) });
  const orphans = g.nodes.filter((n) => (g.inDeg[n] ?? 0) === 0 && (g.out[n] ?? []).length === 0);

  if (dangling.length) {
    console.log(`dangling [[handles]] (${dangling.length}) — the link's target is not a unit:`);
    for (const d of dangling) console.log(`    ${d.from} → [[${d.to}]]${d.hint ? `    did you mean: ${d.hint}?` : ""}`);
  }
  if (orphans.length) {
    console.log(`orphans (${orphans.length}) — nothing links in or out (wire them in, or retire them):`);
    for (const o of orphans) console.log(`    ${o}${lab.has(o) ? `    (${lab.get(o)})` : ""}`);
  }
  if (!dangling.length && !orphans.length) console.log("kb-graph lint: clean — no dangling handles, no orphans.");
  return strict && dangling.length + orphans.length > 0 ? 1 : 0;
}

function rank(g: Graph, lab: Map<string, string>, top: number): number {
  if (!g.nodes.length) { console.log("kb-graph rank: no page units to rank."); return 0; }
  const pr = pageRank(g.nodes, g.out);
  const set = new Set(g.nodes);
  const outDeg = (n: string) => (g.out[n] ?? []).filter((t) => set.has(t)).length;
  const ranked = [...g.nodes].sort((a, b) => pr.get(b)! - pr.get(a)! || (g.inDeg[b] ?? 0) - (g.inDeg[a] ?? 0));
  console.log(`kb-graph rank — load-bearing units (PageRank over the page-link graph):`);
  ranked.slice(0, top).forEach((n, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${pr.get(n)!.toFixed(4)}  in${g.inDeg[n] ?? 0} out${outDeg(n)}  ${lab.get(n) ?? n}  (${n})`);
  });
  if (g.nodes.length > top) console.log(`  … ${top} of ${g.nodes.length} shown — raise --top for more.`);
  return 0;
}

// ── Latent links (slice 2). IDF-weighted shared vocabulary (so ubiquitous words like
// "promptus"/"the" carry ~no signal and a rare shared term like "pagerank" carries a lot) plus a
// shared source. Suggest-only: the script proposes, the human draws the edge. ──
const STOP = new Set("the a an and or of to in on for is it this that with as by at be are was were from not but its their our we you they i he she them his her also can will would could should has have had do does did so if then than into over under more most such which who whom what when where why how all any each both few many much other some only own same too very".split(" "));
const termFreq = (text: string): Map<string, number> => {
  const tf = new Map<string, number>();
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/)) if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
};

interface Doc { slug: string; path: string; label: string; tf: Map<string, number>; source: string; vec: Map<string, number>; norm: number }

/** Page units (skip ledger entries — events aren't link targets), each with its text + source. */
function pageDocs(root: string, dir: string): Doc[] {
  const f = join(dir, "CATALOG.md");
  if (!existsSync(f)) return [];
  const docs: Doc[] = [];
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const p = raw.trim().split(" · ");
    if (p.length < 3 || p[0].indexOf(":") < 1 || p[2].includes("#")) continue; // skip headers / ledger entries
    const { data, body } = parseFrontmatter(readCached(join(root, p[2])));
    const source = typeof data.source === "string" ? data.source.split("#")[0].trim() : "";
    docs.push({ slug: slugOf(p[2]), path: p[2], label: `${p[0]}  ${p[1]}`, tf: termFreq(`${body} ${data.title ?? ""} ${data.description ?? ""}`), source, vec: new Map(), norm: 1 });
  }
  return docs;
}

function suggest(root: string, dir: string, g: Graph, top: number, knn: number, soft: boolean): number {
  const docs = pageDocs(root, dir);
  if (docs.length < 2) { console.log("kb-graph suggest: need at least two page units."); return 0; }
  const N = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1; // smoothed; a term in every doc ≈ 1, a rare term ≫ 1
  // Plain tf·idf cosine. (Tried idf² to sink the broad design-doc's faint matches — but it
  // over-sharpened: each doc's norm became dominated by its own rarest terms, which shrank genuine
  // cross-doc links like graphrag⟷hipporag. The flood is pruned structurally instead — see the
  // mutual-KNN gate below — so the weighting stays honest and the `why` still names the shared terms.)
  for (const d of docs) {
    let s = 0;
    for (const [t, f] of d.tf) { const w = f * idf(t); d.vec.set(t, w); s += w * w; }
    d.norm = Math.sqrt(s) || 1;
  }
  const linked = new Set<string>();
  for (const [a, tos] of Object.entries(g.out)) for (const t of tos) linked.add([slugOf(a), t].sort().join("\t"));

  // One O(N²) pass over the unlinked pairs: tf·idf cosine + shared-source, each kept as a candidate
  // cell (with its "why"). nbr[i] collects i's above-floor neighbours so the gate below can rank them.
  interface Cell { i: number; j: number; cos: number; score: number; sharedSrc: boolean; why: string }
  const cells: Cell[] = [];
  const nbr: Array<Array<{ o: number; cos: number }>> = docs.map(() => []);
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i], b = docs[j];
    if (linked.has([a.slug, b.slug].sort().join("\t"))) continue; // already wired — nothing latent here
    const [small, large] = a.vec.size < b.vec.size ? [a, b] : [b, a];
    let dot = 0;
    const contrib: Array<[string, number]> = [];
    for (const [t, w] of small.vec) { const w2 = large.vec.get(t); if (w2) { dot += w * w2; contrib.push([t, w * w2]); } }
    const cos = dot / (a.norm * b.norm);
    const sharedSrc = a.source !== "" && a.source === b.source;
    if (!sharedSrc && cos < 0.08) continue; // floor: ignore faint lexical noise; a shared source always shows
    if (cos >= 0.08) { nbr[i].push({ o: j, cos }); nbr[j].push({ o: i, cos }); }
    contrib.sort((x, y) => y[1] - x[1]);
    const terms = contrib.slice(0, 4).map((c) => c[0]).join(", ");
    const why = [sharedSrc ? `shared source ${a.source}` : "", terms].filter(Boolean).join(" · ");
    cells.push({ i, j, cos, score: cos + (sharedSrc ? 0.5 : 0), sharedSrc, why });
  }
  // Two ways to tame a broad "hub" note that is similar to everything (hubness; Radovanović 2010).
  // Default — Mutual-KNN: each unit keeps only its top-`knn` lexical neighbours, and a lexical pair
  // survives only when the interest is reciprocal, so a hub (in few units' top lists) is pruned out.
  // --soft — Mutual Proximity (Schnitzer 2012): don't delete edges, RESCALE. A pair scores by how high
  // each unit ranks in the other's neighbourhood (rank-fraction product), so a hub sinks instead of
  // being cut — softer and not k-sensitive. A shared source bypasses either gate.
  let pairs: Array<{ a: string; b: string; score: number; why: string }>;
  if (soft) {
    const M = docs.length, denom = Math.max(1, M - 2);
    // rank-fraction: of the other units, how many does cosine `pc` strictly outrank in unit i's view
    // (every below-floor unit counts, since pc cleared the floor). A hub lands low on both sides.
    const rankFrac = (i: number, pc: number) => {
      let lt = 0; for (const e of nbr[i]) if (e.cos < pc) lt++;
      return (lt + (M - 1 - nbr[i].length)) / denom;
    };
    pairs = cells.map((c) => ({
      a: docs[c.i].slug, b: docs[c.j].slug,
      score: rankFrac(c.i, c.cos) * rankFrac(c.j, c.cos) + (c.sharedSrc ? 0.5 : 0),
      why: c.why,
    }));
  } else {
    const topk = nbr.map((list) => new Set(list.sort((x, y) => y.cos - x.cos).slice(0, knn).map((e) => e.o)));
    pairs = cells
      .filter((c) => c.sharedSrc || (topk[c.i].has(c.j) && topk[c.j].has(c.i)))
      .map((c) => ({ a: docs[c.i].slug, b: docs[c.j].slug, score: c.score, why: c.why }));
  }
  pairs.sort((x, y) => y.score - x.score);
  if (!pairs.length) { console.log("kb-graph suggest: no latent links above the floor — the web is well-knit (or too sparse)."); return 0; }
  console.log("kb-graph suggest — latent links (unlinked but related; draw a [[link]] if apt):");
  pairs.slice(0, top).forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.score.toFixed(3)}  ${p.a} ⟷ ${p.b}    (${p.why})`));
  if (pairs.length > top) console.log(`  … ${top} of ${pairs.length} shown — raise --top for more.`);
  return 0;
}

function main(argv: string[]): number {
  const flags: Record<string, string> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { const k = argv[i].slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith("--")) flags[k] = ""; else (flags[k] = v), i++; }
    else pos.push(argv[i]);
  }
  const cmd = pos[0] ?? "lint";
  const root = findProjectRoot(flags.root ?? process.cwd());
  const dir = derivedDir(root);
  const gf = join(dir, "graph.json");
  if (!existsSync(gf)) { console.error("kb-graph: no graph — run `bun scripts/kb-index.ts` first."); return 1; }
  const g = JSON.parse(readFileSync(gf, "utf8")) as Graph;
  const lab = labels(dir);

  if (cmd === "lint") return lint(g, lab, "strict" in flags);
  if (cmd === "rank") return rank(g, lab, Number(flags.top || 20));
  if (cmd === "suggest") return suggest(root, dir, g, Number(flags.top || 15), Number(flags.knn || 6), "soft" in flags);
  console.error(`kb-graph: unknown command "${cmd}" — use lint | rank | suggest.`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
