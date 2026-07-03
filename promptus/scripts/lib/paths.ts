/**
 * paths.ts — resolve where things live. The project root is the nearest ancestor
 * directory whose `.promptus/` holds the vocab (or Telos); all stores resolve under it.
 *
 * Contract:
 *   findProjectRoot(start):  walk up from `start` to the nearest dir with
 *                            .promptus/schema/kb-vocab.json (or .promptus/TELOS.md); throw if none.
 *   storePath(root, vocab, substrate, slug?):
 *                            placement "sentinel" → the store file (e.g. .promptus/ledger/RESEARCH-LEDGER.md);
 *                            placement "file"     → <store>/<slug>.md.
 *   indexPath(root, vocab, substrate):
 *                            the substrate's index file (.promptus/memory/MEMORY.md), or null.
 *   derivedDir(root):        <root>/.promptus/cache (gitignored; CATALOG.md + graph.json).
 *   insertBeforeSentinel(content, block, sentinel):
 *                            `content` with `block` inserted immediately before the sentinel
 *                            line (matching ledger-append.mjs); throw if the sentinel is absent.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Vocab } from "./vocab.ts";

export function findProjectRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    // The root carries Promptus's namespace: its vocab (or its Telos) lives under .promptus/.
    if (existsSync(join(dir, ".promptus", "schema", "kb-vocab.json")) || existsSync(join(dir, ".promptus", "TELOS.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no .promptus/ project (schema or TELOS) found walking up from ${start}`);
    dir = parent;
  }
}

export function storePath(root: string, vocab: Vocab, substrate: string, slug?: string): string {
  const sub = vocab.substrates[substrate];
  if (!sub) throw new Error(`unknown substrate "${substrate}"`);
  if (sub.placement === "sentinel") return join(root, sub.store);
  if (!slug) throw new Error(`file placement for "${substrate}" requires a slug`);
  return join(root, sub.store, `${slug}.md`);
}

export function indexPath(root: string, vocab: Vocab, substrate: string): string | null {
  const idx = vocab.substrates[substrate]?.index;
  return idx ? join(root, idx) : null;
}

export function derivedDir(root: string): string {
  return join(root, ".promptus", "cache");
}

export function insertBeforeSentinel(content: string, block: string, sentinel: string): string {
  if (!content.includes(sentinel)) throw new Error(`sentinel not found: ${sentinel}`);
  const entry = block.endsWith("\n") ? block : `${block}\n`;
  return content.replace(sentinel, `${entry}\n${sentinel}`);
}
