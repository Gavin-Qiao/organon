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
import { renderSection } from "../editio-render.ts";
import { parseFrontmatter, texEscape, slugify } from "../lib.ts";

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

test("lib: front-matter lists and scalars parse; slugify is label-safe", () => {
  const { data } = parseFrontmatter("---\nclass: deo:Methods\ngrounds: [a-b, c]\nupdated: 2026-07-03\n---\nbody");
  expect(data.class).toBe("deo:Methods");
  expect(data.grounds).toEqual(["a-b", "c"]);
  expect(slugify("Related Work!")).toBe("related-work");
});
