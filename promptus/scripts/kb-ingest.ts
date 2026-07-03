#!/usr/bin/env bun
/**
 * kb-ingest.ts — convert already-collected deep-research into provenance-bearing `lit`
 * units. This is the CURATE verb (distinct from kb-add's STORE and the doctor's MOVE):
 * it gives external-knowledge notes the `source` the `lit` substrate requires, deriving
 * that source ONLY from what is already recorded — a ledger run-id, the note's own
 * citation section, or an operator-supplied value. It never invents a source.
 *
 * Usage:
 *   kb-ingest backfill [--root <dir>] [--apply]
 *       For each file already in `.promptus/docs/lit/`, prepend `lit` frontmatter,
 *       deriving `source` in order: (1) a deep-research run-id (or descriptor) from a
 *       ledger line that maps `→ docs/lit/<slug>.md`, then (2) the note's own
 *       `## Citation` / `## Source` / `## References` section (the heading must BE that
 *       word, not merely start with it — `## Source of the wall` is not a citation). A
 *       note with neither is FLAGGED (frontmatter written without a source) so the
 *       operator can add one — never guessed. The body is never touched.
 *
 *   kb-ingest promote <docs-file> --source "<src>" [--kind NOTE] [--root <dir>] [--apply]
 *       Reclassify a genuinely-external note sitting in the finding store: move
 *       `.promptus/docs/<file>` → `.promptus/docs/lit/<file>`, prepend `lit` frontmatter
 *       with the given `--source` (validated against the lit vocab), and fix the relative
 *       links the move would break (`research-ledger.md`, `telos.md` — case-insensitive —
 *       and bare `./sibling.md`). Any pre-existing frontmatter is replaced, not stacked.
 *
 * DRY-RUN by default; pass `--apply` to write. `status` defaults to BACKGROUND (reference
 * knowledge); promote a unit to CITE by hand when you actually lean on it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { nowISO, nowLocalStamp, stampUTC } from "./lib/clock.ts";
import { mintId } from "./lib/ids.ts";
import { findProjectRoot } from "./lib/paths.ts";
import { known, loadVocab } from "./lib/vocab.ts";

const fwd = (p: string) => p.replace(/\\/g, "/");
const LIT_DIR = ".promptus/docs/lit";
const LEDGER = ".promptus/ledger/RESEARCH-LEDGER.md";
const SKIP = new Set(["index.md", "readme.md", "memory.md"]);

// run-id tokens in the operator's ledgers look like `wrum4t9p7`, `wa4o723kz`, `wf_93f1d629`
// — always mixed letters+digits, so require a digit (rejects English words like "witnessed").
const RUNID = /\bw(?:f_)?[a-z0-9]{7,9}\b/g;
const hasDigit = (s: string) => /\d/.test(s);

type How = "ledger run-id" | "ledger deep-research" | "own citation" | "operator" | "FLAGGED — no source recoverable";

interface Prov { source: string; tier: number } // 2 = run-id, 1 = a deep-research line without one

interface Plan {
  file: string; // abs source path
  rel: string; // for display
  source: string | null;
  how: How;
  kind: string;
  target?: string; // abs, when the file moves (promote)
  linkFixes?: Array<[string, string]>;
}

const stripBom = (c: string) => c.replace(/^﻿/, "");
const stripFrontmatter = (c: string) => stripBom(c).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
const hasFrontmatter = (c: string) => /^﻿?---\r?\n/.test(c);

/** Map each `docs/lit/<slug>` the ledger references to the best provenance on its line:
 *  a deep-research run-id (preferred), else the deep-research descriptor (agent/source counts). */
function ledgerProvenance(root: string): Map<string, Prov> {
  const map = new Map<string, Prov>();
  const p = join(root, LEDGER);
  if (!existsSync(p)) return map;
  const text = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const line of text.split("\n")) {
    if (!line.includes("docs/lit/")) continue;
    const slugs = [...line.matchAll(/docs\/lit\/([a-z0-9-]+)\.md/gi)].map((m) => m[1]);
    if (!slugs.length) continue;
    const id = (line.match(RUNID) ?? []).find(hasDigit);
    let prov: Prov | null = null;
    if (id) prov = { source: `deep-research:${id}`, tier: 2 };
    else if (/deep-research/i.test(line)) {
      const paren = /\(([^)]*\b(?:agents?|sources?|tok)\b[^)]*)\)/i.exec(line)?.[1];
      prov = { source: paren ? `deep-research (${paren.replace(/`/g, "").trim()})` : "deep-research", tier: 1 };
    }
    if (!prov) continue;
    for (const s of slugs) {
      const cur = map.get(s);
      if (!cur || prov.tier > cur.tier) map.set(s, prov);
    }
  }
  return map;
}

/** Pull the note's own citation/source as a compact one-line provenance, or null.
 *  The heading must BE the keyword (optionally numbered), not merely start with it — so
 *  `## Source of the density wall` is not mistaken for a citation. Prefers a "Citation" heading. */
function citationOf(content: string): string | null {
  const lines = stripBom(content).replace(/\r\n/g, "\n").split("\n");
  // A citation heading is the keyword itself (optionally numbered / qualified), e.g. `## Citation`,
  // `## 1. Citation`, `## References (verified inline …)`. It is NOT a content heading where the
  // keyword opens a phrase — `## Source of the wall`, `## References to prior work` — so reject the
  // keyword when a function word follows it.
  const isHead = (l: string) =>
    /^#{1,6}\s+(?:\d+[.)]\s+)?(citations?|sources?|references?|bibliography)\b(?!\s+(?:of|to|for|from|in|on|and|the|with|as|by|that|code)\b)/i.test(l);
  const heads = lines.map((l, i) => ({ l, i })).filter((x) => isHead(x.l));
  if (!heads.length) return null;
  const pick = heads.find((h) => /citation/i.test(h.l)) ?? heads[0]; // prefer an explicit citation
  const buf: string[] = [];
  for (let i = pick.i + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) buf.push(lines[i]);
  const flat = buf.join(" ").replace(/^[-*\s]+/, "").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 160 ? flat.slice(0, 157).trimEnd() + "…" : flat;
}

function frontmatter(kind: string, source: string | null, title: string): string {
  const id = mintId("lit", stampUTC(nowISO()), title);
  const lines = ["---", `id: ${id}`, "substrate: lit", `kind: ${kind}`, "status: BACKGROUND"];
  if (source) lines.push(`source: ${JSON.stringify(source)}`);
  lines.push(`created: ${nowLocalStamp()}`, "---", "");
  return lines.join("\n");
}

const h1 = (c: string, fallback: string) => /^#\s+(.+)$/m.exec(stripBom(c))?.[1].trim() || fallback;

function planBackfill(root: string): Plan[] {
  const dir = join(root, LIT_DIR);
  if (!existsSync(dir)) return [];
  const prov = ledgerProvenance(root);
  const plans: Plan[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md") && !SKIP.has(x.toLowerCase()))) {
    const abs = join(dir, f);
    const content = readFileSync(abs, "utf8");
    if (hasFrontmatter(content)) continue; // already curated — idempotent
    const slug = f.replace(/\.md$/, "");
    const base = { file: abs, rel: `${LIT_DIR}/${f}` };
    const pv = prov.get(slug);
    if (pv) plans.push({ ...base, source: pv.source, how: pv.tier === 2 ? "ledger run-id" : "ledger deep-research", kind: "NOTE" });
    else {
      const cite = citationOf(content);
      if (cite) plans.push({ ...base, source: cite, how: "own citation", kind: "PAPER" });
      else plans.push({ ...base, source: null, how: "FLAGGED — no source recoverable", kind: "NOTE" });
    }
  }
  return plans;
}

/** Recompute the relative links a docs/ → docs/lit/ move would break. Returns rewritten text + the fixes made. */
function fixLinks(content: string): { out: string; fixes: Array<[string, string]> } {
  const fixes: Array<[string, string]> = [];
  let out = content;
  // the ledger + telos moved OUT of docs/ entirely — match case-insensitively (TELOS.md, telos.md)
  const special: Array<[RegExp, string]> = [
    [/\]\((research-ledger\.md)\)/gi, "](../../ledger/RESEARCH-LEDGER.md)"],
    [/\]\((telos\.md)\)/gi, "](../../TELOS.md)"],
  ];
  for (const [re, to] of special) out = out.replace(re, (_m, name: string) => { fixes.push([name, to.slice(2, -1)]); return to; });
  // bare sibling links `](name.md)` (no scheme, no slash, not already re-pathed) now live one dir up
  out = out.replace(/\]\((?!https?:|\.\.?\/|\/)([a-z0-9._-]+\.md)(#[^)]*)?\)/gi, (_m, name: string, anchor = "") => {
    fixes.push([name, `../${name}`]);
    return `](../${name}${anchor})`;
  });
  return { out, fixes };
}

function planPromote(root: string, file: string, source: string, kind: string): Plan {
  const abs = file.includes("/") || file.includes("\\") ? join(root, file) : join(root, ".promptus", "docs", file);
  if (!existsSync(abs)) throw new Error(`promote: not found: ${fwd(abs)}`);
  const name = basename(abs);
  const target = join(root, LIT_DIR, name);
  if (existsSync(target)) throw new Error(`promote: target already exists: ${LIT_DIR}/${name}`);
  const rel = fwd(abs).includes("/.promptus/") ? `.promptus/${fwd(abs).split("/.promptus/").pop()}` : name;
  const { fixes } = fixLinks(stripFrontmatter(readFileSync(abs, "utf8")));
  return { file: abs, rel, source, how: "operator", kind, target, linkFixes: fixes };
}

function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith("--"));
  const has = (f: string) => argv.includes(`--${f}`);
  const valOf = (f: string) => { const i = argv.indexOf(`--${f}`); return i >= 0 ? argv[i + 1] : undefined; };
  const cmd = args[0];
  const root = findProjectRoot(valOf("root") ?? process.cwd());
  const apply = has("apply");

  if (cmd === "backfill") {
    const plans = planBackfill(root);
    if (!plans.length) { console.log("kb-ingest: no un-curated lit notes found under .promptus/docs/lit/."); return 0; }
    const ledger = plans.filter((p) => p.how.startsWith("ledger")).length;
    const cited = plans.filter((p) => p.how === "own citation").length;
    const flagged = plans.filter((p) => !p.source).length;
    console.log(`kb-ingest backfill ${apply ? "" : "(dry-run — pass --apply)"} — ${plans.length} lit notes`);
    for (const p of plans) {
      const src = p.source ? `  source=${p.source.length > 72 ? p.source.slice(0, 69) + "…" : p.source}` : "";
      console.log(`  ${apply ? "✓" : "-"} ${p.rel}  [${p.how}]${src}`);
      if (apply) {
        const c = readFileSync(p.file, "utf8");
        const slug = basename(p.file).replace(/\.md$/, "");
        writeFileSync(p.file, frontmatter(p.kind, p.source, h1(c, slug)) + stripBom(c));
      }
    }
    console.log(`\n  ${plans.length} notes: ${ledger} via ledger provenance, ${cited} via own citation, ${flagged} FLAGGED (add --source by hand).`);
    if (!apply) console.log("  No files were touched.");
    return 0;
  }

  if (cmd === "promote") {
    const file = args[1];
    const source = valOf("source");
    if (!file || !source) { console.error('kb-ingest promote <docs-file> --source "<src>" [--kind NOTE]'); return 2; }
    const kind = valOf("kind") ?? "NOTE";
    const litKinds = known(loadVocab(root).substrates.lit.kinds);
    if (!litKinds.includes(kind)) { console.error(`kb-ingest: kind "${kind}" not allowed for lit — allowed: ${litKinds.join(", ")}`); return 2; }
    const p = planPromote(root, file, source, kind);
    console.log(`kb-ingest promote ${apply ? "" : "(dry-run — pass --apply)"} — ${p.rel} → ${LIT_DIR}/${basename(p.target!)}`);
    console.log(`  source: ${source}  ·  kind: ${p.kind}  ·  status: BACKGROUND`);
    for (const [from, to] of p.linkFixes ?? []) console.log(`  link fix: ](${from}) → ](${to})`);
    if (apply) {
      const body = stripFrontmatter(readFileSync(p.file, "utf8")); // replace any old frontmatter, don't stack
      const { out } = fixLinks(body);
      mkdirSync(dirname(p.target!), { recursive: true });
      writeFileSync(p.target!, frontmatter(p.kind, source, h1(body, basename(p.target!).replace(/\.md$/, ""))) + out);
      rmSync(p.file, { force: true }); // the body now lives under lit/; drop the finding-store original
      console.log("  promoted.");
    } else console.log("  No files were touched.");
    return 0;
  }

  console.error("kb-ingest: usage: kb-ingest <backfill|promote> [...]");
  return 2;
}

process.exit(main(process.argv.slice(2)));
