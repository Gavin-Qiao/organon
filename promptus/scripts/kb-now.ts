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
import { readFileSync } from "node:fs";
import { nowLocalStamp } from "./lib/clock.ts";
import { loadVocab } from "./lib/vocab.ts";
import { findProjectRoot, storePath } from "./lib/paths.ts";
import { ledgerEntries } from "./lib/units.ts";
import { atomicStoreWrite, withStoreLock } from "./lib/store-lock.ts";

const NOW_START = "<!-- now:start -->";
const NOW_END = "<!-- now:end -->";
const REQUIRED: Array<[string, RegExp]> = [
  ["NOW", /^#{2,3}\s+NOW\s*$/m],
  ["Open frontier", /^#{2,3}\s+Open frontier\s*$/m],
  ["Next actions", /^#{2,3}\s+Next actions\s*$/m],
  ["RESUME HERE", /^#{2,3}\s+.*RESUME HERE.*$/m],
];
const UPDATED = /(^\*\*Updated:\*\*\s+).*?(\s+·\s+.*)?$/m;
const NOW_MARKER = /^<!-- kb:now-through \S+ -->\s*$/gm;

const HELP = `kb-now — bounded writer for the resumable NOW-header
usage: kb-now [--note "<short note>"] [--max-lines <n>] [--root <dir>] [--dry-run] < now.md
The input must contain NOW, Open frontier, Next actions, and RESUME headings.
The gate stamps Updated, inserts exactly one freshness marker for the latest
ledger unit, caps the region at 120 lines by default, and touches no log text.`;

function fail(msg: string): never {
  console.error(`kb-now: ${msg}`);
  process.exit(1);
}

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const ledger = storePath(root, loadVocab(root), "ledger");
  const dry = argv.includes("--dry-run");

  // The LLM supplies only the prose body.
  const supplied = (process.stdin.isTTY ? "" : readFileSync(0, "utf8")).replace(/\r\n/g, "\n").trim();
  if (!supplied) fail("empty NOW-header on stdin — pipe the new header (## NOW … RESUME) in");
  const missing = REQUIRED.filter(([, pattern]) => !pattern.test(supplied)).map(([name]) => name);
  if (missing.length) fail(`NOW-header missing required section(s): ${missing.join(", ")}`);
  const maxLines = Number(arg(argv, "max-lines") ?? 120);
  if (!Number.isInteger(maxLines) || maxLines < 1) fail("--max-lines must be a positive integer");
  const suppliedLines = supplied.split("\n").length;
  if (suppliedLines > maxLines) fail(`NOW-header has ${suppliedLines} lines, above --max-lines ${maxLines}`);

  const prepare = () => {
    const text = readFileSync(ledger, "utf8").replace(/\r\n/g, "\n");
    if (text.indexOf(NOW_START) < 0 || text.indexOf(NOW_END) < 0 || text.indexOf(NOW_END) < text.indexOf(NOW_START)) {
      throw new Error(`ledger has no ${NOW_START} … ${NOW_END} region — run /promptus-init, or add the markers`);
    }
    if (!UPDATED.test(text)) throw new Error("ledger has no `**Updated:**` line to stamp");
    const entries = ledgerEntries(ledger);
    const latest = entries.at(-1);
    const through = latest ? (/^<!-- kb:id (\S+) -->$/m.exec(latest.text)?.[1] ?? `anchor:${latest.anchor}`) : "EMPTY";
    const withoutMarkers = supplied.replace(NOW_MARKER, "").replace(/\n{3,}/g, "\n\n").trim();
    const body = withoutMarkers.replace(/^#{2,3}\s+NOW\s*$/m, (heading) => `${heading}\n<!-- kb:now-through ${through} -->`);
    const note = arg(argv, "note");
    const stamp = `${nowLocalStamp().slice(0, 10)}${note ? ` (${note})` : ""}`;
    const stamped = text.replace(UPDATED, (_m, pre: string, tail?: string) => `${pre}${stamp}${tail ?? ""}`);
    const s = stamped.indexOf(NOW_START);
    const e = stamped.indexOf(NOW_END);
    const next = `${stamped.slice(0, s + NOW_START.length)}\n\n${body}\n\n${stamped.slice(e)}`;
    return { body, next, stamp };
  };

  if (dry) {
    let prepared: ReturnType<typeof prepare>;
    try { prepared = prepare(); }
    catch (error) { console.error(`kb-now: ${error instanceof Error ? error.message : String(error)}`); return 1; }
    console.log(`[dry-run] would stamp Updated: ${prepared.stamp} and replace the NOW region:\n`);
    console.log(`${NOW_START}\n\n${prepared.body}\n\n${NOW_END}`);
    return 0;
  }
  let stamp: string;
  try {
    stamp = withStoreLock(root, () => {
      const prepared = prepare();
      atomicStoreWrite(root, ledger, prepared.next);
      return prepared.stamp;
    });
  } catch (error) {
    console.error(`kb-now: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  console.log(`kb-now: NOW-header updated — stamped ${stamp}.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
