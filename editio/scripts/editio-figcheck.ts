#!/usr/bin/env bun
/**
 * editio-figcheck.ts — the figure-size gate (G9): a built figure PDF must already BE the
 * width it will occupy on the page. Post-scaling in LaTeX (width=\columnwidth around a
 * wrong-sized PDF) silently shrinks every font out of spec; this lint catches it at the
 * source instead. Reads the PDF's /MediaBox (PostScript points, 72/inch) and compares the
 * page width against the venue slot width in mm (venue.json: column_width_mm for single,
 * full_width_mm for double) or an explicit --width-mm.
 *
 * Usage:
 *   editio-figcheck.ts <figure.pdf> [more.pdf ...]
 *     [--width-mm <n>] [--slot single|double] [--venue <id>] [--root <dir>] [--tolerance-mm <n>]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, paperDir, readJSON } from "./lib.ts";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const MM_PER_PT = 25.4 / 72;

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** Width of the first /MediaBox in the PDF, in mm — null when none is readable. */
export function mediaBoxWidthMm(bytes: string): number | null {
  const m = bytes.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
  if (!m) return null;
  return (parseFloat(m[3]) - parseFloat(m[1])) * MM_PER_PT;
}

/** Expected width for a venue slot — null when the venue data has no width for it. */
export function slotWidthMm(venue: any, slot: string): number | null {
  const w = slot === "double" ? venue.full_width_mm ?? venue.column_width_mm : venue.column_width_mm;
  return typeof w === "number" ? w : null;
}

function main(argv: string[]): number {
  const pdfs = argv.filter((a) => a.endsWith(".pdf"));
  if (!pdfs.length) {
    console.error("editio-figcheck: no PDF given — usage: editio-figcheck.ts <figure.pdf> [--width-mm N | --slot single|double --venue <id>]");
    return 2;
  }

  const tolerance = parseFloat(arg(argv, "tolerance-mm") ?? "1");
  const slot = arg(argv, "slot") ?? "single";
  let expected = arg(argv, "width-mm") ? parseFloat(arg(argv, "width-mm")!) : NaN;
  let label = `--width-mm`;

  if (Number.isNaN(expected)) {
    const root = arg(argv, "root") ?? findRoot(process.cwd());
    const paperMetaPath = join(paperDir(root), "paper.json");
    const venueId = arg(argv, "venue") ?? (existsSync(paperMetaPath) ? readJSON(paperMetaPath).venue : undefined) ?? "arxiv";
    const venuePath = join(PLUGIN, "templates", "venues", venueId, "venue.json");
    if (!existsSync(venuePath)) {
      console.error(`editio-figcheck: unknown venue "${venueId}" and no --width-mm given`);
      return 2;
    }
    const w = slotWidthMm(readJSON(venuePath), slot);
    if (w == null) {
      console.error(`editio-figcheck: venue "${venueId}" has no width for slot "${slot}" — pass --width-mm`);
      return 2;
    }
    expected = w;
    label = `${venueId} ${slot}`;
  }

  let failed = 0;
  for (const pdf of pdfs) {
    if (!existsSync(pdf)) { console.error(`editio-figcheck: FAIL ${pdf} — file not found`); failed++; continue; }
    const width = mediaBoxWidthMm(readFileSync(pdf, "latin1"));
    if (width == null) {
      console.error(`editio-figcheck: FAIL ${pdf} — no /MediaBox found (object-stream-compressed PDF?); re-export, or verify by hand`);
      failed++;
      continue;
    }
    const delta = Math.abs(width - expected);
    if (delta <= tolerance) {
      console.log(`editio-figcheck: OK   ${pdf} — ${width.toFixed(1)}mm (expected ${expected}mm ±${tolerance}, ${label})`);
    } else {
      console.error(`editio-figcheck: FAIL ${pdf} — ${width.toFixed(1)}mm, expected ${expected}mm ±${tolerance} (${label}); size at creation, never post-scale (editio-figures)`);
      failed++;
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
