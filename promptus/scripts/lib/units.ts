/**
 * units.ts — the one definition of "what text belongs to a unit." A page unit is one
 * file = one unit; a ledger entry shares its file with ~200 others, so its text is just
 * the slice between its `### [ts]` head and the next. Both the retriever (kb-find, for
 * --snippet and body recall) and the fetcher (kb-get) resolve a unit through here, so
 * they can never disagree about where a unit begins and ends. Stdlib-only.
 *
 * Contract:
 *   readCached(file):              the file's text, CRLF-normalised, memoised; "" if absent.
 *   ledgerEntries(file):           the file split into { anchor, title, text } slices, one per `### [ts]` head.
 *   unitText(root, path, title?):  the text of ONE unit named by a catalog path —
 *                                  the whole file for `docs/x.md`, just the entry for `ledger/…md#anchor`.
 *                                  `title` disambiguates entries that collide on a same-second anchor.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Entry { anchor: string; title: string; text: string }
export interface Head { anchor: string; kindStatus: string; title: string; idx: number }

const fileCache = new Map<string, string>();
export function readCached(file: string): string {
  if (!fileCache.has(file)) fileCache.set(file, existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "");
  return fileCache.get(file)!;
}

// One ledger head line: `### [<ts>] <KIND>/<STATUS> — <title>`. Tested per-line (not /g over the
// whole text) so a `### [ts]` line that sits inside a ``` code fence — an example of the format
// quoted in an entry's body, not a unit — is NOT mistaken for a real head and does not split the log.
const HEAD = /^### \[([^\]]+)\] ([^\n—]+?) — (.+)$/;

/**
 * The head lines of a log file, with byte offsets so callers can slice each entry's text. Skips any
 * `### [ts]` inside a ``` fence (mirrors lib/links.ts, which already ignores `[[links]]` in code).
 * Shared by kb-index (to build units) and kb-get/kb-find (to slice one entry) so the catalog anchor
 * and the fetched slice can never drift apart. The anchor is the timestamp with spaces → T.
 */
export function ledgerHeads(text: string): Head[] {
  const heads: Head[] = [];
  let inFence = false;
  let idx = 0;
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = HEAD.exec(line);
      if (m) heads.push({ anchor: m[1].replace(/ /g, "T"), kindStatus: m[2].trim(), title: m[3].trim(), idx });
    }
    idx += line.length + 1; // + the "\n" that split() removed
  }
  return heads;
}

const entryCache = new Map<string, Entry[]>();
export function ledgerEntries(file: string): Entry[] {
  if (entryCache.has(file)) return entryCache.get(file)!;
  const text = readCached(file);
  const heads = ledgerHeads(text);
  const entries = heads.map((h, i) => ({
    anchor: h.anchor,
    title: h.title,
    text: text.slice(h.idx, i + 1 < heads.length ? heads[i + 1].idx : undefined).trimEnd(),
  }));
  entryCache.set(file, entries);
  return entries;
}

/** The text of one unit named by a catalog path. Empty string if the file or entry is gone. */
export function unitText(root: string, path: string, title?: string): string {
  const [rel, anchor] = path.split("#");
  const file = join(root, rel);
  if (!anchor) return readCached(file);
  const es = ledgerEntries(file);
  // entries sharing a second collide on the anchor alone — disambiguate by the catalog's title
  const e = (title ? es.find((x) => x.anchor === anchor && x.title === title) : undefined) ?? es.find((x) => x.anchor === anchor);
  return e?.text ?? "";
}
