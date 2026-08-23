/**
 * render.test.ts — the renderer's contract. The golden fixture under
 * templates/contract/ is the tool-agnostic acceptance test: ANY replacement
 * renderer (pandoc + Lua filter, etc.) must reproduce introduction.tex from
 * introduction.md byte-for-byte (modulo line endings). Rendered output is
 * mode-invariant — draft/publish/blind collapse inside editio.sty at compile.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderSection, suppressSectionHeading } from "../editio-render.ts";
import { markdownProseWordCount, parseFrontmatter, texEscape, slugify } from "../lib.ts";

const CONTRACT = join(import.meta.dir, "..", "..", "templates", "contract");
const norm = (s: string) => s.replace(/\r\n/g, "\n");

test("the golden contract: introduction.md renders to introduction.tex exactly", () => {
  const md = readFileSync(join(CONTRACT, "introduction.md"), "utf8");
  const golden = norm(readFileSync(join(CONTRACT, "introduction.tex"), "utf8"));
  expect(norm(renderSection(md, "introduction"))).toBe(golden);
});

test("claim spans map by grade, ungraded gets claimG, grounds ride along", () => {
  const tex = renderSection("# T\n\n[a]{.claim .validated grounds=h1,h2} [b]{.claim .conjectured} [c]{.claim .unsourced} [d]{.claim}\n", "t");
  expect(tex).toContain("\\claimV{a}\\editiogrounds{h1, h2}");
  expect(tex).toContain("\\claimC{b}");
  expect(tex).toContain("\\claimU{c}");
  expect(tex).toContain("\\claimG{d}");
});

test("citations vs cross-references dispatch on the key prefix", () => {
  const tex = renderSection("# T\n\nSee [@a; @b] and [@fig:x] and @sec:methods and @eq:e.\n", "t");
  expect(tex).toContain("\\cite{a,b}");
  expect(tex).toContain("\\cref{fig:x}");
  expect(tex).toContain("\\cref{sec:methods}");
  expect(tex).toContain("\\cref{eq:e}");
});

test("a mixed cite/cref group is refused", () => {
  expect(() => renderSection("# T\n\n[@a; @fig:x]\n", "t")).toThrow(/mixed/);
});

test("self-citation becomes \\selfcite (maskable in blind)", () => {
  expect(renderSection("# T\n\nSee [@ours]{.self}.\n", "t")).toContain("\\selfcite{ours}");
});

test("an abstract section renders as the abstract environment, not a numbered section", () => {
  const tex = renderSection("---\nclass: doco:Abstract\n---\n# Abstract\n\nOne sentence.\n", "abstract");
  expect(tex).toContain("\\begin{abstract}");
  expect(tex).toContain("\\end{abstract}");
  expect(tex).not.toContain("\\section");
});

test("a venue can suppress a generated section heading without losing its anchor", () => {
  const tex = renderSection("# Introduction\n\nThe opening.\n", "introduction");
  const suppressed = suppressSectionHeading(tex, "introduction");
  expect(suppressed).toContain("\\phantomsection\\label{sec:introduction}");
  expect(suppressed).not.toContain("\\section{Introduction}");
  expect(suppressed).toContain("The opening.");
});

test("source-word estimates ignore claim machinery, citations, headings, and fences", () => {
  const words = markdownProseWordCount([
    "# Heading",
    "",
    "[Two words]{.claim .validated grounds=g} [@source] @num:value $x+y$.",
    "",
    "```latex",
    "\\caption{excluded legend words}",
    "```",
  ].join("\n"));
  expect(words).toBe(4); // Two words + one bound number + one equation token
});

test("latex fences pass through raw; other fences become verbatim; math survives", () => {
  const tex = renderSection("# T\n\n```latex\n\\begin{equation}x\\end{equation}\n```\n\n```py\nprint(1)\n```\n\nInline $a_i \\leq b$ stays.\n", "t");
  expect(tex).toContain("\\begin{equation}x\\end{equation}");
  expect(tex).toContain("\\begin{verbatim}\nprint(1)\n\\end{verbatim}");
  expect(tex).toContain("$a_i \\leq b$");
});

test("prose escaping covers the TeX specials without touching protected runs", () => {
  expect(texEscape("50% & #tags_used {x} ~1^2")).toBe("50\\% \\& \\#tags\\_used \\{x\\} \\textasciitilde{}1\\textasciicircum{}2");
  const tex = renderSection("# T\n\n50% of $x_i$ & more.\n", "t");
  expect(tex).toContain("50\\% of $x_i$ \\& more.");
});

test("blindhide divs wrap their content in \\blindhide", () => {
  const tex = renderSection("# T\n\n::: blindhide\nFunded by Grant 1.\n:::\n", "t");
  expect(tex).toContain("\\blindhide{Funded by Grant 1.}");
});

test("claim text may nest citations and crossrefs (balanced brackets, the dogfood bug)", () => {
  const tex = renderSection("# T\n\n[the same percept ([@sec:theory]), as shown [@wagemans2012]]{.claim .validated grounds=g1}.\n", "t");
  expect(tex).toContain("\\claimV{the same percept (\\cref{sec:theory}), as shown \\cite{wagemans2012}}\\editiogrounds{g1}");
  expect(tex).not.toContain("]{.claim");
});

test("a malformed span leaves residue AND raises the leftover-span warning", () => {
  const warnings: string[] = [];
  renderSection("# T\n\n[unbalanced (]( bracket]{.claim}\n", "t", (m) => warnings.push(m));
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toContain("survived unrendered");
});

test("latex+ fences transform citations and crossrefs but nothing else stays raw", () => {
  const tex = renderSection("# T\n\n```latex+\n\\caption{Beats baseline [@vaswani2017]; see @fig:main & $x_i$.}\n```\n", "t");
  expect(tex).toContain("\\caption{Beats baseline \\cite{vaswani2017}; see \\cref{fig:main} & $x_i$.}"); // & unescaped: raw LaTeX
});

test("lib: front-matter lists and scalars parse; slugify is label-safe", () => {
  const { data } = parseFrontmatter("---\nclass: deo:Methods\ngrounds: [a-b, c]\nupdated: 2026-07-03\n---\nbody");
  expect(data.class).toBe("deo:Methods");
  expect(data.grounds).toEqual(["a-b", "c"]);
  expect(slugify("Related Work!")).toBe("related-work");
});

test("@num:handle binds in prose, math, claim spans, and latex+ captions — never in byte-raw fences", () => {
  const tex = renderSection([
    "# T",
    "",
    "Mean @num:bakeoff-mean-ari in prose and $\\Delta = @num:bakeoff-mean-ari$ in math.",
    "",
    "[leads at @num:bakeoff-mean-ari]{.claim .validated grounds=g}",
    "",
    "```latex+",
    "\\caption{mean @num:bakeoff-mean-ari}",
    "```",
    "",
    "```latex",
    "raw @num:bakeoff-mean-ari stays",
    "```",
    "",
  ].join("\n"), "t");
  const bound = tex.match(/\\editionum\{bakeoff-mean-ari\}/g) ?? [];
  expect(bound.length).toBe(4); // prose + math + claim + latex+ caption
  expect(tex).toContain("$\\Delta = \\editionum{bakeoff-mean-ari}$");
  expect(tex).toContain("\\claimV{leads at \\editionum{bakeoff-mean-ari}}");
  expect(tex).toContain("raw @num:bakeoff-mean-ari stays"); // the byte-raw contract holds
});

test("a bracketed [@num:x] is refused — handles go bare", () => {
  expect(() => renderSection("# T\n\n[@num:x]\n", "t")).toThrow(/bare/);
});

// ──────────── audit hardening: the renderer warns where it used to be silent ────────────

test("AUDIT: near-miss @num handles, unknown claim classes, and heading/list edge cases all warn", () => {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  renderSection([
    "# T",
    "",
    "Wrong case @num:Bakeoff-Mean and a typo grade next.",
    "",
    "[claim text]{.claim .validatd}",
    "",
    "# Second Top Heading",
    "",
    "#### four hashes",
    "",
    "- top item",
    "  - indented item",
    "",
  ].join("\n"), "t", warn);
  expect(warnings.some((w) => w.includes("@num:Bakeoff-Mean") && w.includes("kebab-case"))).toBe(true);
  expect(warnings.some((w) => w.includes(".validatd") && w.includes("UNGRADED"))).toBe(true);
  expect(warnings.some((w) => w.includes("second top-level"))).toBe(true);
  expect(warnings.some((w) => w.includes("headings stop at ###"))).toBe(true);
  expect(warnings.some((w) => w.includes("indented list item"))).toBe(true);
});

test("AUDIT: corrupted spans warn even without the literal '{.claim' spelling; quoted syntax in code does not", () => {
  const warnings: string[] = [];
  renderSection("# T\n\n[missing dot]{claim}\n\n[misspelled]{.clam}\n", "t", (m) => warnings.push(m));
  expect(warnings.some((w) => w.includes("survived unrendered"))).toBe(true);
  const clean: string[] = [];
  const tex = renderSection("# T\n\nThe subset renders `{.claim}` spans in prose.\n", "t", (m) => clean.push(m));
  expect(tex).toContain("\\texttt{\\{.claim\\}}"); // renders fine
  expect(clean.length).toBe(0); // and no false-positive warning
});

test("AUDIT: inline-math % is escaped (fatal downstream otherwise); prose-as-math warns; grounds attrs are escaped", () => {
  const warnings: string[] = [];
  const tex = renderSection([
    "# T",
    "",
    "Error rate $e = 5% \\pm 1%$ across folds.",
    "",
    "The pilot cost $5 in region A and $10 in region B.",
    "",
    "[needs checking]{.claim .validated grounds=needs_check}",
    "",
  ].join("\n"), "t", (m) => warnings.push(m));
  expect(tex).toContain("$e = 5\\% \\pm 1\\%$");
  expect(warnings.some((w) => w.includes("prose captured as math"))).toBe(true);
  expect(tex).toContain("\\editiogrounds{needs\\_check}"); // escaped like the frontmatter path
});

test("AUDIT: symbol fence tags (c++) stay fenced; quote-glued crossrefs resolve; multi-key self-cites are refused", () => {
  const tex = renderSection("# T\n\n```c++\nint x = 1;\n```\n\nSee \"@sec:methods\" and results--@sec:setup.\n", "t");
  expect(tex).toContain("\\begin{verbatim}\nint x = 1;\n\\end{verbatim}");
  expect(tex).toContain("\\cref{sec:methods}");
  expect(tex).toContain("\\cref{sec:setup}");
  expect(() => renderSection("# T\n\n[@a; @b]{.self}\n", "t")).toThrow(/single key/);
});

test("AUDIT: the abstract carries no provenance stamp inside its environment", () => {
  const tex = renderSection("---\nclass: doco:Abstract\nupdated: 2026-07-06\ngrounds: [g]\n---\n# Abstract\n\nOne sentence.\n", "abstract");
  expect(tex).toContain("\\begin{abstract}");
  expect(tex).not.toContain("\\editiostamp");
});
