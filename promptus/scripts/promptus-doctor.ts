#!/usr/bin/env bun
/**
 * promptus-doctor.ts — diagnose a project's Promptus layout and migrate it to the
 * current `.promptus/` namespace. Version-aware; DRY-RUN by default; never edits a
 * unit's content (it only MOVES files, rewrites the vocab's store paths, narrows the
 * `.gitignore`, and rebuilds the derived index).
 *
 * Usage:
 *   promptus-doctor [check|migrate] [--root <dir>] [--apply] [--strict] [--json]
 *
 *   check    (default) READ-ONLY: locate the vocab, name the layout + version, report
 *            health (is the gate reachable? is the whole `.promptus/` wrongly gitignored?
 *            which stores are missing?), and — if the repo is on an older layout — print
 *            the migration plan WITHOUT touching anything. `--strict` exits non-zero when
 *            a migration is needed (so CI / a checkpoint can gate on it).
 *   migrate  plan the moves that bring the repo to the canonical `.promptus/` layout, then
 *            print them. DRY-RUN by default; pass `--apply` to perform them. Idempotent:
 *            a repo already on the current layout is a no-op (only the index is refreshed).
 *
 * Why a migration is needed at all: 0.1.x kept the stores at the repo root
 * (`schema/`, `ledger/`, `docs/`, root `TELOS.md`) and used `.promptus/` for the
 * *derived, gitignored* cache. 0.2.0 inverted that — `.promptus/` is now the *committed*
 * namespace for every store, and the cache dropped to `.promptus/cache/`. A repo left on
 * the old layout silently loses its gate (the plugin's scripts look under `.promptus/schema/`
 * and don't find the vocab), so this is a real fix, not a cosmetic move.
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
  | { op: "reindex"; what: string };

type Layout = "current" | "legacy-root" | "custom" | "unknown";

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
  migrationNeeded: boolean;
  plan: Step[];
  notes: string[];
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
 *  (and any custom substrate) from the old vocab merged in so nothing is silently dropped. */
function upgradeVocab(old: Vocab | null, template: Vocab): Vocab {
  const next = JSON.parse(JSON.stringify(template)) as Vocab;
  if (!old) return next;
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
  return next;
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

function diagnose(start: string): Diagnosis {
  const loc = locate(start);
  const root = loc.root;
  const template = loadJSON(TEMPLATE_VOCAB)!;
  const targetVersion = template.version;
  const old = loc.vocabPath ? loadJSON(loc.vocabPath) : null;
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

  // ── Build the plan (computed statically; paths reflect the order of execution). ──
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
    plan.push({ op: "reindex", what: "refresh .promptus/cache/ (already on the current layout)" });
  }

  return {
    root, vocabPath: loc.vocabPath, vocabLocation: loc.location, vocabVersion: old?.version ?? null, targetVersion,
    layout, gateReachable, gitignoreHazard, stores, telos: telosOrig, migrationNeeded, plan, notes,
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
    }
  }
}

function reportCheck(d: Diagnosis): void {
  const sym = (b: boolean) => (b ? "ok  " : "FAIL");
  console.log(`promptus-doctor: ${fwd(d.root)}`);
  console.log(`  vocab:    ${d.vocabLocation === "none" ? "(not found)" : `${relOf(d.root, d.vocabPath!)} (${d.vocabLocation}, v${d.vocabVersion ?? "?"})`}`);
  console.log(`  layout:   ${d.layout}${d.migrationNeeded ? "  → migration available" : "  (current)"}`);
  console.log(`  ${sym(d.gateReachable)} gate: kb-add ${d.gateReachable ? "can reach" : "CANNOT reach"} .promptus/schema/kb-vocab.json`);
  console.log(`  ${sym(!d.gitignoreHazard)} gitignore: ${d.gitignoreHazard ? "/.promptus/ is broadly ignored — migrated stores would NOT be committed" : "stores are not wrongly ignored"}`);
  console.log("  stores:");
  for (const [k, v] of Object.entries(d.stores)) console.log(`    ${v.exists ? "·" : "×"} ${k.padEnd(8)} ${v.rel}${v.exists ? "" : "  (missing)"}`);
  if (d.migrationNeeded && d.plan.length) {
    console.log(`\n  migration plan (${d.plan.length} steps) — run \`promptus-doctor migrate --apply\`:`);
    for (const s of d.plan) console.log(`    - ${s.what}`);
  } else if (!d.migrationNeeded) {
    console.log("\n  healthy — on the current .promptus/ layout.");
  }
}

function reportPlan(d: Diagnosis, applied: boolean): void {
  const head = applied ? "promptus-doctor: migrated" : "promptus-doctor: migration plan (dry-run — pass --apply to perform)";
  console.log(`${head} — ${fwd(d.root)} [${d.layout}${d.vocabVersion ? `, v${d.vocabVersion}` : ""} → current, v${d.targetVersion}]`);
  if (!d.plan.length) { console.log("  nothing to do."); return; }
  for (const s of d.plan) console.log(`  ${applied ? "✓" : "-"} ${s.what}`);
  if (!applied) console.log(`\n  ${d.plan.filter((s) => s.op !== "reindex").length} change(s) staged. No files were touched. Re-run with --apply to perform them.`);
}

function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith("--"));
  const has = (f: string) => argv.includes(`--${f}`);
  const valOf = (f: string) => { const i = argv.indexOf(`--${f}`); return i >= 0 ? argv[i + 1] : undefined; };
  const cmd = args[0] === "migrate" ? "migrate" : "check";
  const startRaw = valOf("root") ?? process.cwd();
  const start = isAbsolute(startRaw) ? startRaw : resolve(process.cwd(), startRaw);

  if (!loadJSON(TEMPLATE_VOCAB)) { console.error(`promptus-doctor: cannot read the template vocab at ${fwd(TEMPLATE_VOCAB)}`); return 2; }
  const d = diagnose(start);

  if (d.vocabLocation === "none" && d.layout === "unknown") {
    console.error(`promptus-doctor: no Promptus project found at or above ${fwd(start)} (no schema/kb-vocab.json, .promptus/schema/kb-vocab.json, or .promptus/TELOS.md).`);
    return 2;
  }

  if (has("json")) { console.log(JSON.stringify(d, (k, v) => (k === "content" ? undefined : v), 2)); return d.migrationNeeded && has("strict") ? 1 : 0; }

  if (cmd === "check") {
    reportCheck(d);
    return d.migrationNeeded && has("strict") ? 1 : 0;
  }

  // migrate
  if (has("apply")) {
    apply(d);
    reportPlan(d, true);
    return 0;
  }
  reportPlan(d, false);
  return 0;
}

process.exit(main(process.argv.slice(2)));
