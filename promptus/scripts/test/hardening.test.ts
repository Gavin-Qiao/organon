/** Regression contracts for Promptus 0.7 hardening. */
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const NOW = `# Research Ledger — test

**Updated:** 2000-01-01 · **Operator:** test

<!-- now:start -->
## NOW
<!-- kb:now-through EMPTY -->
The gate is being tested.

## Open frontier
- [ ] Prove the next boundary.

## Next actions
1. Run the sealed test.

## <<< RESUME HERE >>>
Resume from the receipt.
<!-- now:end -->

## Log

<!-- kb:append-point -->
`;

function scaffold(now = false): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-hardening-"));
  roots.push(root);
  for (const path of ["ledger", "docs/lit", "memory", "schema"]) mkdirSync(join(root, ".promptus", path), { recursive: true });
  writeFileSync(join(root, ".promptus", "TELOS.md"), "# Test atlas\n\n## North star\nBuild explanations that remain honest.\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), now ? NOW : "# Ledger\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(root, ".promptus", "memory", "MEMORY.md"), "# Memory\n\n<!-- kb:append-point -->\n");
  copyFileSync(VOCAB, join(root, ".promptus", "schema", "kb-vocab.json"));
  return root;
}

function run(script: string, root: string | null, args: string[] = [], input = "") {
  const full = root ? ["--root", root, ...args] : args;
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...full], { input, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
const add = (root: string, args: string[], body = "body") => run("kb-add.ts", root, args, body);
const index = (root: string) => run("kb-index.ts", root);

test("kb-find ranks lexical evidence and caps broad queries at 20 by default", () => {
  const root = scaffold();
  for (let i = 0; i < 24; i++) add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", `Proximity note ${i}`], "common proximity evidence");
  add(root, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Transfer atlas result"], "proximity transfer transfer transfer calibrated");
  index(root);
  const result = run("kb-find.ts", root, ["proximity transfer"]);
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.includes(" · "));
  expect(lines.length).toBe(20);
  expect(lines[0]).toContain("Transfer atlas result");
  expect(result.stdout).toContain("20 of 25 shown");
  const conjunctive = run("kb-find.ts", root, ["proximity transfer", "--all"]);
  expect(conjunctive.stdout).toContain("Transfer atlas result");
  expect(conjunctive.stdout).not.toContain("Proximity note");
});

test("cold ledger history is absent by default and opt-in with --history", () => {
  const root = scaffold();
  const archive = join(root, ".promptus", "ledger", "archive");
  mkdirSync(archive, { recursive: true });
  writeFileSync(join(archive, "2024.md"), "### [2024-01-01 01:02:03] DEADEND/REFUTED — Retired quasar route\n<!-- kb:id event-old -->\nquasarneedle failure\n");
  const pageArchive = join(root, ".promptus", "docs", "archive");
  mkdirSync(pageArchive, { recursive: true });
  writeFileSync(join(pageArchive, "old-page.md"), "---\nid: finding-old-page\nsubstrate: finding\nkind: CLAIM\nstatus: SUPERSEDED\n---\n# Old nebula page\n\nnebulaneedle\n");
  index(root);
  expect(readFileSync(join(root, ".promptus", "cache", "CATALOG.md"), "utf8")).not.toContain("Retired quasar route");
  expect(run("kb-find.ts", root, ["quasarneedle"]).stdout).toContain("no matches");
  const historical = run("kb-find.ts", root, ["quasarneedle", "--history"]);
  expect(historical.stdout).toContain("Retired quasar route");
  expect(historical.stdout).toContain("cold-history");
  expect(run("kb-find.ts", root, ["nebulaneedle"]).stdout).toContain("no matches");
  expect(run("kb-find.ts", root, ["nebulaneedle", "--history"]).stdout).toContain("Old nebula page");
});

test("graph links resolve canonical stable ids and aliases without false dangling debt", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "alpha.md"), "---\nid: finding-alpha\nsubstrate: finding\nkind: CLAIM\nstatus: VALIDATED\naliases: [former-alpha]\n---\n# Alpha\n");
  writeFileSync(join(root, ".promptus", "docs", "beta.md"), "---\nid: finding-beta\nsubstrate: finding\nkind: CLAIM\nstatus: VALIDATED\nlinks: [finding-alpha, former-alpha]\n---\n# Beta\n");
  index(root);
  const graph = JSON.parse(readFileSync(join(root, ".promptus", "cache", "graph.json"), "utf8"));
  expect(graph.dangling).toEqual([]);
  expect(graph.out.beta).toEqual(["alpha"]);
  expect(graph.unitOut["finding-beta"]).toEqual(["finding-alpha"]);
  expect(graph.inDeg.alpha).toBe(1);
});

test("kb-graph rank hides inactive units unless --history is explicit", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "retired.md"), "---\nid: finding-retired\nsubstrate: finding\nkind: CLAIM\nstatus: SUPERSEDED\nlinks: [active]\n---\n# Retired hub\n");
  writeFileSync(join(root, ".promptus", "docs", "active.md"), "---\nid: finding-active\nsubstrate: finding\nkind: CLAIM\nstatus: VALIDATED\nlinks: [retired]\n---\n# Active result\n");
  index(root);
  expect(run("kb-graph.ts", root, ["rank"]).stdout).not.toContain("Retired hub");
  expect(run("kb-graph.ts", root, ["rank", "--history"]).stdout).toContain("Retired hub");
});

test("kb-now owns the latest-unit marker and promptus-check rejects a stale marker", () => {
  const root = scaffold(true);
  const added = add(root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", "New evidence"], "result");
  const id = /\(id ([^)]+)\)/.exec(added.stdout)![1];
  const stale = run("promptus-check.ts", root);
  expect(stale.status).toBe(1);
  expect(stale.stdout).toContain("FAIL NOW freshness");
  const body = "### NOW\n<!-- kb:now-through fake -->\nFresh.\n\n### Open frontier\n- [ ] One edge.\n\n### Next actions\n1. Test.\n\n### <<< RESUME HERE >>>\nContinue.";
  expect(run("kb-now.ts", root, [], body).status).toBe(0);
  const ledger = readFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "utf8");
  expect(ledger.match(/<!-- kb:now-through /g)?.length).toBe(1);
  expect(ledger).toContain(`<!-- kb:now-through ${id} -->`);
  expect(run("promptus-check.ts", root).status).toBe(0);
});

test("promptus-check ratchet accepts inherited debt but rejects newly introduced debt", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "legacy.md"), "# Legacy\n\nold debt\n");
  expect(run("promptus-check.ts", root, ["--record-baseline"]).status).toBe(0);
  expect(run("promptus-check.ts", root, ["--ratchet"]).status).toBe(0);
  writeFileSync(join(root, ".promptus", "docs", "new-legacy.md"), "# New legacy\n\nnew debt\n");
  const result = run("promptus-check.ts", root, ["--ratchet"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("new unclassified");
  expect(result.stdout).toContain("new-legacy.md");
});

test("artifact dependencies verify existence and optional SHA-256 bytes", () => {
  const root = scaffold();
  mkdirSync(join(root, "results"));
  const receipt = join(root, "results", "receipt.json");
  writeFileSync(receipt, "{\"ok\":true}\n");
  const hash = createHash("sha256").update(readFileSync(receipt)).digest("hex");
  add(root, ["--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Artifact result", "--artifact", `receipt|results/receipt.json|${hash}`], "reproducible");
  expect(run("promptus-check.ts", root).status).toBe(0);
  writeFileSync(receipt, "{\"ok\":false}\n");
  const changed = run("promptus-check.ts", root);
  expect(changed.status).toBe(1);
  expect(changed.stdout).toContain("hash-mismatch");
});

test("thinker quarantine preserves bytes and provenance without promoting claims", () => {
  const root = scaffold();
  const input = join(root, "thinker.txt");
  const body = "# External thinker\n\nClaim: perhaps true.\n";
  writeFileSync(input, body);
  const dry = run("kb-ingest.ts", root, ["quarantine", "thinker.txt", "--source", "external-thinker:round-7", "--title", "Thinker round seven"]);
  expect(dry.status).toBe(0);
  expect(existsSync(join(root, ".promptus", "docs", "lit", "thinker-round-seven.md"))).toBe(false);
  const applied = run("kb-ingest.ts", root, ["quarantine", "thinker.txt", "--source", "external-thinker:round-7", "--title", "Thinker round seven", "--apply"]);
  expect(applied.stdout).toContain("No claims were extracted or validated");
  const stored = readFileSync(join(root, ".promptus", "docs", "lit", "thinker-round-seven.md"), "utf8");
  expect(stored).toContain("status: UNTRUSTED");
  expect(stored).toContain("source: \"external-thinker:round-7\"");
  expect(stored.endsWith(body)).toBe(true);
  expect(existsSync(join(root, ".promptus", "docs", "thinker-round-seven.md"))).toBe(false);
});

test("promptus-status gives grannie a deterministic one-screen orientation", () => {
  const root = scaffold(true);
  const result = run("promptus-status.ts", root, ["--json"]);
  expect(result.status).toBe(0);
  const status = JSON.parse(result.stdout);
  expect(status.northStar).toBe("Build explanations that remain honest.");
  expect(status.now).toBe("The gate is being tested.");
  expect(status.blocker).toBe("Prove the next boundary.");
  expect(status.next).toBe("Run the sealed test.");
  expect(status.resume).toBe("Resume from the receipt.");
});

test("new CLI surfaces provide --help without needing a project", () => {
  for (const script of ["kb-add.ts", "kb-find.ts", "kb-get.ts", "kb-graph.ts", "kb-ingest.ts", "kb-now.ts", "promptus-check.ts", "promptus-status.ts", "promptus-doctor.ts", "promptus-session-doctor.ts", "thinker-round.ts"]) {
    const result = run(script, null, ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("usage");
  }
});
