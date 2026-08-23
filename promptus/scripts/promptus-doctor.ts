#!/usr/bin/env bun
/**
 * promptus-doctor.ts — diagnose a project's Promptus layout and book-keep it onto
 * the current `.promptus/` namespace + current template vocab. Version-aware;
 * DRY-RUN by default; never edits a unit's content (it only MOVES files, merges the
 * vocab while keeping custom extended terms, narrows the `.gitignore`, rebuilds the
 * derived index, and optionally records a debt baseline).
 *
 * Usage:
 *   promptus-doctor [check|migrate|upgrade] [--root <dir>] [--apply] [--strict] [--json]
 *                   [--record-baseline]
 *
 *   check    (default) READ-ONLY: locate the vocab, name the layout + version, report
 *            health (is the gate reachable? is the whole `.promptus/` wrongly gitignored?
 *            which stores are missing? is the derived catalog lagging the ledger —
 *            hand-appends at the sentinel skip the incremental index? do root-level
 *            twins of namespaced stores linger from before a migration? is the Telos
 *            polluted with event-shaped content — dates, ledger event ids, session
 *            stamps, NOW-shaped headings — that belongs
 *            in the ledger / NOW-header / memory? is a namespaced vocab behind the
 *            template? is a marked thinker exchange intact, or is there an extra
 *            ungoverned tree such as legacy `.promptus/thinker/` prose?
 *            is inherited classification/link/orphan debt unratcheted?), and print a
 *            migration/upgrade plan WITHOUT touching anything. `--strict` exits
 *            non-zero when a layout migration or mechanical book-keeping upgrade is
 *            needed (so CI / a checkpoint can gate on it). Telos hygiene, digest lag,
 *            and extra trees are report-only: judgment moves them, so the doctor names
 *            them and never edits unit bodies.
 *   migrate / upgrade
 *            plan the moves (legacy layout) or the non-content book-keeping (already
 *            namespaced) that bring the repo to the canonical `.promptus/` layout and
 *            current template vocab, then print them. DRY-RUN by default; pass
 *            `--apply` to perform them. Idempotent: a fully current repo refreshes
 *            only the index. `--record-baseline` (with `--apply`) records inherited
 *            classification/link/orphan debt after the reindex.
 *
 * Why a migration is needed at all: 0.1.x kept the stores at the repo root
 * (`schema/`, `ledger/`, `docs/`, root `TELOS.md`) and used `.promptus/` for the
 * *derived, gitignored* cache. 0.2.0 inverted that — `.promptus/` is now the *committed*
 * namespace for every store, and the cache dropped to `.promptus/cache/`. A repo left on
 * the old layout silently loses its gate (the plugin's scripts look under `.promptus/schema/`
 * and don't find the vocab), so this is a real fix, not a cosmetic move.
 *
 * Why book-keeping is needed on an already-namespaced repo: a long-running store can
 * sit on layout `current` while its vocab is still v3 against template v4, the catalog
 * lags, a thinker exchange drifts (or ungoverned prose accretes there), or inherited dangling/orphan
 * debt has no ratchet baseline. Reporting that repo as "healthy" because the gate is
 * reachable hides the work. The upgrade never rewrites historical units.
 *
 * The canonical target (templates/schema/kb-vocab.json):
 *   .promptus/schema/kb-vocab.json · .promptus/ledger/RESEARCH-LEDGER.md ·
 *   .promptus/docs · .promptus/docs/lit · .promptus/memory · .promptus/TELOS.md ·
 *   .promptus/cache/ (derived, gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectThinkerExchange, type ThinkerExchangeReport } from "./lib/thinker.ts";
import { ledgerHeads } from "./lib/units.ts";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_VOCAB = join(SELF_DIR, "..", "templates", "schema", "kb-vocab.json");

const fwd = (p: string) => p.replace(/\\/g, "/");
const relOf = (root: string, p: string) => fwd(relative(root, p)) || ".";

// ── The canonical .promptus/ destinations (mirror templates/schema/kb-vocab.json) ──
const CANON = {
  schema: ".promptus/schema/kb-vocab.json",
  ledger: ".promptus/ledger/RESEARCH-LEDGER.md",
  docs: ".promptus/docs",
  lit: ".promptus/docs/lit",
  memory: ".promptus/memory",
  telos: ".promptus/TELOS.md",
  cache: ".promptus/cache",
} as const;

interface Vocab {
  version: number;
  substrates: Record<string, { store: string; index?: string; placement?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** A single reversible action. The plan is a list of these; `check`/dry-run print them, `--apply` runs them. */
type Step =
  | { op: "move"; from: string; to: string; what: string }
  | { op: "delete"; path: string; what: string }
  | { op: "write-vocab"; to: string; oldPath: string | null; content: string; what: string }
  | { op: "gitignore"; to: string; content: string; what: string }
  | { op: "rmdir-empty"; path: string; what: string }
  | { op: "reindex"; what: string }
  | { op: "record-baseline"; what: string };

type Layout = "current" | "legacy-root" | "custom" | "unknown";

interface VocabGap {
  behind: boolean;
  versionBehind: boolean;
  missing: string[];
  extras: string[];
}

interface ExtraTree { rel: string; files: number }

interface DebtReport {
  source: "health.json" | "none";
  checkedAt: string | null;
  units: number | null;
  sourceFiles: number | null;
  unclassified: number;
  dangling: number;
  orphans: number;
  artifactFailures: number;
  archivalArtifactWarnings: number;
  nowFresh: boolean | null;
  baseline: boolean;
  newUnclassified: number | null;
  newDangling: number | null;
  newOrphans: number | null;
  unratcheted: boolean;
}

interface Diagnosis {
  root: string;
  vocabPath: string | null;
  vocabLocation: "namespaced" | "legacy" | "none";
  vocabVersion: number | null;
  targetVersion: number;
  layout: Layout;
  gateReachable: boolean;
  gitignoreHazard: boolean;
  stores: Record<string, { src: string; rel: string; exists: boolean }>;
  telos: string | null;
  telosHygiene: TelosFlag[];
  /** ledger units the derived catalog doesn't carry (hand-appends at the sentinel,
   *  or a stale/absent cache) — 0/null when current. */
  catalogLag: number | null;
  ledgerUnits: number | null;
  catalogUnits: number | null;
  /** root-level twins of namespaced stores (pre-migration leftovers that diverge
   *  silently — the gate only ever writes .promptus/). */
  rootTwins: string[];
  /** lit units postdating the newest digested finding — research landing as
   *  citations without digests (the three-homes rule, research-ledger skill). */
  digestLag: { lit: number; lastFinding: string | null } | null;
  vocabBehind: boolean;
  vocabMissing: string[];
  vocabExtras: string[];
  extraTrees: ExtraTree[];
  thinkerExchange: ThinkerExchangeReport;
  staleDerived: string[];
  debt: DebtReport;
  /** layout migration off a pre-namespace store. */
  migrationNeeded: boolean;
  /** mechanical book-keeping on an already-namespaced store (vocab merge, gitignore,
   *  catalog rebuild, drop leftover derived files at `.promptus/` root). */
  bookkeepingNeeded: boolean;
  /** true only when layout is current AND no remaining doctor flags (including
   *  report-only extra trees / telos / digest / unratcheted inherited debt). */
  fullyHealthy: boolean;
  plan: Step[];
  notes: string[];
}

interface TelosFlag { line: number; sample: string; why: string }

/** Telos hygiene: the Telos holds direction and changes rarely, rewritten in place. Flag
 *  event-shaped content that belongs in the other stores — dates and event ids are ledger
 *  lines (kb-add), NOW-shaped headings are the ledger NOW-header (kb-now), session stamps
 *  are neither. Report-only: what to move where is judgment, so the doctor never edits. */
function telosHygiene(telosPath: string | null): TelosFlag[] {
  if (!telosPath || !existsSync(telosPath)) return [];
  const flags: TelosFlag[] = [];
  readFileSync(telosPath, "utf8").split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    const why: string[] = [];
    if (/\b20\d{2}-\d{2}-\d{2}\b/.test(l)) why.push("a date");
    if (/\bevent-\d{8}T\d{6}Z?\b/.test(l)) why.push("a ledger event id");
    if (/\bcont\.\d+\b/i.test(l)) why.push("a session stamp");
    if (/^#{1,6}\s/.test(l) && /\b(now|frontier|status|next actions|updated)\b/i.test(l)) why.push("a NOW-shaped heading");
    if (why.length) flags.push({ line: i + 1, sample: l.length > 72 ? `${l.slice(0, 69)}…` : l, why: why.join(" + ") });
  });
  return flags;
}

// ── Locate the project the way the doctor must: recognize BOTH the current
// namespaced vocab and a legacy root vocab, walking up from `start`. ──
function locate(start: string): { root: string; vocabPath: string; location: "namespaced" | "legacy" } | { root: string; vocabPath: null; location: "none" } {
  let dir = resolve(start);
  for (;;) {
    const ns = join(dir, ".promptus", "schema", "kb-vocab.json");
    const legacy = join(dir, "schema", "kb-vocab.json");
    if (existsSync(ns)) return { root: dir, vocabPath: ns, location: "namespaced" };
    if (existsSync(legacy)) return { root: dir, vocabPath: legacy, location: "legacy" };
    // a namespaced TELOS with no vocab still marks a (broken) root
    if (existsSync(join(dir, ".promptus", "TELOS.md"))) return { root: dir, vocabPath: null, location: "none" };
    const parent = dirname(dir);
    if (parent === dir) return { root: resolve(start), vocabPath: null, location: "none" };
    dir = parent;
  }
}

function loadJSON(p: string): Vocab | null {
  try { return JSON.parse(readFileSync(p, "utf8")) as Vocab; } catch { return null; }
}

/** New vocab = the current canonical template, with any custom blessed kinds/statuses
 *  (and any custom substrate/relation/top-level key) from the old vocab merged in so
 *  nothing is silently dropped. A project version ahead of the template is kept. */
function upgradeVocab(old: Vocab | null, template: Vocab): Vocab {
  const next = JSON.parse(JSON.stringify(template)) as Vocab;
  if (!old) return next;
  if (typeof old.version === "number" && old.version > next.version) next.version = old.version;
  for (const [name, sub] of Object.entries(next.substrates)) {
    const o = old.substrates?.[name];
    if (!o) continue;
    for (const facet of ["kinds", "statuses"] as const) {
      const os = (o as any)[facet] as { core?: string[]; extended?: string[] } | undefined;
      const ns = (sub as any)[facet] as { core: string[]; extended: string[] };
      if (!os || !ns) continue;
      const oldKnown = [...(os.core ?? []), ...(os.extended ?? [])];
      const tplKnown = [...ns.core, ...ns.extended];
      const extra = oldKnown.filter((x) => !tplKnown.includes(x));
      if (extra.length) ns.extended = [...ns.extended, ...extra];
    }
  }
  // carry over any custom substrate the template lacks, re-homing its store under .promptus/
  for (const [name, o] of Object.entries(old.substrates ?? {})) {
    if (next.substrates[name]) continue;
    const carried = JSON.parse(JSON.stringify(o));
    carried.store = renamespace(String(carried.store ?? ""));
    if (typeof carried.index === "string") carried.index = renamespace(carried.index);
    next.substrates[name] = carried;
  }
  const nextRel = ((next as any).relations ?? {}) as Record<string, unknown>;
  for (const [name, rel] of Object.entries(((old as any).relations ?? {}) as Record<string, unknown>)) {
    if (nextRel[name] == null) nextRel[name] = JSON.parse(JSON.stringify(rel));
  }
  (next as any).relations = nextRel;
  for (const field of ["lit_reuse", "status_glyphs", "export_context"] as const) {
    const ov = (old as any)[field];
    if (!ov || typeof ov !== "object") continue;
    (next as any)[field] = { ...ov, ...(next as any)[field] };
  }
  for (const [k, v] of Object.entries(old)) {
    if (k === "version" || k === "substrates" || k === "relations") continue;
    if (!(k in next)) (next as any)[k] = JSON.parse(JSON.stringify(v));
  }
  return next;
}

function facetTerms(sub: unknown, facet: "kinds" | "statuses"): string[] {
  const f = (sub as { [k: string]: { core?: string[]; extended?: string[] } } | undefined)?.[facet];
  return [...(f?.core ?? []), ...(f?.extended ?? [])];
}

function vocabGap(old: Vocab | null, template: Vocab): VocabGap {
  if (!old) return { behind: true, versionBehind: true, missing: ["(no vocab)"], extras: [] };
  const missing: string[] = [];
  const extras: string[] = [];
  const versionBehind = (old.version ?? 0) < template.version;
  for (const [name, sub] of Object.entries(template.substrates ?? {})) {
    const o = old.substrates?.[name];
    if (!o) { missing.push(`substrate:${name}`); continue; }
    for (const facet of ["kinds", "statuses"] as const) {
      const tKnown = facetTerms(sub, facet);
      const oKnown = facetTerms(o, facet);
      for (const term of tKnown) if (!oKnown.includes(term)) missing.push(`${name}.${facet}:${term}`);
      for (const term of oKnown) if (!tKnown.includes(term)) extras.push(`${name}.${facet}:${term}`);
    }
  }
  for (const name of Object.keys(old.substrates ?? {})) {
    if (!template.substrates?.[name]) extras.push(`substrate:${name}`);
  }
  const tRel = Object.keys((template as any).relations ?? {});
  const oRel = Object.keys((old as any).relations ?? {});
  for (const r of tRel) if (!oRel.includes(r)) missing.push(`relation:${r}`);
  for (const r of oRel) if (!tRel.includes(r)) extras.push(`relation:${r}`);
  return { behind: versionBehind || missing.length > 0, versionBehind, missing, extras };
}

function vocabMergeWhat(old: Vocab, template: Vocab, gap: VocabGap): string {
  const to = Math.max(old.version ?? 0, template.version);
  const keep = gap.extras.slice(0, 8);
  const add = gap.missing.slice(0, 8);
  const ver = (old.version ?? 0) !== to ? ` v${old.version} → v${to}` : ` v${to}`;
  const keepTxt = keep.length ? `; keep ${keep.join(", ")}${gap.extras.length > 8 ? ", …" : ""}` : "";
  const addTxt = add.length ? `; add ${add.join(", ")}${gap.missing.length > 8 ? ", …" : ""}` : "";
  return `merge vocab${ver} keeping custom extended terms${keepTxt}${addTxt}`;
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}

function extraTreesOf(root: string, recognized: Set<string> = new Set()): ExtraTree[] {
  const ns = join(root, ".promptus");
  if (!existsSync(ns)) return [];
  const canon = new Set(["schema", "ledger", "docs", "memory", "cache"]);
  const out: ExtraTree[] = [];
  for (const e of readdirSync(ns, { withFileTypes: true })) {
    if (e.isDirectory() && !canon.has(e.name) && !recognized.has(e.name) && e.name !== ".git") {
      out.push({ rel: `.promptus/${e.name}/`, files: countFiles(join(ns, e.name)) });
    }
  }
  return out;
}

function staleDerivedOf(root: string): string[] {
  const out: string[] = [];
  for (const name of ["CATALOG.md", "graph.json", "index.sqlite"]) {
    if (existsSync(join(root, ".promptus", name))) out.push(`.promptus/${name}`);
  }
  return out;
}

function readDebt(root: string): DebtReport {
  const healthPath = join(root, CANON.cache, "health.json");
  const baselinePath = join(root, ".promptus", "schema", "health-baseline.json");
  let baselineDoc: { schema?: string; unclassified?: string[]; dangling?: string[]; orphans?: string[] } | null = null;
  if (existsSync(baselinePath)) {
    try { baselineDoc = JSON.parse(readFileSync(baselinePath, "utf8")); } catch { baselineDoc = null; }
  }
  const hasB = baselineDoc?.schema === "promptus.health-baseline.v1";
  const empty: DebtReport = {
    source: "none", checkedAt: null, units: null, sourceFiles: null,
    unclassified: 0, dangling: 0, orphans: 0, artifactFailures: 0, archivalArtifactWarnings: 0, nowFresh: null,
    baseline: hasB, newUnclassified: null, newDangling: null, newOrphans: null, unratcheted: false,
  };
  if (!existsSync(healthPath)) return empty;
  let h: any = null;
  try { h = JSON.parse(readFileSync(healthPath, "utf8")); } catch { return empty; }
  const unclassified = Array.isArray(h.unclassified) ? h.unclassified : [];
  const dangling = Array.isArray(h.dangling) ? h.dangling : [];
  const orphans = Array.isArray(h.orphans) ? h.orphans : [];
  const unPaths = unclassified.map((x: any) => typeof x === "string" ? x : x?.path).filter(Boolean) as string[];
  const dangKeys = dangling.map((x: any) => typeof x === "string" ? x : `${x.from}→${x.target}`) as string[];
  const orphanKeys = orphans.map((x: any) => String(x));
  const extra = (cur: string[], allowed: string[] | undefined) => cur.filter((item) => !(allowed ?? []).includes(item));
  const debtN = unclassified.length + dangling.length + orphans.length;
  return {
    source: "health.json",
    checkedAt: typeof h.checkedAt === "string" ? h.checkedAt : null,
    units: typeof h.units === "number" ? h.units : null,
    sourceFiles: typeof h.sourceFiles === "number" ? h.sourceFiles : null,
    unclassified: unclassified.length,
    dangling: dangling.length,
    orphans: orphans.length,
    artifactFailures: Array.isArray(h.artifactFailures) ? h.artifactFailures.length : 0,
    archivalArtifactWarnings: Array.isArray(h.archivalArtifactWarnings) ? h.archivalArtifactWarnings.length : 0,
    nowFresh: h.now && typeof h.now.fresh === "boolean" ? h.now.fresh : null,
    baseline: hasB,
    newUnclassified: hasB ? extra(unPaths, baselineDoc?.unclassified).length : null,
    newDangling: hasB ? extra(dangKeys, baselineDoc?.dangling).length : null,
    newOrphans: hasB ? extra(orphanKeys, baselineDoc?.orphans).length : null,
    unratcheted: !hasB && debtN > 0,
  };
}

/** Push a bare store path under .promptus/ if it isn't already there. */
function renamespace(store: string): string {
  const s = fwd(store).replace(/^\.\//, "");
  return s.startsWith(".promptus/") ? s : `.promptus/${s}`;
}

/** Narrow a `.gitignore` that hides the whole `.promptus/` (the 0.1.x derived-cache rule)
 *  down to just `/.promptus/cache/`, so the migrated stores are committed, not ignored.
 *  Returns the new content, or null when no change is needed. */
function narrowGitignore(content: string | null): string | null {
  const want = "/.promptus/cache/";
  if (content === null) return `${want}\n`;
  const lines = content.split(/\r?\n/);
  const broad = /^\/?\.promptus\/?$/; // .promptus  /.promptus  .promptus/  /.promptus/
  const already = lines.some((l) => /^\/?\.promptus\/cache\/?$/.test(l.trim()));
  let touched = false;
  const out = lines.map((l) => {
    if (broad.test(l.trim())) { touched = true; return want; }
    return l;
  });
  if (touched) {
    // drop a duplicate cache rule if narrowing produced one
    const seen = new Set<string>();
    const deduped = out.filter((l) => {
      const t = l.trim();
      if (/^\/?\.promptus\/cache\/?$/.test(t)) { if (seen.has("cache")) return false; seen.add("cache"); }
      return true;
    });
    return deduped.join("\n");
  }
  if (!already) return `${content.replace(/\n*$/, "\n")}${want}\n`;
  return null;
}

function diagnose(start: string, opts: { recordBaseline?: boolean } = {}): Diagnosis {
  const loc = locate(start);
  const root = loc.root;
  const template = loadJSON(TEMPLATE_VOCAB)!;
  const targetVersion = template.version;
  const old = loc.vocabPath ? loadJSON(loc.vocabPath) : null;
  const gap = vocabGap(old, template);
  const notes: string[] = [];

  // Where does each store currently live (per the old vocab, relative to root)?
  const sub = (n: string): string | undefined => old?.substrates?.[n]?.store;
  const findingStore = sub("finding") ?? "docs";
  const ledgerStore = sub("ledger") ?? "ledger/RESEARCH-LEDGER.md";
  const litStore = sub("lit") ?? "docs/lit";
  const memoryStore = sub("memory") ?? "memory";

  const findingDir = join(root, findingStore);
  const ledgerOrig = join(root, ledgerStore);
  const memoryDir = join(root, memoryStore);

  // TELOS isn't a substrate — probe the known homes: root or inside the finding store
  // (legacy), then the canonical `.promptus/` home (so `check` on a migrated repo is honest).
  const telosOrig =
    [join(root, "TELOS.md"), join(root, "telos.md"), join(findingDir, "telos.md"), join(findingDir, "TELOS.md"), join(root, ".promptus", "TELOS.md"), join(root, ".promptus", "docs", "telos.md")].find(existsSync) ?? null;

  const stores: Diagnosis["stores"] = {
    schema: { src: loc.vocabPath ?? "", rel: loc.vocabPath ? relOf(root, loc.vocabPath) : "(none)", exists: !!loc.vocabPath },
    ledger: { src: ledgerOrig, rel: relOf(root, ledgerOrig), exists: existsSync(ledgerOrig) },
    finding: { src: findingDir, rel: relOf(root, findingDir), exists: existsSync(findingDir) },
    lit: { src: join(root, litStore), rel: relOf(root, join(root, litStore)), exists: existsSync(join(root, litStore)) },
    memory: { src: memoryDir, rel: relOf(root, memoryDir), exists: existsSync(memoryDir) },
    telos: { src: telosOrig ?? "", rel: telosOrig ? relOf(root, telosOrig) : "(none)", exists: !!telosOrig },
  };

  const gateReachable = existsSync(join(root, ".promptus", "schema", "kb-vocab.json"));

  // Is the whole .promptus/ namespace wrongly gitignored (the 0.1.x derived-cache rule)?
  const giPath = join(root, ".gitignore");
  const giContent = existsSync(giPath) ? readFileSync(giPath, "utf8") : null;
  const gitignoreHazard = giContent !== null && giContent.split(/\r?\n/).some((l) => /^\/?\.promptus\/?$/.test(l.trim()));

  // Decide the layout.
  let layout: Layout = "unknown";
  if (loc.location === "namespaced" && fwd(findingStore).startsWith(".promptus/")) layout = "current";
  else if (loc.location === "legacy") {
    // legacy-root = canonical-but-unprefixed (ledger/ + docs/ + root TELOS); else custom (ledger inside docs, etc.)
    const ledgerInDocs = fwd(ledgerOrig).startsWith(fwd(findingDir) + "/");
    layout = ledgerInDocs || telosOrig === null || !fwd(ledgerStore).startsWith("ledger/") ? "custom" : "legacy-root";
  } else if (loc.location === "none") layout = "unknown";

  const migrationNeeded = layout !== "current";
  const vocabBehind = gap.behind && loc.location === "namespaced";

  // Hand-edits at the sentinel skip kb-add's incremental catalog append, so the
  // derived catalog silently falls behind the ledger (a real project sat ~10 stale
  // before anyone noticed). Count both sides; the fix is always just kb-index.
  let catalogLag: number | null = null;
  let ledgerUnits: number | null = null;
  let catalogUnits: number | null = null;
  if (layout === "current") {
    const nsLedger = join(root, CANON.ledger);
    if (existsSync(nsLedger)) {
      ledgerUnits = ledgerHeads(readFileSync(nsLedger, "utf8").replace(/\r\n/g, "\n")).length;
      const catalogPath = join(root, CANON.cache, "CATALOG.md");
      const catalogText = existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "";
      const catLines = catalogText ? catalogText.split(/\r?\n/).filter((line) => {
        const colon = line.indexOf(":");
        const delimiter = line.indexOf(" · ");
        return colon > 0 && delimiter > colon;
      }) : [];
      catalogUnits = catLines.length;
      const catLedger = catLines.filter((l) => l.startsWith("ledger:")).length;
      if (ledgerUnits > catLedger) catalogLag = ledgerUnits - catLedger;
    }
  }
  const thinkerExchange = inspectThinkerExchange(root);
  const extraTrees = extraTreesOf(root, thinkerExchange.markerValid ? new Set(["thinker"]) : new Set());
  const staleDerived = staleDerivedOf(root);
  const debt = readDebt(root);

  // A root-level twin of a namespaced store is a pre-migration leftover that can only
  // diverge (the gate writes .promptus/ alone); one real repo needed a 264-reference
  // dedup after its twins drifted. Named here so it never gets that far again.
  const rootTwins: string[] = [];
  if (layout === "current") {
    for (const t of ["schema/kb-vocab.json", "ledger/RESEARCH-LEDGER.md", "TELOS.md"]) {
      if (existsSync(join(root, t))) rootTwins.push(t);
    }
  }

  // Research has three homes (research-ledger skill): event → ledger, sources → lit,
  // digested reasoning → finding. The digest is the one that gets skipped — a real
  // project ran a week of deep-research as ledger events + 44 lit units while the
  // findings substrate stayed dark. The judgment (what to digest) can't be scripted;
  // the LAG can be measured: lit units postdating the newest digested finding.
  let digestLag: Diagnosis["digestLag"] = null;
  if (layout === "current") {
    const createdStamps = (dir: string): string[] => {
      if (!existsSync(dir)) return [];
      const out: string[] = [];
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".md") || f === "INDEX.md") continue;
        try {
          const m = readFileSync(join(dir, f), "utf8").match(/^created:\s*"?([0-9: -]+)"?\s*$/m);
          if (m) out.push(m[1].trim());
        } catch { /* a subdir (docs/lit) — skip */ }
      }
      return out.sort();
    };
    const findings = createdStamps(join(root, CANON.docs));
    const lits = createdStamps(join(root, CANON.lit));
    const lastFinding = findings.at(-1) ?? null;
    const newerLit = lastFinding ? lits.filter((c) => c > lastFinding).length : lits.length;
    if (newerLit >= 5) digestLag = { lit: newerLit, lastFinding };
  }

  // ── Build the plan (computed statically; paths reflect the order of execution). ──
  // If a future step ever rewrites path STRINGS inside unit prose, mind the recorded
  // lesson: a blind rewrite corrupts prose that NAMES a path as an object ("delete
  // root docs/" → "delete root .promptus/docs/") — that class needs its own check,
  // beyond link/URL contexts.
  const plan: Step[] = [];
  if (migrationNeeded && (old || telosOrig)) {
    const P = (rel: string) => join(root, rel);

    // 1. Clear the 0.1.x derived files sitting at .promptus/ root (rebuilt into cache/).
    for (const d of ["CATALOG.md", "graph.json", "index.sqlite"]) {
      const p = join(root, ".promptus", d);
      if (existsSync(p)) plan.push({ op: "delete", path: p, what: `drop stale derived ${fwd(`.promptus/${d}`)} (rebuilt into cache/)` });
    }

    // 2. Move the findings dir wholesale (carries docs/lit and any ledger/telos living inside it).
    const docsTarget = P(CANON.docs);
    const docsMoved = stores.finding.exists && fwd(findingDir) !== fwd(docsTarget);
    if (docsMoved) plan.push({ op: "move", from: findingDir, to: docsTarget, what: `findings ${stores.finding.rel}/ → ${CANON.docs}/ (with lit/ and any nested notes)` });

    // 3. Move the ledger to its canonical home — resolving where it sits AFTER step 2.
    if (stores.ledger.exists) {
      const ledgerNow = docsMoved && fwd(ledgerOrig).startsWith(fwd(findingDir) + "/")
        ? join(docsTarget, relative(findingDir, ledgerOrig))
        : ledgerOrig;
      if (fwd(ledgerNow) !== fwd(P(CANON.ledger))) plan.push({ op: "move", from: ledgerNow, to: P(CANON.ledger), what: `ledger ${stores.ledger.rel} → ${CANON.ledger}` });
    }

    // 4. Move TELOS — also resolving its post-step-2 location.
    if (telosOrig) {
      const telosNow = docsMoved && fwd(telosOrig).startsWith(fwd(findingDir) + "/")
        ? join(docsTarget, relative(findingDir, telosOrig))
        : telosOrig;
      if (fwd(telosNow) !== fwd(P(CANON.telos))) plan.push({ op: "move", from: telosNow, to: P(CANON.telos), what: `telos ${stores.telos.rel} → ${CANON.telos}` });
    }

    // 5. Move a materialized memory store, if any.
    if (stores.memory.exists && fwd(memoryDir) !== fwd(P(CANON.memory))) plan.push({ op: "move", from: memoryDir, to: P(CANON.memory), what: `memory ${stores.memory.rel}/ → ${CANON.memory}/` });

    // 6. Write the upgraded vocab to the canonical location; remove the old one.
    const newVocab = upgradeVocab(old, template);
    const oldVocabPath = loc.vocabPath && fwd(loc.vocabPath) !== fwd(P(CANON.schema)) ? loc.vocabPath : null;
    plan.push({
      op: "write-vocab",
      to: P(CANON.schema),
      oldPath: oldVocabPath,
      content: `${JSON.stringify(newVocab, null, 2)}\n`,
      what: `write upgraded vocab → ${CANON.schema}${old && old.version !== targetVersion ? ` (v${old.version} → v${targetVersion})` : ""}${oldVocabPath ? `, remove ${relOf(root, oldVocabPath)}` : ""}`,
    });

    // 7. Narrow the .gitignore so the migrated stores are committed, not ignored.
    const narrowed = narrowGitignore(giContent);
    if (narrowed !== null) plan.push({ op: "gitignore", to: giPath, content: narrowed, what: gitignoreHazard ? "narrow .gitignore /.promptus/ → /.promptus/cache/ (stores must be committed)" : "ensure .gitignore keeps /.promptus/cache/ ignored" });

    // 8. Tidy now-empty legacy store dirs.
    for (const d of [dirname(ledgerOrig), dirname(loc.vocabPath ?? "")]) {
      if (d && existsSync(d) && fwd(d) !== fwd(root) && !fwd(d).includes("/.promptus")) plan.push({ op: "rmdir-empty", path: d, what: `remove ${relOf(root, d)}/ if empty` });
    }

    // 9. Rebuild the derived index on the new layout.
    plan.push({ op: "reindex", what: "rebuild .promptus/cache/CATALOG.md + graph.json" });
  } else if (!migrationNeeded) {
    const P = (rel: string) => join(root, rel);
    for (const rel of staleDerived) {
      plan.push({ op: "delete", path: join(root, rel), what: `drop stale derived ${rel} (rebuilt into cache/)` });
    }
    if (vocabBehind && old) {
      const newVocab = upgradeVocab(old, template);
      plan.push({
        op: "write-vocab",
        to: P(CANON.schema),
        oldPath: null,
        content: `${JSON.stringify(newVocab, null, 2)}\n`,
        what: vocabMergeWhat(old, template, gap),
      });
    }
    const narrowed = narrowGitignore(giContent);
    if (narrowed !== null) {
      plan.push({
        op: "gitignore",
        to: giPath,
        content: narrowed,
        what: gitignoreHazard ? "narrow .gitignore /.promptus/ → /.promptus/cache/ (stores must be committed)" : "ensure .gitignore keeps /.promptus/cache/ ignored",
      });
    }
    plan.push({
      op: "reindex",
      what: catalogLag
        ? `rebuild .promptus/cache/ (${catalogLag} ledger unit(s) missing from the catalog)`
        : "refresh .promptus/cache/ (already on the current layout)",
    });
    if (opts.recordBaseline) {
      plan.push({ op: "record-baseline", what: "record inherited classification/link/orphan debt as .promptus/schema/health-baseline.json" });
    }
  }

  const gitignoreNeedsUpdate = narrowGitignore(giContent) !== null;
  const thinkerRefreshNeeded = thinkerExchange.present && thinkerExchange.markerValid &&
    thinkerExchange.issues.length > 0 && thinkerExchange.issues.every((issue) => issue.startsWith("derived "));
  const bookkeepingNeeded = !migrationNeeded && (
    vocabBehind || gitignoreHazard || gitignoreNeedsUpdate || !!catalogLag || staleDerived.length > 0 || thinkerRefreshNeeded
  );
  const hygieneFlags = telosHygiene(telosOrig);
  const fullyHealthy = layout === "current"
    && !bookkeepingNeeded
    && !digestLag
    && hygieneFlags.length === 0
    && extraTrees.length === 0
    && (!thinkerExchange.present || thinkerExchange.governed)
    && rootTwins.length === 0
    && debt.artifactFailures === 0
    && !debt.unratcheted;

  return {
    root, vocabPath: loc.vocabPath, vocabLocation: loc.location, vocabVersion: old?.version ?? null, targetVersion,
    layout, gateReachable, gitignoreHazard, stores, telos: telosOrig, telosHygiene: hygieneFlags,
    catalogLag, ledgerUnits, catalogUnits, rootTwins, digestLag,
    vocabBehind, vocabMissing: gap.missing, vocabExtras: gap.extras,
    extraTrees, thinkerExchange, staleDerived, debt,
    migrationNeeded, bookkeepingNeeded, fullyHealthy, plan, notes,
  };
}

function apply(d: Diagnosis): void {
  mkdirSync(join(d.root, ".promptus"), { recursive: true });
  for (const s of d.plan) {
    switch (s.op) {
      case "delete":
        rmSync(s.path, { force: true, recursive: true });
        break;
      case "move":
        if (!existsSync(s.from)) { console.error(`  skip (source vanished): ${relOf(d.root, s.from)}`); break; }
        mkdirSync(dirname(s.to), { recursive: true });
        if (existsSync(s.to)) throw new Error(`refuse to overwrite existing ${relOf(d.root, s.to)}`);
        renameSync(s.from, s.to);
        break;
      case "write-vocab":
        mkdirSync(dirname(s.to), { recursive: true });
        writeFileSync(s.to, s.content);
        if (s.oldPath && existsSync(s.oldPath) && fwd(s.oldPath) !== fwd(s.to)) rmSync(s.oldPath, { force: true });
        break;
      case "gitignore":
        writeFileSync(s.to, s.content);
        break;
      case "rmdir-empty":
        try { if (existsSync(s.path) && readdirSync(s.path).length === 0) rmdirSync(s.path); } catch { /* not empty / vanished — leave it */ }
        break;
      case "reindex": {
        const r = spawnSync(process.execPath, [join(SELF_DIR, "kb-index.ts"), "--root", d.root], { encoding: "utf8" });
        if (r.stdout) process.stdout.write(r.stdout);
        if (r.status !== 0 && r.stderr) process.stderr.write(r.stderr);
        break;
      }
      case "record-baseline": {
        const r = spawnSync(process.execPath, [join(SELF_DIR, "promptus-check.ts"), "--root", d.root, "--record-baseline"], { encoding: "utf8" });
        if (r.stdout) process.stdout.write(r.stdout);
        if (r.status !== 0 && r.stderr) process.stderr.write(r.stderr);
        break;
      }
    }
  }
}

function reportCheck(d: Diagnosis): void {
  const sym = (b: boolean) => (b ? "ok  " : "FAIL");
  console.log(`promptus-doctor: ${fwd(d.root)}`);
  const scaleBits = [
    d.debt.units != null ? `${d.debt.units} health units` : null,
    d.catalogUnits != null ? `${d.catalogUnits} catalog units` : null,
    d.ledgerUnits != null ? `${d.ledgerUnits} ledger events` : null,
    d.debt.sourceFiles != null ? `${d.debt.sourceFiles} source files` : null,
  ].filter(Boolean);
  if (scaleBits.length) console.log(`  scale:    ${scaleBits.join(" · ")}`);
  const versionBehind = (d.vocabVersion ?? 0) < d.targetVersion;
  const vocabBehindTxt = !d.vocabBehind ? ""
    : versionBehind ? `  → behind template v${d.targetVersion}`
    : `  → missing template terms (template v${d.targetVersion})`;
  console.log(`  vocab:    ${d.vocabLocation === "none" ? "(not found)" : `${relOf(d.root, d.vocabPath!)} (${d.vocabLocation}, v${d.vocabVersion ?? "?"})${vocabBehindTxt}`}`);
  console.log(`  layout:   ${d.layout}${d.migrationNeeded ? "  → migration available" : d.bookkeepingNeeded ? "  → upgrade available" : "  (current)"}`);
  console.log(`  ${sym(d.gateReachable)} gate: kb-add ${d.gateReachable ? "can reach" : "CANNOT reach"} .promptus/schema/kb-vocab.json`);
  console.log(`  ${sym(!d.gitignoreHazard)} gitignore: ${d.gitignoreHazard ? "/.promptus/ is broadly ignored — migrated stores would NOT be committed" : "stores are not wrongly ignored"}`);
  console.log("  stores:");
  for (const [k, v] of Object.entries(d.stores)) console.log(`    ${v.exists ? "·" : "×"} ${k.padEnd(8)} ${v.rel}${v.exists ? "" : "  (missing)"}`);
  if (d.vocabBehind) {
    const missing = d.vocabMissing.slice(0, 8).join(", ") || "(version only)";
    const extras = d.vocabExtras.slice(0, 8).join(", ");
    console.log(`  FLAG vocab: store v${d.vocabVersion ?? "?"} ${versionBehind ? `behind template v${d.targetVersion}` : `missing template terms (template v${d.targetVersion})`} — merge would add ${missing}${d.vocabMissing.length > 8 ? ", …" : ""}${extras ? `; keep custom ${extras}${d.vocabExtras.length > 8 ? ", …" : ""}` : ""}`);
  }
  if (d.catalogLag) {
    console.log(`  FLAG catalog: ${d.catalogLag} ledger unit(s) missing from the derived catalog (hand-appended at the sentinel, or a stale/absent cache) — run kb-index`);
  }
  if (d.staleDerived.length) {
    console.log(`  FLAG derived: leftover ${d.staleDerived.join(", ")} at the namespace root — drop and rebuild into cache/`);
  }
  if (d.extraTrees.length) {
    const listed = d.extraTrees.map((t) => `${t.rel} (${t.files} files)`).join(", ");
    console.log(`  FLAG extra: ungoverned ${listed} — ingest via kb-ingest quarantine; doctor --apply will not move or rewrite them`);
  }
  if (d.thinkerExchange.present && d.thinkerExchange.markerValid) {
    console.log(`  ${d.thinkerExchange.governed ? "ok  " : "FLAG"} thinker: governed exchange · ${d.thinkerExchange.rounds.length} round(s)`);
    for (const issue of d.thinkerExchange.issues.slice(0, 8)) console.log(`    ${issue}`);
    if (d.thinkerExchange.issues.length > 8) console.log(`    … and ${d.thinkerExchange.issues.length - 8} more`);
  }
  if (d.rootTwins.length) {
    console.log(`  FLAG twins: root-level ${d.rootTwins.join(", ")} shadow the namespaced store(s) — the gate only writes .promptus/, so twins diverge; reconcile, then remove the root copy`);
  }
  if (d.digestLag) {
    console.log(`  FLAG digest: ${d.digestLag.lit} lit unit(s) postdate the newest finding unit${d.digestLag.lastFinding ? ` (last digested ${d.digestLag.lastFinding})` : " (no finding units exist)"} — research is landing as citations without digests; the reasoning is perishable (three homes: research-ledger skill)`);
  }
  if (d.debt.source === "health.json") {
    const now = d.debt.nowFresh == null ? "" : `; NOW ${d.debt.nowFresh ? "fresh" : "STALE"}`;
    console.log(`  debt:     ${d.debt.dangling} dangling · ${d.debt.orphans} orphans · ${d.debt.unclassified} unclassified · ${d.debt.artifactFailures} current artifact failures · ${d.debt.archivalArtifactWarnings} archival artifact warnings${now}${d.debt.checkedAt ? ` (health.json ${d.debt.checkedAt})` : ""}`);
    if (d.debt.baseline) {
      const nd = d.debt.newDangling ?? 0, no = d.debt.newOrphans ?? 0, nu = d.debt.newUnclassified ?? 0;
      console.log(`  ${nd + no + nu ? "FLAG" : "ok  "} ratchet: baseline present; ${nd} new dangling · ${no} new orphans · ${nu} new unclassified vs baseline`);
    } else if (d.debt.unratcheted) {
      console.log("  FLAG debt-baseline: inherited dangling/orphan/unclassified debt has no health-baseline.json — record with promptus-doctor upgrade --apply --record-baseline (or promptus-check --record-baseline)");
    }
  }
  if (d.telosHygiene.length) {
    console.log(`  telos hygiene: ${d.telosHygiene.length} event-shaped line(s) — the Telos is direction, rewritten in place;`);
    console.log("    route events to the ledger (kb-add), the frontier to the NOW-header (kb-now), settled facts to memory:");
    for (const h of d.telosHygiene.slice(0, 8)) console.log(`    L${h.line} (${h.why}): ${h.sample}`);
    if (d.telosHygiene.length > 8) console.log(`    … and ${d.telosHygiene.length - 8} more`);
  }
  if (d.migrationNeeded && d.plan.length) {
    console.log(`\n  migration plan (${d.plan.length} steps) — run \`promptus-doctor migrate --apply\`:`);
    for (const s of d.plan) console.log(`    - ${s.what}`);
  } else if (d.bookkeepingNeeded) {
    console.log(`\n  upgrade plan (${d.plan.length} steps) — run \`promptus-doctor upgrade --apply\` (dry-run by default; never edits unit bodies):`);
    for (const s of d.plan) console.log(`    - ${s.what}`);
  } else if (!d.fullyHealthy) {
    console.log("\n  not fully healthy — remaining flags above are report-only or need judgment; --apply never rewrites unit bodies.");
  } else if (!d.migrationNeeded) {
    console.log("\n  healthy — on the current .promptus/ layout.");
  }
}

function reportPlan(d: Diagnosis, applied: boolean): void {
  const kind = d.migrationNeeded ? "migration" : "upgrade";
  const head = applied
    ? `promptus-doctor: ${d.migrationNeeded ? "migrated" : "upgraded"}`
    : `promptus-doctor: ${kind} plan (dry-run — pass --apply to perform)`;
  console.log(`${head} — ${fwd(d.root)} [${d.layout}${d.vocabVersion ? `, v${d.vocabVersion}` : ""} → current, v${d.targetVersion}]`);
  if (!d.plan.length) { console.log("  nothing to do."); return; }
  for (const s of d.plan) console.log(`  ${applied ? "✓" : "-"} ${s.what}`);
  if (!applied) console.log(`\n  ${d.plan.filter((s) => s.op !== "reindex").length} change(s) staged. No files were touched. Re-run with --apply to perform them.`);
}

const HELP = `promptus-doctor — diagnose layout and book-keep a Promptus store
usage: promptus-doctor [check|migrate|upgrade] [--root <dir>] [--apply] [--strict] [--json] [--record-baseline]
  check              read-only diagnosis (default)
  migrate | upgrade  layout migration or current-layout book-keeping; dry-run unless --apply
  --apply            perform the plan; never edits unit bodies
  --record-baseline  with migrate/upgrade --apply, record inherited debt after reindex
  --strict           non-zero when a layout migration or mechanical upgrade remains
  --json             machine-readable diagnosis (vocab write payloads omitted)
A current-layout repo is not reported fully healthy while vocab is behind the
template, the catalog lags, gitignore is broad, leftover derived files sit at
.promptus/ root, a thinker exchange is damaged, extra ungoverned trees exist, or
inherited debt is unratcheted.`;

function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith("--"));
  const has = (f: string) => argv.includes(`--${f}`);
  const valOf = (f: string) => { const i = argv.indexOf(`--${f}`); return i >= 0 ? argv[i + 1] : undefined; };
  if (has("help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const cmd = args[0] === "migrate" || args[0] === "upgrade" ? "migrate" : "check";
  const startRaw = valOf("root") ?? process.cwd();
  const start = isAbsolute(startRaw) ? startRaw : resolve(process.cwd(), startRaw);

  if (!loadJSON(TEMPLATE_VOCAB)) { console.error(`promptus-doctor: cannot read the template vocab at ${fwd(TEMPLATE_VOCAB)}`); return 2; }
  const d = diagnose(start, { recordBaseline: cmd === "migrate" && has("record-baseline") });

  if (d.vocabLocation === "none" && d.layout === "unknown") {
    console.error(`promptus-doctor: no Promptus project found at or above ${fwd(start)} (no schema/kb-vocab.json, .promptus/schema/kb-vocab.json, or .promptus/TELOS.md).`);
    return 2;
  }

  const strictFail = (d.migrationNeeded || d.bookkeepingNeeded) && has("strict");
  if (has("json")) { console.log(JSON.stringify(d, (k, v) => (k === "content" ? undefined : v), 2)); return strictFail ? 1 : 0; }

  if (cmd === "check") {
    reportCheck(d);
    return strictFail ? 1 : 0;
  }

  // migrate / upgrade
  if (has("apply")) {
    apply(d);
    reportPlan(d, true);
    return 0;
  }
  reportPlan(d, false);
  return 0;
}

process.exit(main(process.argv.slice(2)));
