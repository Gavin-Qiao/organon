#!/usr/bin/env bun
/**
 * ledger-append.ts — thin back-compat wrapper. Forwards to kb-add with
 * `--substrate ledger`, preserving the operator's existing muscle memory and any
 * callers of the old append script. New code should call kb-add directly.
 *
 * Usage:
 *   ledger-append --kind <K> --status <S> --title "<t>" [...]  < body.md
 *     ≡ kb-add --substrate ledger --kind <K> --status <S> --title "<t>" [...]
 *
 * Note (migration): the original `ledger-append.mjs` (node) took `--ledger <path>`;
 * this resolves the ledger from the project root (the nearest `.promptus/`) instead. Update
 * any AGENTS.md that still calls `node …/ledger-append.mjs --ledger …` when you
 * adopt Promptus in a repo (see .promptus/docs/adoption.md).
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("bun", [join(here, "kb-add.ts"), "--substrate", "ledger", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
