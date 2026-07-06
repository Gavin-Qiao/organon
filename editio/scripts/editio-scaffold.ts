#!/usr/bin/env bun
/**
 * editio-scaffold.ts — lay down (or rebuild) the .editio/paper/ workspace for a venue.
 *
 * Idempotent: authored files (paper.json, sections/*.md, refs.bib, the schema) are
 * created only when missing and never overwritten; generated files (main.tex,
 * front/metadata.tex, editio.sty) refresh only with --force. Venue = data
 * (templates/venues/<id>/venue.json); mode defaults to draft; identity comes from
 * paper.json only, scaffolded as placeholders — never anyone's real name.
 *
 * Usage:
 *   editio-scaffold.ts [--root <dir>] [--venue <id>] [--order <id>] [--force]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, paperDir, readJSON, texEscape } from "./lib.ts";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(PLUGIN, "templates");

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}
const log = (m: string) => console.log(`editio-scaffold: ${m}`);

function ensureDir(p: string) { mkdirSync(p, { recursive: true }); }

/** Create from template only when absent (authored files). Returns true if written. */
function seed(dest: string, content: string): boolean {
  if (existsSync(dest)) return false;
  writeFileSync(dest, content);
  return true;
}

/** Generate a derived file: write when absent or --force. */
function generate(dest: string, content: string, force: boolean): boolean {
  if (existsSync(dest) && !force) return false;
  writeFileSync(dest, content);
  return true;
}

function humanize(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** front/metadata.tex from paper.json — blind-safe via \ifeditioblind. */
function metadataTex(meta: any, authorFormat: string): string {
  const authorsFull = (meta.authors as any[]).map((a) => {
    const notes = [a.affiliation, a.email].filter(Boolean).join(". ");
    return authorFormat === "ieee-journal"
      ? `${a.name}`
      : `${texEscape(a.name)}${notes ? `\\thanks{${texEscape(notes)}}` : ""}`;
  });
  const author = authorFormat === "ieee-journal"
    ? `${authorsFull.map(texEscape).join(", ")}${(meta.authors as any[]).some((a) => a.affiliation)
        ? `\\thanks{${(meta.authors as any[]).filter((a) => a.affiliation).map((a) => texEscape(`${a.name} is with ${a.affiliation}.`)).join(" ")}}`
        : ""}`
    : authorsFull.join(" \\and ");
  const blindLabel = texEscape(meta.blind?.label ?? "Anonymous Authors");
  return [
    "% front/metadata.tex — GENERATED from paper.json by editio-scaffold (--force to regenerate).",
    "% Identity lives in paper.json only; blind mode masks it here at compile time.",
    `\\title{${texEscape(meta.title ?? "Untitled")}}`,
    "\\ifeditioblind",
    `  \\author{${blindLabel}}`,
    "\\else",
    `  \\author{${author}}`,
    "\\fi",
    "",
  ].join("\n");
}

function main(argv: string[]): number {
  // walk up to an existing project root so a run from inside .editio/paper/ extends
  // that workspace instead of nesting a second one under it
  const root = arg(argv, "root") ?? findRoot(process.cwd());
  const force = argv.includes("--force");
  const paper = paperDir(root);

  ensureDir(join(paper, "sections"));
  ensureDir(join(paper, "front"));
  ensureDir(join(paper, "figures"));
  ensureDir(join(root, ".editio", "schema"));

  // 1. The structure gate — project-tunable copy, like kb-vocab.json.
  const gatePath = join(root, ".editio", "schema", "doco-deo.json");
  if (!existsSync(gatePath)) { copyFileSync(join(TEMPLATES, "schema", "doco-deo.json"), gatePath); log("seeded .editio/schema/doco-deo.json"); }
  const gate = readJSON(gatePath);

  // 2. paper.json — authored; placeholders only, never overwritten.
  if (seed(join(paper, "paper.json"), readFileSync(join(TEMPLATES, "paper.json"), "utf8"))) {
    log("seeded paper.json (placeholder identity — edit it; it is the only place your name goes)");
  }
  const meta = readJSON(join(paper, "paper.json"));

  // 3. Resolve venue + order (flags override paper.json; paper.json stays untouched).
  const venueId = arg(argv, "venue") ?? meta.venue ?? "arxiv";
  const orderId = arg(argv, "order") ?? meta.order ?? "cs-systems";
  const venuePath = join(TEMPLATES, "venues", venueId, "venue.json");
  if (!existsSync(venuePath)) {
    const known = readdirSync(join(TEMPLATES, "venues"));
    console.error(`editio-scaffold: unknown venue "${venueId}" — available: ${known.join(", ")}`);
    return 1;
  }
  const venue = readJSON(venuePath);
  const order: string[] = gate.orders?.[orderId];
  if (!order) {
    console.error(`editio-scaffold: unknown order "${orderId}" — available: ${Object.keys(gate.orders ?? {}).join(", ")}`);
    return 1;
  }

  // 4. The render layer — derived from the plugin; refresh with --force.
  if (generate(join(paper, "editio.sty"), readFileSync(join(TEMPLATES, "latex", "editio.sty"), "utf8"), force)) log("wrote editio.sty");

  // 5. main.tex — generated from the template + venue data.
  const inputs = order
    .filter((c) => c !== "doco:BibliographicReferenceList") // the bibliography is main.tex's own tail
    .map((c) => gate.section_slugs?.[c] ?? c.split(":").pop()!.toLowerCase())
    .map((slug) => `\\InputIfFileExists{sections/${slug}}{}{}`)
    .join("\n");
  const packages = (venue.packages ?? [])
    .map((p: string) => (p.startsWith("[") ? `\\usepackage${p}` : `\\usepackage{${p}}`))
    .join("\n");
  const preamble = (venue.preamble ?? []).join("\n");
  const mainTex = readFileSync(join(TEMPLATES, "latex", "main.tex"), "utf8")
    .replace("EDITIO_VERSION", String(readJSON(join(PLUGIN, ".claude-plugin", "plugin.json")).version))
    .replace("EDITIO_VENUE", venue.id)
    .replace("EDITIO_CLASS_OPTIONS", (venue.class_options ?? []).join(","))
    .replace("EDITIO_CLASS", venue.class)
    .replace("EDITIO_EXTRA_PACKAGES\n", packages ? `${packages}\n` : "")
    .replace("EDITIO_VENUE_PREAMBLE\n", preamble ? `${preamble}\n` : "")
    .replace("EDITIO_SECTIONS", inputs)
    .replace("EDITIO_BIBSTYLE", venue.bib_style)
    .replace("EDITIO_BIB", String(meta.bibliography ?? "refs.bib").replace(/\.bib$/, ""));
  if (generate(join(paper, "main.tex"), mainTex, force)) log(`wrote main.tex (venue ${venue.id}, order ${orderId})`);

  // 5a. front/macros.tex — the AUTHORED extension point (the first dogfood reached
  //     for it): seeded once, \InputIfFileExists'd by main.tex, never regenerated.
  if (seed(join(paper, "front", "macros.tex"), [
    "% front/macros.tex — YOURS. Seeded once; the scaffold never touches it again,",
    "% and main.tex \\InputIfFileExists's it before the document starts. Put your",
    "% macros, float tuning, and package tweaks here — they survive --force.",
    "",
  ].join("\n"))) log("seeded front/macros.tex (your standing extension point)");

  // 5b. .latexmkrc — the reference build driver config (out-of-tree build;
  //     bibtex runs in build/ and finds sources through BIBINPUTS).
  const rc = [
    "# .latexmkrc — GENERATED by editio-scaffold (--force to regenerate).",
    "# Out-of-tree build: aux + pdf land in build/ (gitignored); latexmk is the",
    "# reference driver per skills-not-stacks — swap it for your own build freely.",
    "$out_dir = 'build';",
    "$pdf_mode = 1;",
    "ensure_path('BIBINPUTS', '..');",
    "",
  ].join("\n");
  if (generate(join(paper, ".latexmkrc"), rc, force)) log("wrote .latexmkrc (build with: latexmk main.tex)");

  // 6. front/metadata.tex — generated from paper.json.
  if (generate(join(paper, "front", "metadata.tex"), metadataTex(meta, venue.author_format ?? "plain"), force)) {
    log("wrote front/metadata.tex (blind-masked via \\ifeditioblind)");
  }

  // 6b. figures/editio.mplstyle — generated from venue widths, so figures are born at
  //     the slot size (editio-figures; editio-figcheck gates the result).
  if (typeof venue.column_width_mm === "number") {
    const wIn = venue.column_width_mm / 25.4;
    const fullIn = (venue.full_width_mm ?? venue.column_width_mm) / 25.4;
    const mpl = readFileSync(join(TEMPLATES, "figures", "editio.mplstyle"), "utf8")
      .replace("EDITIO_VENUE", venue.id)
      .replace("EDITIO_FIG_W_IN", wIn.toFixed(2))
      .replace("EDITIO_FIG_H_IN", (wIn / 1.618).toFixed(2))
      .replace("EDITIO_FULL_W_IN", fullIn.toFixed(2))
      .replace("EDITIO_FONT_PT", String(venue.figure_font_pt ?? 8));
    if (generate(join(paper, "figures", "editio.mplstyle"), mpl, force)) {
      log(`wrote figures/editio.mplstyle (${venue.column_width_mm}mm column, ${venue.figure_font_pt ?? 8}pt)`);
    }
  } else {
    log(`venue "${venue.id}" has no column_width_mm — skipped figures/editio.mplstyle`);
  }

  // 7. Section stubs — authored files, seeded once per order entry.
  const today = new Date().toISOString().slice(0, 10);
  let stubs = 0;
  for (const cls of order) {
    if (cls === "doco:BibliographicReferenceList") continue;
    const slug = gate.section_slugs?.[cls] ?? cls.split(":").pop()!.toLowerCase();
    const stub = [
      "---",
      `class: ${cls}`,
      "status: drafting",
      "grounds: []",
      `updated: ${today}`,
      "---",
      `# ${humanize(slug)}`,
      "",
    ].join("\n");
    if (seed(join(paper, "sections", `${slug}.md`), stub)) stubs++;
  }
  if (stubs) log(`seeded ${stubs} section stub(s) for order "${orderId}"`);

  // 8. refs.bib — authored; editio-bib (Phase 4) will generate from the lit store.
  seed(join(paper, String(meta.bibliography ?? "refs.bib")), "% refs.bib — editio-bib builds this from the promptus lit store (Phase 4); hand-add entries meanwhile.\n");

  // 9. Keep the derived build dir out of git (the paper source itself is committed).
  const gi = join(root, ".gitignore");
  const line = "/.editio/paper/build/";
  const cur = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  if (!cur.split(/\r?\n/).includes(line)) {
    writeFileSync(gi, `${cur.length && !cur.endsWith("\n") ? `${cur}\n` : cur}${line}\n`);
    log(".gitignore: added /.editio/paper/build/");
  }

  log(`done — ${paper}`);
  console.log("next: write sections/*.md, then `editio-render.ts --all`, then `latexmk main.tex` (builds into build/)");
  return 0;
}

process.exit(main(process.argv.slice(2)));
