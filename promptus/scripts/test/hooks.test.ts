/**
 * hooks.test.ts — the session-start hook's Telos injection. The hook makes the Telos
 * non-optional: it is injected as content every session start, bounded by a line cap as a
 * runaway guard. We test the pure block-builder here; the end-to-end wiring is the
 * `SessionStart` entry in hooks.json.
 */
import { afterAll, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nowBlock, telosBlock } from "../../hooks/_lib.ts";
import { gateDecision, parseApplyPatch } from "../../hooks/protect-gate.ts";

const PLUGIN_ROOT = join(import.meta.dir, "..", "..");
const codexHooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks", "codex.json"), "utf8"));
const tmps: string[] = [];
afterAll(() => {
  for (const dir of tmps) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

test("telosBlock: a short Telos is injected whole (trimmed), not truncated", () => {
  const text = "# Telos\n\n## North star\n\nDo the thing.\n";
  const block = telosBlock(text);
  expect(block).toContain("# Telos");
  expect(block).toContain("Do the thing.");
  expect(block).not.toContain("truncated");
});

test("telosBlock: an over-long Telos is capped, with a pointer to the full file", () => {
  const text = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
  const block = telosBlock(text, 160);
  expect(block).toContain("line 0");
  expect(block).toContain("line 159");
  expect(block).not.toContain("line 200");
  expect(block).toContain("read the full .promptus/TELOS.md");
  expect(block.split("\n").length).toBeLessThan(170);
});

test("nowBlock: explicit markers exclude an intervening glossary", () => {
  const text = `# Ledger

<!-- now:start -->

## NOW
Current live state.

## <<< RESUME HERE >>>
Resume the current experiment.

<!-- now:end -->

## Glossary
Legacy material that must not be injected.

## Log
Append-only history.`;
  const block = nowBlock(text);
  expect(block).toContain("Current live state.");
  expect(block).toContain("Resume the current experiment.");
  expect(block).not.toContain("Glossary");
  expect(block).not.toContain("Append-only history");
});

test("nowBlock: legacy heading layout remains bounded", () => {
  const body = Array.from({ length: 200 }, (_, index) => `state ${index}`).join("\n");
  const block = nowBlock(`# Ledger\n\n## NOW\n${body}\n\n## Log\nold`, 20);
  expect(block).toContain("state 0");
  expect(block).not.toContain("state 100");
  expect(block).not.toContain("old");
  expect(block).toContain("NOW truncated");
});

test("protect-gate parses every Codex apply_patch target", () => {
  const edits = parseApplyPatch(`*** Begin Patch
*** Update File: README.md
@@
+safe
*** Update File: .promptus/ledger/RESEARCH-LEDGER.md
@@
+### [2026-07-09] RESULT — bypass
*** End Patch`);
  expect(edits.map((e) => e.path)).toEqual(["README.md", ".promptus/ledger/RESEARCH-LEDGER.md"]);
  expect(edits[1].added).toContain("### [2026-07-09]");
});

test("protect-gate blocks Codex freehand ledger entries but permits ordinary patches", () => {
  const root = "C:/workspace/project";
  const bad = gateDecision(
    {
      tool_name: "apply_patch",
      tool_input: {
        command: `*** Begin Patch
*** Update File: .promptus/ledger/RESEARCH-LEDGER.md
@@
+### [2026-07-09] RESULT — bypass
*** End Patch`,
      },
    },
    root,
  );
  expect(bad).toContain("kb-add");
  expect(
    gateDecision(
      {
        tool_name: "apply_patch",
        tool_input: { command: "*** Begin Patch\n*** Update File: README.md\n@@\n+safe\n*** End Patch" },
      },
      root,
    ),
  ).toBeNull();
});

test("protect-gate blocks Codex writes to the derived cache", () => {
  const reason = gateDecision(
    {
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: .promptus/cache/fake.md\n+fake\n*** End Patch" },
    },
    "C:/workspace/project",
  );
  expect(reason).toContain("derived index");
});

test("every Codex hook declares POSIX and Windows launch commands", () => {
  for (const groups of Object.values(codexHooks.hooks) as any[]) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        expect(hook.command).toContain("${PLUGIN_ROOT}/");
        expect(hook.commandWindows).toContain("%PLUGIN_ROOT%/");
        expect(hook.command).not.toContain("\\");
        expect(hook.commandWindows).not.toContain("\\");
      }
    }
  }
});

test("the platform-selected Codex hook command executes and blocks a gate bypass", () => {
  const root = mkdtempSync(join(tmpdir(), "promptus-hook-test-"));
  tmps.push(root);
  mkdirSync(join(root, ".promptus", "schema"), { recursive: true });
  writeFileSync(join(root, ".promptus", "schema", "kb-vocab.json"), "{}");

  const hook = codexHooks.hooks.PreToolUse[0].hooks[0];
  const command = process.platform === "win32" ? hook.commandWindows : hook.command;
  const input = JSON.stringify({
    cwd: root,
    hook_event_name: "PreToolUse",
    turn_id: "test-turn",
    model: "test-model",
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: .promptus/ledger/RESEARCH-LEDGER.md\n@@\n+### [2026-07-09] RESULT — bypass\n*** End Patch",
    },
  });
  const result = spawnSync(command, {
    cwd: root,
    env: { ...process.env, PLUGIN_ROOT },
    input,
    encoding: "utf8",
    shell: true,
  });
  expect(result.status).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(output.hookSpecificOutput.permissionDecisionReason).toContain("kb-add");
});
