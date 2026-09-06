/**
 * frontmatter.ts — parse/serialize the minimal YAML-subset frontmatter block
 * that tops a stored page unit (--- ... ---). Stdlib-only; no YAML dependency.
 * Support only what units need: scalar `key: value` and inline `[a, b]` lists.
 *
 * Contract:
 *   parseFrontmatter(md):      { data, body } — `data` is the parsed block (or {}
 *                              if absent), `body` is the markdown after it.
 *   serializeFrontmatter(data): the "---\n…\n---\n" block for `data`.
 */

export type Frontmatter = Record<string, string | string[]>;

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(md: string): { data: Frontmatter; body: string } {
  const m = FENCE.exec(md);
  if (!m) return { data: {}, body: md };
  const data: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const raw = line.slice(idx + 1).trim();
    const inline = /^\[(.*)\]$/.exec(raw);
    data[key] = inline
      ? inline[1].split(",").map((s) => unquote(s.trim())).filter((s) => s.length > 0)
      : unquote(raw);
  }
  return { data, body: md.slice(m[0].length) };
}

export function serializeFrontmatter(data: Frontmatter): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    lines.push(Array.isArray(v) ? `${k}: [${v.map(quote).join(", ")}]` : `${k}: ${quote(v)}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function quote(s: string): string {
  // Quote only when the bare value would confuse the minimal parser above.
  return /[:#[\],]/.test(s) || s.trim() !== s || s === "" ? JSON.stringify(s) : s;
}
