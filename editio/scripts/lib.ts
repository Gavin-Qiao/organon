// lib.ts — editio's own thin helpers. Deliberately independent of promptus's
// scripts/lib (the plugins reuse each other at the SKILL level, never by import),
// so this stays small and carries its own tests.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal front-matter parser: a leading `---` block of `key: value` lines.
 *  Values: plain strings, [a, b] inline lists, quoted strings. Enough for
 *  section front-matter (class/status/grounds/updated/budget) — not YAML. */
export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const src = text.replace(/\r\n/g, "\n");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    let v: unknown = raw.trim();
    if (typeof v === "string") {
      if (v.startsWith("[") && v.endsWith("]")) {
        v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      } else {
        v = v.replace(/^["']|["']$/g, "");
      }
    }
    data[key] = v;
  }
  return { data, body: src.slice(m[0].length) };
}

/** Read + parse a JSON file, with a path-carrying error. */
export function readJSON(path: string): any {
  if (!existsSync(path)) throw new Error(`missing JSON file: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path} is not valid JSON — ${(e as Error).message}`);
  }
}

/** The paper workspace under a project root. */
export function paperDir(root: string): string {
  return join(root, ".editio", "paper");
}

/** Load and lightly validate .editio/paper/paper.json. */
export function loadPaperMeta(root: string): any {
  const p = join(paperDir(root), "paper.json");
  const meta = readJSON(p);
  for (const f of ["title", "authors", "venue", "order"]) {
    if (meta[f] === undefined) throw new Error(`${p} missing "${f}"`);
  }
  if (!Array.isArray(meta.authors) || meta.authors.length === 0) {
    throw new Error(`${p} needs at least one author (placeholders are fine)`);
  }
  return meta;
}

/** Escape LaTeX-special characters in plain prose (NOT inside math/code).
 *  Backslashes are tokenized first so later steps can't mangle their expansion. */
export function texEscape(s: string): string {
  const BS = "\u0000BS\u0000";
  return s
    .replace(/\\/g, BS)
    .replace(/([{}])/g, "\\$1")
    .replace(/([&%#_$])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replaceAll(BS, "\\textbackslash{}");
}

/** kebab-case a heading into a label-safe slug. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
