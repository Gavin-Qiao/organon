/**
 * figcheck.test.ts — editio-figcheck's contract (the G9 gate): read the PDF's
 * /MediaBox, convert points to mm, compare against the venue slot width or an
 * explicit --width-mm, and fail loudly when a figure would need post-scaling.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaBoxWidthMm, slotWidthMm } from "../editio-figcheck.ts";

const SCRIPT = join(import.meta.dir, "..", "editio-figcheck.ts");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "editio-figcheck-test-"));
  tmps.push(d);
  return d;
}
function run(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** A minimal single-page PDF whose page width is exactly `pt` points. */
function pdfOfWidthPt(pt: number): string {
  return [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt} 176.5] >> endobj`,
    "trailer << /Root 1 0 R >>",
    "%%EOF",
    "",
  ].join("\n");
}

test("mediaBoxWidthMm converts the MediaBox width from points to mm", () => {
  expect(mediaBoxWidthMm(pdfOfWidthPt(252))).toBeCloseTo(88.9, 3); // TPAMI column = 3.5in
  expect(mediaBoxWidthMm(pdfOfWidthPt(360))).toBeCloseTo(127.0, 3); // 5in exactly
  expect(mediaBoxWidthMm("/MediaBox [0 0 612 792]")).toBeCloseTo(215.9, 1); // US Letter
});

test("a MediaBox with a shifted origin measures x2 - x1, not x2", () => {
  expect(mediaBoxWidthMm("/MediaBox [10 20 259.4488 196.5]")).toBeCloseTo(88.0, 3);
});

test("a PDF with no readable MediaBox returns null", () => {
  expect(mediaBoxWidthMm("%PDF-1.7 compressed object streams, nothing to see")).toBeNull();
});

test("slotWidthMm: single reads column_width_mm; double prefers full_width_mm, falls back to column", () => {
  const venue = { column_width_mm: 88, full_width_mm: 181 };
  expect(slotWidthMm(venue, "single")).toBe(88);
  expect(slotWidthMm(venue, "double")).toBe(181);
  expect(slotWidthMm({ column_width_mm: 127 }, "double")).toBe(127);
  expect(slotWidthMm({}, "single")).toBeNull();
});

test("CLI passes a correctly sized figure and fails a wrong one, with the no-post-scale hint", () => {
  const d = scratch();
  const fig = join(d, "panel.pdf");
  writeFileSync(fig, pdfOfWidthPt(249.4488)); // 88mm
  const ok = run(fig, "--width-mm", "88");
  expect(ok.status).toBe(0);
  expect(ok.out).toContain("OK");
  const bad = run(fig, "--width-mm", "127");
  expect(bad.status).toBe(1);
  expect(bad.out).toContain("never post-scale");
});

test("CLI resolves the expected width from venue data (arxiv single = 165.1mm)", () => {
  const d = scratch();
  const fig = join(d, "wide.pdf");
  writeFileSync(fig, pdfOfWidthPt(468)); // 6.5in = 165.1mm
  const r = run(fig, "--venue", "arxiv", "--root", d);
  expect(r.status).toBe(0);
  expect(r.out).toContain("arxiv single");
});

test("tolerance is a real gate: default ±1mm passes 88.5, --tolerance-mm 0.2 rejects it", () => {
  const d = scratch();
  const fig = join(d, "close.pdf");
  writeFileSync(fig, pdfOfWidthPt(250.8661)); // 88.5mm
  expect(run(fig, "--width-mm", "88").status).toBe(0);
  expect(run(fig, "--width-mm", "88", "--tolerance-mm", "0.2").status).toBe(1);
});

test("a PDF without a MediaBox fails rather than silently passing", () => {
  const d = scratch();
  const fig = join(d, "opaque.pdf");
  writeFileSync(fig, "%PDF-1.7 nothing parseable");
  const r = run(fig, "--width-mm", "88");
  expect(r.status).toBe(1);
  expect(r.out).toContain("MediaBox");
});
