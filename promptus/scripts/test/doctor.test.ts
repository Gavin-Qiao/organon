/**
 * doctor.test.ts — promptus-doctor: version-aware diagnosis + migration to the
 * `.promptus/` namespace. Four axes: detection (name the layout, the version, the
 * health hazards), safety (dry-run touches nothing; never edit a unit's bytes;
 * refuse a non-project), correctness (every store lands at its canonical home, the
 * vocab is rewritten + upgraded, the `.gitignore` is narrowed so stores are
 * committed), and the end-to-end guarantee (post-migration the gate works again and
 * every doc — even a frontmatter-less project note — is parseable + retrievable).
 *
 * The two fixtures mirror the real repos this tool was built for: a Psi-like
 * legacy-root layout (stores at the repo root, `.promptus/` is the gitignored cache)
 * and a Probatio-like custom layout (ledger + telos living inside `docs/`).
 * Run: `bun test`.
 */
import { test, expect, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const tmps: string[] = [];
afterAll(() => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });

function mkTmp(prefix = "promptus-doc-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmps.push(d);
  return d;
}

function run(script: string, args: string[], opts: { stdin?: string; cwd?: string } = {}) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { input: opts.stdin ?? "", encoding: "utf8", cwd: opts.cwd });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const doctor = (root: string, args: string[]) => run("promptus-doctor.ts", [...args, "--root", root]);
const exists = (root: string, p: string) => existsSync(join(root, p));
const read = (root: string, p: string) => readFileSync(join(root, p), "utf8");

/** A legacy (0.1.x) vocab: stores at the repo root, paths unprefixed. `kind` selects where
 *  the ledger lives — its own `ledger/` dir (Psi-like) or inside `docs/` (Probatio-like). */
function legacyVocab(kind: "root" | "custom", version = 3) {
  return {
    version,
    substrates: {
      ledger: { prefix: "event", store: kind === "root" ? "ledger/RESEARCH-LEDGER.md" : "docs/research-ledger.md", placement: "sentinel", envelope: "log", policy: "permissive", kinds: { core: ["PLAN", "RESULT", "DECISION"], extended: ["IDEA", "SPIKE"] }, statuses: { core: ["CONJECTURED", "VALIDATED"], extended: ["PARKED"] } },
      finding: { prefix: "finding", store: "docs", placement: "file", envelope: "page", policy: "strict", kinds: { core: ["RESULT", "CLAIM"], extended: [] }, statuses: { core: ["VALIDATED"], extended: [] } },
      lit: { prefix: "lit", store: "docs/lit", placement: "file", envelope: "page", policy: "strict", kinds: { core: ["PAPER"], extended: [] }, statuses: { core: ["CITE"], extended: [] }, requires: ["source"] },
      memory: { prefix: "memory", store: "memory", index: "memory/MEMORY.md", placement: "file", envelope: "memory", policy: "strict", kinds: { core: ["project"], extended: [] }, statuses: { core: ["validated"], extended: [] } },
    },
    relations: { supersedes: { inverse_status: "SUPERSEDED" } },
    lit_reuse: { CITE: "cito:cites" },
    sentinel: "<!-- kb:append-point -->",
  };
}

const LEDGER = `# Research Ledger — legacy

**Updated:** 2026-06-20 10:00 (legacy)  ·  **Operator:** t  ·  **Agent:** t

<!-- now:start -->
## NOW
legacy now
## Open frontier
- [ ] thing
## Next actions
1. go
## <<< RESUME HERE AFTER COMPACTION >>>
here
<!-- now:end -->

## Log

<!-- kb:append-point -->
### [2026-06-20 09:00:00] RESULT/VALIDATED — needle alpha median ARI 0.95
the headline result lives here
`;

const NOTE = "# Contour neck synthesis\n\nThe 2diamonds case scores 3.9 on neck salience; banana scores 0.4.\n";

/** Scaffold a legacy repo on disk. Returns the root. */
function scaffoldLegacy(kind: "root" | "custom", opts: { version?: number; gitignore?: string } = {}): string {
  const root = mkTmp();
  mkdirSync(join(root, "schema"), { recursive: true });
  mkdirSync(join(root, "docs", "lit"), { recursive: true });
  mkdirSync(join(root, ".promptus"), { recursive: true }); // 0.1.x used .promptus/ for the derived cache
  writeFileSync(join(root, "schema", "kb-vocab.json"), JSON.stringify(legacyVocab(kind, opts.version ?? 3), null, 2) + "\n");
  writeFileSync(join(root, "docs", "neck-synthesis.md"), NOTE);
  writeFileSync(join(root, "docs", "lit", "boundary.md"), "# Boundary construction\n\nexternal note.\n");
  writeFileSync(join(root, ".promptus", "CATALOG.md"), "# stale derived\nold:STALE · ghost · docs/ghost.md\n");
  writeFileSync(join(root, ".promptus", "graph.json"), `{"stale":true}`);
  writeFileSync(join(root, ".gitignore"), opts.gitignore ?? "node_modules/\n/.promptus/\n*.log\n");
  if (kind === "root") {
    mkdirSync(join(root, "ledger"), { recursive: true });
    writeFileSync(join(root, "ledger", "RESEARCH-LEDGER.md"), LEDGER);
    writeFileSync(join(root, "TELOS.md"), "# Telos — legacy root\n");
  } else {
    writeFileSync(join(root, "docs", "research-ledger.md"), LEDGER);
    writeFileSync(join(root, "docs", "telos.md"), "# Telos — custom\n");
  }
  return root;
}

// ──────────────────────────── Detection ────────────────────────────

test("check: names a legacy-root layout and flags the down gate + gitignore hazard", () => {
  const root = scaffoldLegacy("root");
  const r = doctor(root, ["check"]);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("layout:   legacy-root");
  expect(r.stdout).toContain("migration available");
  expect(r.stdout).toContain("CANNOT reach .promptus/schema/kb-vocab.json"); // gate down
  expect(r.stdout).toContain("/.promptus/ is broadly ignored");             // gitignore hazard
});

test("check: names a custom layout (ledger living inside docs/)", () => {
  const root = scaffoldLegacy("custom");
  const r = doctor(root, ["check"]);
  expect(r.stdout).toContain("layout:   custom");
  expect(r.stdout).toContain("ledger   docs/research-ledger.md");
  expect(r.stdout).toContain("telos    docs/telos.md");
});

test("check --strict: non-zero when a migration is needed, zero once current", () => {
  const root = scaffoldLegacy("root");
  expect(doctor(root, ["check", "--strict"]).status).toBe(1); // legacy → needs migration
  doctor(root, ["migrate", "--apply"]);
  expect(doctor(root, ["check", "--strict"]).status).toBe(0); // now current
});

test("check: a directory with no Promptus project errors clearly", () => {
  const root = mkTmp("promptus-bare-");
  const r = doctor(root, ["check"]);
  expect(r.status).toBe(2);
  expect(r.stderr.toLowerCase()).toContain("no promptus project");
});

// ──────────────────────────── Safety ────────────────────────────

test("migrate dry-run: stages a plan but touches nothing on disk", () => {
  const root = scaffoldLegacy("root");
  const r = doctor(root, ["migrate"]); // no --apply
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("dry-run");
  expect(r.stdout).toContain("No files were touched");
  // the old layout is exactly as it was
  expect(exists(root, "schema/kb-vocab.json")).toBe(true);
  expect(exists(root, "ledger/RESEARCH-LEDGER.md")).toBe(true);
  expect(exists(root, ".promptus/schema/kb-vocab.json")).toBe(false);
  expect(exists(root, ".promptus/cache/CATALOG.md")).toBe(false);
});

test("migrate --apply: never edits a unit's bytes (the anti-corruption guarantee)", () => {
  const root = scaffoldLegacy("custom");
  const before = read(root, "docs/neck-synthesis.md");
  doctor(root, ["migrate", "--apply"]);
  expect(exists(root, ".promptus/docs/neck-synthesis.md")).toBe(true);
  expect(read(root, ".promptus/docs/neck-synthesis.md")).toBe(before); // byte-identical
});

// ──────────────────────────── Correctness ────────────────────────────

test("migrate --apply (legacy-root): every store lands at its canonical .promptus/ home", () => {
  const root = scaffoldLegacy("root");
  const r = doctor(root, ["migrate", "--apply"]);
  expect(r.status).toBe(0);
  for (const p of [".promptus/schema/kb-vocab.json", ".promptus/ledger/RESEARCH-LEDGER.md", ".promptus/TELOS.md", ".promptus/docs/neck-synthesis.md", ".promptus/docs/lit/boundary.md", ".promptus/cache/CATALOG.md"]) {
    expect(exists(root, p)).toBe(true);
  }
  // the legacy homes are gone
  expect(exists(root, "schema/kb-vocab.json")).toBe(false);
  expect(exists(root, "ledger/RESEARCH-LEDGER.md")).toBe(false);
  expect(exists(root, "TELOS.md")).toBe(false);
  expect(exists(root, "docs/neck-synthesis.md")).toBe(false);
});

test("migrate --apply (custom): the ledger and telos are pulled OUT of docs/ to canonical homes", () => {
  const root = scaffoldLegacy("custom");
  doctor(root, ["migrate", "--apply"]);
  expect(exists(root, ".promptus/ledger/RESEARCH-LEDGER.md")).toBe(true); // routed out of docs/
  expect(exists(root, ".promptus/TELOS.md")).toBe(true);                  // routed out of docs/
  expect(exists(root, ".promptus/docs/neck-synthesis.md")).toBe(true);    // the rest of docs/ stays a finding
  expect(exists(root, ".promptus/docs/research-ledger.md")).toBe(false);  // not left behind in docs/
  expect(exists(root, ".promptus/docs/telos.md")).toBe(false);
});

test("migrate --apply: the vocab is re-homed, store paths .promptus/-prefixed, and version pinned to target", () => {
  const root = scaffoldLegacy("root");
  doctor(root, ["migrate", "--apply"]);
  const v = JSON.parse(read(root, ".promptus/schema/kb-vocab.json"));
  expect(v.version).toBe(3);
  expect(v.substrates.ledger.store).toBe(".promptus/ledger/RESEARCH-LEDGER.md");
  expect(v.substrates.finding.store).toBe(".promptus/docs");
  expect(v.substrates.lit.store).toBe(".promptus/docs/lit");
  expect(v.substrates.memory.index).toBe(".promptus/memory/MEMORY.md");
});

test("migrate --apply: a custom blessed term in the old vocab survives the upgrade", () => {
  const root = scaffoldLegacy("root");
  doctor(root, ["migrate", "--apply"]);
  const v = JSON.parse(read(root, ".promptus/schema/kb-vocab.json"));
  const ledgerKinds = [...v.substrates.ledger.kinds.core, ...v.substrates.ledger.kinds.extended];
  const ledgerStatuses = [...v.substrates.ledger.statuses.core, ...v.substrates.ledger.statuses.extended];
  expect(ledgerKinds).toContain("SPIKE");   // custom extended kind preserved
  expect(ledgerStatuses).toContain("PARKED"); // custom extended status preserved
});

test("migrate --apply: an older vocab version is upgraded to the target shape", () => {
  const root = scaffoldLegacy("root", { version: 2 });
  const r = doctor(root, ["check"]);
  expect(r.stdout).toContain("v2");
  doctor(root, ["migrate", "--apply"]);
  const v = JSON.parse(read(root, ".promptus/schema/kb-vocab.json"));
  expect(v.version).toBe(3); // upgraded
  expect(v.relations.refutes).toBeDefined(); // gained the full canonical relation set
});

test("migrate --apply: the .gitignore is narrowed so the stores are committed, not ignored", () => {
  const root = scaffoldLegacy("root");
  doctor(root, ["migrate", "--apply"]);
  const gi = read(root, ".gitignore");
  expect(gi).toContain("/.promptus/cache/"); // only the cache is ignored
  expect(gi.split(/\r?\n/)).not.toContain("/.promptus/"); // the broad rule is gone
  expect(gi).toContain("node_modules/"); // unrelated rules are preserved
});

test("migrate --apply: stale derived files at .promptus/ root are dropped and the cache is rebuilt", () => {
  const root = scaffoldLegacy("root");
  doctor(root, ["migrate", "--apply"]);
  // the 0.1.x cache at the namespace root is gone; the new derived cache is under cache/
  expect(read(root, ".promptus/cache/CATALOG.md")).not.toContain("ghost"); // the stale entry didn't survive
  expect(exists(root, ".promptus/graph.json")).toBe(false); // not at the namespace root
  expect(exists(root, ".promptus/cache/graph.json")).toBe(true);
});

test("migrate --apply: running twice is idempotent (the second run moves nothing)", () => {
  const root = scaffoldLegacy("custom");
  doctor(root, ["migrate", "--apply"]);
  const second = doctor(root, ["migrate", "--apply"]);
  expect(second.status).toBe(0);
  expect(second.stdout).toContain("current"); // already on the current layout
  // not re-moved or duplicated
  expect(exists(root, ".promptus/ledger/RESEARCH-LEDGER.md")).toBe(true);
  expect(exists(root, ".promptus/docs/research-ledger.md")).toBe(false);
});

// ──────────────────────── End-to-end guarantees ────────────────────────

test("post-migration: the gate works again — kb-add can write a new ledger entry", () => {
  const root = scaffoldLegacy("root");
  doctor(root, ["migrate", "--apply"]);
  const a = run("kb-add.ts", ["--root", root, "--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "gate restored"], { stdin: "after migration" });
  expect(a.status).toBe(0); // the gate that was down before is up now
  expect(read(root, ".promptus/ledger/RESEARCH-LEDGER.md")).toContain("gate restored");
});

test("post-migration: every doc is parseable + retrievable, including frontmatter-less project notes", () => {
  const root = scaffoldLegacy("custom");
  doctor(root, ["migrate", "--apply"]);
  // the index already ran inside migrate; the frontmatter-less note is catalogued as finding:?
  expect(read(root, ".promptus/cache/CATALOG.md")).toContain("finding:? · Contour neck synthesis");
  // a needle buried in that note's body is retrievable
  const byBody = run("kb-find.ts", ["--root", root, "2diamonds"]);
  expect(byBody.stdout).toContain(".promptus/docs/neck-synthesis.md");
  // a needle in the ledger is retrievable too
  const byLedger = run("kb-find.ts", ["--root", root, "median", "ARI"]);
  expect(byLedger.stdout).toContain(".promptus/ledger/RESEARCH-LEDGER.md");
});
