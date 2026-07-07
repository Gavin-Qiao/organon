/**
 * identity.test.ts — editio-identity's contract: paper.json is the single source of
 * truth for identity, delivered to every document as pure data macros. The five-files-
 * per-authorship-change incident replays here: one paper.json edit + one regenerate
 * must reach the title, the author block, and the bios — and blind masking stays in
 * the consumers. Runs the real scripts through the bun binary against temp roots.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { identityTexOf, shortName, stripTexorpdfstring } from "../editio-identity.ts";

const IDENTITY = join(import.meta.dir, "..", "editio-identity.ts");
const SCAFFOLD = join(import.meta.dir, "..", "editio-scaffold.ts");
const RENDER = join(import.meta.dir, "..", "editio-render.ts");

const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "editio-identity-test-"));
  tmps.push(d);
  return d;
}
function run(script: string, root: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const paper = (root: string, ...p: string[]) => join(root, ".editio", "paper", ...p);
const read = (p: string) => readFileSync(p, "utf8");

const TWO_AUTHORS = {
  title: "Gauging \\texorpdfstring{$\\Psi$}{Psi}: A Measured Study",
  short_title: "",
  authors: [
    { name: "Ada Lovelace King", affiliation: "Analytical Engines Ltd", email: "" },
    { name: "Alan Turing", affiliation: "Analytical Engines Ltd", email: "a_turing@example.org", corresponding: true },
  ],
  venue: "arxiv",
};

test("stripTexorpdfstring collapses to the TeX arg, balanced braces and all", () => {
  expect(stripTexorpdfstring("Gauging \\texorpdfstring{$\\Psi$}{Psi} Fields")).toBe("Gauging $\\Psi$ Fields");
  expect(stripTexorpdfstring("\\texorpdfstring{$e^{x}$}{e^x} and \\texorpdfstring{$\\mu$}{mu}")).toBe("$e^{x}$ and $\\mu$");
  expect(stripTexorpdfstring("no directive")).toBe("no directive");
});

test("shortName gives F.~Last; single-word names pass through", () => {
  expect(shortName("Ada Lovelace King")).toBe("A.~King");
  expect(shortName("Alan Turing")).toBe("A.~Turing");
  expect(shortName("Plato")).toBe("Plato");
});

test("identityTexOf: title verbatim (math survives), authors as data macros, corresponding derived", () => {
  const tex = identityTexOf(TWO_AUTHORS);
  expect(tex).toContain("GENERATED from paper.json");
  expect(tex).toContain(`\\newcommand{\\PaperTitle}{${TWO_AUTHORS.title}}`); // verbatim — no escaping of a LaTeX title
  expect(tex).toContain("\\newcommand{\\PaperTitlePlain}{Gauging $\\Psi$: A Measured Study}");
  expect(tex).toContain("\\newcommand{\\AuthorList}{Ada~Lovelace~King and Alan~Turing}");
  expect(tex).toContain("\\newcommand{\\AuthorListAnd}{Ada~Lovelace~King \\and Alan~Turing}");
  expect(tex).toContain("\\newcommand{\\AffilShared}{Analytical Engines Ltd}"); // shared affil appears once
  expect(tex).toContain("\\newcommand{\\CorrAuthorShort}{A.~Turing}"); // the marked author, not the first
  expect(tex).toContain("\\newcommand{\\CorrEmail}{a\\_turing@example.org}"); // escaped for LaTeX
  expect(tex).toContain("\\newcommand{\\AuthorOneName}{Ada Lovelace King}");
  expect(tex).toContain("\\newcommand{\\AuthorTwoName}{Alan Turing}");
  expect(tex).toContain("The authors are with Analytical Engines Ltd.");
  expect(tex).toContain("Corresponding author: A.~Turing (a\\_turing@example.org).");
});

test("no corresponding flag defaults to the first author; no email drops the sentence", () => {
  const tex = identityTexOf({ title: "T", authors: [{ name: "Grace Hopper", affiliation: "Navy" }] });
  expect(tex).toContain("\\newcommand{\\CorrAuthorShort}{G.~Hopper}");
  expect(tex).toContain("\\newcommand{\\IdentityThanks}{The author is with Navy.}");
  expect(tex).not.toContain("Corresponding author:");
});

test("more authors than the ordinal table is a clean error, and empty authors[] refuses", () => {
  expect(() => identityTexOf({ title: "T", authors: [] })).toThrow("no authors");
  expect(() => identityTexOf({ title: "T", authors: Array.from({ length: 21 }, (_, i) => ({ name: `A ${i}` })) })).toThrow("extend ORDINALS");
});

test("a fresh scaffold writes identity.tex; the CLI reports current, then regenerates after a paper.json edit", () => {
  const root = scratch();
  expect(run(SCAFFOLD, root, "--venue", "arxiv").status).toBe(0);
  expect(existsSync(paper(root, "front", "identity.tex"))).toBe(true);

  const r1 = run(IDENTITY, root);
  expect(r1.status).toBe(0);
  expect(r1.out).toContain("is current");

  const meta = paper(root, "paper.json");
  writeFileSync(meta, read(meta).replace("Untitled", "A Better Title For A Real Paper"));
  const r2 = run(IDENTITY, root);
  expect(r2.status).toBe(0);
  expect(r2.out).toContain("wrote front/identity.tex");
  expect(read(paper(root, "front", "identity.tex"))).toContain("A Better Title For A Real Paper");
});

test("editio-render --all refreshes the identity layer, so one command propagates a paper.json edit", () => {
  const root = scratch();
  run(SCAFFOLD, root, "--venue", "arxiv");
  const meta = paper(root, "paper.json");
  writeFileSync(meta, read(meta).replace("Author One", "Katherine Johnson"));
  expect(run(RENDER, root, "--all").status).toBe(0);
  expect(read(paper(root, "front", "identity.tex"))).toContain("\\newcommand{\\AuthorOneName}{Katherine Johnson}");
});

test("a venue with a bio_env gets front/bios.tex — macro-driven stubs, blind-masked", () => {
  const root = scratch();
  run(SCAFFOLD, root, "--venue", "tpami");
  const meta = paper(root, "paper.json");
  writeFileSync(meta, read(meta).replace('"venue": "arxiv"', '"venue": "tpami"'));
  const r = run(IDENTITY, root);
  expect(r.out).toContain("wrote front/bios.tex");
  const bios = read(paper(root, "front", "bios.tex"));
  expect(bios).toContain("\\ifeditioblind\\else");
  expect(bios).toContain("\\begin{IEEEbiographynophoto}{\\AuthorOneName}\\AuthorOneBio\\end{IEEEbiographynophoto}");
  expect(bios).not.toContain("Author One"); // data macros only — no literal name
  expect(read(paper(root, "main.tex"))).toContain("\\InputIfFileExists{front/bios}"); // wired by the template
});

test("outside any workspace the CLI exits 2 with an honest error", () => {
  const bare = scratch();
  const r = run(IDENTITY, bare);
  expect(r.status).toBe(2);
  expect(r.out).toContain("not an editio workspace");
});

// ──────────── 0.5.1 venue fidelity: keywords, running heads, bio prose, photos, drop cap ────────────

test("keywords, the running head, and per-author bio prose are data macros too", () => {
  const tex = identityTexOf({
    title: "T Is A Title", keywords: ["gauge fields", "C&C"],
    authors: [
      { name: "Ada Lovelace King", affiliation: "X", bio: "received the Ph.D. degree & studies engines." },
      { name: "Alan Turing", affiliation: "X" },
    ],
  });
  expect(tex).toContain("\\newcommand{\\PaperKeywords}{gauge fields, C\\&C}");
  expect(tex).toContain("\\newcommand{\\AuthorRunning}{A.~King et al.}");
  expect(tex).toContain("\\newcommand{\\AuthorOneBio}{received the Ph.D. degree \\& studies engines.}");
  expect(tex).toContain("\\newcommand{\\AuthorTwoBio}{\\BioBody}"); // no bio yet — boilerplate fallback
  const solo = identityTexOf({ title: "T", authors: [{ name: "Grace Hopper" }] });
  expect(solo).toContain("\\newcommand{\\AuthorRunning}{G.~Hopper}"); // no "et al." for one author
});

test("an author with a photo gets the photo bio environment; the others keep no-photo", () => {
  const root = scratch();
  run(SCAFFOLD, root, "--venue", "tpami");
  const meta = paper(root, "paper.json");
  const parsed = JSON.parse(read(meta));
  parsed.venue = "tpami";
  parsed.authors = [
    { name: "Ada Lovelace King", affiliation: "X", photo: "figures/photos/ada.jpg", bio: "leads the engine group." },
    { name: "Alan Turing", affiliation: "X" },
  ];
  writeFileSync(meta, JSON.stringify(parsed, null, 2));
  expect(run(IDENTITY, root).status).toBe(0);
  const bios = read(paper(root, "front", "bios.tex"));
  expect(bios).toContain("\\begin{IEEEbiography}[{\\includegraphics[width=1in,height=1.25in,clip,keepaspectratio]{figures/photos/ada.jpg}}]{\\AuthorOneName}\\AuthorOneBio\\end{IEEEbiography}");
  expect(bios).toContain("\\begin{IEEEbiographynophoto}{\\AuthorTwoName}\\AuthorTwoBio\\end{IEEEbiographynophoto}");
});

test("par_start venues get \\IEEEPARstart on the first body section; arxiv stays untouched", () => {
  const root = scratch();
  run(SCAFFOLD, root, "--venue", "tpami");
  const meta = paper(root, "paper.json");
  writeFileSync(meta, read(meta).replace('"venue": "arxiv"', '"venue": "tpami"'));
  const intro = paper(root, "sections", "introduction.md");
  writeFileSync(intro, read(intro) + "\nThis opening paragraph earns the drop cap.\n");
  expect(run(RENDER, root, "--all").status).toBe(0);
  expect(read(paper(root, "sections", "introduction.tex"))).toContain("\\IEEEPARstart{T}{his} opening paragraph");
  // the abstract (first in build order) is never the drop-cap target
  expect(read(paper(root, "sections", "abstract.tex"))).not.toContain("\\IEEEPARstart");

  const arxivRoot = scratch();
  run(SCAFFOLD, arxivRoot, "--venue", "arxiv");
  const intro2 = paper(arxivRoot, "sections", "introduction.md");
  writeFileSync(intro2, read(intro2) + "\nThis opening paragraph stays plain.\n");
  run(RENDER, arxivRoot, "--all");
  expect(read(paper(arxivRoot, "sections", "introduction.tex"))).not.toContain("\\IEEEPARstart");
});
