/**
 * _lib.ts — shared helpers for the Promptus Claude Code and Codex hooks.
 *
 * Every hook reads the event JSON from stdin and is a strict no-op outside a
 * Promptus repo (no `.promptus/` project), so enabling the plugin never
 * interferes with other projects.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function readHookInput(): Promise<any> {
  try {
    const text = await Bun.stdin.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function projectRoot(input: any): string {
  return (input && typeof input.cwd === "string" && input.cwd) || process.cwd();
}

export function ledgerPath(root: string): string | null {
  const p = join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
  return existsSync(p) ? p : null;
}

export function isPromptusRepo(root: string): boolean {
  return existsSync(join(root, ".promptus", "schema", "kb-vocab.json"));
}

export function telosPath(root: string): string | null {
  const p = join(root, ".promptus", "TELOS.md");
  return existsSync(p) ? p : null;
}

/**
 * The Telos block to inject at session start. The Telos is short by design, so it is injected
 * whole — capped at `cap` lines as a runaway guard, with a pointer to the full file when truncated.
 */
export function telosBlock(text: string, cap = 160): string {
  const lines = text.split(/\r?\n/);
  if (lines.length > cap) {
    return (
      lines.slice(0, cap).join("\n").trimEnd() +
      "\n\n(Telos truncated — read the full .promptus/TELOS.md)"
    );
  }
  return lines.join("\n").trim();
}

/**
 * The bounded live-state block to inject at session start.
 *
 * Current ledgers delimit the authoritative block explicitly.  Prefer those
 * markers so intervening sections such as a glossary can never leak into the
 * startup context.  The legacy heading-based fallback keeps older stores
 * resumable, and the line cap is a final runaway guard for both layouts.
 */
export function nowBlock(text: string, cap = 120): string {
  const lines = text.split(/\r?\n/);
  const startI = lines.findIndex((line) => line.trim() === "<!-- now:start -->");
  const endI =
    startI === -1
      ? -1
      : lines.findIndex(
          (line, index) => index > startI && line.trim() === "<!-- now:end -->",
        );

  let selected: string[];
  if (startI !== -1 && endI > startI) {
    selected = lines.slice(startI + 1, endI);
  } else {
    const nowI = lines.findIndex((line) => /^## NOW\b/.test(line));
    const logI = lines.findIndex((line) => /^## Log\b/.test(line));
    if (nowI !== -1) {
      selected = lines.slice(nowI, logI > nowI ? logI : lines.length);
    } else {
      const resumeI = lines.findIndex((line) => /RESUME HERE/.test(line));
      selected =
        resumeI !== -1
          ? lines.slice(resumeI, Math.min(lines.length, resumeI + 14))
          : lines.slice(0, 30);
    }
  }

  if (selected.length > cap) {
    return (
      selected.slice(0, cap).join("\n").trimEnd() +
      "\n\n(NOW truncated — read .promptus/ledger/RESEARCH-LEDGER.md between the now markers)"
    );
  }
  return selected.join("\n").trim();
}
