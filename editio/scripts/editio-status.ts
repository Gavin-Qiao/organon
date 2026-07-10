#!/usr/bin/env bun
/**
 * editio-status.ts — the grounding layer's instrument panel. The renderer never
 * blocks; THIS is where the promises in the skills become checkable: per-section
 * class / status / grounds / claim tally, every ungraded claim's file:line, each
 * grounds handle resolved against the promptus store (substrate:status), and the
 * publish gate as an actual command.
 *
 * Usage:
 *   editio-status.ts [--root <dir>]      the report (sections + claims + grounds)
 *   editio-status.ts --claims            also list each ungraded/unsourced span at file:line
 *   editio-status.ts --gate              the publish/blind gate: exit 1 on any ungraded span,
 *                                        unsourced span, or overclaim (a .validated claim whose
 *                                        grounds are weak, unknown, or absent)
 *
 * Grounds resolution: a handle resolves against file units (.promptus/docs/*,
 * docs/lit/*, memory/* — slug = filename) or a ledger entry's slugified title.
 * Grounds have a deterministic strength: firm units may support .validated prose,
 * conjectured/provisional/open units require .conjectured prose, and invalidated
 * units (REFUTED / SUPERSEDED / DEADEND / CONFOUNDED / CONTESTED / retired)
 * contradict either grade.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findRoot, paperDir, parseFrontmatter, slugify } from "./lib.ts";
import { findSpans, parseAttrs, sectionOrder } from "./editio-render.ts";

interface Unit { substrate: string; status: string }
interface Claim { section: string; line: number; grade: "validated" | "conjectured" | "unsourced" | "ungraded"; text: string; grounds: string[]; override?: string }
type GroundStrength = "firm" | "weak" | "invalid";

const INVALID = new Set(["REFUTED", "SUPERSEDED", "DEADEND", "CONFOUNDED", "CONTESTED", "retired", "WONTFIX"]);

function groundStrength(u: Unit): GroundStrength {
  if (INVALID.has(u.status)) return "invalid";
  if (u.substrate === "finding" && u.status === "VALIDATED") return "firm";
  if (u.substrate === "lit" && u.status === "CITE") return "firm";
  if (u.substrate === "memory" && u.status === "validated") return "firm";
  if (u.substrate === "ledger" && (u.status === "VALIDATED" || u.status === "RESOLVED")) return "firm";
  return "weak";
}

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

/** Every store unit a grounds handle can name: file units by filename slug,
 *  ledger entries by slugified title (file units win on collision). */
export function storeUnits(root: string): Map<string, Unit> {
  const map = new Map<string, Unit>();
  const p = join(root, ".promptus");
  const ledger = join(p, "ledger", "RESEARCH-LEDGER.md");
  if (existsSync(ledger)) {
    for (const m of readFileSync(ledger, "utf8").matchAll(/^### \[[^\]]+\] ([A-Z]+)\/([A-Za-z]+) — (.+)$/gm)) {
      map.set(slugify(m[3]), { substrate: "ledger", status: m[2] });
    }
  }
  for (const [dir, substrate] of [["docs", "finding"], ["docs/lit", "lit"], ["memory", "memory"]] as const) {
    const d = join(p, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".md") || /^(INDEX|MEMORY)\.md$/.test(f)) continue;
      let text: string;
      try { text = readFileSync(join(d, f), "utf8"); } catch { continue; } // a subdir (docs/lit) — skip
      const { data } = parseFrontmatter(text);
      map.set(f.replace(/\.md$/, ""), { substrate: String(data.substrate ?? substrate), status: String(data.status ?? "?") });
    }
  }
  return map;
}

/** Claim spans in one section's markdown — fence content excluded, lines 1-based. */
export function scanClaims(md: string, section: string): Claim[] {
  const fences: Array<[number, number]> = [];
  for (const m of md.matchAll(/```[\s\S]*?```/g)) fences.push([m.index!, m.index! + m[0].length]);
  const inFence = (i: number) => fences.some(([a, b]) => i >= a && i < b);
  const out: Claim[] = [];
  for (const f of findSpans(md)) {
    if (inFence(f.start)) continue;
    const { classes, attrs } = parseAttrs(f.rawAttrs);
    if (!classes.includes("claim")) continue;
    const grade = classes.includes("validated") ? "validated"
      : classes.includes("conjectured") ? "conjectured"
      : classes.includes("unsourced") ? "unsourced"
      : "ungraded";
    out.push({
      section,
      line: md.slice(0, f.start).split("\n").length,
      grade,
      text: f.text.replace(/\s+/g, " ").trim(),
      grounds: attrs.grounds ? attrs.grounds.split(",").map((g) => g.trim()).filter(Boolean) : [],
      ...(attrs.override ? { override: attrs.override } : {}),
    });
  }
  return out;
}

function main(argv: string[]): number {
  const root = arg(argv, "root") ?? findRoot(process.cwd());
  const paper = paperDir(root);
  const sectionsDir = join(paper, "sections");
  if (!existsSync(sectionsDir)) {
    console.error(`editio-status: no ${sectionsDir} — not an editio workspace (searched upward from the cwd); pass --root <dir>`);
    return 2;
  }
  const units = storeUnits(root);
  const gate = argv.includes("--gate");
  const listClaims = argv.includes("--claims") || gate;

  const claims: Claim[] = [];
  const rows: string[] = [];
  let totalWords = 0;
  for (const slug of sectionOrder(paper)) {
    const md = readFileSync(join(sectionsDir, `${slug}.md`), "utf8");
    const { data, body } = parseFrontmatter(md);
    const cs = scanClaims(md, slug);
    claims.push(...cs);
    const fmGrounds = Array.isArray(data.grounds) ? (data.grounds as string[]) : [];
    const tally = { validated: 0, conjectured: 0, unsourced: 0, ungraded: 0 };
    for (const c of cs) tally[c.grade]++;
    const tallyStr = `${tally.validated}V ${tally.conjectured}C ${tally.unsourced}U ${tally.ungraded}G`;
    // drafted words (prose only — fences and headings excluded): a fresh stub is 0,
    // so "skeleton just created" vs "drafted" vs "clean" is readable from the report
    // (a fresh scaffold and a finished paper used to be indistinguishable here) —
    // shown against the section's own `budget:` frontmatter when it carries one
    const words = body.replace(/```[\s\S]*?```/g, " ").split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join(" ").split(/\s+/).filter(Boolean).length;
    totalWords += words;
    const budget = Number.parseInt(String(data.budget ?? ""), 10);
    const flag = tally.ungraded || tally.unsourced ? `  <- ${[tally.ungraded ? `${tally.ungraded} ungraded` : "", tally.unsourced ? `${tally.unsourced} unsourced` : ""].filter(Boolean).join(", ")}` : "";
    rows.push(`  ${slug.padEnd(18)} ${String(data.class ?? "?").padEnd(22)} ${String(data.status ?? "?").padEnd(10)} grounds ${fmGrounds.length}  claims ${tallyStr}  words ${words}${Number.isFinite(budget) ? `/${budget}` : ""}${flag}`);
  }

  // grounds resolution — section frontmatter handles + span handles, deduped
  const handles = new Map<string, string[]>(); // handle -> where used
  for (const slug of sectionOrder(paper)) {
    const { data } = parseFrontmatter(readFileSync(join(sectionsDir, `${slug}.md`), "utf8"));
    for (const g of Array.isArray(data.grounds) ? (data.grounds as string[]) : []) handles.set(g, [...(handles.get(g) ?? []), `${slug}.md (frontmatter)`]);
  }
  for (const c of claims) for (const g of c.grounds) handles.set(g, [...(handles.get(g) ?? []), `${c.section}.md:${c.line}`]);
  const weak: string[] = [];
  const unknown: string[] = [];
  for (const [h, where] of handles) {
    const u = units.get(h);
    if (!u) unknown.push(`${h} (${where[0]}${where.length > 1 ? ` +${where.length - 1}` : ""})`);
    else if (groundStrength(u) !== "firm") weak.push(`${h} = ${u.substrate}:${u.status} (${where.join(", ")})`);
  }

  console.log(`editio-status: ${rows.length} section(s) — ${paper}`);
  for (const r of rows) console.log(r);
  const total = { validated: 0, conjectured: 0, unsourced: 0, ungraded: 0 };
  for (const c of claims) total[c.grade]++;
  console.log(`  claims: ${claims.length} total — ${total.validated} validated · ${total.conjectured} conjectured · ${total.unsourced} unsourced · ${total.ungraded} ungraded · ${totalWords} words drafted`);
  const storeNote = units.size ? "" : existsSync(join(root, ".promptus")) ? "  (.promptus has no units yet — kb-add fills it)" : "  (no .promptus store found)";
  console.log(`  grounds: ${handles.size} handle(s) — ${handles.size - weak.length - unknown.length} resolved · ${weak.length} weak · ${unknown.length} unknown${storeNote}`);
  for (const w of weak) console.log(`    weak    ${w}`);
  for (const u of unknown) console.log(`    unknown ${u}`);

  if (listClaims) {
    const bad = claims.filter((c) => c.grade === "ungraded" || c.grade === "unsourced");
    if (bad.length) {
      console.log(`  ${gate ? "gate " : ""}findings:`);
      for (const c of bad) console.log(`    ${c.grade.padEnd(9)} sections/${c.section}.md:${c.line}  [${c.text.length > 60 ? `${c.text.slice(0, 57)}...` : c.text}]`);
    }
  }

  if (!gate) return 0;

  // the publish gate: no ungraded, no unsourced, no overclaims. An in-span
  // override excuses an UNSOURCED claim (the author accepts it, on the record)
  // and a VALIDATED claim's weak/unknown grounds — never an ungraded one:
  // ungraded means the audit loop hasn't run, and the fix is running it.
  const violations: string[] = [];
  const onRecord: string[] = [];
  for (const c of claims) {
    if (c.grade === "ungraded") violations.push(`ungraded claim at sections/${c.section}.md:${c.line}${c.override ? ` (override does not apply to ungraded — run the audit loop and grade the span)` : ""}`);
    if (c.grade === "unsourced") {
      if (c.override) onRecord.push(`unsourced, overridden at sections/${c.section}.md:${c.line} — on the record: "${c.override}"`);
      else violations.push(`unsourced claim at sections/${c.section}.md:${c.line}`);
    }
    if (c.grade === "validated" && !c.override) {
      const resolved = c.grounds.filter((g) => units.has(g));
      if (!c.grounds.length) violations.push(`validated claim with no grounds at sections/${c.section}.md:${c.line}`);
      else if (!resolved.length) violations.push(`validated claim with only unknown grounds (${c.grounds.join(", ")}) at sections/${c.section}.md:${c.line}`);
      else for (const g of resolved) {
        const u = units.get(g)!;
        if (groundStrength(u) !== "firm") violations.push(`overclaim: .validated over ${g} = ${u.substrate}:${u.status} at sections/${c.section}.md:${c.line}`);
      }
    }
    if (c.grade === "conjectured" && !c.override) {
      for (const g of c.grounds.filter((x) => units.has(x))) {
        const u = units.get(g)!;
        if (groundStrength(u) === "invalid") violations.push(`contradicted: .conjectured over ${g} = ${u.substrate}:${u.status} at sections/${c.section}.md:${c.line}`);
      }
    }
  }
  for (const r of onRecord) console.log(`  ${r}`);
  if (violations.length) {
    console.error(`editio-status: GATE FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`    ${v}`);
    console.error("  fix the prose, or ground the claim (recall -> grade). override=\"reason\" excuses an unsourced claim or a validated claim's weak grounds — never an ungraded one.");
    return 1;
  }
  console.log(`  gate: publish-clean — no ungraded, no unsourced, no overclaims${onRecord.length ? ` (${onRecord.length} override(s) on the record)` : ""}.`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
