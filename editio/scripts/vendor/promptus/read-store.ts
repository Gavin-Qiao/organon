/** Canonical read-only Markdown unit collection, shared with packaged consumers.
 * Edit this source, then run promptus/scripts/sync-reader.ts; never edit vendor copies. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import { extractLinks } from "./links.ts";
import type { Relation, Vocab } from "./vocab.ts";
import { ledgerHeads } from "./units.ts";
import { createRelationResolver, inverseLifecycleStatus } from "./relation-lifecycle.ts";

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

/** Optional index-only memoizer. Evidence consumers omit it and parse source directly. */
export type ParseReuse = (file: string, kind: string, parse: () => Unit[]) => Unit[];

/** Strict, source-only lifecycle projection for evidence consumers. */
export function collectEffectiveUnits(root: string, vocab: Vocab, includeCold = true): Unit[] {
  const units = collectUnits(root, vocab).filter(unit => includeCold || !unit.cold);
  const ids = units.flatMap(unit => unit.id ? [unit.id] : []);
  if (new Set(ids).size !== ids.length) throw new Error("Promptus has duplicate stable IDs; repair source identity before retrieval");
  const counts = new Map<string, number>();
  for (const unit of units) for (const handle of new Set([unit.id, unit.slug, ...unit.aliases].filter(Boolean))) counts.set(handle!, (counts.get(handle!) ?? 0) + 1);
  const resolver = createRelationResolver(units);
  for (const unit of units) for (const relation of unit.relations) {
    const target = resolver.resolve(relation.target), spec = vocab.relations[relation.type];
    if (spec && (spec.inverse_status || spec.inverse_status_by_substrate) && (!target || (counts.get(relation.target) ?? 0) > 1)) throw new Error(`Unresolved or ambiguous lifecycle target: ${relation.target}`);
    const status = target ? inverseLifecycleStatus(vocab, relation, target) : undefined;
    if (target && status) target.status = status;
  }
  return units;
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
export function collectUnits(root: string, vocab: Vocab, cache?: Map<string, Buffer>, reuse?: ParseReuse): Unit[] {
  const units: Unit[] = [];
  const ledger = (file: string, cold: boolean) => {
    if (!existsSync(file)) return [];
    const parse = () => parseLedgerFile(root, file, cold, cache);
    return reuse ? reuse(file, `ledger:${cold}`, parse) : parse();
  };
  const page = (file: string, substrate: string, cold: boolean) => {
    const parse = () => [parsePage(root, substrate, file, cold, cache)];
    return reuse ? reuse(file, `${substrate}:${cold}`, parse) : parse();
  };
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
    units.push(...ledger(liveFile, false));
    const archive = join(dirname(liveFile), "archive");
    if (existsSync(archive)) {
      for (const file of mdFiles(archive)) units.push(...ledger(file, true));
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
      units.push(...page(nf, st.name, false));
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
      units.push(...page(nf, st.name, true));
    }
  }
  return units;
}
