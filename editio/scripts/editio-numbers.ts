#!/usr/bin/env bun
/**
 * editio-numbers.ts — one source of truth for every load-bearing number.
 *
 * Learned from the second dogfood: a real paper's headline mean was typed into
 * eight sentences across three files; when the source changed, the drift was
 * caught by LUCK, and the fix was a bespoke sed script. The paper team's own
 * ledger lesson is this tool's spec: "re-run the benchmark whenever the source
 * changes; verify fresh==frozen before trusting tables."
 *
 * The mechanism: numbers.json names each value once (handle → value + where it
 * came from); `--write` binds them into front/numbers.tex (\csname definitions)
 * and locks, PER HANDLE, the bound value plus a sha256 of each source file;
 * prose/math/captions reference values as `@num:handle` (→ \editionum{handle});
 * raw fences and front/macros.tex may call \editionum{handle} directly — both
 * spellings are scanned. The report names every stale, unknown, unverified, and
 * unused handle; `--gate` turns drift into exit 1.
 *
 * Hardened against its own adversarial audit:
 *   - `--write` REFUSES to re-lock a handle whose sources changed while its
 *     value didn't (the laundering hole: a stale value silently re-blessed).
 *   - a claimed-but-never-hashed source gates (unverified ≠ fine).
 *   - the gate diffs front/numbers.tex against what numbers.json would generate
 *     (hand-edits and bad merges surface; no mtime heuristics).
 *   - values are validated (unbalanced braces / unescaped % / control chars
 *     would fatally break the LaTeX build downstream — refused at the door).
 *   - the lock is a TRIPWIRE against accidents, not a security boundary: a
 *     hand-edited lock can still lie to the gate, exactly like a hand-edited
 *     .git object. The gate defends the honest author from drift, not the
 *     dishonest one from themselves.
 *
 * Usage:
 *   editio-numbers.ts [--root <dir>]     the report (bindings, usage, freshness)
 *   editio-numbers.ts --write            (re)generate front/numbers.tex + the lock
 *   editio-numbers.ts --gate             exit 1 on any violation (see above)
 *
 * numbers.json (in .editio/paper/):
 *   { "bakeoff-mean-ari": { "value": "0.872",
 *       "source": ["results/g2_baseline.json"],      // file(s) the value came from, root-relative
 *       "computed_by": "scratchpad/emit_bakeoff_table.py",
 *       "note": "all-105, failures->0",
 *       "pinned": "frozen 2026-07-04 with the submission tag" },  // stale passes ON THE RECORD
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
  editio-numbers.ts --gate           exit 1 on unknown/unverified/stale/laundered bindings
authoring: write @num:handle in prose, math ($@num:x$), and \`\`\`latex+ captions;
\\editionum{handle} directly in raw fences and front/macros.tex (both are scanned);
values live in numbers.json only. See the editio-numbers skill.`;

interface Entry { value: string; source: string[]; computed_by?: string; note?: string; pinned?: string }
interface Use { handle: string; file: string; line: number }
interface LockRecord { value: string; sources: Record<string, string> }
interface Lock { written: string; handles: Record<string, LockRecord> }

// kebab-case, no leading/trailing hyphen — identical to the renderer's charset
const HANDLE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const NUM_TOKEN = /@num:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g;
const MACRO_TOKEN = /\\editionum\{([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\}/g;

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** A value goes verbatim into a \gdef body: unbalanced braces, an unescaped %,
 *  or a control character fatally break the whole LaTeX build downstream
 *  (runaway definition) — refuse at the door, naming the handle. */
function validateValue(handle: string, value: string): void {
  if (/[\n\r\t]/.test(value)) throw new Error(`numbers.json: "${handle}" value contains a control character`);
  if (/(^|[^\\])%/.test(value)) throw new Error(`numbers.json: "${handle}" value has an unescaped % (write \\% — a bare % swallows the rest of the generated line)`);
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\") { i++; continue; }
    if (value[i] === "{") depth++;
    else if (value[i] === "}" && --depth < 0) break;
  }
  if (depth !== 0) throw new Error(`numbers.json: "${handle}" value has unbalanced braces`);
}

/** JSON.parse silently keeps the LAST duplicate key — exactly the silent
 *  copy-paste mistake this tool exists to prevent. A small string-aware
 *  depth-1 scan catches it before parsing. */
function findDuplicateKeys(raw: string): string[] {
  const seen = new Map<string, number>();
  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '"') {
      let j = i + 1;
      let s = "";
      for (; j < raw.length; j++) {
        if (raw[j] === "\\") { s += raw[j] + (raw[j + 1] ?? ""); j++; continue; }
        if (raw[j] === '"') break;
        s += raw[j];
      }
      const after = raw.slice(j + 1).match(/^\s*:/);
      if (depth === 1 && after) seen.set(s, (seen.get(s) ?? 0) + 1);
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    i++;
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

/** numbers.json → validated entries (shorthand string = bare value). */
export function loadNumbers(paper: string): Map<string, Entry> {
  const p = join(paper, "numbers.json");
  const out = new Map<string, Entry>();
  if (!existsSync(p)) return out;
  const dupes = findDuplicateKeys(readFileSync(p, "utf8")).filter((k) => !k.startsWith("_"));
  if (dupes.length) throw new Error(`numbers.json: duplicate handle(s) ${dupes.join(", ")} — JSON silently keeps the last; merge them`);
  const raw = readJSON(p);
  for (const [handle, v] of Object.entries(raw)) {
    if (handle.startsWith("_")) continue; // _note etc.
    if (!HANDLE.test(handle)) throw new Error(`numbers.json: handle "${handle}" — handles are kebab-case [a-z0-9-], no leading/trailing hyphen`);
    if (v === null || (typeof v !== "string" && typeof v !== "object")) throw new Error(`numbers.json: "${handle}" must be a value string or an entry object`);
    const e: Entry = typeof v === "string"
      ? { value: v, source: [] }
      : { value: String((v as any).value ?? ""), source: [(v as any).source ?? []].flat().map(String), computed_by: (v as any).computed_by, note: (v as any).note, pinned: (v as any).pinned };
    if (!e.value) throw new Error(`numbers.json: "${handle}" has no value`);
    validateValue(handle, e.value);
    out.set(handle, e);
  }
  return out;
}

/** @num: and \editionum usages in one section. The renderer strips frontmatter
 *  before any transform, so the scan must too (a @num: in a YAML note is dead
 *  text — gating on it was the audit's false-fail). Split into: rendered uses
 *  (@num: outside raw/inert regions), hits inside plain ```latex fences (@num:
 *  is byte-raw there — a violation), and direct \editionum{...} calls inside
 *  latex/latex+ fences (the documented escape hatch — real uses). */
export function scanUses(md: string, file: string): { uses: Use[]; fenceHits: Use[] } {
  const full = md.replace(/\r\n/g, "\n");
  const fm = full.match(/^---\n[\s\S]*?\n---\n?/);
  const offset = fm ? fm[0].split("\n").length - 1 : 0;
  const src = fm ? full.slice(fm[0].length) : full;
  const lineOf = (i: number) => src.slice(0, i).split("\n").length + offset;

  const rawLatex: Array<[number, number]> = [];
  for (const m of src.matchAll(/```latex\n[\s\S]*?```/g)) rawLatex.push([m.index!, m.index! + m[0].length]);
  const latexPlus: Array<[number, number]> = [];
  for (const m of src.matchAll(/```latex\+\n[\s\S]*?```/g)) latexPlus.push([m.index!, m.index! + m[0].length]);
  const inert: Array<[number, number]> = [];
  for (const m of src.matchAll(/```(?!latex\+?\n)\w*\n[\s\S]*?```/g)) inert.push([m.index!, m.index! + m[0].length]);
  for (const m of src.matchAll(/`[^`\n]+`/g)) inert.push([m.index!, m.index! + m[0].length]);
  const within = (spans: Array<[number, number]>, i: number) => spans.some(([a, b]) => i >= a && i < b);

  const uses: Use[] = [];
  const fenceHits: Use[] = [];
  for (const m of src.matchAll(NUM_TOKEN)) {
    const at = { handle: m[1], file, line: lineOf(m.index!) };
    if (within(rawLatex, m.index!)) fenceHits.push(at);
    else if (!within(inert, m.index!)) uses.push(at);
  }
  // the escape hatch: \editionum{...} written directly in raw LaTeX contexts is
  // a real binding the compiled paper will resolve — scan it, don't ignore it
  for (const m of src.matchAll(MACRO_TOKEN)) {
    if (within(rawLatex, m.index!) || within(latexPlus, m.index!)) {
      uses.push({ handle: m[1], file, line: lineOf(m.index!) });
    }
  }
  return { uses, fenceHits };
}

function sha(root: string, rel: string): string {
  const abs = join(root, rel);
  if (!statSync(abs).isFile()) throw new Error(`source "${rel}" is not a file`);
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

type Fresh = { state: "fresh" | "stale" | "unverified" | "pinned"; why?: string; gates: boolean };

/** Freshness of one entry against its per-handle lock record. Claimed-but-never-
 *  verified provenance GATES (the audit's false pass #2): if you name a source,
 *  the gate holds you to hashing it. Pinned passes on the record. */
export function freshness(root: string, e: Entry, rec: LockRecord | undefined): Fresh {
  if (e.pinned) return { state: "pinned", why: e.pinned, gates: false };
  if (!e.source.length) return { state: "unverified", why: "no source recorded", gates: false };
  if (!rec) return { state: "unverified", why: "sources never hashed — run --write", gates: true };
  for (const s of e.source) {
    if (!existsSync(join(root, s))) return { state: "stale", why: `source ${s} is missing`, gates: true };
    if (!rec.sources[s]) return { state: "unverified", why: `source ${s} not in the lock — run --write`, gates: true };
    if (sha(root, s) !== rec.sources[s]) return { state: "stale", why: `source ${s} changed since --write`, gates: true };
  }
  return { state: "fresh", gates: false };
}

/** The exact front/numbers.tex content numbers.json implies — used by --write to
 *  generate it and by the gate to DIFF against what's actually on disk. */
function expectedTex(numbers: Map<string, Entry>): string {
  const lines = [
    "% front/numbers.tex — GENERATED by editio-numbers --write from numbers.json.",
    "% The ONE place values exist; everything else references \\editionum{handle}.",
  ];
  for (const [h, e] of numbers) lines.push(`\\expandafter\\gdef\\csname editionum@${h}\\endcsname{${e.value}}`);
  return `${lines.join("\n")}\n`;
}

function loadLock(lockPath: string): Lock | null {
  if (!existsSync(lockPath)) return null;
  const raw = readJSON(lockPath);
  // v1 lock (flat sources, no per-handle records) carries no values — treat as absent
  return raw && typeof raw.handles === "object" ? (raw as Lock) : null;
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
  const lock = loadLock(lockPath);

  if (write) {
    // the laundering guard (the audit's CRITICAL false pass): a handle whose
    // sources changed while its VALUE didn't is a stale value about to be
    // re-blessed — refuse the whole write, atomically, and name the loop.
    const laundered: string[] = [];
    const nextHandles: Record<string, LockRecord> = {};
    for (const [h, e] of numbers) {
      const sources: Record<string, string> = {};
      for (const s of e.source) if (existsSync(join(root, s))) sources[s] = sha(root, s);
      const prev = lock?.handles[h];
      if (prev && !e.pinned && prev.value === e.value && e.source.length &&
        Object.keys(prev.sources).length &&
        e.source.some((s) => prev.sources[s] && sources[s] && prev.sources[s] !== sources[s])) {
        laundered.push(`${h}: source changed but the value didn't — re-run ${e.computed_by ?? "the pipeline"}, verify fresh==frozen, update the value in numbers.json (or pin it with a reason), then --write`);
        continue;
      }
      nextHandles[h] = { value: e.value, sources };
    }
    if (laundered.length) {
      console.error(`editio-numbers: WRITE REFUSED — ${laundered.length} handle(s) would re-bless a stale value:`);
      for (const l of laundered) console.error(`    ${l}`);
      return 1;
    }
    writeFileSync(texPath, expectedTex(numbers));
    writeFileSync(lockPath, `${JSON.stringify({ written: new Date().toISOString(), handles: nextHandles }, null, 2)}\n`);
    console.log(`editio-numbers: wrote front/numbers.tex (${numbers.size} binding(s)) + numbers.lock.json (${Object.keys(nextHandles).length} handle record(s))`);
    if (!numbers.size) console.log("  numbers.json is empty or missing — seed it (see the editio-numbers skill)");
    return 0;
  }

  // usage across the paper (every sections/*.md, wired or not) + front/macros.tex
  const uses: Use[] = [];
  const fenceHits: Use[] = [];
  for (const slug of sectionOrder(paper)) {
    const r = scanUses(readFileSync(join(paper, "sections", `${slug}.md`), "utf8"), `sections/${slug}.md`);
    uses.push(...r.uses);
    fenceHits.push(...r.fenceHits);
  }
  const macrosPath = join(paper, "front", "macros.tex");
  if (existsSync(macrosPath)) {
    const t = readFileSync(macrosPath, "utf8").replace(/\r\n/g, "\n");
    for (const m of t.matchAll(MACRO_TOKEN)) {
      uses.push({ handle: m[1], file: "front/macros.tex", line: t.slice(0, m.index!).split("\n").length });
    }
  }
  const used = new Map<string, number>();
  for (const u of uses) used.set(u.handle, (used.get(u.handle) ?? 0) + 1);
  const unknown = uses.filter((u) => !numbers.has(u.handle));

  console.log(`editio-numbers: ${numbers.size} handle(s) — ${paper}`);
  const violations: string[] = [];
  for (const [h, e] of numbers) {
    const f = freshness(root, e, lock?.handles[h]);
    const tag = f.state === "fresh" ? "fresh" : f.state === "pinned" ? `PINNED (${f.why})` : f.state === "stale" ? `STALE (${f.why})` : `unverified (${f.why})`;
    const n = used.get(h);
    console.log(`  ${h.padEnd(24)} = ${e.value.padEnd(12)} ${tag}${n ? `  used ×${n}` : "  unused"}`);
    if (f.gates) violations.push(`${f.state}: ${h} — ${f.why}${f.state === "stale" ? `; re-run ${e.computed_by ?? "the pipeline"}, verify fresh==frozen, update numbers.json, then --write` : ""}`);
  }
  for (const u of unknown) {
    console.log(`  unknown  ${u.handle} at ${u.file}:${u.line}`);
    violations.push(`unknown handle ${u.handle} at ${u.file}:${u.line}`);
  }
  for (const u of fenceHits) {
    console.log(`  byte-raw @num:${u.handle} at ${u.file}:${u.line} — plain \`\`\`latex never transforms; use \`\`\`latex+ (or \\editionum{${u.handle}} directly)`);
    violations.push(`@num:${u.handle} inside a byte-raw fence at ${u.file}:${u.line}`);
  }
  // the bindings themselves: front/numbers.tex must BE what numbers.json implies
  // (hand-edits, bad merges, and forgotten --write all surface here; no mtimes)
  if (numbers.size || uses.length) {
    if (!existsSync(texPath)) {
      violations.push("front/numbers.tex missing — run --write");
    } else if (readFileSync(texPath, "utf8").replace(/\r\n/g, "\n") !== expectedTex(numbers)) {
      violations.push("front/numbers.tex does not match numbers.json — run --write (hand-edits are overwritten; values belong in numbers.json)");
    }
  }
  console.log(`  bindings: ${existsSync(texPath) ? "front/numbers.tex present" : "front/numbers.tex MISSING (run --write)"} · ${uses.length} use(s) in ${new Set(uses.map((u) => u.file)).size} file(s) (sections wired or not, plus front/macros.tex)`);

  if (!gate) return 0;
  if (violations.length) {
    console.error(`editio-numbers: GATE FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`    ${v}`);
    return 1;
  }
  console.log("  gate: numbers-clean — every handle bound and matching, every source fresh (or pinned on the record).");
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`editio-numbers: ${(e as Error).message}`);
    process.exit(2);
  }
}
