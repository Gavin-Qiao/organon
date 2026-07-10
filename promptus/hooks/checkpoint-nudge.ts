#!/usr/bin/env bun
/**
 * Claude SessionEnd / Codex PreCompact hook — a gentle nudge to flush perishable state.
 * It never performs the checkpoint itself and is a no-op outside a Promptus repo.
 */
import { readHookInput, projectRoot, ledgerPath } from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);
if (!ledgerPath(root)) process.exit(0);

if (input.reason === "clear") process.exit(0); // a deliberate Claude /clear isn't a handoff

const message =
  "Promptus: session ending. If anything you decided, ran, or learned lives only in this " +
  "conversation, run the Promptus checkpoint workflow so the ledger keeps it.";
if (input.hook_event_name === "PreCompact") {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
} else {
  process.stdout.write(message + "\n");
}
