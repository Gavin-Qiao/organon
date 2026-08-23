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
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeIdentity } from "./editio-identity.ts";
import { findRoot, parseFrontmatter, paperDir, readJSON, slugify, texEscape } from "./lib.ts";

const VENUES = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "venues");

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
    if (keys.some((k) => k.startsWith("num:"))) throw new Error(`${ctx}: @num: handles go bare in prose (@num:x), never inside [@…]`);
    const refs = keys.every((k) => CROSSREF.test(k));
    const none = keys.every((k) => !CROSSREF.test(k));
    if (!refs && !none) throw new Error(`${ctx}: mixed \\cite and \\cref keys in [@${inner}]`);
    return protect(refs ? `\\cref{${keys.join(",")}}` : `\\cite{${keys.join(",")}}`);
  });
  // bare crossrefs: @sec:methods in running prose — any non-word neighbour
  // qualifies (quotes, dashes, parens); a word char blocks it (emails)
  s = s.replace(/(^|[^\w@])@((?:fig|tab|sec|eq):[A-Za-z0-9:_-]+)/g, (_, pre, key) => `${pre}${protect(`\\cref{${key}}`)}`);
  // bound numbers: @num:handle → \editionum{handle}. The VALUE never enters any
  // .tex except front/numbers.tex (editio-numbers --write) — one source of truth,
  // zero typed copies (the second dogfood's reconcile-by-sed pain).
  s = s.replace(/@num:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g, (_, h) => protect(`\\editionum{${h}}`));
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

/** Find `[text]{attrs}` spans with BALANCED brackets — claim text may nest
 *  citations like `([@sec:theory])`, whose inner `]` must not close the span
 *  (the first dogfood's bug). Outermost spans only; attrs never contain braces. */
export function findSpans(s: string): { start: number; end: number; text: string; rawAttrs: string }[] {
  const out: { start: number; end: number; text: string; rawAttrs: string }[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] !== "[") { i++; continue; }
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s[j] === "[") depth++;
      else if (s[j] === "]" && --depth === 0) break;
    }
    if (depth !== 0 || s[j + 1] !== "{") { i++; continue; }
    const close = s.indexOf("}", j + 2);
    if (close < 0 || s.slice(j + 2, close).includes("{")) { i++; continue; }
    out.push({ start: i, end: close + 1, text: s.slice(i + 1, j), rawAttrs: s.slice(j + 2, close) });
    i = close + 1;
  }
  return out;
}

export function parseAttrs(raw: string): { classes: string[]; attrs: Record<string, string> } {
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

const CLAIM_CLASSES = new Set(["claim", "validated", "conjectured", "unsourced"]);

function spans(s: string, ctx: string, warn?: (m: string) => void): string {
  const found = findSpans(s);
  if (!found.length) return s;
  let out = "";
  let pos = 0;
  for (const f of found) {
    out += s.slice(pos, f.start);
    const { classes, attrs } = parseAttrs(f.rawAttrs);
    if (classes.includes("self")) {
      if (f.text.includes(";")) throw new Error(`${ctx}: a self-cite takes a single key ([@ours]{.self}) — split multiple self-cites into separate spans`);
      out += protect(`\\selfcite{${f.text.trim().replace(/^@/, "")}}`);
    } else if (classes.includes("claim")) {
      // a typo'd grade (.validatd) silently downgrades to ungraded — say so
      const strays = classes.filter((c) => !CLAIM_CLASSES.has(c));
      if (strays.length) warn?.(`${ctx}: unknown claim class(es) .${strays.join(" .")} — the span renders UNGRADED (grades are .validated/.conjectured/.unsourced)`);
      const grade = classes.includes("validated") ? "\\claimV"
        : classes.includes("conjectured") ? "\\claimC"
        : classes.includes("unsourced") ? "\\claimU"
        : "\\claimG";
      const body = inline(f.text.replace(/\n/g, " "), ctx);
      const grounds = attrs.grounds ? protect(`\\editiogrounds{${texEscape(attrs.grounds.split(",").map((g) => g.trim()).join(", "))}}`) : "";
      out += protect(`${grade}{${body}}${grounds}`);
    } else {
      out += s.slice(f.start, f.end); // not ours — leave for later passes
    }
    pos = f.end;
  }
  return out + s.slice(pos);
}

// ── Section rendering ────────────────────────────────────────────────────────
export function renderSection(md: string, fileSlug: string, warn?: (msg: string) => void): string {
  tokens.length = 0;
  const { data, body } = parseFrontmatter(md);
  const ctx = `${fileSlug}.md`;
  let s = body;

  // near-miss @num handles (wrong charset) would silently fail to bind and ship
  // as literal text — warn up front. Plain ```latex fences are exempt (byte-raw
  // by contract; editio-numbers flags @num there instead).
  for (const m of body.replace(/```latex\n[\s\S]*?```/g, "").matchAll(/@num:([A-Za-z0-9_-]+)/g)) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(m[1])) {
      warn?.(`${ctx}: @num:${m[1]} won't bind — handles are kebab-case [a-z0-9-] with no leading/trailing hyphen`);
    }
  }

  // 1. protect raw LaTeX fences, other fences (verbatim), display + inline math, inline code
  //    ```latex+ opts INTO the citation/crossref transforms (captions want [@key] and
  //    @fig: too — the dogfood's split-brain papercut); plain ```latex stays fully raw.
  s = s.replace(/```latex\+\n([\s\S]*?)```/g, (_, tex) => `\n${protect(cites(tex.trimEnd(), ctx))}\n`);
  s = s.replace(/```latex\n([\s\S]*?)```/g, (_, tex) => `\n${protect(tex.trimEnd())}\n`);
  //    fence tags may carry symbols (c++, c#) — the tag is discarded, never echoed
  s = s.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, _lang, code) => `\n${protect(`\\begin{verbatim}\n${code.trimEnd()}\n\\end{verbatim}`)}\n`);
  //    math passes through raw, except @num:handle — a bound number is exactly the
  //    kind of token that lives inside $…$ (mean ARI $@num:x$), so bind before protecting
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, math: string) => protect(`\\[${math.trim().replace(/@num:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g, "\\editionum{$1}")}\\]`));
  s = s.replace(/\$([^$\n]+)\$/g, (_, math: string) => {
    // a bare % in single-line inline math comments out its own closing $ — always
    // fatal downstream, never intended: escape it
    let m = math.replace(/(^|[^\\])%/g, "$1\\%");
    m = m.replace(/@num:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g, "\\editionum{$1}");
    // two currency $'s on one line silently typeset the prose between them as
    // math (the audit's "cost $5 ... $10" case) — warn on math with no math in it
    if (/\s/.test(m) && !/[\\^_={}<>+*/|]/.test(m)) {
      warn?.(`${ctx}: "$${math}$" looks like prose captured as math — for currency, escape as \\$`);
    }
    return protect(`$${m}$`);
  });
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => protect(`\\texttt{${texEscape(code)}}`));

  // 2. blindhide fenced divs (may span paragraphs; \blindhide is \long)
  s = s.replace(/^::: *blindhide *\n([\s\S]*?)\n^:::\s*$/gm, (_, inner: string) => `${protect(`\\blindhide{${inline(spans(inner.trim(), ctx, warn), ctx)}}`)}\n`);

  // 3. claim spans + self-cites (span text runs the inline pipeline internally)
  s = spans(s, ctx, warn);

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
        // provenance stamp right under the section head (draft-only at compile);
        // never inside the abstract environment — it would typeset ahead of the
        // abstract's own prose
        const grounds = Array.isArray(data.grounds) ? (data.grounds as string[]).join(", ") : "";
        if (data.updated && !isAbstract) out.push(`\\editiostamp{${texEscape(String(data.updated))}}{${texEscape(grounds)}}`);
        out.push("");
      } else {
        if (hashes.length === 1) warn?.(`${ctx}: a second top-level "# " heading — one section file is one \\section; rendered as \\subsection`);
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
      if (/^#{4,}\s/.test(line)) warn?.(`${ctx}: "${line.slice(0, 24)}…" — headings stop at ### in the subset; rendered as prose`);
      if (/^\s+(?:[-*]|\d+\.)\s+/.test(line)) warn?.(`${ctx}: indented list item flattened into the line above — nested lists are not in the subset`);
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
  // collapse runs of blank lines
  const joined = head.concat(out).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

  // leftover-span lint, PRE-restore: protected content (inline code, raw fences)
  // is still   markers here, so legitimate `{.claim}` quoted in code can't
  // false-positive — and genuinely corrupted spans (missing dot, misspelled
  // class, nested spans) surface as escaped `]\{…` residue no keyword list
  // could enumerate.
  const leftovers = joined.match(/\]\\\{\.?[\w-][^\n]{0,28}|\\\{\.claim\b[^\n]{0,28}/g);
  if (leftovers?.length) {
    const shown = [...new Set(leftovers.map((l) => (l.length > 26 ? `${l.slice(0, 23)}…` : l)))];
    warn?.(`${ctx}: ${leftovers.length} span(s) survived unrendered (check bracket/attr syntax): ${shown.join(" · ")}`);
  }
  return restore(joined);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** Section slugs in build order — read from main.tex when present, else alphabetical. */
export function sectionOrder(paper: string): string[] {
  const dir = join(paper, "sections");
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  const mainTex = join(paper, "main.tex");
  if (!existsSync(mainTex)) return onDisk.sort();
  const ordered = [...readFileSync(mainTex, "utf8").matchAll(/sections\/([\w-]+)/g)].map((m) => m[1]).filter((s) => onDisk.includes(s));
  return [...ordered, ...onDisk.filter((s) => !ordered.includes(s)).sort()];
}

/**
 * IEEE-style drop cap (\IEEEPARstart{T}{his}) on the first prose paragraph — applied
 * per venue (venue.json par_start), AFTER the contract render, so the markdown source
 * and the golden contract stay venue-neutral. Skips (with a warning) when the paragraph
 * opens with markup a drop cap can't wrap; the author's escape hatch is a latex+ fence.
 */
export function dropCap(tex: string, warn: (m: string) => void, slug: string): string {
  const lines = tex.split("\n");
  let seenSection = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\\section\{/.test(lines[i])) { seenSection = true; continue; }
    if (!seenSection) continue;
    const line = lines[i];
    if (!line.trim() || line.startsWith("\\") || line.startsWith("%")) continue;
    const m = line.match(/^([A-Za-z])([A-Za-z]*)/);
    if (!m) {
      warn(`par_start: sections/${slug}.md's first paragraph opens with markup — \\IEEEPARstart not applied (hand-write it in a latex+ fence if wanted)`);
      return tex;
    }
    lines[i] = `\\IEEEPARstart{${m[1]}}{${m[2]}}${line.slice(m[0].length)}`;
    return lines.join("\n");
  }
  warn(`par_start: sections/${slug}.md has no drop-cappable paragraph — \\IEEEPARstart not applied`);
  return tex;
}

/** Some venues require a body section without a printed heading (NMI Articles:
 * Introduction). Keep an anchor for cross-references while removing only the
 * generated top-level heading; provenance stamps and prose remain untouched. */
export function suppressSectionHeading(tex: string, slug: string): string {
  const safe = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tex.replace(new RegExp(`\\\\section\\{[^\\n]*\\}\\\\label\\{sec:${safe}\\}`), `\\phantomsection\\label{sec:${slug}}`);
}

/** Put a generated section body inside a venue-owned environment while retaining
 * its cross-reference anchor. The environment supplies its own heading (for
 * example NeurIPS's `ack`, which also hides acknowledgements in blind review). */
export function wrapSectionEnvironment(tex: string, slug: string, environment: string): string {
  if (!/^[A-Za-z@]+$/.test(environment)) throw new Error(`unsafe section environment "${environment}"`);
  const safe = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(`\\\\section\\{[^\\n]*\\}\\\\label\\{sec:${safe}\\}`);
  if (!head.test(tex)) return tex;
  const wrapped = tex.replace(head, `\\begin{${environment}}\n\\phantomsection\\label{sec:${slug}}`);
  return `${wrapped.trimEnd()}\n\\end{${environment}}\n`;
}

const HELP = `editio-render — the reference md -> tex renderer (see editio-latex/references/authoring-subset.md)
usage:
  editio-render.ts [--root <dir>] [--all]        render every sections/*.md next to its source
                                                 (the default when --file is absent)
  editio-render.ts --file <path> [--stdout]      render one file (stdout = print, no write)
  editio-render.ts --concat [out.md]             concatenate sections (main.tex order) into one
                                                 markdown file (stdout when no path) — for reviews
                                                 and end-to-end reads
--root defaults to the nearest ancestor containing .editio/ or .promptus/, so running
from inside .editio/paper/ works. Warnings (unrendered spans) go to stderr; the renderer
never blocks — enforcement is editio-status --gate.`;

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(0); }
  const root = arg(argv, "root") ?? findRoot(process.cwd());
  const file = arg(argv, "file");
  const toStdout = argv.includes("--stdout");
  const paper = paperDir(root);
  const sections = join(paper, "sections");

  if (!file && !existsSync(sections)) {
    console.error(`editio-render: no ${sections} — not an editio workspace (searched upward from the cwd). Run editio-scaffold at the project root, or pass --root <dir>.`);
    process.exit(2); // same "not a workspace" code as every sibling CLI
  }

  if (argv.includes("--concat")) {
    const outPath = arg(argv, "concat");
    const doc = sectionOrder(paper)
      .map((slug) => `<!-- sections/${slug}.md -->\n\n${readFileSync(join(sections, `${slug}.md`), "utf8").trim()}\n`)
      .join("\n");
    if (outPath) { writeFileSync(outPath, doc); console.log(`editio-render: concatenated ${sectionOrder(paper).length} section(s) -> ${outPath}`); }
    else process.stdout.write(doc);
    process.exit(0);
  }

  const targets: string[] = [];
  if (file) targets.push(file);
  else for (const slug of sectionOrder(paper)) targets.push(join(sections, `${slug}.md`));

  const warn = (m: string) => console.error(`editio-render: warning — ${m}`);

  // the venue's par_start nicety targets the first BODY section (the slug after the
  // abstract in build order) — venue truth stays in venue.json, prose stays neutral
  let dropSlug: string | null = null;
  const suppressedHeadings = new Set<string>();
  const sectionEnvironments = new Map<string, string>();
  if (existsSync(join(paper, "paper.json"))) {
    try {
      const venuePath = join(VENUES, String(readJSON(join(paper, "paper.json")).venue ?? "arxiv"), "venue.json");
      if (existsSync(venuePath)) {
        const venue = readJSON(venuePath);
        if (venue.par_start) dropSlug = sectionOrder(paper).find((s) => s !== "abstract") ?? null;
        for (const slug of venue.structure?.suppress_section_headings ?? []) suppressedHeadings.add(String(slug));
        for (const [slug, environment] of Object.entries(venue.structure?.section_environments ?? {})) {
          sectionEnvironments.set(String(slug), String(environment));
        }
      }
    } catch { /* venue niceties never block a render */ }
  }

  for (const t of targets) {
    if (!existsSync(t)) { console.error(`editio-render: missing ${t}`); process.exit(1); }
    const slug = basename(t).replace(/\.md$/, "");
    let tex: string;
    try {
      tex = renderSection(readFileSync(t, "utf8"), slugify(slug), warn);
    } catch (e) {
      console.error(`editio-render: ${(e as Error).message}`);
      process.exit(1);
    }
    if (slug === dropSlug) tex = dropCap(tex, warn, slug);
    if (suppressedHeadings.has(slug)) tex = suppressSectionHeading(tex, slug);
    if (sectionEnvironments.has(slug)) tex = wrapSectionEnvironment(tex, slug, sectionEnvironments.get(slug)!);
    if (toStdout) process.stdout.write(tex);
    else {
      const dest = t.replace(/\.md$/, ".tex");
      writeFileSync(dest, tex);
      console.log(`editio-render: ${t} -> ${dest}`);
    }
  }

  // --all also refreshes the identity data layer, so a paper.json edit propagates to
  // every consumer (metadata / bios / titles) in the same command that renders prose.
  if (!file && existsSync(join(paper, "paper.json"))) {
    try {
      for (const f of writeIdentity(root).changed) console.log(`editio-render: ${f} regenerated (identity data from paper.json)`);
    } catch (e) {
      warn(`identity data not regenerated — ${(e as Error).message}`);
    }
  }
}
