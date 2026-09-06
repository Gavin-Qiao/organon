/** Optional, bounded raw parser cache. Exact file digests, never stat-only freshness.
 * Strict evidence/health collectors deliberately do not use this accelerator. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statfsSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { derivedDir } from "./paths.ts";
import { atomicStoreWrite, withStoreLock } from "./store-lock.ts";
import { ledgerEntriesFromText } from "./units.ts";
import type { ParseReuse, Unit } from "./read-store.ts";

export const PARSE_CACHE = "parsed-units-v1.json.gz";
// Production acceptance did not justify enabling persistent caching globally.
export const DEFAULT_PARSE_BYTES = 0;
const DECODE_BYTES = 128 * 1024 * 1024;
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Item = { key: string; revision: string; units: Unit[] };
type Payload = { schema: 1; root: string; parser: string; entries: Item[] };
const parserFiles = ["read-store.ts", "frontmatter.ts", "links.ts", "units.ts"];
const parserHash = () => sha(parserFiles.map(file => sha(readFileSync(join(import.meta.dir, file)))).join(""));

export function parseLimit(): number {
  const limit = Number(process.env.PROMPTUS_PARSE_CACHE_BYTES ?? DEFAULT_PARSE_BYTES);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > DECODE_BYTES) throw Error("RESOURCE_LIMIT_INVALID: PROMPTUS_PARSE_CACHE_BYTES must be an integer from 0 to 134217728; 0 disables reuse");
  return limit;
}

export function requireCacheSpace(bytes: number, limit: number, available: number | null) {
  if (bytes > limit) throw Error("CACHE_QUOTA: compressed raw cache exceeds limit; canonical indexing retained");
  if (available !== null && available < bytes) throw Error("CACHE_SPACE: insufficient replacement space; canonical indexing retained");
}

/** Refuse indirection on owned paths; never traverse or evict arbitrary cache trees. */
export function safeCachePath(root: string, name: string): string {
  if (![PARSE_CACHE, "index-state.json"].includes(name)) throw Error("CACHE_TARGET_INVALID");
  let path = resolve(root);
  for (const part of [".promptus", "cache", name]) {
    path = join(path, part);
    if (!existsSync(path)) {
      try { lstatSync(path); throw Error(`CACHE_PATH_UNSAFE: ${path}`); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
      continue;
    }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (part === name ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw Error(`CACHE_PATH_UNSAFE: ${path}`);
  }
  return path;
}

function load(root: string, limit: number): Payload | undefined {
  if (!limit) return;
  const path = safeCachePath(root, PARSE_CACHE);
  if (!existsSync(path) || lstatSync(path).size > limit) return;
  const envelope = JSON.parse(gunzipSync(readFileSync(path), { maxOutputLength: DECODE_BYTES }).toString("utf8"));
  if (typeof envelope.payload !== "string" || sha(envelope.payload) !== envelope.sha256) throw Error("CACHE_CORRUPT: raw parser checksum mismatch");
  const data = JSON.parse(envelope.payload) as Payload;
  if (data.schema !== 1 || data.root !== resolve(root) || data.parser !== parserHash() || !Array.isArray(data.entries)) return;
  if (new Set(data.entries.map(item => item.key)).size !== data.entries.length) throw Error("CACHE_CORRUPT: duplicate parse key");
  for (const item of data.entries) {
    if (typeof item.key !== "string" || !/^[a-f0-9]{64}$/.test(item.revision) || !Array.isArray(item.units)) throw Error("CACHE_CORRUPT: invalid parse entry");
    for (const unit of item.units) if (typeof unit.text !== "string" || typeof unit.relPath !== "string" || typeof unit.title !== "string" || !Array.isArray(unit.relations) || !Array.isArray(unit.links) || !Array.isArray(unit.aliases) || !Array.isArray(unit.artifacts)) throw Error("CACHE_CORRUPT: invalid raw unit");
  }
  return data;
}

export function cacheUsage(root: string) {
  const limitBytes = parseLimit(), path = safeCachePath(root, PARSE_CACHE);
  let cacheBytes = 0;
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) cacheBytes += lstatSync(file).size;
    }
  };
  walk(derivedDir(root));
  let availableBytes: number | null = null;
  try { const fs = statfsSync(root); availableBytes = Number(fs.bavail) * Number(fs.bsize); } catch { /* explicit unknown, not an unlimited claim */ }
  return { root: resolve(root), cacheBytes, parseBytes: existsSync(path) ? lstatSync(path).size : 0, limitBytes,
    replacementScratchUpperBoundBytes: limitBytes, availableBytes,
    scope: "Parse-cache limit only; total cache usage includes other indexes. Free space is a point-in-time estimate, not a reservation.",
    decodedLimitBytes: DECODE_BYTES, gpuRequired: false, downloads: false };
}

export function createParseCache(root: string, buffers: Map<string, Buffer>, certify = false) {
  const limit = parseLimit(), previous = new Map<string, Item>(), next: Item[] = [];
  const stats = { parsed: 0, reused: 0, bytes: 0, saved: false, diagnostic: "" };
  if (!certify) try { for (const item of load(root, limit)?.entries ?? []) previous.set(item.key, item); }
  catch (error) { stats.diagnostic = String(error); }
  const reuse: ParseReuse = (file, kind, parse) => {
    if (!limit) { stats.parsed++; return parse(); }
    const bytes = buffers.get(file) ?? readFileSync(file); buffers.set(file, bytes);
    const key = JSON.stringify([relative(root, file).replaceAll("\\", "/"), kind]), revision = sha(bytes);
    const old = previous.get(key);
    const units = old?.revision === revision ? (stats.reused++, structuredClone(old.units)) : (stats.parsed++, parse());
    next.push({ key, revision, units: structuredClone(units) });
    return units;
  };
  const save = () => {
    if (!limit) return stats;
    try {
      const payload = JSON.stringify({ schema: 1, root: resolve(root), parser: parserHash(), entries: next } satisfies Payload);
      // Bound decoding on subsequent reads and refuse oversized writes without failing indexing.
      const encoded = JSON.stringify({ sha256: sha(payload), payload });
      if (Buffer.byteLength(encoded) > DECODE_BYTES) throw Error("CACHE_QUOTA: decoded raw cache exceeds limit; canonical indexing retained");
      const bytes = gzipSync(encoded); stats.bytes = bytes.length;
      requireCacheSpace(bytes.length, limit, null);
      const path = safeCachePath(root, PARSE_CACHE);
      if (existsSync(path) && readFileSync(path).equals(bytes)) return stats;
      const available = cacheUsage(root).availableBytes;
      requireCacheSpace(bytes.length, limit, available);
      atomicStoreWrite(root, path, bytes); stats.saved = true;
    } catch (error) { stats.diagnostic = String(error); }
    return stats;
  };
  return { reuse, save, stats };
}

/** Lazy phrase text: digest each consumed physical file once, then use matching raw units.
 * Changed/missing files use the exact buffer just read, not a second unsynchronised read. */
export function cachedUnitText(root: string): (path: string, title?: string) => string {
  let items: Map<string, { revision: string; units: Map<string, Unit> }[]> | undefined;
  const files = new Map<string, { text: string; revision: string; entries?: Map<string, string> }>();
  return (path, title) => {
    if (!items) {
      items = new Map();
      try { for (const item of load(root, parseLimit())?.entries ?? []) {
        const [file] = JSON.parse(item.key);
        items.set(file, [...(items.get(file) ?? []), { revision: item.revision,
          units: new Map(item.units.map(unit => [JSON.stringify([unit.relPath, unit.title]), unit])) }]);
      } } catch { /* raw cache unavailable: exact source fallback */ }
    }
    const [file, anchor] = path.split("#");
    let source = files.get(file);
    if (!source) {
      let bytes: Buffer;
      try { bytes = readFileSync(join(root, file)); } catch (error: any) { if (error.code !== "ENOENT") throw error; bytes = Buffer.alloc(0); }
      source = { text: bytes.toString("utf8").replace(/\r\n/g, "\n"), revision: items.has(file) ? sha(bytes) : "" }; files.set(file, source);
    }
    for (const item of items.get(file) ?? []) if (item.revision === source.revision) {
      const unit = title ? item.units.get(JSON.stringify([path, title])) : [...item.units.values()].find(unit => unit.relPath === path);
      if (unit) return anchor ? unit.text.trimEnd() : unit.text;
    }
    if (!anchor) return source.text;
    if (!source.entries) {
      source.entries = new Map();
      for (const entry of ledgerEntriesFromText(source.text)) {
        const exact = JSON.stringify([entry.anchor, entry.title]);
        if (!source.entries.has(exact)) source.entries.set(exact, entry.text);
        if (!source.entries.has(entry.anchor)) source.entries.set(entry.anchor, entry.text);
      }
    }
    return (title ? source.entries.get(JSON.stringify([anchor, title])) : undefined) ?? source.entries.get(anchor) ?? "";
  };
}

export function evictParseCache(root: string, apply = false) {
  const preview = () => ({ ...cacheUsage(root), target: safeCachePath(root, PARSE_CACHE), applied: false });
  if (!apply) return preview();
  return withStoreLock(root, () => {
    const result = preview();
    if (existsSync(result.target)) unlinkSync(result.target);
    return { ...result, applied: true, recovery: "Optional raw parses rebuild on the next kb-index; Markdown and ordinary indexes were not removed." };
  });
}
