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
import { loadVocab } from "./lib/vocab.ts";
import { ledgerEntries, readCached } from "./lib/units.ts";

type Resolved = { ok: true; text: string } | { ok: false; err: string };

function resolve(root: string, path: string, title: string | undefined, ledgerFiles: Set<string>, wholeFile: boolean): Resolved {
  const [rel, anchor] = path.split("#");
  const file = join(root, rel);
  // confine to the project: a catalog path is always inside root, so a `../` escape is never a unit —
  // refuse it rather than read an arbitrary file off disk (on Unix, `../…/etc/hosts` exists).
  const abs = resolvePath(file), absRoot = resolvePath(root);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return { ok: false, err: `refusing to read outside the project root: ${rel}` };
  if (!existsSync(file)) return { ok: false, err: `no such file: ${rel}` };
  const normalized = resolvePath(file);
  const isLedger = ledgerFiles.has(normalized)
    || [...ledgerFiles].some((ledger) => normalized.startsWith(resolvePath(join(ledger, "..", "archive")) + sep));
  if (!anchor && isLedger && !wholeFile) {
    return { ok: false, err: `${rel} is a ledger log, not one unit — use an anchored path from kb-find, or explicitly pass --whole-file` };
  }
  if (!anchor && title) return { ok: false, err: `--title only disambiguates an anchored ledger path; ${rel} has no #anchor` };
  if (!anchor) return { ok: true, text: readCached(file) }; // a page, or an explicit whole-log fetch
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

const HELP = `kb-get — fail-closed source-unit fetch
usage:
  kb-get <catalog-path>... [--title <t>] [--max-bytes <n>] [--root <dir>]
  kb-get <ledger-file> --whole-file [--max-bytes <n>] [--root <dir>]
rules:
  ledger paths must carry the #anchor emitted by kb-find; an unanchored log is
  refused unless --whole-file is explicit. Output is capped at 65536 bytes by
  default; raise --max-bytes deliberately, or use --whole-file for an explicit
  uncapped whole-file fetch.`;

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const flags: Record<string, string> = {};
  const booleans = new Set(["whole-file"]);
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      if (booleans.has(key)) flags[key] = "";
      else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) { console.error(`kb-get: --${key} requires a value`); return 1; }
        flags[key] = next;
        i++;
      }
    }
    else paths.push(argv[i]);
  }
  if (!paths.length) { console.error("kb-get: usage: kb-get <path>... [--title <t>] [--max-bytes <n>] [--root <dir>]"); return 1; }

  const root = findProjectRoot(flags.root ?? process.cwd());
  const vocab = loadVocab(root);
  const ledgerFiles = new Set(
    Object.values(vocab.substrates)
      .filter((substrate) => substrate.envelope === "log")
      .map((substrate) => resolvePath(root, substrate.store)),
  );
  const maxBytes = Number(flags["max-bytes"] ?? 65536);
  if (!Number.isInteger(maxBytes) || maxBytes < 1) { console.error("kb-get: --max-bytes must be a positive integer"); return 1; }
  const wholeFile = "whole-file" in flags;
  const blocks: string[] = [];
  let failures = 0;
  for (const p of paths) {
    const r = resolve(root, p, flags.title, ledgerFiles, wholeFile);
    if (r.ok) {
      const bytes = Buffer.byteLength(r.text);
      if (!wholeFile && bytes > maxBytes) {
        console.error(`kb-get: refusing ${p}: unit is ${bytes} bytes, above --max-bytes ${maxBytes}; raise the ceiling deliberately`);
        failures++;
      } else blocks.push(paths.length > 1 ? `==> ${p} <==\n${r.text}` : r.text);
    }
    else { console.error(`kb-get: ${r.err}`); failures++; }
  }
  if (blocks.length) console.log(blocks.join("\n\n"));
  return failures > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
