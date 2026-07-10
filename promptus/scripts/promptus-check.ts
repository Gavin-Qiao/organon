#!/usr/bin/env bun
/**
 * promptus-check.ts — one health surface for the live knowledge store.
 *
 * Rebuilds the disposable index by default, then checks the source/index
 * contract: store hash, classified units, duplicate ids, typed-relation
 * targets, dangling links, and orphans. The report is derived and disposable.
 *
 * Usage: promptus-check [--root <dir>] [--strict] [--strict-graph] [--json]
 *                       [--no-index]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { slugify } from "./lib/ids.ts";
import { main as rebuildIndex } from "./kb-index.ts";

interface Card {
  substrate: string;
  status: string;
  title: string;
  path: string;
  id?: string;
}

interface Graph {
  nodes?: string[];
  out?: Record<string, string[]>;
  inDeg?: Record<string, number>;
  relations?: Array<{ from: string; type: string; to: string }>;
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "cache" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function hashStore(root: string): { hash: string; files: number } {
  const base = join(root, ".promptus");
  const paths = filesUnder(base).sort((a, b) => a.localeCompare(b));
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(relative(base, path).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), files: paths.length };
}

function parseCatalog(text: string): Card[] {
  const cards: Card[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(" · ");
    if (parts.length < 3) continue;
    const split = parts[0].indexOf(":");
    if (split < 1) continue;
    const substrate = parts[0].slice(0, split);
    const status = parts[0].slice(split + 1).trim();
    const metadata = parts.slice(3).join(" · ");
    const id = /(?:^|\s)id:(\S+)/.exec(metadata)?.[1];
    cards.push({ substrate, status, title: parts[1], path: parts[2], id });
  }
  return cards;
}

function readJSON(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function main(argv: string[]): number {
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const cache = derivedDir(root);
  const catalogPath = join(cache, "CATALOG.md");
  const graphPath = join(cache, "graph.json");
  const healthPath = join(cache, "health.json");
  const noIndex = argv.includes("--no-index");
  const strict = argv.includes("--strict");
  const strictGraph = argv.includes("--strict-graph");
  const json = argv.includes("--json");

  let indexFailed = false;
  let indexError = "";
  if (!noIndex) {
    try {
      indexFailed = rebuildIndex(["--root", root, "--quiet"]) !== 0;
    } catch (error) {
      indexFailed = true;
      indexError = error instanceof Error ? error.message : String(error);
    }
  }

  const source = hashStore(root);
  const previous = readJSON(healthPath);
  const stale = noIndex && (!previous || previous.storeHash !== source.hash);
  const cards = existsSync(catalogPath) ? parseCatalog(readFileSync(catalogPath, "utf8")) : [];
  const graph = (readJSON(graphPath) ?? {}) as Graph;

  const unclassified = cards.filter((card) => !card.status || card.status === "?");
  const ids = new Map<string, Card[]>();
  for (const card of cards) {
    if (!card.id) continue;
    ids.set(card.id, [...(ids.get(card.id) ?? []), card]);
  }
  const duplicateIds = [...ids].filter(([, matches]) => matches.length > 1);

  const slugs = new Set(cards.filter((card) => !card.path.includes("#")).map((card) => card.path.split("/").pop()!.replace(/\.md$/, "")));
  const titleSlugs = new Set(cards.filter((card) => card.substrate === "ledger").map((card) => slugify(card.title)));
  const knownIds = new Set(ids.keys());
  const relationTargetExists = (target: string): boolean => {
    if (knownIds.has(target) || slugs.has(target)) return true;
    const legacy = /^event-\d{8}T\d{6}Z-(.+)$/.exec(target)?.[1];
    return Boolean(legacy && titleSlugs.has(legacy));
  };
  const unresolvedRelations = (graph.relations ?? []).filter((edge) => !relationTargetExists(edge.to));

  const nodes = new Set(graph.nodes ?? []);
  const out = graph.out ?? {};
  const dangling = Object.entries(out).flatMap(([from, targets]) =>
    targets.filter((target) => !nodes.has(target)).map((target) => ({ from, target })),
  );
  const orphans = [...nodes].filter((node) => (graph.inDeg?.[node] ?? 0) === 0 && (out[node] ?? []).length === 0);

  const baseErrors = Number(indexFailed) + Number(stale) + duplicateIds.length + unresolvedRelations.length;
  const strictErrors = baseErrors + (strict ? unclassified.length : 0) + (strictGraph ? dangling.length + orphans.length : 0);
  const result = {
    root: root.replace(/\\/g, "/"),
    storeHash: source.hash,
    sourceFiles: source.files,
    units: cards.length,
    indexFailed,
    indexError,
    stale,
    unclassified: unclassified.map((card) => ({ title: card.title, path: card.path })),
    duplicateIds: duplicateIds.map(([id, matches]) => ({ id, paths: matches.map((card) => card.path) })),
    unresolvedRelations,
    dangling,
    orphans,
    healthy: strictErrors === 0,
  };

  if (!noIndex) {
    mkdirSync(cache, { recursive: true });
    writeFileSync(healthPath, JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2) + "\n");
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("promptus-check: " + cards.length + " units · " + source.files + " source files · " + source.hash.slice(0, 12));
    console.log("  " + (indexFailed ? "FAIL" : "ok  ") + " index" + (noIndex ? " (not rebuilt)" : " rebuilt"));
    console.log("  " + (stale ? "FAIL" : "ok  ") + " source/index freshness");
    console.log("  " + (duplicateIds.length ? "FAIL" : "ok  ") + " duplicate ids: " + duplicateIds.length);
    console.log("  " + (unresolvedRelations.length ? "FAIL" : "ok  ") + " unresolved relation targets: " + unresolvedRelations.length);
    console.log("  " + (unclassified.length ? "FLAG" : "ok  ") + " unclassified units: " + unclassified.length);
    console.log("  " + (dangling.length ? "WARN" : "ok  ") + " dangling links: " + dangling.length);
    console.log("  " + (orphans.length ? "WARN" : "ok  ") + " orphans: " + orphans.length);
    for (const card of unclassified.slice(0, 10)) console.log("    unclassified " + card.path + " — " + card.title);
    for (const item of duplicateIds.slice(0, 10)) console.log("    duplicate id " + item[0]);
    for (const edge of unresolvedRelations.slice(0, 10)) console.log("    unresolved " + edge.type + " " + edge.to + " from " + edge.from);
    if (indexFailed && indexError) console.log("    " + indexError.split(/\r?\n/)[0]);
  }

  return strictErrors ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
