#!/usr/bin/env bun
/**
 * kb-index.ts — rebuild the DERIVED, disposable index from the markdown truth.
 * Run after a batch of writes; safe to delete .promptus/ and regenerate anytime.
 *
 * Usage: kb-index [--root <dir>] [--strict]
 *
 *   1. Walk all four stores' markdown under the project root.
 *   2. Parse each unit's header/frontmatter (frontmatter.ts), [[links]], and typed relations.
 *   3. Rebuild .promptus/CATALOG.md — one line per unit (the card-catalog the model reads).
 *   4. Rebuild .promptus/graph.json — [[link]] adjacency + typed relation edges (with CiTO/PROV IRIs).
 *   5. Apply relation inverse_status (a `supersedes`/`fixes` target is marked SUPERSEDED in place).
 *   6. Lint + report: orphans (no links in/out) and unresolved links (target not a file).
 *   7. Idempotent. With --strict, exit non-zero when lint finds problems (gates /checkpoint).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { extractLinks } from "./lib/links.ts";
import { loadVocab, type Relation, type Vocab } from "./lib/vocab.ts";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";
import { ledgerHeads } from "./lib/units.ts";

interface Unit {
  substrate: string;
  status: string;
  title: string;
  slug: string | null; // page units are link targets; ledger entries are not
  relPath: string;
  links: string[];
  relations: Relation[];
  id?: string;
}

const rel = (root: string, p: string) => relative(root, p).replace(/\\/g, "/");

function parseRel(s: string): Relation | null {
  const c = s.indexOf(":");
  return c > 0 && c < s.length - 1 ? { type: s.slice(0, c), target: s.slice(c + 1).trim() } : null;
}

// Walk RECURSIVELY: a store's notes may sit in subdirectories (e.g. docs/positioning/), and a
// non-recursive walk left those silently unindexed. But `archive/` is cold storage by convention
// (continuations retired for bloat control) and hidden dirs (.git, …) aren't content — skip both,
// so re-indexing doesn't re-introduce the bloat that archiving removed. README/index/memory files
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

function parseLedger(root: string, store: string): Unit[] {
  const file = join(root, store);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const heads = ledgerHeads(text); // shared, fence-aware — kb-index and kb-get slice on the same heads
  return heads.map((h, i) => {
    const body = text.slice(h.idx, i + 1 < heads.length ? heads[i + 1].idx : undefined);
    const status = h.kindStatus.split("/").pop()!.replace(/^[★⚠↩]/, "").trim();
    // strip fenced blocks before reading typed relations — a `↳ …` quoted as an example inside a
    // ``` fence is not a real edge (same discipline as the fence-aware head parse + links.ts)
    const prose = body.replace(/```[\s\S]*?```/g, "\n");
    const relations = [...prose.matchAll(/^↳ (\S+) (.+)$/gm)].map((x) => ({ type: x[1], target: x[2].trim() }));
    // anchor (h.anchor) is already space-free (spaces → T) so the catalog's `· path ·` columns stay parseable
    return { substrate: "ledger", status, title: h.title, slug: null, relPath: `${store}#${h.anchor}`, links: extractLinks(body), relations };
  });
}

function parsePage(root: string, substrate: string, file: string): Unit {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
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
    relations,
    id: typeof data.id === "string" ? data.id : undefined,
  };
}

function collect(root: string, vocab: Vocab): Unit[] {
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
  const owner = (fileDir: string) => fileStores.find((st) => fileDir === st.dir || fileDir.startsWith(st.dir + "/"));

  for (const sub of Object.values(vocab.substrates)) if (sub.envelope === "log") units.push(...parseLedger(root, sub.store));

  const seen = new Set<string>();
  for (const st of fileStores) {
    for (const f of mdFiles(st.dir)) {
      const nf = norm(f);
      if (seen.has(nf) || sentinelFiles.has(nf)) continue;
      const own = owner(norm(dirname(nf)));
      if (!own || own.name !== st.name) continue; // a nested, more-specific store owns this file
      seen.add(nf);
      units.push(parsePage(root, st.name, nf));
    }
  }
  return units;
}

function main(argv: string[]): number {
  const ri = argv.indexOf("--root");
  const root = findProjectRoot(ri >= 0 ? argv[ri + 1] : process.cwd());
  const vocab = loadVocab(root);
  const units = collect(root, vocab);

  // relation inverse_status: a `supersedes`/`fixes` target is marked SUPERSEDED in place.
  const byId = new Map(units.filter((u) => u.id).map((u) => [u.id!, u]));
  const relEdges: Array<{ from: string; type: string; to: string; cito?: string; prov?: string }> = [];
  for (const u of units) {
    const from = u.id ?? u.slug ?? u.relPath;
    for (const r of u.relations) {
      const spec = vocab.relations[r.type] ?? {};
      if (spec.inverse_status && byId.has(r.target)) byId.get(r.target)!.status = spec.inverse_status;
      relEdges.push({ from, type: r.type, to: r.target, ...(spec.cito ? { cito: spec.cito } : {}), ...(spec.prov ? { prov: spec.prov } : {}) });
    }
  }

  const nodes = new Set(units.filter((u) => u.slug).map((u) => u.slug!));
  const out: Record<string, string[]> = {};
  const inDeg: Record<string, number> = Object.fromEntries([...nodes].map((s) => [s, 0]));
  const unresolved: Array<{ from: string; to: string }> = [];
  for (const u of units) {
    const key = u.slug ?? u.relPath;
    out[key] = u.links;
    for (const t of u.links) (nodes.has(t) ? inDeg[t]++ : unresolved.push({ from: key, to: t }));
  }
  const orphans = [...nodes].filter((s) => inDeg[s] === 0 && (out[s] ?? []).length === 0);

  const lines = units
    .map((u) => `${u.substrate}:${u.status} · ${u.title} · ${u.relPath}${u.links.length ? ` · ${u.links.map((l) => `[[${l}]]`).join(" ")}` : ""}`)
    .sort();
  const dir = derivedDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "CATALOG.md"),
    `# Promptus card-catalog (DERIVED — rebuilt by kb-index; safe to delete)\n\n> ${units.length} units · read this first; load only the bodies you need.\n\n${lines.join("\n")}\n`,
  );
  writeFileSync(join(dir, "graph.json"), `${JSON.stringify({ nodes: [...nodes], out, inDeg, relations: relEdges }, null, 2)}\n`);

  const linkEdges = Object.values(out).reduce((s, a) => s + a.length, 0);
  console.log(`kb-index: ${units.length} units · ${linkEdges} links · ${relEdges.length} relations → .promptus/cache/CATALOG.md + graph.json`);
  if (unresolved.length) {
    console.log(`  unresolved links (${unresolved.length}) — a typo or an intentional concept-handle:`);
    for (const e of unresolved.slice(0, 25)) console.log(`    ${e.from} → [[${e.to}]]`);
  }
  if (orphans.length) {
    console.log(`  orphans (${orphans.length}) — nothing links in or out:`);
    for (const o of orphans.slice(0, 25)) console.log(`    ${o}`);
  }
  if (unresolved.length + orphans.length === 0) console.log("  clean.");
  return argv.includes("--strict") && unresolved.length + orphans.length > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
