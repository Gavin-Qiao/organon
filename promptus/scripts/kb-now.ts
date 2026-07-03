#!/usr/bin/env bun
/**
 * kb-now.ts — the gated writer for the ledger's NOW-header (the resumable state).
 *
 * The append-only LOG enters through kb-add; the mutable header enters through THIS,
 * so nothing in the ledger is ever freehand. The LLM supplies only the prose (on
 * stdin); the script owns everything a model can get wrong:
 *   - the `Updated:` stamp, from the clock in LOCAL time (never hand-typed — a
 *     hand-typed date is the original drift kb-add was built to kill),
 *   - the placement: a BOUNDED write between `<!-- now:start -->` and
 *     `<!-- now:end -->`, so the log and the static framing physically can't be touched,
 *   - a required-section check, so the header can't be left structurally broken,
 *   - an atomic write (temp + rename), so a crash mid-write leaves the original intact.
 *
 * Usage: kb-now [--note "<short parenthetical>"] [--root <dir>] [--dry-run]  < now-header.md
 *
 * stdin replaces the region between the sentinels and MUST contain every section in
 * REQUIRED, or it is refused with the missing set.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { nowLocalStamp } from "./lib/clock.ts";
import { loadVocab } from "./lib/vocab.ts";
import { findProjectRoot, storePath } from "./lib/paths.ts";

const NOW_START = "<!-- now:start -->";
const NOW_END = "<!-- now:end -->";
const REQUIRED = ["## NOW", "## Open frontier", "## Next actions", "RESUME HERE"];
const UPDATED = /(^\*\*Updated:\*\*\s+).*?(\s+·\s+.*)?$/m;

function fail(msg: string): never {
  console.error(`kb-now: ${msg}`);
  process.exit(1);
}

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function main(argv: string[]): number {
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const ledger = storePath(root, loadVocab(root), "ledger");
  const dry = argv.includes("--dry-run");

  // The LLM supplies only the prose body.
  const body = (process.stdin.isTTY ? "" : readFileSync(0, "utf8")).replace(/\r\n/g, "\n").trim();
  if (!body) fail("empty NOW-header on stdin — pipe the new header (## NOW … RESUME) in");
  const missing = REQUIRED.filter((s) => !body.includes(s));
  if (missing.length) fail(`NOW-header missing required section(s): ${missing.join(", ")}`);

  const text = readFileSync(ledger, "utf8").replace(/\r\n/g, "\n");
  if (text.indexOf(NOW_START) < 0 || text.indexOf(NOW_END) < 0 || text.indexOf(NOW_END) < text.indexOf(NOW_START)) {
    fail(`ledger has no ${NOW_START} … ${NOW_END} region — run /promptus-init, or add the markers`);
  }
  if (!UPDATED.test(text)) fail("ledger has no `**Updated:**` line to stamp");

  // 1. The script owns the date — local, matching the log; the LLM supplies only the note.
  const note = arg(argv, "note");
  const stamp = `${nowLocalStamp().slice(0, 10)}${note ? ` (${note})` : ""}`;
  const stamped = text.replace(UPDATED, (_m, pre: string, tail?: string) => `${pre}${stamp}${tail ?? ""}`);

  // 2. Bounded write: recompute the region on the stamped text (the stamp shifts offsets), then
  //    replace only between the sentinels — the log and the framing are physically out of reach.
  const s = stamped.indexOf(NOW_START);
  const e = stamped.indexOf(NOW_END);
  const next = `${stamped.slice(0, s + NOW_START.length)}\n\n${body}\n\n${stamped.slice(e)}`;

  if (dry) {
    console.log(`[dry-run] would stamp Updated: ${stamp} and replace the NOW region:\n`);
    console.log(`${NOW_START}\n\n${body}\n\n${NOW_END}`);
    return 0;
  }
  const tmp = `${ledger}.tmp`;
  writeFileSync(tmp, next);
  renameSync(tmp, ledger); // atomic over the original
  console.log(`kb-now: NOW-header updated — stamped ${stamp}.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
