#!/usr/bin/env bun
/**
 * editio-numbers.ts — one source of truth for every load-bearing number.
 *
 * Learned from the second dogfood: a real paper's headline mean was typed into
 * eight sentences across three files; when the source changed, the fix was a
 * bespoke sed script with fifteen assertion-guarded replace pairs — and the drift
 * was caught by LUCK, not by a check. The paper team's own ledger lesson is this
 * tool's spec: "re-run the benchmark whenever the source changes; verify
 * fresh==frozen before trusting tables."
 *
 * The mechanism: numbers.json names each value once (handle → value + where it
 * came from); `--write` binds them into front/numbers.tex (\csname definitions)
 * and locks a hash of each source file; prose/math/captions reference values as
 * `@num:handle` (→ \editionum{handle}); the report names every stale, unknown,
 * and unused handle; `--gate` turns drift into exit 1.
 *
 * Usage:
 *   editio-numbers.ts [--root <dir>]     the report (bindings, usage, freshness)
 *   editio-numbers.ts --write            (re)generate front/numbers.tex + the source lock
 *   editio-numbers.ts --gate             exit 1 on unknown handles, @num in a byte-raw
 *                                        fence, stale sources (unpinned), or bindings
 *                                        older than numbers.json
 *
 * numbers.json (in .editio/paper/):
 *   { "bakeoff-mean-ari": { "value": "0.872",
 *       "source": ["results/g2_baseline.json"],      // file(s) the value came from, root-relative
 *       "computed_by": "scratchpad/emit_bakeoff_table.py",
 *       "note": "all-105, failures->0",
 *       "pinned": "frozen 2026-07-04 with the submission tag" },  // optional: stale passes ON THE RECORD
 *     "volcano-ari": "0.622" }                        // shorthand: just the value
 *
 * What stays yours: re-running the pipeline (editio never executes your
 * experiments — script over server), and re-reading the sentence around a changed
 * number — a value flip can invalidate the verdict words next to it, which is the
 * claims gate's territory (re-grade the span).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRoot, paperDir, readJSON } from "./lib.ts";
import { sectionOrder } from "./editio-render.ts";

const HELP = `editio-numbers — one source of truth for every load-bearing number
usage:
  editio-numbers.ts [--root <dir>]   report: bindings, usage, freshness
  editio-numbers.ts --write          (re)generate front/numbers.tex + the source lock
  editio-numbers.ts --gate           exit 1 on unknown/stale/byte-raw-fence violations
authoring: write @num:handle in prose, math ($@num:x$), and \`\`\`latex+ captions;
values live in numbers.json only. See the editio-numbers skill.`;

interface Entry { value: string; source: string[]; computed_by?: string; note?: string; pinned?: string }
interface Use { handle: string; file: string; line: number }

const HANDLE = /^[a-z0-9][a-z0-9-]*$/;

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** numbers.json → validated entries (shorthand string = bare value). */
export function loadNumbers(paper: string): Map<string, Entry> {
  const p = join(paper, "numbers.json");
  const out = new Map<string, Entry>();
  if (!existsSync(p)) return out;
  const raw = readJSON(p);
  for (const [handle, v] of Object.entries(raw)) {
    if (handle.startsWith("_")) continue; // _note etc.
    if (!HANDLE.test(handle)) throw new Error(`numbers.json: handle "${handle}" — handles are kebab-case [a-z0-9-]`);
    const e: Entry = typeof v === "string"
      ? { value: v, source: [] }
      : { value: String((v as any).value ?? ""), source: [(v as any).source ?? []].flat().map(String), computed_by: (v as any).computed_by, note: (v as any).note, pinned: (v as any).pinned };
    if (!e.value) throw new Error(`numbers.json: "${handle}" has no value`);
    out.set(handle, e);
  }
  return out;
}

/** @num: usages in one section — split into rendered uses and hits inside plain
 *  ```latex fences, which are byte-raw by contract and would ship "@num:x" verbatim. */
export function scanUses(md: string, file: string): { uses: Use[]; fenceHits: Use[] } {
  const src = md.replace(/\r\n/g, "\n");
  // regions the renderer never transforms: plain ```latex (byte-raw), non-latex+
  // fences (verbatim), inline code. latex+ fences DO transform — keep them scannable.
  const raw: Array<[number, number]> = [];
  for (const m of src.matchAll(/```latex\n[\s\S]*?```/g)) raw.push([m.index!, m.index! + m[0].length]);
  const inert: Array<[number, number]> = [];
  for (const m of src.matchAll(/```(?!latex\+?\n)\w*\n[\s\S]*?```/g)) inert.push([m.index!, m.index! + m[0].length]);
  for (const m of src.matchAll(/`[^`\n]+`/g)) inert.push([m.index!, m.index! + m[0].length]);
  const within = (spans: Array<[number, number]>, i: number) => spans.some(([a, b]) => i >= a && i < b);

  const uses: Use[] = [];
  const fenceHits: Use[] = [];
  for (const m of src.matchAll(/@num:([a-z0-9][a-z0-9-]*)/g)) {
    const at = { handle: m[1], file, line: src.slice(0, m.index!).split("\n").length };
    if (within(raw, m.index!)) fenceHits.push(at);
    else if (!within(inert, m.index!)) uses.push(at);
  }
  return { uses, fenceHits };
}

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

type Fresh = { state: "fresh" | "stale" | "unverified" | "pinned"; why?: string };

/** Freshness of one entry against the lock: every source file's hash must match
 *  what --write recorded. Pinned entries pass on the record. */
export function freshness(root: string, e: Entry, lock: Record<string, string> | null): Fresh {
  if (e.pinned) return { state: "pinned", why: e.pinned };
  if (!e.source.length) return { state: "unverified", why: "no source recorded" };
  if (!lock) return { state: "unverified", why: "no lock — run --write" };
  for (const s of e.source) {
    const abs = join(root, s);
    if (!existsSync(abs)) return { state: "stale", why: `source ${s} is missing` };
    if (!lock[s]) return { state: "unverified", why: `source ${s} not in the lock — run --write` };
    if (sha(abs) !== lock[s]) return { state: "stale", why: `source ${s} changed since --write` };
  }
  return { state: "fresh" };
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const root = arg(argv, "root") ?? findRoot(process.cwd());
  const paper = paperDir(root);
  if (!existsSync(join(paper, "sections"))) {
    console.error(`editio-numbers: no ${join(paper, "sections")} — not an editio workspace (searched upward from the cwd); pass --root <dir>`);
    return 2;
  }
  const gate = argv.includes("--gate");
  const write = argv.includes("--write");

  const numbers = loadNumbers(paper);
  const lockPath = join(paper, "front", "numbers.lock.json");
  const texPath = join(paper, "front", "numbers.tex");

  if (write) {
    const lines = [
      "% front/numbers.tex — GENERATED by editio-numbers --write from numbers.json.",
      "% The ONE place values exist; everything else references \\editionum{handle}.",
    ];
    const lock: Record<string, string> = {};
    for (const [h, e] of numbers) {
      lines.push(`\\expandafter\\gdef\\csname editionum@${h}\\endcsname{${e.value}}`);
      for (const s of e.source) if (existsSync(join(root, s))) lock[s] = sha(join(root, s));
    }
    writeFileSync(texPath, `${lines.join("\n")}\n`);
    writeFileSync(lockPath, `${JSON.stringify({ written: new Date().toISOString(), sources: lock }, null, 2)}\n`);
    console.log(`editio-numbers: wrote front/numbers.tex (${numbers.size} binding(s)) + numbers.lock.json (${Object.keys(lock).length} source hash(es))`);
    if (!numbers.size) console.log("  numbers.json is empty or missing — seed it (see the editio-numbers skill)");
    return 0;
  }

  const lock = existsSync(lockPath) ? (readJSON(lockPath).sources as Record<string, string>) : null;

  // usage across the paper, in build order
  const uses: Use[] = [];
  const fenceHits: Use[] = [];
  for (const slug of sectionOrder(paper)) {
    const r = scanUses(readFileSync(join(paper, "sections", `${slug}.md`), "utf8"), `sections/${slug}.md`);
    uses.push(...r.uses);
    fenceHits.push(...r.fenceHits);
  }
  const used = new Map<string, number>();
  for (const u of uses) used.set(u.handle, (used.get(u.handle) ?? 0) + 1);
  const unknown = uses.filter((u) => !numbers.has(u.handle));

  console.log(`editio-numbers: ${numbers.size} handle(s) — ${paper}`);
  const violations: string[] = [];
  for (const [h, e] of numbers) {
    const f = freshness(root, e, lock);
    const tag = f.state === "fresh" ? "fresh" : f.state === "pinned" ? `PINNED (${f.why})` : f.state === "stale" ? `STALE (${f.why})` : `unverified (${f.why})`;
    const n = used.get(h);
    console.log(`  ${h.padEnd(24)} = ${e.value.padEnd(12)} ${tag}${n ? `  used ×${n}` : "  unused"}`);
    if (f.state === "stale") violations.push(`stale: ${h} — ${f.why}; re-run ${e.computed_by ?? "the pipeline"}, verify fresh==frozen, update numbers.json, then --write`);
  }
  for (const u of unknown) {
    console.log(`  unknown  @num:${u.handle} at ${u.file}:${u.line}`);
    violations.push(`unknown handle @num:${u.handle} at ${u.file}:${u.line}`);
  }
  for (const u of fenceHits) {
    console.log(`  byte-raw @num:${u.handle} at ${u.file}:${u.line} — plain \`\`\`latex never transforms; use \`\`\`latex+ (or \\editionum{${u.handle}} directly)`);
    violations.push(`@num:${u.handle} inside a byte-raw fence at ${u.file}:${u.line}`);
  }
  if (uses.length && !existsSync(texPath)) {
    violations.push("front/numbers.tex missing — run --write (bindings referenced but never generated)");
  } else if (existsSync(texPath) && existsSync(join(paper, "numbers.json")) &&
    statSync(join(paper, "numbers.json")).mtimeMs > statSync(texPath).mtimeMs) {
    violations.push("numbers.json is newer than front/numbers.tex — run --write");
  }
  console.log(`  bindings: ${existsSync(texPath) ? "front/numbers.tex present" : "front/numbers.tex MISSING (run --write)"} · ${uses.length} use(s) in ${new Set(uses.map((u) => u.file)).size} section(s)`);

  if (!gate) return 0;
  if (violations.length) {
    console.error(`editio-numbers: GATE FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`    ${v}`);
    return 1;
  }
  console.log("  gate: numbers-clean — every handle bound, every source fresh (or pinned on the record).");
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
