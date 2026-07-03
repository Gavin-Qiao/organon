#!/usr/bin/env bun
/**
 * PostToolUse hook — keep the catalog fresh. After a real kb-add runs (a Bash command),
 * rebuild the derived index so the card-catalog, graph, and supersedes never drift from
 * the markdown. No-op for any other command, a dry run, or outside a Promptus repo.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readHookInput, projectRoot, isPromptusRepo } from "./_lib.ts";

const input = await readHookInput();
const root = projectRoot(input);
if (!isPromptusRepo(root)) process.exit(0);

const cmd: string = (input.tool_input && input.tool_input.command) || "";
if (!/\bkb-add(\.ts)?\b/.test(cmd) || /--dry-run\b/.test(cmd)) process.exit(0);

const indexScript = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "kb-index.ts");
const proc = Bun.spawnSync(["bun", indexScript], { cwd: root, stdout: "pipe", stderr: "pipe" });

if (proc.success) {
  process.stdout.write("Promptus: catalog re-indexed after kb-add.\n");
} else {
  process.stderr.write("Promptus: kb-index after kb-add failed —\n" + proc.stderr.toString());
}
process.exit(0);
