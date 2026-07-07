#!/usr/bin/env bun
/**
 * editio-identity.ts — paper.json is the one place identity lives; this makes it true.
 *
 * The third dogfood measured the gap: one authorship decision ("swap the first and
 * corresponding authors") took FIVE hand-edited files — paper.json, front/metadata.tex,
 * two sets of author bios, and the supplement's \title/\author — with the title
 * triplicated along the way. The fix is a data layer: this script reads paper.json and
 * writes front/identity.tex, a file of pure class-agnostic \newcommand data macros.
 * Every document assembles its author block / bios / titles FROM those macros;
 * class-specific formatting stays in the consumers. Changing identity is one
 * paper.json edit + a regenerate (editio-render --all does it for you).
 *
 * Macros:
 *   \PaperTitle        the title verbatim (titles are LaTeX — math survives)
 *   \PaperTitlePlain   \texorpdfstring{tex}{pdf} collapsed to its TeX arg
 *   \PaperShortTitle   paper.json short_title, falling back to \PaperTitlePlain
 *   \AuthorList        "Author~One, Author~Two and Author~Three" (prose form)
 *   \AuthorListAnd     "Author~One \and Author~Two" (article-class \author form)
 *   \AffilShared       the unique affiliations, "; "-joined
 *   \CorrAuthorShort   "F.~Last" of the corresponding author
 *   \CorrEmail         the corresponding author's email
 *   \IdentityThanks    the assembled provenance sentence(s) for a \thanks{...}
 *   \AuthorOneName ..  each author's plain name, for bios (spelled ordinals)
 *   \BioBody           bio boilerplate built on \AffilShared
 *
 * The corresponding author is the first with "corresponding": true, else the first
 * author. Venues with a bio_env (venue.json) also get front/bios.tex — per-author
 * bio stubs referencing the macros, blind-masked via \ifeditioblind.
 *
 * Deterministic, report-only on the workspace: writes only when content changed,
 * never edits paper.json. Exit 2 when there is no workspace.
 *
 * Usage:
 *   editio-identity.ts [--root <dir>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, paperDir, readJSON, texEscape } from "./lib.ts";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(PLUGIN, "templates");

const ORDINALS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** Read one balanced {group} starting at (or after whitespace from) `from`. */
function readGroup(s: string, from: number): [string, number] {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== "{") return ["", from];
  let depth = 0;
  const start = i + 1;
  for (; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return [s.slice(start, i), i + 1];
  }
  return [s.slice(start), s.length];
}

/** \texorpdfstring{TEX}{PDF} → TEX (repeated, so nesting collapses too). */
export function stripTexorpdfstring(s: string): string {
  let out = s;
  for (let guard = 0; guard < 20; guard++) {
    const i = out.indexOf("\\texorpdfstring");
    if (i < 0) break;
    const [tex, afterTex] = readGroup(out, i + "\\texorpdfstring".length);
    const [, afterPdf] = readGroup(out, afterTex);
    out = out.slice(0, i) + tex + out.slice(afterPdf);
  }
  return out;
}

/** "First Middle Last" → "F.~Last" (single-word names pass through). */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return texEscape(name.trim());
  return `${texEscape(words[0][0])}.~${texEscape(words[words.length - 1])}`;
}

const tieName = (name: string) => texEscape(name.trim()).replace(/ /g, "~");

export function identityTexOf(meta: any): string {
  const authors: any[] = Array.isArray(meta.authors) ? meta.authors : [];
  if (!authors.length) throw new Error("paper.json has no authors[]");
  if (authors.length > ORDINALS.length) throw new Error(`more than ${ORDINALS.length} authors — extend ORDINALS in editio-identity.ts`);
  const corr = authors.find((a) => a?.corresponding) ?? authors[0];
  const names = authors.map((a) => tieName(String(a?.name ?? "")));
  const list = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const affils = [...new Set(authors.map((a) => String(a?.affiliation ?? "").trim()).filter(Boolean))];
  const affilShared = affils.map(texEscape).join("; ");
  const email = String(corr?.email ?? "").trim();
  const thanks = [
    affilShared ? `The author${authors.length > 1 ? "s are" : " is"} with ${affilShared}.` : "",
    email ? `Corresponding author: ${shortName(String(corr?.name ?? ""))} (${texEscape(email)}).` : "",
  ].filter(Boolean).join(" ");
  const title = String(meta.title ?? "Untitled");
  const shortTitle = String(meta.short_title ?? "").trim();
  return [
    "% front/identity.tex — GENERATED from paper.json by editio-identity; edit paper.json, never this file.",
    "% Pure class-agnostic data macros: documents assemble their author blocks / bios / titles FROM these,",
    "% so one paper.json edit + editio-render --all updates every consumer. Blind masking stays in the",
    "% consumers (\\ifeditioblind) — this file is data.",
    `\\newcommand{\\PaperTitle}{${title}}`,
    `\\newcommand{\\PaperTitlePlain}{${stripTexorpdfstring(title)}}`,
    `\\newcommand{\\PaperShortTitle}{${shortTitle || stripTexorpdfstring(title)}}`,
    `\\newcommand{\\AuthorList}{${list}}`,
    `\\newcommand{\\AuthorListAnd}{${names.join(" \\and ")}}`,
    `\\newcommand{\\AffilShared}{${affilShared}}`,
    `\\newcommand{\\CorrAuthorShort}{${shortName(String(corr?.name ?? ""))}}`,
    `\\newcommand{\\CorrEmail}{${texEscape(email)}}`,
    `\\newcommand{\\IdentityThanks}{${thanks}}`,
    ...authors.map((a, i) => `\\newcommand{\\Author${ORDINALS[i]}Name}{${texEscape(String(a?.name ?? ""))}}`),
    `\\newcommand{\\BioBody}{is with \\AffilShared.}`,
    "",
  ].join("\n");
}

export function biosTexOf(meta: any, bioEnv: string): string {
  const authors: any[] = Array.isArray(meta.authors) ? meta.authors : [];
  return [
    "% front/bios.tex — GENERATED from paper.json by editio-identity; edit paper.json, never this file.",
    "% One bio stub per author, assembled from the identity macros; blind builds drop the block.",
    "\\ifeditioblind\\else",
    ...authors.map((_, i) => `\\begin{${bioEnv}}{\\Author${ORDINALS[i]}Name}\\BioBody\\end{${bioEnv}}`),
    "\\fi",
    "",
  ].join("\n");
}

/** Regenerate front/identity.tex (+ front/bios.tex for venues with a bio_env) when stale. */
export function writeIdentity(root: string): { changed: string[] } {
  const paper = paperDir(root);
  const meta = readJSON(join(paper, "paper.json"));
  const changed: string[] = [];
  const put = (rel: string, content: string) => {
    const dest = join(paper, rel);
    if (existsSync(dest) && readFileSync(dest, "utf8") === content) return;
    writeFileSync(dest, content);
    changed.push(rel);
  };
  put("front/identity.tex", identityTexOf(meta));
  const venuePath = join(TEMPLATES, "venues", String(meta.venue ?? "arxiv"), "venue.json");
  const bioEnv = existsSync(venuePath) ? readJSON(venuePath).bio_env : undefined;
  if (bioEnv) put("front/bios.tex", biosTexOf(meta, String(bioEnv)));
  return { changed };
}

function main(argv: string[]): number {
  const root = arg(argv, "root") ?? findRoot(process.cwd());
  const paper = paperDir(root);
  if (!existsSync(join(paper, "paper.json"))) {
    console.error(`editio-identity: no ${join(paper, "paper.json")} — not an editio workspace (searched upward from the cwd); pass --root <dir>`);
    return 2;
  }
  try {
    const { changed } = writeIdentity(root);
    if (changed.length) for (const f of changed) console.log(`editio-identity: wrote ${f}`);
    else console.log("editio-identity: front/identity.tex is current (matches paper.json)");
    return 0;
  } catch (e) {
    console.error(`editio-identity: ${(e as Error).message}`);
    return 2;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
