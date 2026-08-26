#!/usr/bin/env bun
/**
 * kb-index.ts — rebuild the DERIVED, disposable index from the markdown truth.
 * Run after a batch of writes; safe to delete .promptus/cache/ and regenerate anytime.
 *
 * Usage: kb-index [--root <dir>] [--strict]
 *
 *   1. Walk all four stores' markdown under the project root.
 *   2. Parse each unit's header/frontmatter (frontmatter.ts), [[links]], and typed relations.
 *   3. Rebuild CATALOG.md plus the bounded lexical search.json (both disposable).
 *   4. Rebuild graph.json — canonical [[link]] adjacency + typed relations (CiTO/PROV IRIs).
 *   5. Apply substrate-aware relation inverse status in the derived projection only.
 *   6. Lint + report: orphans (no resolved wikilink or typed relation) and unresolved links.
 *   7. Idempotent. With --strict, exit non-zero when lint finds problems (gates /checkpoint).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { extractLinks } from "./lib/links.ts";
import { loadVocab, type Relation, type Vocab } from "./lib/vocab.ts";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { ledgerHeads } from "./lib/units.ts";
import { createRelationResolver, inverseLifecycleStatus } from "./lib/relation-lifecycle.ts";
import { buildSearchIndex, type SearchSourceDocument } from "./lib/search.ts";
import { hashStore } from "./lib/store-hash.ts";
import { atomicStoreWrite } from "./lib/store-lock.ts";
import {
  THINKER_DIR,
  hasThinkerMarker,
  inspectThinkerExchange,
  refreshThinkerReadSurfaces,
  type ThinkerExchangeReport,
} from "./lib/thinker.ts";

export interface Unit {
  substrate: string;
  status: string;
  title: string;
  slug: string | null; // page units are link targets; ledger entries are not
  relPath: string;
  links: string[];
  aliases: string[];
  relations: Relation[];
  artifacts: string[];
  text: string;
  cold: boolean;
  id?: string;
}

const rel = (root: string, p: string) => relative(root, p).replace(/\\/g, "/");

function parseRel(s: string): Relation | null {
  const c = s.indexOf(":");
  return c > 0 && c < s.length - 1 ? { type: s.slice(0, c), target: s.slice(c + 1).trim() } : null;
}

// Walk RECURSIVELY: a store's notes may sit in subdirectories (e.g. docs/positioning/), and a
// non-recursive walk left those silently unindexed. But `archive/` is cold storage by convention
// (continuations retired for bloat control) and hidden dirs (.git, …) aren't live page content —
// skip both. A log-store archive is passed to this walker explicitly and enters search as cold
// history, never the live catalog/graph. README/index/memory files
// are navigation, not units, so they're skipped too.
function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "archive" && !e.name.startsWith(".")) out.push(...mdFiles(p));
    } else if (e.name.endsWith(".md") && !["index.md", "memory.md", "readme.md"].includes(e.name.toLowerCase())) out.push(p);
  }
  return out;
}

function archivedMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.name === "archive") out.push(...mdFiles(path));
    else out.push(...archivedMdFiles(path));
  }
  return out;
}

function sourceBytes(file: string, cache?: Map<string, Buffer>): Buffer {
  const cached = cache?.get(file);
  if (cached) return cached;
  const raw = readFileSync(file);
  cache?.set(file, raw);
  return raw;
}

function parseLedgerFile(root: string, file: string, cold = false, cache?: Map<string, Buffer>): Unit[] {
  if (!existsSync(file)) return [];
  const text = sourceBytes(file, cache).toString("utf8").replace(/\r\n/g, "\n");
  const heads = ledgerHeads(text); // shared, fence-aware — kb-index and kb-get slice on the same heads
  return heads.map((h, i) => {
    const body = text.slice(h.idx, i + 1 < heads.length ? heads[i + 1].idx : undefined);
    const status = h.kindStatus.split("/").pop()!.replace(/^[★⚠↩]/, "").trim();
    // strip fenced blocks before reading typed relations — a `↳ …` quoted as an example inside a
    // ``` fence is not a real edge (same discipline as the fence-aware head parse + links.ts)
    const prose = body.replace(/```[\s\S]*?```/g, "\n");
    const relations = [...prose.matchAll(/^↳ (\S+) (.+)$/gm)].map((x) => ({ type: x[1], target: x[2].trim() }));
    const id = /^<!-- kb:id (\S+) -->$/m.exec(prose)?.[1];
    // anchor (h.anchor) is already space-free (spaces → T) so the catalog's `· path ·` columns stay parseable
    return {
      substrate: "ledger",
      status,
      title: h.title,
      slug: null,
      relPath: `${rel(root, file)}#${h.anchor}`,
      links: extractLinks(body),
      aliases: [],
      relations,
      artifacts: [...prose.matchAll(/^<!-- kb:artifact (.+) -->$/gm)].map((match) => match[1].trim()),
      text: body,
      cold,
      id,
    };
  });
}

function parsePage(root: string, substrate: string, file: string, cold = false, cache?: Map<string, Buffer>): Unit {
  const text = sourceBytes(file, cache).toString("utf8").replace(/\r\n/g, "\n");
  const { data, body } = parseFrontmatter(text);
  const slug = file.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/, "");
  const h1 = /^#\s+(.+)$/m.exec(body);
  const links = Array.from(new Set([...(Array.isArray(data.links) ? data.links : []), ...extractLinks(body)]));
  const relations = (Array.isArray(data.relations) ? data.relations : []).map(parseRel).filter((r): r is Relation => r !== null);
  if (typeof data.supersedes === "string") relations.push({ type: "supersedes", target: data.supersedes }); // back-compat
  return {
    substrate,
    status: String(data.status ?? "?"),
    title: h1 ? h1[1].trim() : String(data.description ?? data.name ?? slug),
    slug,
    relPath: rel(root, file),
    links,
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    relations,
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    text,
    cold,
    id: typeof data.id === "string" ? data.id : undefined,
  };
}

/** Read the Markdown truth into units without deriving or writing any cache files. */
export function collectUnits(root: string, vocab: Vocab, cache?: Map<string, Buffer>): Unit[] {
  const units: Unit[] = [];
  const norm = (p: string) => p.replace(/\\/g, "/");
  // File stores can nest (lit = docs/lit lives inside finding = docs). Each file belongs to its
  // LONGEST-matching store dir, so the recursive finding walk does not double-index lit, and a
  // note in an undeclared subdir (docs/positioning/) is indexed under its nearest store (finding).
  const fileStores = Object.entries(vocab.substrates)
    .filter(([, s]) => s.placement === "file")
    .map(([name, s]) => ({ name, dir: norm(join(root, s.store)) }))
    .sort((a, b) => b.dir.length - a.dir.length);
  // Sentinel stores (the ledger) are parsed as a log, never as a page — even when they live
  // inside a file-store dir (e.g. Probatio's ledger is docs/research-ledger.md), so skip them here.
  const sentinelFiles = new Set(
    Object.values(vocab.substrates).filter((s) => s.placement === "sentinel").map((s) => norm(join(root, s.store))),
  );
  const sentinelArchiveDirs = [...sentinelFiles].map((file) => norm(join(dirname(file), "archive")));
  const owner = (fileDir: string) => fileStores.find((st) => fileDir === st.dir || fileDir.startsWith(st.dir + "/"));

  for (const sub of Object.values(vocab.substrates)) {
    if (sub.envelope !== "log") continue;
    const liveFile = join(root, sub.store);
    units.push(...parseLedgerFile(root, liveFile, false, cache));
    const archive = join(dirname(liveFile), "archive");
    if (existsSync(archive)) {
      for (const file of mdFiles(archive)) units.push(...parseLedgerFile(root, file, true, cache));
    }
  }

  const seen = new Set<string>();
  for (const st of fileStores) {
    for (const f of mdFiles(st.dir)) {
      const nf = norm(f);
      if (seen.has(nf) || sentinelFiles.has(nf)) continue;
      const own = owner(norm(dirname(nf)));
      if (!own || own.name !== st.name) continue; // a nested, more-specific store owns this file
      seen.add(nf);
      units.push(parsePage(root, st.name, nf, false, cache));
    }
  }
  // Page-store archives also remain retrievable, but only through kb-find --history. A custom
  // log whose archive happens to sit under a page store is already parsed above as log units.
  for (const st of fileStores) {
    for (const f of archivedMdFiles(st.dir)) {
      const nf = norm(f);
      if (seen.has(nf) || sentinelArchiveDirs.some((dir) => nf === dir || nf.startsWith(dir + "/"))) continue;
      const own = owner(norm(dirname(nf)));
      if (!own || own.name !== st.name) continue;
      seen.add(nf);
      units.push(parsePage(root, st.name, nf, true, cache));
    }
  }
  return units;
}

export interface IndexBuildResult {
  exitCode: number;
  root: string;
  liveUnits: number;
  coldUnits: number;
  source: { hash: string; files: number } | null;
  derivedWrites: number;
  thinkerExchange: ThinkerExchangeReport;
}

function writeDerivedIfChanged(root: string, path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  atomicStoreWrite(root, path, content);
  return true;
}

/** Rebuild the disposable projections and return reusable custody evidence. */
export function buildIndex(argv: string[]): IndexBuildResult {
  const quiet = argv.includes("--quiet");
  const log = (message: string) => { if (!quiet) console.log(message); };
  const ri = argv.indexOf("--root");
  const root = findProjectRoot(ri >= 0 ? argv[ri + 1] : process.cwd());
  const vocab = loadVocab(root);
  const cache = argv.includes("--source-hash") ? new Map<string, Buffer>() : undefined;
  const units = collectUnits(root, vocab, cache);
  const source = cache ? hashStore(root, cache) : null;
  const liveUnits = units.filter((unit) => !unit.cold);
  const coldUnits = units.filter((unit) => unit.cold);

  // Relation lifecycle projection: page/log history becomes SUPERSEDED; memory becomes retired.
  const resolver = createRelationResolver(liveUnits);
  const resolveTarget = resolver.resolve;
  const nodes = new Set(liveUnits.filter((u) => u.slug).map((u) => u.slug!));
  const relationDegree: Record<string, number> = Object.fromEntries([...nodes].map((slug) => [slug, 0]));
  const relEdges: Array<{ from: string; type: string; to: string; rawTo?: string; resolved: boolean; cito?: string; prov?: string }> = [];
  for (const u of liveUnits) {
    const from = u.id ?? u.slug ?? u.relPath;
    for (const r of u.relations) {
      const spec = vocab.relations[r.type] ?? {};
      const target = resolveTarget(r.target);
      const inverseStatus = target ? inverseLifecycleStatus(vocab, r, target) : undefined;
      if (inverseStatus && target) target.status = inverseStatus;
      if (target) {
        if (u.slug) relationDegree[u.slug] = (relationDegree[u.slug] ?? 0) + 1;
        if (target.slug) relationDegree[target.slug] = (relationDegree[target.slug] ?? 0) + 1;
      }
      relEdges.push({
        from,
        type: r.type,
        to: target?.id ?? target?.slug ?? r.target,
        ...(target && (target.id ?? target.slug) !== r.target ? { rawTo: r.target } : {}),
        resolved: Boolean(target),
        ...(spec.cito ? { cito: spec.cito } : {}),
        ...(spec.prov ? { prov: spec.prov } : {}),
      });
    }
  }
  // Collect after inverse-status transitions so artifact custody sees the unit's effective
  // lifecycle state regardless of source traversal order.
  const artifacts: Array<{ from: string; spec: string; status: string }> = [];
  for (const u of liveUnits) {
    const from = u.id ?? u.slug ?? u.relPath;
    for (const spec of u.artifacts) artifacts.push({ from, spec, status: u.status });
  }

  const out: Record<string, string[]> = {};
  const unitOut: Record<string, string[]> = {};
  const inDeg: Record<string, number> = Object.fromEntries([...nodes].map((s) => [s, 0]));
  const dangling: Array<{ from: string; target: string; reason: "unresolved" | "ambiguous-alias" }> = [];
  const external: Array<{ from: string; target: string }> = [];
  const externalTarget = (target: string) => /^(?:https?:\/\/|[a-z][a-z0-9+.-]*:)/i.test(target);
  for (const u of liveUnits) {
    const key = u.slug ?? u.relPath;
    const pageTargets: string[] = [];
    const stableTargets: string[] = [];
    for (const rawTarget of u.links) {
      if (externalTarget(rawTarget)) {
        external.push({ from: key, target: rawTarget });
        continue;
      }
      const target = resolveTarget(rawTarget);
      if (target) {
        stableTargets.push(target.id ?? target.slug ?? target.relPath);
        if (target.slug) {
          pageTargets.push(target.slug);
        }
      } else {
        pageTargets.push(rawTarget);
        stableTargets.push(rawTarget);
        dangling.push({
          from: key,
          target: rawTarget,
          reason: resolver.aliasCount(rawTarget) > 1 ? "ambiguous-alias" : "unresolved",
        });
      }
    }
    out[key] = [...new Set(pageTargets)];
    for (const target of out[key]) if (nodes.has(target)) inDeg[target]++;
    unitOut[u.id ?? key] = [...new Set(stableTargets)];
  }
  const orphans = [...nodes].filter((s) => inDeg[s] === 0 && (out[s] ?? []).length === 0 && (relationDegree[s] ?? 0) === 0);

  const lines = liveUnits
    .map((u) => {
      const metadata = [
        ...(u.id ? [`id:${u.id}`] : []),
        ...u.aliases.map((alias) => `alias:${alias}`),
        ...u.links.map((l) => `[[${l}]]`),
      ];
      return `${u.substrate}:${u.status} · ${u.title} · ${u.relPath}${metadata.length ? ` · ${metadata.join(" ")}` : ""}`;
    })
    .sort();
  const dir = derivedDir(root);
  mkdirSync(dir, { recursive: true });
  const catalog = `# Promptus card-catalog (DERIVED — rebuilt by kb-index; safe to delete)\n\n> ${liveUnits.length} live units · ${coldUnits.length} cold-history units · read this first; load only the bodies you need.\n\n${lines.join("\n")}\n`;
  let derivedWrites = 0;
  if (writeDerivedIfChanged(root, join(dir, "CATALOG.md"), catalog)) derivedWrites++;
  const graph = `${JSON.stringify({ nodes: [...nodes], out, unitOut, inDeg, relationDegree, relations: relEdges, dangling, external, artifacts }, null, 2)}\n`;
  if (writeDerivedIfChanged(root, join(dir, "graph.json"), graph)) derivedWrites++;
  const catalogHash = createHash("sha256").update(catalog).digest("hex");
  const searchSources: SearchSourceDocument[] = units.map((unit) => ({
    substrate: unit.substrate,
    status: unit.status,
    title: unit.title,
    path: unit.relPath,
    text: unit.text,
    ...(unit.id ? { id: unit.id } : {}),
    links: unit.links,
    cold: unit.cold,
  }));
  const search = `${JSON.stringify(buildSearchIndex(searchSources, catalogHash))}\n`;
  if (writeDerivedIfChanged(root, join(dir, "search.json"), search)) derivedWrites++;
  const thinkerExchange = existsSync(join(root, THINKER_DIR)) && hasThinkerMarker(root)
    ? refreshThinkerReadSurfaces(root, cache)
    : inspectThinkerExchange(root, cache);

  const linkEdges = Object.values(out).reduce((s, a) => s + a.length, 0);
  log(`kb-index: ${liveUnits.length} live + ${coldUnits.length} cold units · ${linkEdges} links · ${relEdges.length} relations → .promptus/cache/CATALOG.md + graph.json + search.json`);
  if (dangling.length) {
    log(`  unresolved links (${dangling.length}) — a typo, ambiguous alias, or intentional concept-handle:`);
    for (const e of dangling.slice(0, 25)) log(`    ${e.from} → [[${e.target}]] (${e.reason})`);
  }
  if (orphans.length) {
    log(`  orphans (${orphans.length}) — no resolved wikilink or typed relation:`);
    for (const o of orphans.slice(0, 25)) log(`    ${o}`);
  }
  if (dangling.length + orphans.length === 0) log("  clean.");
  return {
    exitCode: argv.includes("--strict") && dangling.length + orphans.length > 0 ? 1 : 0,
    root,
    liveUnits: liveUnits.length,
    coldUnits: coldUnits.length,
    source,
    derivedWrites,
    thinkerExchange,
  };
}

export function main(argv: string[]): number {
  return buildIndex(argv).exitCode;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
