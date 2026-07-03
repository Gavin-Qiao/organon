#!/usr/bin/env bun
/**
 * editio-render.ts — the reference md→tex renderer (bespoke, bun, stdlib-only).
 *
 * Renders .editio/paper/sections/<slug>.md → <slug>.tex, mapping the editio
 * authoring subset (see editio-latex/references/authoring-subset.md) onto the
 * editio.sty macros. The renderer NEVER blocks: ungraded and unsourced claims
 * render (tinted in draft mode); enforcement is editio-lint's job. Output is
 * mode-invariant — draft/publish/blind collapse inside editio.sty at compile.
 *
 * The contract is tool-agnostic: pandoc + a Lua filter is the documented swap,
 * and any replacement must pass the same golden fixture (templates/contract/).
 *
 * Usage:
 *   editio-render.ts [--root <dir>] [--all]           render every sections/*.md
 *   editio-render.ts [--root <dir>] --file <path>     render one file
 *   editio-render.ts --file <path> --stdout           print the .tex (no write)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter, paperDir, slugify, texEscape } from "./lib.ts";

// ── Token protection ─────────────────────────────────────────────────────────
// Protected segments (math, code, raw LaTeX, resolved macros) are swapped for
// \u0000<n>\u0000 markers so no later pass can touch them, then restored last.
const tokens: string[] = [];
function protect(tex: string): string {
  tokens.push(tex);
  return `\u0000${tokens.length - 1}\u0000`;
}
function restore(s: string): string {
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
  }
  return s;
}

// ── Inline passes ────────────────────────────────────────────────────────────
const CROSSREF = /^(fig|tab|sec|eq):/;

/** [@a; @b] → \cite{a,b} · [@fig:x] / bare @fig:x → \cref{fig:x} · mixed → error */
function cites(s: string, ctx: string): string {
  s = s.replace(/\[@([^\]]+)\]/g, (_, inner: string) => {
    const keys = inner.split(";").map((k) => k.trim().replace(/^@/, ""));
    const refs = keys.every((k) => CROSSREF.test(k));
    const none = keys.every((k) => !CROSSREF.test(k));
    if (!refs && !none) throw new Error(`${ctx}: mixed \\cite and \\cref keys in [@${inner}]`);
    return protect(refs ? `\\cref{${keys.join(",")}}` : `\\cite{${keys.join(",")}}`);
  });
  // bare crossrefs: @sec:methods in running prose
  s = s.replace(/(^|[\s(])@((?:fig|tab|sec|eq):[A-Za-z0-9:_-]+)/g, (_, pre, key) => `${pre}${protect(`\\cref{${key}}`)}`);
  return s;
}

/** **bold** → \textbf · *em* → \emph (after cites; before escaping) */
function emphasis(s: string): string {
  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_, t) => protect(`\\textbf{${texEscape(t)}}`));
  s = s.replace(/\*([^*\n]+)\*/g, (_, t) => protect(`\\emph{${texEscape(t)}}`));
  return s;
}

/** The whole inline pipeline for one run of prose. */
function inline(s: string, ctx: string): string {
  s = cites(s, ctx);
  s = emphasis(s);
  // escape what remains, marker-safe (split on tokens, escape the gaps)
  return s.split(/(\u0000\d+\u0000)/).map((part) => (/^\u0000\d+\u0000$/.test(part) ? part : texEscape(part))).join("");
}

// ── Claim spans ──────────────────────────────────────────────────────────────
// [text]{.claim .validated grounds=h1,h2} → \claimV{...}\editiogrounds{h1, h2}
// [text]{.claim} → \claimG{...}   ·   [@key]{.self} → \selfcite{key}
const SPAN = /\[([^\[\]]+)\]\{([^{}]*)\}/g;

function parseAttrs(raw: string): { classes: string[]; attrs: Record<string, string> } {
  const classes: string[] = [];
  const attrs: Record<string, string> = {};
  const re = /\.([\w-]+)|([\w-]+)=(?:"([^"]*)"|([^\s"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[1]) classes.push(m[1]);
    else attrs[m[2]] = m[3] ?? m[4] ?? "";
  }
  return { classes, attrs };
}

function spans(s: string, ctx: string): string {
  return s.replace(SPAN, (whole, text: string, rawAttrs: string) => {
    const { classes, attrs } = parseAttrs(rawAttrs);
    if (classes.includes("self")) {
      const key = text.trim().replace(/^@/, "");
      return protect(`\\selfcite{${key}}`);
    }
    if (!classes.includes("claim")) return whole; // not ours — leave for later passes
    const grade = classes.includes("validated") ? "\\claimV"
      : classes.includes("conjectured") ? "\\claimC"
      : classes.includes("unsourced") ? "\\claimU"
      : "\\claimG";
    const body = inline(text.replace(/\n/g, " "), ctx);
    const grounds = attrs.grounds ? protect(`\\editiogrounds{${attrs.grounds.split(",").map((g) => g.trim()).join(", ")}}`) : "";
    return protect(`${grade}{${body}}${grounds}`);
  });
}

// ── Section rendering ────────────────────────────────────────────────────────
export function renderSection(md: string, fileSlug: string): string {
  tokens.length = 0;
  const { data, body } = parseFrontmatter(md);
  const ctx = `${fileSlug}.md`;
  let s = body;

  // 1. protect raw LaTeX fences, other fences (verbatim), display + inline math, inline code
  s = s.replace(/```latex\n([\s\S]*?)```/g, (_, tex) => `\n${protect(tex.trimEnd())}\n`);
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => `\n${protect(`\\begin{verbatim}\n${code.trimEnd()}\n\\end{verbatim}`)}\n`);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => protect(`\\[${math.trim()}\\]`));
  s = s.replace(/\$([^$\n]+)\$/g, (_, math) => protect(`$${math}$`));
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => protect(`\\texttt{${texEscape(code)}}`));

  // 2. blindhide fenced divs (may span paragraphs; \blindhide is \long)
  s = s.replace(/^::: *blindhide *\n([\s\S]*?)\n^:::\s*$/gm, (_, inner: string) => `${protect(`\\blindhide{${inline(spans(inner.trim(), ctx), ctx)}}`)}\n`);

  // 3. claim spans + self-cites (span text runs the inline pipeline internally)
  s = spans(s, ctx);

  // 4. blocks: headings, lists, paragraphs — inline pipeline on each run of prose
  const isAbstract = String(data.class ?? "") === "doco:Abstract";
  const out: string[] = [];
  let list: "itemize" | "enumerate" | null = null;
  const closeList = () => { if (list) { out.push(`\\end{${list}}`); list = null; } };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) { out.push(inline(para.join(" "), ctx)); out.push(""); para = []; }
  };
  let sectionOpened = false;

  for (const lineRaw of s.split("\n")) {
    const line = lineRaw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const [_, hashes, title] = h;
      if (hashes.length === 1 && !sectionOpened) {
        sectionOpened = true;
        if (isAbstract) out.push("\\begin{abstract}");
        else out.push(`\\section{${inline(title, ctx)}}\\label{sec:${fileSlug}}`);
        // provenance stamp right under the section head (draft-only at compile)
        const grounds = Array.isArray(data.grounds) ? (data.grounds as string[]).join(", ") : "";
        if (data.updated) out.push(`\\editiostamp{${texEscape(String(data.updated))}}{${texEscape(grounds)}}`);
        out.push("");
      } else {
        const cmd = hashes.length <= 2 ? "\\subsection" : "\\subsubsection";
        out.push(`${cmd}{${inline(title, ctx)}}`);
        out.push("");
      }
    } else if (li || ol) {
      flushPara();
      const kind = li ? "itemize" : "enumerate";
      if (list !== kind) { closeList(); out.push(`\\begin{${kind}}`); list = kind; }
      out.push(`  \\item ${inline((li ?? ol)![1], ctx)}`);
    } else if (line.trim() === "") {
      flushPara(); closeList();
    } else {
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  if (isAbstract && sectionOpened) out.push("\\end{abstract}");

  const head = [
    `% GENERATED by editio-render from sections/${fileSlug}.md — edits here are disposable.`,
    `% class: ${data.class ?? "?"} · status: ${data.status ?? "?"}`,
    "",
  ];
  // collapse runs of blank lines, restore protected segments
  const tex = head.concat(out).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return restore(tex);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const root = arg(argv, "root") ?? process.cwd();
  const file = arg(argv, "file");
  const toStdout = argv.includes("--stdout");
  const sections = join(paperDir(root), "sections");

  const targets: string[] = [];
  if (file) targets.push(file);
  else {
    if (!existsSync(sections)) {
      console.error(`editio-render: no ${sections} — run editio-scaffold first`);
      process.exit(1);
    }
    for (const f of readdirSync(sections)) if (f.endsWith(".md")) targets.push(join(sections, f));
  }

  for (const t of targets) {
    if (!existsSync(t)) { console.error(`editio-render: missing ${t}`); process.exit(1); }
    const slug = basename(t).replace(/\.md$/, "");
    let tex: string;
    try {
      tex = renderSection(readFileSync(t, "utf8"), slugify(slug));
    } catch (e) {
      console.error(`editio-render: ${(e as Error).message}`);
      process.exit(1);
    }
    if (toStdout) process.stdout.write(tex);
    else {
      const dest = t.replace(/\.md$/, ".tex");
      writeFileSync(dest, tex);
      console.log(`editio-render: ${t} -> ${dest}`);
    }
  }
}
