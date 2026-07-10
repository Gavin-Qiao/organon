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
  'echo "<body>" | bun "<plugin-root>/scripts/kb-add.ts" --substrate <s> --kind <K> --status <S> --title "…"';
const KB_NOW =
  'echo "<## NOW … RESUME>" | bun "<plugin-root>/scripts/kb-now.ts" --note "<short>"';

type PatchEdit = { kind: "Add" | "Update" | "Delete" | "Move"; path: string; added: string };

/** Parse the file targets and added lines from Codex's apply_patch command payload. */
export function parseApplyPatch(command: string): PatchEdit[] {
  const lines = command.split(/\r?\n/);
  const edits: PatchEdit[] = [];
  let current: PatchEdit | null = null;
  for (const line of lines) {
    const head = line.match(/^\*\*\* (Add|Update|Delete) File:\s*(.+?)\s*$/);
    if (head) {
      current = { kind: head[1] as PatchEdit["kind"], path: head[2], added: "" };
      edits.push(current);
      continue;
    }
    const move = line.match(/^\*\*\* Move to:\s*(.+?)\s*$/);
    if (move && current) {
      edits.push({ kind: "Move", path: current.path, added: "" });
      edits.push({ kind: "Move", path: move[1], added: "" });
      continue;
    }
    if (current && /^\+(?!\+\+)/.test(line)) current.added += line.slice(1) + "\n";
  }
  return edits;
}

function relPath(root: string, filePath: string): string {
  return relative(root, resolve(root, filePath)).split(sep).join("/");
}

/** Return the blocking reason for a Claude or Codex edit payload, or null when allowed. */
export function gateDecision(input: any, root: string): string | null {
  const tool: string = input.tool_name || "";
  const ti = input.tool_input || {};
  const patchEdits = tool === "apply_patch" ? parseApplyPatch(String(ti.command || "")) : [];
  const edits: PatchEdit[] = patchEdits.length
    ? patchEdits
    : [{ kind: tool === "Write" ? "Add" : "Update", path: ti.file_path || ti.path || "", added: "" }];

  for (const edit of edits) {
    if (!edit.path) continue;
    const rel = relPath(root, edit.path);
    if (rel === ".promptus/cache" || rel.startsWith(".promptus/cache/")) {
      return "`.promptus/cache/` is the derived index — never hand-edit it. Rebuild it with `kb-index`.";
    }
    if (rel !== ".promptus/ledger/RESEARCH-LEDGER.md") continue;
    if (tool === "Write" || edit.kind === "Add" || edit.kind === "Delete" || edit.kind === "Move") {
      return `Don't overwrite, delete, or move the ledger. Log entries go through kb-add; the NOW-header through kb-now:\n  ${KB_ADD}\n  ${KB_NOW}`;
    }

    const additions = tool === "apply_patch" ? edit.added : "";
    const adds = (s: string) => /(^|\n)### \[/.test(s || "");
    const stamps = (s: string) => /\*\*Updated:\*\*/.test(s || "");
    if (tool === "apply_patch") {
      if (adds(additions))
        return `That patch adds a \`### [ts] …\` log entry by hand. Use the gate instead:\n  ${KB_ADD}`;
      if (stamps(additions))
        return `That patch hand-sets the \`**Updated:**\` stamp. The NOW-header goes through kb-now:\n  ${KB_NOW}`;
      continue;
    }

    const newStr = ti.new_string ?? "";
    const oldStr = ti.old_string ?? "";
    const textEdits = tool === "MultiEdit" && Array.isArray(ti.edits) ? ti.edits : [{ new_string: newStr, old_string: oldStr }];
    if (textEdits.some((e: any) => adds(e.new_string) && !adds(e.old_string))) {
      return `That edit adds a \`### [ts] …\` log entry by hand. Log entries go through the gate (it owns the timestamp, id, and placement):\n  ${KB_ADD}`;
    }
    if (textEdits.some((e: any) => stamps(e.new_string))) {
      return `That edit hand-sets the \`**Updated:**\` stamp. The NOW-header goes through kb-now, which owns the date:\n  ${KB_NOW}`;
    }
  }
  return null;
}

export async function main(): Promise<void> {
  const input = await readHookInput();
  const root = projectRoot(input);
  if (!isPromptusRepo(root)) return;
  const reason = gateDecision(input, root);
  if (reason) deny(reason);
}

if (import.meta.main) await main();
