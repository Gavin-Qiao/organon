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
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadVocab } from "./lib/vocab.ts";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { createRelationResolver, inverseLifecycleStatus } from "./lib/relation-lifecycle.ts";
import { buildSearchIndex, type SearchSourceDocument } from "./lib/search.ts";
import { hashStore } from "./lib/store-hash.ts";
import { atomicStoreWrite, withStoreLock } from "./lib/store-lock.ts";
import { createParseCache, safeCachePath } from "./lib/parse-cache.ts";
import {
  THINKER_DIR,
  hasThinkerMarker,
  inspectThinkerExchange,
  refreshThinkerReadSurfaces,
  type ThinkerExchangeReport,
} from "./lib/thinker.ts";

export { collectUnits, type Unit } from "./lib/read-store.ts";
import { collectUnits, type Unit } from "./lib/read-store.ts";

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
  const ri = argv.indexOf("--root");
  const root = findProjectRoot(ri >= 0 ? argv[ri + 1] : process.cwd());
  return withStoreLock(root, () => buildLockedIndex(argv));
}

function buildLockedIndex(argv: string[]): IndexBuildResult {
  const quiet = argv.includes("--quiet");
  const log = (message: string) => { if (!quiet) console.log(message); };
  const ri = argv.indexOf("--root");
  const root = findProjectRoot(ri >= 0 ? argv[ri + 1] : process.cwd());
  const vocab = loadVocab(root);
  const cache = new Map<string, Buffer>();
  const raw = createParseCache(root, cache, argv.includes("--source-hash"));
  const units = collectUnits(root, vocab, cache, raw.reuse);
  const source = argv.includes("--source-hash") ? hashStore(root, cache) : null;
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
  const statePath = safeCachePath(root, "index-state.json");
  // A failed/interrupted multi-file publication remains visibly incomplete.
  atomicStoreWrite(root, statePath, JSON.stringify({ phase: "writing", pid: process.pid }));
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
  const rawStats = raw.save();
  if (rawStats.diagnostic) console.error(`kb-index: ${rawStats.diagnostic}`);
  if (argv.includes("--cache-stats")) console.error(`PARSE_CACHE ${JSON.stringify(rawStats)}`);
  atomicStoreWrite(root, statePath, JSON.stringify({ phase: "clean", catalogHash,
    searchHash: createHash("sha256").update(search).digest("hex"),
    graphHash: createHash("sha256").update(graph).digest("hex") }));
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
