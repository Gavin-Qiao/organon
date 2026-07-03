#!/usr/bin/env bun
/**
 * kb-get.ts — fetch ONE unit's text by its catalog path, without opening the whole
 * 140KB ledger. The companion to kb-find: kb-find says WHICH unit (header-first, the
 * cheap-certain tier); kb-get returns that unit's body (the conditional tier — fetch
 * only the ones the headers said were worth reading). Both resolve a unit through
 * lib/units.ts, so a path kb-find emits is exactly a path kb-get reads.
 *
 * Usage: kb-get <path>... [--title <t>] [--root <dir>]
 *
 *   <path>   a catalog path, the third ` · ` column of kb-find's output:
 *              docs/foo.md                              → a page: the whole file
 *              ledger/RESEARCH-LEDGER.md#2026-06-29T18:44:31 → a ledger entry: just that slice
 *   --title  disambiguate two entries that share a same-second anchor (pass the catalog title).
 *   --root   project root (defaults to cwd, walking up to the nearest .promptus/).
 *
 * Prints each unit verbatim — frontmatter kept, because a lit unit's `source:` is its
 * evidence. Several paths are fenced with a `==> path <==` divider. Exit 1 if any path
 * resolves to nothing (missing file or unknown anchor), naming it on stderr — kb-get is an
 * honest substrate: it never invents a body, and it tells you precisely what it could not find.
 */

import { existsSync } from "node:fs";
import { join, resolve as resolvePath, sep } from "node:path";
import { findProjectRoot } from "./lib/paths.ts";
import { ledgerEntries, readCached } from "./lib/units.ts";

type Resolved = { ok: true; text: string } | { ok: false; err: string };

function resolve(root: string, path: string, title?: string): Resolved {
  const [rel, anchor] = path.split("#");
  const file = join(root, rel);
  // confine to the project: a catalog path is always inside root, so a `../` escape is never a unit —
  // refuse it rather than read an arbitrary file off disk (on Unix, `../…/etc/hosts` exists).
  const abs = resolvePath(file), absRoot = resolvePath(root);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return { ok: false, err: `refusing to read outside the project root: ${rel}` };
  if (!existsSync(file)) return { ok: false, err: `no such file: ${rel}` };
  if (!anchor) return { ok: true, text: readCached(file) }; // a page: the file IS the unit
  const es = ledgerEntries(file);
  const atAnchor = es.filter((x) => x.anchor === anchor);
  if (!atAnchor.length) {
    // unknown anchor — offer same-day neighbours so the caller can spot a typo or a stale catalog
    const near = es.filter((x) => x.anchor.slice(0, 10) === anchor.slice(0, 10)).slice(0, 3).map((x) => `${x.anchor} (${x.title})`);
    return { ok: false, err: `no entry '#${anchor}' in ${rel}${near.length ? ` — near: ${near.join(", ")}` : ""}` };
  }
  if (title) {
    const exact = atAnchor.find((x) => x.title === title);
    if (exact) return { ok: true, text: exact.text };
    // a title was named but matches none here. Resolve only when unambiguous (one entry at the
    // anchor, the title was just belt-and-braces); otherwise stay honest — NEVER hand back a
    // different entry than the one asked for.
    if (atAnchor.length === 1) return { ok: true, text: atAnchor[0].text };
    return { ok: false, err: `no entry titled "${title}" at '#${anchor}' — ${atAnchor.length} candidates: ${atAnchor.map((x) => `"${x.title}"`).join("; ")}` };
  }
  return { ok: true, text: atAnchor[0].text }; // no title given: the first entry at the anchor
}

function main(argv: string[]): number {
  const flags: Record<string, string> = {};
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { flags[argv[i].slice(2)] = argv[i + 1] ?? ""; i++; }
    else paths.push(argv[i]);
  }
  if (!paths.length) { console.error("kb-get: usage: kb-get <path>... [--title <t>] [--root <dir>]"); return 1; }

  const root = findProjectRoot(flags.root ?? process.cwd());
  const blocks: string[] = [];
  let failures = 0;
  for (const p of paths) {
    const r = resolve(root, p, flags.title);
    if (r.ok) blocks.push(paths.length > 1 ? `==> ${p} <==\n${r.text}` : r.text);
    else { console.error(`kb-get: ${r.err}`); failures++; }
  }
  if (blocks.length) console.log(blocks.join("\n\n"));
  return failures > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
