#!/usr/bin/env bun
/**
 * kb-find.ts — header-first retrieval. No embeddings, no DB (see the invariant):
 * a hand-written header beats a vector for a small, dense, status-tagged corpus.
 *
 * Usage: kb-find "<query>" [--substrate <s>] [--status <st>] [--hops <n>]
 *                          [--limit <n>] [--snippet] [--root <dir>]
 *
 *   1. Read .promptus/CATALOG.md as the primary index (the card-catalog).
 *   2. Score catalog headers against the query; grep store bodies for sub-header recall —
 *      UNIT-SCOPED, so a ledger term matches only the entry that holds it, not every entry
 *      that shares the ledger file (the de-noise: lexical matching stays the script's job,
 *      done at the right granularity; relevance stays the model's).
 *   3. Walk graph.json up to --hops for multi-hop (associative) retrieval.
 *   4. --substrate / --status slice epistemically; --limit caps the result (reporting
 *      "N of M"); --snippet attaches the matched line so the caller judges relevance
 *      header-first, without opening the file.
 *   5. Emit matches as `substrate:status · title · path` — transparent, so the caller
 *      (the recall skill) can open each and verify the claim against its source.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { unitText } from "./lib/units.ts";

interface Card { substrate: string; status: string; title: string; path: string; links: string[] }

function parseCatalog(text: string): Card[] {
  // Split on the ` · ` delimiter rather than a token regex, so a free-form status
  // with spaces (e.g. a psi-style "CORRECTION + RESULT") still parses.
  const cards: Card[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(" · ");
    if (parts.length < 3) continue;
    const ci = parts[0].indexOf(":");
    if (ci < 1) continue;
    const substrate = parts[0].slice(0, ci);
    const status = parts[0].slice(ci + 1).trim();
    if (!substrate || !status) continue;
    const links = parts[3] ? Array.from(parts[3].matchAll(/\[\[([^\]]+)\]\]/g)).map((x) => x[1]) : [];
    cards.push({ substrate, status, title: parts[1], path: parts[2], links });
  }
  return cards;
}

const slugOf = (p: string) => p.split("#")[0].split("/").pop()!.replace(/\.md$/, "");

// Unit-scoped body text (the de-noise) lives in lib/units.ts, shared with kb-get: a ledger term
// must match only THAT entry's slice, not every entry in the shared file. unitText(root, path, title).

/** The first line of the unit that holds a query term — the snippet the caller judges from. */
function snippetOf(root: string, card: Card, terms: string[]): string {
  for (const ln of unitText(root, card.path, card.title).split("\n")) {
    if (terms.some((t) => ln.toLowerCase().includes(t))) {
      const s = ln.replace(/^[#>\s-]+/, "").trim().replace(/\s+/g, " ");
      if (s) return s.length > 120 ? s.slice(0, 117) + "…" : s;
    }
  }
  return "";
}

function main(argv: string[]): number {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2), next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[k] = ""; // boolean flag, e.g. --snippet
      else (flags[k] = next), i++;
    } else positionals.push(argv[i]);
  }
  const flag = (k: string): string | undefined => flags[k];
  const query = positionals[0] ?? "";
  const root = findProjectRoot(flag("root") ?? process.cwd());
  const dir = derivedDir(root);
  const catalogFile = join(dir, "CATALOG.md");
  if (!existsSync(catalogFile)) { console.error("kb-find: no catalog — run `bun scripts/kb-index.ts` first."); return 1; }

  let cards = parseCatalog(readFileSync(catalogFile, "utf8"));
  const subF = flag("substrate"), stF = flag("status");
  if (subF) cards = cards.filter((c) => c.substrate === subF);
  if (stF) cards = cards.filter((c) => c.status === stF);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (c: Card) =>
    terms.reduce((s, t) => s + (c.title.toLowerCase().includes(t) ? 2 : 0) + (c.path.toLowerCase().includes(t) ? 1 : 0), 0);

  // key by full card identity, not path — ledger entries share the ledger file path
  const key = (c: Card) => `${c.substrate}\t${c.status}\t${c.title}\t${c.path}`;
  const picked = new Map<string, { c: Card; s: number }>();
  for (const c of cards) {
    const s = score(c);
    if (terms.length === 0 || s > 0) picked.set(key(c), { c, s });
  }
  // sub-header recall: grep the bodies the headers didn't advertise — UNIT-SCOPED, so a ledger
  // term matches only the entry that contains it, not every entry in the shared ledger file.
  if (terms.length) {
    for (const c of cards) {
      if (picked.has(key(c))) continue;
      const body = unitText(root, c.path, c.title).toLowerCase();
      if (body && terms.some((t) => body.includes(t))) picked.set(key(c), { c, s: 1 });
    }
  }
  // graph-walk for associative neighbours
  const hops = Number(flag("hops") ?? 0);
  if (hops > 0 && existsSync(join(dir, "graph.json"))) {
    const g = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")) as { out: Record<string, string[]> };
    const seen = new Set([...picked.values()].map((x) => slugOf(x.c.path)));
    let frontier = [...seen];
    for (let h = 0; h < hops; h++) {
      const next: string[] = [];
      for (const n of frontier) for (const t of g.out[n] ?? []) if (!seen.has(t)) (seen.add(t), next.push(t));
      frontier = next;
    }
    for (const c of cards) if (seen.has(slugOf(c.path)) && !picked.has(key(c))) picked.set(key(c), { c, s: 0 });
  }

  const hits = [...picked.values()].sort((a, b) => b.s - a.s);
  if (!hits.length) { console.log("kb-find: no matches."); return 0; }
  const wantSnip = "snippet" in flags;
  const limit = Number(flag("limit") ?? 0);
  const shown = limit > 0 ? hits.slice(0, limit) : hits;
  for (const { c } of shown) {
    const snip = wantSnip ? snippetOf(root, c, terms) : "";
    console.log(`${c.substrate}:${c.status} · ${c.title} · ${c.path}${snip ? `\n    ↳ ${snip}` : ""}`);
  }
  if (shown.length < hits.length) console.log(`  … ${shown.length} of ${hits.length} shown — raise --limit for more.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
