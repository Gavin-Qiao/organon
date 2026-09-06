/** Benchmark-only raw parser memoization. Production never imports this module. */
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Unit } from "../promptus/scripts/lib/read-store.ts";
import { atomicStoreWrite } from "../promptus/scripts/lib/store-lock.ts";
import { controlPath, cut, fixture, sha } from "./publication-fence.ts";

export const PARSE_CACHE = "raw-parses.json.gz";
type RecordEntry = { key: string; revision: string; units: Unit[] };
type Envelope = { schema: 1; root: string; config: string; entries: RecordEntry[] };
type Stats = { filesParsed: number; filesReused: number; unitsParsed: number; unitsReused: number; sourceBytesRead: number; directoryCalls: number; directoryEntries: number; loadMs: number; parseMs: number; saveMs: number; cacheBytesRead: number; cacheBytesWritten: number; cacheBytes: number; rawJsonBytes: number; reason: string };
type Context = { root: string; dirty: Set<string> | null; previous: Map<string, RecordEntry>; next: Map<string, RecordEntry>; stats: Stats };
let context: Context | undefined;
export function noteDiscovery(count: number) {
  if (context) { context.stats.directoryCalls++; context.stats.directoryEntries += count; }
}
export function reuseFile(root: string, file: string, kind: string, bytes: Map<string, Buffer> | undefined, parse: (cache: Map<string, Buffer>) => Unit[]): Unit[] {
  if (!context || context.root !== root) return parse(bytes ?? new Map());
  const rel = relative(root, file).replaceAll("\\", "/"), key = JSON.stringify([rel, kind]);
  const previous = context.previous.get(key);
  if (previous && context.dirty && !context.dirty.has(rel)) {
    context.next.set(key, previous);
    context.stats.filesReused++; context.stats.unitsReused += previous.units.length;
    // The indexer mutates effective status. Never hand it the stored raw objects.
    return structuredClone(previous.units);
  }
  const start = performance.now();
  const buffer = readFileSync(file), buffers = bytes ?? new Map<string, Buffer>();
  buffers.set(file, buffer);
  const units = parse(buffers);
  context.stats.sourceBytesRead += buffer.length;
  context.stats.filesParsed++; context.stats.unitsParsed += units.length;
  context.next.set(key, { key, revision: sha(buffer), units: structuredClone(units) });
  context.stats.parseMs += performance.now() - start;
  return units;
}
export function withParsedReuse<T>(root: string, vocab: unknown, sourceCertification: boolean, collect: () => T): T {
  if (context) throw Error("nested raw-cache collection");
  const marker = fixture(root), config = sha(marker.runtimeHash + JSON.stringify(vocab));
  const path = join(root, ".promptus/cache", PARSE_CACHE);
  const stats: Stats = { filesParsed: 0, filesReused: 0, unitsParsed: 0, unitsReused: 0, sourceBytesRead: 0, directoryCalls: 0, directoryEntries: 0, loadMs: 0, parseMs: 0, saveMs: 0, cacheBytesRead: 0, cacheBytesWritten: 0, cacheBytes: 0, rawJsonBytes: 0, reason: "full" };
  let previous: RecordEntry[] = [], dirty: Set<string> | null = null;
  const started = performance.now();
  try {
    if (sourceCertification) throw Error("source-certification");
    const control = JSON.parse(readFileSync(controlPath(root), "utf8"));
    if (!Array.isArray(control.dirty) || !["DIRTY", "PUBLISHING"].includes(control.phase)) throw Error("full-reconciliation");
    const raw = readFileSync(path); stats.cacheBytesRead = raw.length;
    if (sha(raw) !== control.components?.[PARSE_CACHE]) throw Error("cache-checksum");
    // Resource guard for synthetic fixtures, not an adoption/disk allowance.
    const decoded = gunzipSync(raw, { maxOutputLength: 128 * 1024 * 1024 });
    const cache = JSON.parse(decoded.toString("utf8")) as Envelope;
    if (cache.schema !== 1 || cache.root !== root || cache.config !== config || !Array.isArray(cache.entries)
      || cache.entries.some(e => typeof e.key !== "string" || typeof e.revision !== "string" || !Array.isArray(e.units))) throw Error("cache-schema");
    if (new Set(cache.entries.map(e => e.key)).size !== cache.entries.length) throw Error("duplicate-cache-key");
    previous = cache.entries; dirty = new Set(control.dirty); stats.reason = "known-dirty-reuse";
  } catch (error) { stats.reason = sourceCertification ? "source-certification" : String(error); }
  stats.loadMs = performance.now() - started;
  context = { root, dirty, previous: new Map(previous.map(e => [e.key, e])), next: new Map(), stats };
  try {
    const result = collect();
    const startSave = performance.now();
    const envelope: Envelope = { schema: 1, root, config, entries: [...context.next.values()] };
    const json = Buffer.from(JSON.stringify(envelope));
    const compressed = gzipSync(json);
    stats.rawJsonBytes = json.length; stats.cacheBytes = compressed.length;
    cut("before-parse-cache");
    const same = existsSync(path) && readFileSync(path).equals(compressed);
    if (!same) {
      // The existing atomic writer passes bytes directly to fs.writeFileSync.
      // Its public type is string-only; no production signature change is needed.
      const writeBytes = atomicStoreWrite as unknown as (root: string, path: string, content: Uint8Array) => void;
      writeBytes(root, path, compressed); stats.cacheBytesWritten = compressed.length;
    }
    cut("after-parse-cache");
    stats.saveMs = performance.now() - startSave;
    return result;
  } finally {
    process.stderr.write(`PARSE_REUSE ${JSON.stringify(stats)}\n`);
    context = undefined;
  }
}
