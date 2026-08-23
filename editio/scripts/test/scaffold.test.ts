/**
 * scaffold.test.ts — editio-scaffold's contract: idempotent, venue-driven,
 * and identity-clean (placeholders only; blind masking wired in the generated
 * metadata). Runs the real script through the bun binary against temp roots.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "editio-scaffold.ts");
const RENDER = join(import.meta.dir, "..", "editio-render.ts");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "editio-scaffold-test-"));
  tmps.push(d);
  return d;
}
function run(root: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const paper = (root: string, ...p: string[]) => join(root, ".editio", "paper", ...p);
const read = (p: string) => readFileSync(p, "utf8");

test("scaffold lays down the arxiv workspace: gate, meta, sty, main, rc, stubs, bib, gitignore", () => {
  const root = scratch();
  expect(run(root, "--venue", "arxiv").status).toBe(0);
  for (const f of ["paper.json", "editio.sty", "main.tex", ".latexmkrc", "refs.bib", join("front", "metadata.tex"), join("sections", "introduction.md")]) {
    expect(existsSync(paper(root, f))).toBe(true);
  }
  expect(existsSync(join(root, ".editio", "schema", "doco-deo.json"))).toBe(true);
  const main = read(paper(root, "main.tex"));
  expect(main).toContain("\\documentclass[11pt]{article}");
  expect(main).toContain("\\usepackage{natbib}");
  expect(main).toContain("\\InputIfFileExists{sections/introduction}{}{}");
  expect(main).toContain("\\bibliographystyle{plainnat}");
  expect(read(join(root, ".gitignore"))).toContain("/.editio/paper/build/");
});

test("authored files survive re-runs; generated files refresh only with --force", () => {
  const root = scratch();
  run(root, "--venue", "arxiv");
  const meta = paper(root, "paper.json");
  writeFileSync(meta, read(meta).replace("Untitled", "My Real Title"));
  const intro = paper(root, "sections", "introduction.md");
  writeFileSync(intro, read(intro) + "\nReal prose.\n");

  expect(run(root, "--venue", "arxiv").status).toBe(0); // plain re-run
  expect(read(meta)).toContain("My Real Title");
  expect(read(intro)).toContain("Real prose.");

  expect(run(root, "--venue", "arxiv", "--force").status).toBe(0); // force refreshes generated only
  expect(read(meta)).toContain("My Real Title");
  expect(read(intro)).toContain("Real prose.");
  // the title reaches the paper as DATA: identity.tex carries it, metadata references the macro
  expect(read(paper(root, "front", "identity.tex"))).toContain("My Real Title");
  expect(read(paper(root, "front", "metadata.tex"))).toContain("\\title{\\PaperTitle}");
});

test("tpami venue swaps the class and bib style; unknown venues list what exists", () => {
  const root = scratch();
  expect(run(root, "--venue", "tpami").status).toBe(0);
  const main = read(paper(root, "main.tex"));
  expect(main).toContain("\\documentclass[10pt,journal,compsoc]{IEEEtran}");
  expect(main).toContain("\\bibliographystyle{IEEEtran}");
  expect(main).toContain("\\usepackage{dblfloatfix}"); // figure* discipline ships by construction
  expect(main).toContain("\\renewcommand{\\dbltopfraction}{0.9}");
  expect(JSON.parse(read(paper(root, "paper.json"))).venue).toBe("tpami");
  const bad = run(scratch(), "--venue", "nope");
  expect(bad.status).toBe(1);
  expect(bad.out).toContain("arxiv");
  expect(bad.out).toContain("nmi");
  expect(bad.out).toContain("tpami");
});

test("a fresh NMI scaffold records its venue/order and applies the Article structure", () => {
  const root = scratch();
  expect(run(root, "--venue", "nmi").status).toBe(0);
  const meta = JSON.parse(read(paper(root, "paper.json")));
  expect(meta.venue).toBe("nmi");
  expect(meta.order).toBe("nature-article");

  const main = read(paper(root, "main.tex"));
  expect(main).toContain("\\documentclass[11pt,a4paper,twocolumn]{article}");
  expect(main).toContain("\\usepackage[numbers,sort&compress]{natbib}");
  expect(main.indexOf("sections/results")).toBeLessThan(main.indexOf("sections/discussion"));
  expect(main.indexOf("sections/discussion")).toBeLessThan(main.indexOf("sections/methods"));
  expect(main).not.toContain("sections/conclusion");

  const style = read(paper(root, "figures", "editio.mplstyle"));
  expect(style).toContain("figure.figsize: 3.46, 2.14");
  expect(style).toContain("font.family: sans-serif");
  expect(style).toContain("font.size: 7");
  expect(style).toContain("mathtext.fontset: dejavusans");

  const rendered = spawnSync(process.execPath, [RENDER, "--root", root, "--all"], { encoding: "utf8" });
  expect(rendered.status).toBe(0);
  const intro = read(paper(root, "sections", "introduction.tex"));
  expect(intro).toContain("\\phantomsection\\label{sec:introduction}");
  expect(intro).not.toContain("\\section{Introduction}");
});

test("a fresh NeurIPS scaffold uses the official package modes, back-matter order, and external assets", () => {
  const root = scratch();
  const scaffold = run(root, "--venue", "neurips");
  expect(scaffold.status).toBe(0);
  expect(scaffold.out).toContain("venue asset missing: neurips_2026.sty");
  expect(scaffold.out).toContain("venue asset missing: front/checklist.tex");
  const meta = JSON.parse(read(paper(root, "paper.json")));
  expect(meta).toMatchObject({ venue: "neurips", order: "ml-conference" });

  const main = read(paper(root, "main.tex"));
  expect(main).toContain("\\documentclass[]{article}");
  expect(main).toContain("\\usepackage[preprint]{neurips_2026}");
  expect(main).toContain("\\usepackage[main]{neurips_2026}");
  expect(main).toContain("\\usepackage[main,final]{neurips_2026}");
  expect(main).toContain("\\label{editio:content-end}");
  expect(main.indexOf("sections/acknowledgements")).toBeLessThan(main.indexOf("\\bibliography{"));
  expect(main.indexOf("sections/appendix")).toBeGreaterThan(main.indexOf("\\bibliography{"));
  expect(main.indexOf("front/checklist.tex")).toBeGreaterThan(main.indexOf("sections/appendix"));
  expect(existsSync(paper(root, "sections", "acknowledgements.md"))).toBe(false);
  expect(existsSync(paper(root, "sections", "appendix.md"))).toBe(false);

  const metadata = read(paper(root, "front", "metadata.tex"));
  expect(metadata).toContain("\\AuthorOneAffiliation");
  expect(metadata).toContain("\\AuthorOneEmail");
  expect(metadata).not.toContain("Author One");
  const style = read(paper(root, "figures", "editio.mplstyle"));
  expect(style).toContain("figure.figsize: 5.50, 3.40");
  expect(style).toContain("font.size: 8");
});

test("the gitignore line is added exactly once across runs", () => {
  const root = scratch();
  run(root, "--venue", "arxiv");
  run(root, "--venue", "arxiv");
  const lines = read(join(root, ".gitignore")).split(/\r?\n/).filter((l) => l === "/.editio/paper/build/");
  expect(lines.length).toBe(1);
});

test("front/macros.tex is a seeded extension point: wired into main.tex, survives --force", () => {
  const root = scratch();
  run(root, "--venue", "arxiv");
  expect(read(paper(root, "main.tex"))).toContain("\\InputIfFileExists{front/macros}");
  const macros = paper(root, "front", "macros.tex");
  expect(existsSync(macros)).toBe(true);
  writeFileSync(macros, "% mine\n\\newcommand{\\mymacro}{x}\n");
  expect(run(root, "--venue", "arxiv", "--force").status).toBe(0);
  expect(read(macros)).toContain("\\mymacro"); // authored: --force never touches it
});

test("scaffold generates figures/editio.mplstyle sized to the venue column", () => {
  const root = scratch();
  expect(run(root, "--venue", "arxiv").status).toBe(0);
  const mpl = read(paper(root, "figures", "editio.mplstyle"));
  expect(mpl).toContain("for venue arxiv");
  expect(mpl).toContain("figure.figsize: 6.50, 4.02"); // 165.1mm text width, golden-ratio height
  expect(mpl).toContain("font.size: 9");
  expect(mpl).toContain("0072B2"); // the Okabe-Ito cycle survived substitution
  expect(mpl).not.toContain("EDITIO_"); // every token resolved
});

test("a venue swap with --force resizes the mplstyle", () => {
  const root = scratch();
  run(root, "--venue", "arxiv");
  expect(run(root, "--venue", "tpami", "--force").status).toBe(0);
  const mpl = read(paper(root, "figures", "editio.mplstyle"));
  expect(mpl).toContain("for venue tpami");
  expect(mpl).toContain("figure.figsize: 3.50, 2.16"); // 88.9mm column = 3.5in
  expect(mpl).toContain("font.size: 9"); // IEEE: figure type ~9-10pt at final size
});

test("ieee-journal venues get the compsoc title block, running heads, and no abstract in the body flow", () => {
  const root = scratch();
  expect(run(root, "--venue", "tpami").status).toBe(0);
  const main = read(paper(root, "main.tex"));
  expect(main).toContain("\\IEEEtitleabstractindextext{%");
  expect(main).toContain("\\InputIfFileExists{sections/abstract}{}{}%"); // the abstract lives in the title block…
  expect(main).toContain("\\begin{IEEEkeywords}\\PaperKeywords\\end{IEEEkeywords}");
  expect(main).toContain("\\IEEEdisplaynontitleabstractindextext");
  expect(main).toContain("\\markboth{IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE}");
  expect(main).toContain("\\AuthorRunning: \\PaperShortTitle"); // …and the running head is macro-fed, blind-guarded
  expect(main).toContain("\\ifeditioblind\\markboth");
  expect(main.match(/sections\/abstract/g)?.length).toBe(1); // exactly once — not again in the body

  const arxivMain = read(paper(scratchArxiv(), "main.tex"));
  expect(arxivMain).toContain("\\maketitle");
  expect(arxivMain).not.toContain("\\IEEEtitleabstractindextext");
  expect(arxivMain).not.toContain("\\markboth");
});
function scratchArxiv(): string {
  const root = scratch();
  run(root, "--venue", "arxiv");
  return root;
}

test("generated metadata is blind-safe and assembles identity from the macros only", () => {
  const root = scratch();
  run(root, "--venue", "arxiv");
  const md = read(paper(root, "front", "metadata.tex"));
  expect(md).toContain("\\ifeditioblind");
  expect(md).toContain("Anonymous Authors");
  expect(md).toContain("\\input{front/identity}");
  expect(md).toContain("\\AuthorListAnd");
  expect(md).not.toContain("Author One"); // names arrive via the data macros, never literally
  const id = read(paper(root, "front", "identity.tex"));
  expect(id).toContain("GENERATED from paper.json");
  expect(id).toContain("\\newcommand{\\AuthorOneName}{Author One}");
});
