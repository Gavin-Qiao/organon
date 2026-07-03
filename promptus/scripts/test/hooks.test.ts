/**
 * hooks.test.ts — the session-start hook's Telos injection. The hook makes the Telos
 * non-optional: it is injected as content every session start, bounded by a line cap as a
 * runaway guard. We test the pure block-builder here; the end-to-end wiring is the
 * `SessionStart` entry in hooks.json.
 */
import { test, expect } from "bun:test";
import { telosBlock } from "../../hooks/_lib.ts";

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
