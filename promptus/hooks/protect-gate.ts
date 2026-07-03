#!/usr/bin/env bun
/**
 * PreToolUse hook — protect the gate. Knowledge enters through kb-add, not freehand.
 * Blocks:
 *   - any Write/Edit under .promptus/ (the derived index; kb-index owns it)
 *   - overwriting the ledger, or an Edit that hand-adds a `### [ts] …` log entry
 * Allows everything else, including NOW-header edits at /checkpoint. No-op outside a
 * Promptus repo.
 */
import { resolve, relative, sep } from "node:path";
import { readHookInput, projectRoot, isPromptusRepo } from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);
if (!isPromptusRepo(root)) process.exit(0);

const tool: string = input.tool_name || "";
const ti = input.tool_input || {};
const filePath: string = ti.file_path || ti.path || "";
if (!filePath) process.exit(0);

const rel = relative(root, resolve(root, filePath)).split(sep).join("/");

function deny(reason: string): never {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const KB_ADD =
  'echo "<body>" | bun "$CLAUDE_PLUGIN_ROOT/scripts/kb-add.ts" --substrate <s> --kind <K> --status <S> --title "…"';
const KB_NOW =
  'echo "<## NOW … RESUME>" | bun "$CLAUDE_PLUGIN_ROOT/scripts/kb-now.ts" --note "<short>"';

// 1. The derived cache is never hand-edited (the rest of .promptus/ is the committed store).
if (rel === ".promptus/cache" || rel.startsWith(".promptus/cache/")) {
  deny(
    "`.promptus/cache/` is the derived index — never hand-edit it. " +
      'It is rebuilt by `bun "$CLAUDE_PLUGIN_ROOT/scripts/kb-index.ts"`.',
  );
}

// 2. The ledger: log entries go through kb-add, the NOW-header through kb-now. Nothing freehand.
if (rel === ".promptus/ledger/RESEARCH-LEDGER.md") {
  if (tool === "Write") {
    deny(`Don't overwrite the ledger. Log entries go through kb-add; the NOW-header through kb-now:\n  ${KB_ADD}\n  ${KB_NOW}`);
  }
  if (tool === "Edit" || tool === "MultiEdit") {
    const adds = (s: string) => /(^|\n)### \[/.test(s || "");
    const stamps = (s: string) => /\*\*Updated:\*\*/.test(s || "");
    const newStr = ti.new_string ?? "";
    const oldStr = ti.old_string ?? "";
    const edits = tool === "MultiEdit" && Array.isArray(ti.edits) ? ti.edits : [{ new_string: newStr, old_string: oldStr }];
    if (edits.some((e: any) => adds(e.new_string) && !adds(e.old_string))) {
      deny(`That edit adds a \`### [ts] …\` log entry by hand. Log entries go through the gate (it owns the timestamp, id, and placement):\n  ${KB_ADD}`);
    }
    if (edits.some((e: any) => stamps(e.new_string))) {
      deny(`That edit hand-sets the \`**Updated:**\` stamp. The NOW-header goes through kb-now, which owns the date (from the clock — a hand-typed date is the original drift):\n  ${KB_NOW}`);
    }
  }
}

process.exit(0);
