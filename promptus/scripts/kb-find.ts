#!/usr/bin/env bun
/**
 * kb-find.ts — bounded, status-aware lexical retrieval over Promptus units.
 *
 * Markdown remains authoritative. kb-index derives search.json; this command
 * validates that index against CATALOG.md and falls back to an in-memory rebuild
 * when an older cache has no lexical index yet.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import {
  buildSearchIndex, SEARCH_INDEX_SCHEMA, searchIndex, searchTokens,
  type SearchDocument, type SearchIndex, type SearchSourceDocument,
} from "./lib/search.ts";
import { unitText } from "./lib/units.ts";

interface Card { substrate: string; status: string; title: string; path: string; id?: string; links: string[] }

function parseCatalog(text: string): Card[] {
  const cards: Card[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(" · ");
    if (parts.length < 3) continue;
    const ci = parts[0].indexOf(":");
    if (ci < 1) continue;
    const substrate = parts[0].slice(0, ci);
    const status = parts[0].slice(ci + 1).trim();
    if (!substrate || !status) continue;
    const metadata = parts.slice(3).join(" · ");
    const id = /(?:^|\s)id:(\S+)/.exec(metadata)?.[1];
    const links = Array.from(metadata.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1]);
    cards.push({ substrate, status, title: parts[1], path: parts[2], id, links });
  }
  return cards;
}

const slugOf = (path: string) => path.split("#")[0].split("/").pop()!.replace(/\.md$/, "");
const graphKeyOf = (document: SearchDocument) => document.id ?? (document.path.includes("#") ? document.path : slugOf(document.path));

function snippetOf(root: string, document: SearchDocument, terms: string[]): string {
  for (const line of unitText(root, document.path, document.title).split("\n")) {
    const normalized = line.toLowerCase();
    if (!terms.length || terms.some((term) => normalized.includes(term))) {
      const snippet = line.replace(/^[#>\s-]+/, "").trim().replace(/\s+/g, " ");
      if (snippet) return snippet.length > 120 ? snippet.slice(0, 117) + "…" : snippet;
    }
  }
  return "";
}

const HELP = `kb-find — ranked, bounded lexical retrieval over Promptus units
usage:
  kb-find "<query>" [--all] [--history] [--include-inactive]
                     [--substrate <s>] [--status <st>] [--hops <n>]
                     [--limit <n>] [--snippet] [--root <dir>]
  kb-find             lists the highest-priority live cards (default cap: 20)
query:
  words are ranked with BM25-style lexical scoring; "quoted phrases" are exact;
  +word requires a term; --all requires every unquoted term.
flags:
  --history          also search cold ledger/archive history
  --include-inactive do not demote SUPERSEDED, REFUTED, or RETIRED units
  --substrate <s>    only one store
  --status <STATUS>  only one exact epistemic status
  --hops <n>         also include linked live neighbours up to n hops
  --limit <n>        cap output (default 20; must be positive)
  --snippet          attach one matching source line
  --root <dir>       project root
then: kb-get "<path from a hit>" fetches the bounded source unit.`;

function readIndex(dir: string, catalogText: string, cards: Card[], root: string): SearchIndex {
  const catalogHash = createHash("sha256").update(catalogText).digest("hex");
  const file = join(dir, "search.json");
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as SearchIndex;
      if (parsed.schema === SEARCH_INDEX_SCHEMA && parsed.catalogHash === catalogHash) return parsed;
    } catch { /* stale/old derived cache: rebuild below */ }
  }
  const sources: SearchSourceDocument[] = cards.map((card) => ({
    substrate: card.substrate,
    status: card.status,
    title: card.title,
    path: card.path,
    ...(card.id ? { id: card.id } : {}),
    links: card.links,
    text: unitText(root, card.path, card.title),
  }));
  return buildSearchIndex(sources, catalogHash);
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const flags: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = "";
      else { flags[key] = next; i++; }
    } else positionals.push(argv[i]);
  }
  const query = positionals.join(" ").trim();
  const root = findProjectRoot(flags.root ?? process.cwd());
  const dir = derivedDir(root);
  const catalogFile = join(dir, "CATALOG.md");
  if (!existsSync(catalogFile)) { console.error("kb-find: no catalog — run `bun scripts/kb-index.ts` first."); return 1; }
  const limit = Number(flags.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1) { console.error("kb-find: --limit must be a positive integer."); return 1; }
  const catalogText = readFileSync(catalogFile, "utf8");
  const index = readIndex(dir, catalogText, parseCatalog(catalogText), root);
  const textOf = (document: SearchDocument) => unitText(root, document.path, document.title);
  const hits = searchIndex(index, query, {
    substrate: flags.substrate,
    status: flags.status,
    history: "history" in flags,
    all: "all" in flags,
    includeInactive: "include-inactive" in flags,
  }, textOf);

  const picked = new Map(hits.map((hit) => [hit.document.key, hit]));
  const hops = Number(flags.hops ?? 0);
  if (hops > 0 && existsSync(join(dir, "graph.json"))) {
    const graph = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")) as { out: Record<string, string[]>; unitOut?: Record<string, string[]> };
    const graphOut = graph.unitOut ?? graph.out;
    const seen = new Set([...picked.values()].filter((hit) => !hit.document.cold).map((hit) => graphKeyOf(hit.document)));
    let frontier = [...seen];
    for (let hop = 0; hop < hops; hop++) {
      const next: string[] = [];
      for (const node of frontier) for (const target of graphOut[node] ?? []) if (!seen.has(target)) { seen.add(target); next.push(target); }
      frontier = next;
    }
    for (const document of index.documents) {
      if (!document.cold && seen.has(graphKeyOf(document)) && !picked.has(document.key)) {
        picked.set(document.key, { document, score: 0, matchedTerms: [] });
      }
    }
  }

  const ranked = [...picked.values()].sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title));
  if (!ranked.length) { console.log("kb-find: no matches."); return 0; }
  const shown = ranked.slice(0, limit);
  const terms = searchTokens(query);
  for (const hit of shown) {
    const document = hit.document;
    const snippet = "snippet" in flags ? snippetOf(root, document, terms) : "";
    const history = document.cold ? " · cold-history" : "";
    console.log(`${document.substrate}:${document.status} · ${document.title} · ${document.path}${history}${snippet ? `\n    ↳ ${snippet}` : ""}`);
  }
  if (shown.length < ranked.length) console.log(`  … ${shown.length} of ${ranked.length} shown — raise --limit for more.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
