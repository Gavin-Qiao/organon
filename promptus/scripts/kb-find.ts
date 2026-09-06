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
import { semanticSnapshot, semanticCandidates, type SemanticSnapshot } from "./lib/semantic.ts";
import { createRelationResolver } from "./lib/relation-lifecycle.ts";
import { cachedUnitText } from "./lib/parse-cache.ts";

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
                     [--limit <n>] [--snippet] [--semantic] [--root <dir>]
  kb-find             lists the highest-priority live cards (default cap: 20)
query:
  words are ranked with BM25-style lexical scoring; "quoted phrases" are exact;
  +word requires a term; --all requires every unquoted term.
flags:
  --semantic        optional local QMD vectors; requires kb-semantic configure/update
                    unavailable/stale backend falls back to current-source lexical search
                    exact controls use lexical; inactive units need history/status/include-inactive
  --history          also search cold ledger/archive history
  --include-inactive do not demote SUPERSEDED, REFUTED, or RETIRED units
  --substrate <s>    only one store
  --status <STATUS>  only one exact epistemic status
  --hops <n>         also include linked live neighbours up to n hops
  --limit <n>        cap output (default 20; must be positive)
  --snippet          attach one matching source line
  --root <dir>       project root
then: kb-get "<path from a hit>" fetches the bounded source unit.`;

function readIndex(dir: string, catalogText: string, cards: Card[], root: string, capturedSearch?: string): SearchIndex {
  const catalogHash = createHash("sha256").update(catalogText).digest("hex");
  const file = join(dir, "search.json");
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(capturedSearch ?? readFileSync(file, "utf8")) as SearchIndex;
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
  const booleans = new Set(["all", "history", "include-inactive", "snippet", "semantic"]);
  const values = new Set(["root", "limit", "substrate", "status", "hops"]);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      if ((!booleans.has(key) && !values.has(key)) || key in flags) { console.error(`kb-find: unknown or duplicate flag --${key}`); return 1; }
      const next = argv[i + 1];
      if (booleans.has(key)) flags[key] = "";
      else if (next === undefined || next.startsWith("--")) { console.error(`kb-find: --${key} requires a value`); return 1; }
      else { flags[key] = next; i++; }
    } else positionals.push(argv[i]);
  }
  const query = positionals.join(" ").trim();
  const root = findProjectRoot(flags.root ?? process.cwd());
  const dir = derivedDir(root);
  const catalogFile = join(dir, "CATALOG.md");
  if (!existsSync(catalogFile) && !("semantic" in flags)) { console.error("kb-find: no catalog — run `bun scripts/kb-index.ts` first."); return 1; }
  const limit = Number(flags.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1) { console.error("kb-find: --limit must be a positive integer."); return 1; }
  const hops = Number(flags.hops ?? 0);
  if (!Number.isSafeInteger(hops) || hops < 0) { console.error("kb-find: --hops must be a nonnegative integer"); return 1; }
  const catalogText = existsSync(catalogFile) ? readFileSync(catalogFile, "utf8") : "";
  let snapshot: SemanticSnapshot | undefined;
  let snapshotText: Map<string, string> | undefined;
  let capturedGraph: string | undefined;
  let index: SearchIndex;
  const refreshSource = () => { snapshot = semanticSnapshot(root); snapshotText = undefined; index = buildSearchIndex(snapshot.documents, snapshot.fingerprint); };
  if ("semantic" in flags) refreshSource();
  else {
    let coherent = true;
    let capturedSearch: string | undefined;
    const state = join(dir, "index-state.json");
    if (existsSync(state)) try {
      const stateText = readFileSync(state, "utf8"), receipt = JSON.parse(stateText);
      capturedSearch = readFileSync(join(dir, "search.json"), "utf8");
      coherent = receipt.phase === "clean" && receipt.catalogHash === createHash("sha256").update(catalogText).digest("hex")
        && receipt.searchHash === createHash("sha256").update(capturedSearch).digest("hex");
      if (hops) {
        capturedGraph = readFileSync(join(dir, "graph.json"), "utf8");
        coherent &&= receipt.graphHash === createHash("sha256").update(capturedGraph).digest("hex");
      }
      coherent &&= readFileSync(state, "utf8") === stateText;
    } catch { coherent = false; }
    if (!coherent) { console.error("kb-find: INDEX_PUBLICATION_INCOMPLETE: using current-source lexical retrieval; run kb-index after the active writer finishes"); refreshSource(); }
    else index = readIndex(dir, catalogText, parseCatalog(catalogText), root, capturedSearch);
  }
  const cachedText = cachedUnitText(root);
  const textOf = (document: SearchDocument) => snapshot
    ? (snapshotText ??= new Map(snapshot.documents.map(doc => [JSON.stringify([doc.path, doc.title]), doc.text]))).get(JSON.stringify([document.path, document.title])) ?? ""
    : cachedText(document.path, document.title);
  const options = {
    substrate: flags.substrate,
    status: flags.status,
    history: "history" in flags,
    all: "all" in flags,
    includeInactive: "include-inactive" in flags,
  };
  let hits = searchIndex(index!, query, options, textOf), route = "";
  if (snapshot && "semantic" in flags) {
    route = "lexical";
    if (!query || options.all || /"|(?:^|\s)\+/.test(query)) console.error("kb-find: explicit lexical controls or empty query; semantic route bypassed");
    else try {
      const candidates = semanticCandidates(root, snapshot, query, { ...options, limit });
      const documents = new Map(index!.documents.map(doc => [doc.key, doc]));
      hits = candidates.map((doc, i) => ({ document: documents.get(doc.key)!, score: candidates.length - i, matchedTerms: [] }));
      route = "qmd";
    } catch (error) {
      console.error(`kb-find: semantic unavailable (${String(error)}); using current-source lexical fallback`);
      refreshSource(); hits = searchIndex(index!, query, options, textOf); route = "lexical-fallback";
    }
  }

  const picked = new Map(hits.map((hit) => [hit.document.key, hit]));
  if (hops > 0 && (snapshot || existsSync(join(dir, "graph.json")))) {
    const sourceGraph = () => {
      const units = snapshot!.documents.map(doc => ({ ...doc, relPath: doc.path })), resolver = createRelationResolver(units);
      return { out: Object.fromEntries(units.map(doc => [graphKeyOf(doc as unknown as SearchDocument), [...doc.links, ...doc.relations.map(r => r.target)].flatMap(link => {
        const target = resolver.resolve(link); return target && !target.cold ? [graphKeyOf(target as unknown as SearchDocument)] : [];
      })])) };
    };
    const graph = (snapshot ? sourceGraph() : JSON.parse(capturedGraph ?? readFileSync(join(dir, "graph.json"), "utf8"))) as { out: Record<string, string[]>; unitOut?: Record<string, string[]> };
    const graphOut = graph.unitOut ?? graph.out;
    const seen = new Set([...picked.values()].filter((hit) => !hit.document.cold).map((hit) => graphKeyOf(hit.document)));
    let frontier = [...seen];
    for (let hop = 0; hop < hops; hop++) {
      const next: string[] = [];
      for (const node of frontier) for (const target of graphOut[node] ?? []) if (!seen.has(target)) { seen.add(target); next.push(target); }
      frontier = next;
    }
    for (const document of index!.documents) {
      if (!document.cold && (!options.substrate || document.substrate === options.substrate) && (!options.status || document.status === options.status)
        && (!snapshot || options.status || options.history || options.includeInactive || !["SUPERSEDED", "REFUTED", "RETIRED", "UNTRUSTED"].includes(document.status.toUpperCase()))
        && seen.has(graphKeyOf(document)) && !picked.has(document.key)) {
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
    console.log(`${document.substrate}:${document.status} · ${document.title} · ${document.path}${history}${route ? ` · route:${route}` : ""}${snippet ? `\n    ↳ ${snippet}` : ""}`);
  }
  if (shown.length < ranked.length) console.log(`  … ${shown.length} of ${ranked.length} shown — raise --limit for more.`);
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(`kb-find: ${String(error)}`); process.exitCode = 1; }
