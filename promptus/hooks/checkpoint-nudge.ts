#!/usr/bin/env bun
/**
 * SessionEnd hook — a gentle nudge to flush before the session is gone. No auto-run
 * (PreCompact stays manual by preference); just a reminder. No-op outside a Promptus repo.
 */
import { readHookInput, projectRoot, ledgerPath } from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);
if (!ledgerPath(root)) process.exit(0);

if (input.reason === "clear") process.exit(0); // a deliberate /clear isn't a handoff

process.stdout.write(
  "Promptus: session ending. If anything you decided, ran, or learned lives only in this " +
    "conversation, run /promptus:checkpoint so the ledger keeps it.\n",
);
