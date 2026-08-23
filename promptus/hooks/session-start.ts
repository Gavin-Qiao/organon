#!/usr/bin/env bun
/**
 * SessionStart hook — make the Telos non-optional, and orient a resuming agent.
 *
 * Every session start, inject (1) the project's Telos — its direction and the rules that never
 * bend — as content rather than a "go read it" pointer, so the main session always holds the
 * north star before acting; then (2) the ledger's NOW-header, the live resumable state. A strict
 * no-op outside a Promptus repo (no Telos and no ledger → nothing emitted).
 */
import { readFileSync } from "node:fs";
import {
  readHookInput,
  projectRoot,
  ledgerPath,
  telosPath,
  telosBlock,
  nowBlock,
} from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);

// (1) Telos — injected whole (it is short by design), capped as a runaway guard.
const tp = telosPath(root);
const telos = tp ? telosBlock(readFileSync(tp, "utf8")) : "";

// (2) NOW-header — marker-bounded live state, with legacy heading fallback.
const lp = ledgerPath(root);
let now = "";
let title = "Promptus project";
if (lp) {
  const ledger = readFileSync(lp, "utf8");
  const lines = ledger.split(/\r?\n/);
  title = (lines.find((l) => /^# /.test(l)) || "# Research Ledger").replace(/^#\s*/, "").trim();
  now = nowBlock(ledger);
}

if (!telos && !now) process.exit(0);

let out =
  `Promptus — resuming "${title}". The Telos below is the project's direction and the rules ` +
  `that never bend; hold it before acting. Then the live state from the ledger NOW-header. ` +
  `(Full stores: .promptus/TELOS.md, .promptus/ledger/RESEARCH-LEDGER.md.)\n`;
if (telos) out += `\n=== TELOS — read before acting (not optional) ===\n${telos}\n`;
if (now) out += `\n=== NOW — live state, from the ledger ===\n${now}\n`;
process.stdout.write(out);
