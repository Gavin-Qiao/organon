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
import { readHookInput, projectRoot, ledgerPath, telosPath, telosBlock } from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);

// (1) Telos — injected whole (it is short by design), capped as a runaway guard.
const tp = telosPath(root);
const telos = tp ? telosBlock(readFileSync(tp, "utf8")) : "";

// (2) NOW-header — the live state: "## NOW" down to the "## Log" that starts the append-only
// entries. Fall back to the RESUME block, then the top of the file.
const lp = ledgerPath(root);
let now = "";
let title = "Promptus project";
if (lp) {
  const lines = readFileSync(lp, "utf8").split(/\r?\n/);
  title = (lines.find((l) => /^# /.test(l)) || "# Research Ledger").replace(/^#\s*/, "").trim();
  const nowI = lines.findIndex((l) => /^## NOW/.test(l));
  const logI = lines.findIndex((l) => /^## Log\b/.test(l));
  if (nowI !== -1) {
    const end = logI > nowI ? logI : Math.min(lines.length, nowI + 60);
    now = lines.slice(nowI, end).join("\n").trim();
  } else {
    const resumeI = lines.findIndex((l) => /RESUME HERE/.test(l));
    now =
      resumeI !== -1
        ? lines.slice(resumeI, Math.min(lines.length, resumeI + 14)).join("\n").trim()
        : lines.slice(0, 30).join("\n").trim();
  }
}

if (!telos && !now) process.exit(0);

let out =
  `Promptus — resuming "${title}". The Telos below is the project's direction and the rules ` +
  `that never bend; hold it before acting. Then the live state from the ledger NOW-header. ` +
  `(Full stores: .promptus/TELOS.md, .promptus/ledger/RESEARCH-LEDGER.md.)\n`;
if (telos) out += `\n=== TELOS — read before acting (not optional) ===\n${telos}\n`;
if (now) out += `\n=== NOW — live state, from the ledger ===\n${now}\n`;
process.stdout.write(out);
