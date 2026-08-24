/** Regression contracts for the read-only session doctor. */
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const PROMPTUS = join(import.meta.dir, "..", "..");
const SCRIPTS = join(PROMPTUS, "scripts");
const VOCAB = join(PROMPTUS, "templates", "schema", "kb-vocab.json");
const roots: string[] = [];

afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const NOW = `# Research Ledger — session doctor

**Updated:** 2000-01-01 · **Operator:** test

<!-- now:start -->
## NOW
<!-- kb:now-through EMPTY -->
The current state is recorded.

## Open frontier
- [ ] Close one edge.

## Next actions
1. Run one check.

## <<< RESUME HERE >>>
Resume from the latest receipt.
<!-- now:end -->

## Log

<!-- kb:append-point -->
`;

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-session-doctor-"));
  roots.push(root);
  for (const path of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(root, ".promptus", path), { recursive: true });
  copyFileSync(VOCAB, join(root, ".promptus", "schema", "kb-vocab.json"));
  writeFileSync(join(root, ".promptus", "TELOS.md"), "# Telos — test\n\n## North star\nKeep the session honest.\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), NOW);
  writeFileSync(join(root, ".promptus", "memory", "MEMORY.md"), "# Memory\n\n<!-- kb:append-point -->\n");
  return root;
}

function run(script: string, root: string, args: string[] = [], input = "") {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), "--root", root, ...args], { input, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function add(root: string, title: string) {
  return run("kb-add.ts", root, ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", title], `${title} body`);
}

function now(root: string, resume = "Resume from the latest receipt.") {
  const body = `## NOW\nCurrent.\n\n## Open frontier\n- [ ] One edge.\n\n## Next actions\n1. One action.\n\n## <<< RESUME HERE >>>\n${resume}`;
  return run("kb-now.ts", root, [], body);
}

function check(root: string) { return run("promptus-check.ts", root); }
function doctor(root: string, args: string[] = ["--json"]) { return run("promptus-session-doctor.ts", root, args); }

function allFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function treeReceipt(root: string): string {
  const base = join(root, ".promptus");
  const hash = createHash("sha256");
  for (const path of allFiles(base).sort()) {
    hash.update(relative(base, path).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update(String(statSync(path).mtimeMs));
  }
  return hash.digest("hex");
}

test("a fresh complete store is ready and the doctor writes no bytes", () => {
  const root = scaffold();
  expect(add(root, "Fresh evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const before = treeReceipt(root);
  const result = doctor(root);
  const after = treeReceipt(root);
  expect(result.status).toBe(0);
  expect(after).toBe(before);
  const report = JSON.parse(result.stdout);
  expect(report.schema).toBe("promptus.session-doctor.v1");
  expect(report.readOnly).toBe(true);
  expect(report.sessionReady).toBe(true);
  expect(report.handoff.fresh).toBe(true);
  expect(report.cache.catalogCoverage.missing).toBe(0);
  expect(report.cache.searchCoverage.missing).toBe(0);
  expect(report.guarantee).toContain("No files were written");
});

test("a post-receipt ledger write blocks stale handoff and retrieval", () => {
  const root = scaffold();
  expect(add(root, "Indexed evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  expect(add(root, "Unindexed evidence").status).toBe(0);
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.sessionReady).toBe(false);
  expect(report.handoff.fresh).toBe(false);
  expect(report.cache.healthFingerprintMatches).toBe(false);
  expect(report.cache.searchCoverage.missing).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("HANDOFF_STALE");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("CACHE_STALE");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("SEARCH_SOURCE_LAG");
});

test("a title containing the visual catalog delimiter is diagnosed without false lag", () => {
  const root = scaffold();
  expect(add(root, "Evidence · with · separators").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const result = doctor(root);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.sessionReady).toBe(true);
  expect(report.cache.catalogCoverage.missing).toBe(0);
  expect(report.cache.delimiterCollisions.count).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("CATALOG_DELIMITER_COLLISION");
});

test("coverage includes live finding, literature, and memory units rather than only ledger entries", () => {
  const root = scaffold();
  expect(add(root, "Indexed evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  writeFileSync(join(root, ".promptus", "docs", "unindexed.md"), `---\nid: finding-unindexed\nsubstrate: finding\nkind: RESULT\nstatus: VALIDATED\n---\n# Unindexed finding\n`);
  writeFileSync(join(root, ".promptus", "docs", "lit", "unindexed-lit.md"), `---\nid: lit-unindexed\nsubstrate: lit\nkind: PAPER\nstatus: CITE\nsource: test:1\n---\n# Unindexed literature\n`);
  writeFileSync(join(root, ".promptus", "memory", "unindexed-memory.md"), `---\nid: memory-unindexed\nsubstrate: memory\nkind: FACT\nstatus: validated\nname: Unindexed memory\n---\n# Unindexed memory\n`);
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.scale.liveSourceUnits).toBe(report.scale.catalogUnits + 3);
  expect(report.cache.catalogCoverage.missing).toBe(3);
  expect(report.cache.searchCoverage.missing).toBe(3);
  expect(report.cache.catalogCoverage.missingSample.map((item: { id: string }) => item.id).sort()).toEqual([
    "finding-unindexed", "lit-unindexed", "memory-unindexed",
  ]);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("CATALOG_SOURCE_LAG");
});

test("stable-ID mismatches cannot pass by matching only path and title", () => {
  const root = scaffold();
  expect(run("kb-add.ts", root, ["--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Identity evidence"], "body").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const catalogPath = join(root, ".promptus", "cache", "CATALOG.md");
  const searchPath = join(root, ".promptus", "cache", "search.json");
  const catalog = readFileSync(catalogPath, "utf8").replace(/(Identity evidence .*? id:)\S+/, "$1tampered-id");
  writeFileSync(catalogPath, catalog);
  const search = JSON.parse(readFileSync(searchPath, "utf8"));
  const document = search.documents.find((item: { title: string }) => item.title === "Identity evidence");
  document.id = "tampered-id";
  search.catalogHash = createHash("sha256").update(catalog).digest("hex");
  writeFileSync(searchPath, JSON.stringify(search) + "\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.cache.catalogCoverage.identityMismatches).toBe(1);
  expect(report.cache.searchCoverage.identityMismatches).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("CATALOG_IDENTITY_MISMATCH");
});

test("an unknown lexical-index schema blocks retrieval even when hashes match", () => {
  const root = scaffold();
  expect(add(root, "Evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const searchPath = join(root, ".promptus", "cache", "search.json");
  const search = JSON.parse(readFileSync(searchPath, "utf8"));
  search.schema = "promptus.lexical-search.future";
  writeFileSync(searchPath, JSON.stringify(search) + "\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.cache.searchSchemaValid).toBe(false);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("SEARCH_SCHEMA_INVALID");
});

test("legacy same-second ledger units keep distinct retrieval identities", () => {
  const root = scaffold();
  const ledger = join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
  const twins = [
    "### [1999-01-01 00:00:00] RESULT/VALIDATED — Legacy first twin",
    "legacytwinkey first body",
    "",
    "### [1999-01-01 00:00:00] RESULT/VALIDATED — Legacy second twin",
    "legacytwinkey second body",
    "",
  ].join("\n");
  writeFileSync(ledger, readFileSync(ledger, "utf8").replace("<!-- kb:append-point -->", `${twins}\n<!-- kb:append-point -->`));
  expect(add(root, "Current evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);

  const search = JSON.parse(readFileSync(join(root, ".promptus", "cache", "search.json"), "utf8"));
  const legacy = search.documents.filter((item: { title: string }) => item.title.startsWith("Legacy "));
  expect(search.schema).toBe("promptus.lexical-search.v2");
  expect(legacy).toHaveLength(2);
  expect(new Set(legacy.map((item: { key: string }) => item.key)).size).toBe(2);

  const found = run("kb-find.ts", root, ["legacytwinkey", "--all", "--limit", "10"]);
  expect(found.status).toBe(0);
  expect(found.stdout).toContain("Legacy first twin");
  expect(found.stdout).toContain("Legacy second twin");

  const result = doctor(root);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).cache.searchKeys.liveCollisions).toBe(0);

  // An updater may encounter the unreleased v1 cache. kb-find must rebuild it
  // in memory instead of trusting the timestamp-only keys; the read-only doctor
  // still asks for a durable re-index before declaring the session ready.
  search.schema = "promptus.lexical-search.v1";
  for (const item of legacy) item.key = item.path;
  writeFileSync(join(root, ".promptus", "cache", "search.json"), JSON.stringify(search) + "\n");
  const fallback = run("kb-find.ts", root, ["legacytwinkey", "--all", "--limit", "10"]);
  expect(fallback.stdout).toContain("Legacy first twin");
  expect(fallback.stdout).toContain("Legacy second twin");
  const stale = doctor(root);
  expect(stale.status).toBe(1);
  expect(JSON.parse(stale.stdout).issues.map((issue: { code: string }) => issue.code)).toContain("SEARCH_SCHEMA_INVALID");
});

test("colliding live search keys block silent kb-find result loss", () => {
  const root = scaffold();
  expect(run("kb-add.ts", root, ["--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED", "--title", "First keyed result"], "first").status).toBe(0);
  expect(run("kb-add.ts", root, ["--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED", "--title", "Second keyed result"], "second").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const searchPath = join(root, ".promptus", "cache", "search.json");
  const search = JSON.parse(readFileSync(searchPath, "utf8"));
  const first = search.documents.find((item: { title: string }) => item.title === "First keyed result");
  const second = search.documents.find((item: { title: string }) => item.title === "Second keyed result");
  second.key = first.key;
  writeFileSync(searchPath, JSON.stringify(search) + "\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.cache.searchKeys.liveCollisions).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("SEARCH_KEY_COLLISION");
});

test("cold-history Markdown is matched against the opt-in search surface", () => {
  const root = scaffold();
  const archive = join(root, ".promptus", "ledger", "archive");
  mkdirSync(archive, { recursive: true });
  writeFileSync(join(archive, "1999.md"), `### [1999-01-01 00:00:00] RESULT/VALIDATED — Archived evidence\n<!-- kb:id event-archived -->\ncold proof\n`);
  expect(add(root, "Live evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const fresh = doctor(root);
  expect(fresh.status).toBe(0);
  expect(JSON.parse(fresh.stdout).cache.coldSearchCoverage.missing).toBe(0);
  const searchPath = join(root, ".promptus", "cache", "search.json");
  const search = JSON.parse(readFileSync(searchPath, "utf8"));
  search.documents = search.documents.filter((item: { cold: boolean }) => !item.cold);
  writeFileSync(searchPath, JSON.stringify(search) + "\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.historyRetrievalReady).toBe(false);
  expect(report.cache.coldSearchCoverage.missing).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("SEARCH_COLD_SOURCE_LAG");
});

test("a recognized legacy Telos heading supplies orientation without pretending it is canonical", () => {
  const root = scaffold();
  const telosPath = join(root, ".promptus", "TELOS.md");
  writeFileSync(telosPath, readFileSync(telosPath, "utf8").replace("## North star", "## The end"));
  expect(add(root, "Evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const result = doctor(root);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.orientation.northStar).toBe("Keep the session honest.");
  expect(report.orientationSource.canonicalNorthStarHeading).toBe(false);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("TELOS_NORTH_STAR_LEGACY_HEADING");
});

test("a current health receipt is compared with the recorded no-new-debt baseline", () => {
  const root = scaffold();
  expect(add(root, "Evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(run("promptus-check.ts", root, ["--record-baseline"]).status).toBe(0);
  writeFileSync(join(root, ".promptus", "docs", "new-debt.md"), `---\nid: finding-new-debt\nsubstrate: finding\nkind: RESULT\nstatus: VALIDATED\nlinks: [missing-after-baseline]\n---\n# New graph debt\n`);
  expect(check(root).status).toBe(0);
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.ratchet.authoritative).toBe(true);
  expect(report.ratchet.newDebt.dangling.count).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("RATCHET_NEW_DEBT");
});

test("superseded artifact drift is an archival warning and does not block resume", () => {
  const root = scaffold();
  const badHash = "0".repeat(64);
  writeFileSync(join(root, "old-evidence.txt"), "changed historical bytes\n");
  const old = run("kb-add.ts", root, [
    "--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED",
    "--title", "Old evidence", "--artifact", `evidence|old-evidence.txt|${badHash}`,
  ], "historical result");
  expect(old.status).toBe(0);
  const oldId = /\(id ([^)]+)\)/.exec(old.stdout)?.[1];
  expect(oldId).toBeTruthy();
  expect(run("kb-add.ts", root, [
    "--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED",
    "--title", "Replacement evidence", "--supersedes", oldId!,
  ], "current replacement").status).toBe(0);
  expect(add(root, "Resume evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);

  const result = doctor(root, ["--json", "--artifacts"]);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.sessionReady).toBe(true);
  expect(report.healthReceipt.artifactFailures).toBe(0);
  expect(report.healthReceipt.archivalArtifactWarnings).toBe(1);
  expect(report.artifacts.failures).toBe(0);
  expect(report.artifacts.archivalWarnings).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("ARCHIVAL_ARTIFACT_DRIFT");
});

test("retired memory artifact drift is an archival warning and does not block resume", () => {
  const root = scaffold();
  const badHash = "0".repeat(64);
  writeFileSync(join(root, "memory-evidence.txt"), "changed historical memory bytes\n");
  const old = run("kb-add.ts", root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated",
    "--title", "Retired memory evidence", "--artifact", `evidence|memory-evidence.txt|${badHash}`,
  ], "historical memory result");
  expect(old.status).toBe(0);
  const oldId = /^id:\s*(\S+)$/m.exec(readFileSync(join(root, ".promptus", "memory", "retired-memory-evidence.md"), "utf8"))?.[1];
  expect(oldId).toBeTruthy();
  expect(run("kb-add.ts", root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated",
    "--title", "Replacement memory evidence", "--supersedes", oldId!,
  ], "current memory replacement").status).toBe(0);
  expect(add(root, "Resume retired memory evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);

  const result = doctor(root, ["--json", "--artifacts"]);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.sessionReady).toBe(true);
  expect(report.healthReceipt.artifactFailures).toBe(0);
  expect(report.healthReceipt.archivalArtifactWarnings).toBe(1);
  expect(report.artifacts.failures).toBe(0);
  expect(report.artifacts.archivalWarnings).toBe(1);
  expect(report.artifacts.outcomes["hash-mismatch"]).toBe(1);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("ARCHIVAL_ARTIFACT_DRIFT");
});

test("a live artifact recheck blocks resume when current evidence drifts after its receipt", () => {
  const root = scaffold();
  const artifact = join(root, "current-evidence.txt");
  writeFileSync(artifact, "sealed current bytes\n");
  const hash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  expect(run("kb-add.ts", root, [
    "--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED",
    "--title", "Current evidence", "--artifact", `evidence|current-evidence.txt|${hash}`,
  ], "current result").status).toBe(0);
  expect(add(root, "Resume current evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);

  writeFileSync(artifact, "drifted after the health receipt\n");
  const result = doctor(root, ["--json", "--artifacts"]);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.sessionReady).toBe(false);
  expect(report.artifacts.failures).toBe(1);
  expect(report.artifacts.archivalWarnings).toBe(0);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("ARTIFACTS_FAIL_NOW");
});

test("an empty resume field blocks a superficially fresh status", () => {
  const root = scaffold();
  expect(add(root, "Evidence").status).toBe(0);
  expect(now(root, "").status).toBe(0);
  expect(check(root).status).toBe(0);
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.handoff.fresh).toBe(true);
  expect(report.handoff.missingFields).toContain("resume");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("HANDOFF_INCOMPLETE");
});

test("duplicate append sentinels block a session even when NOW and cache are fresh", () => {
  const root = scaffold();
  expect(add(root, "Evidence").status).toBe(0);
  expect(now(root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const ledger = join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md");
  writeFileSync(ledger, readFileSync(ledger, "utf8") + "\n<!-- kb:append-point -->\nstray tail\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.handoff.appendSentinels.count).toBe(2);
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("LEDGER_SENTINEL_INVALID");
});

test("a legacy store without a north-star section, NOW markers, or cache fails closed", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "TELOS.md"), "# A legacy direction\n\nUseful prose without a canonical heading.\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "# Ledger\n\n<!-- kb:append-point -->\n");
  const result = doctor(root);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.orientation.northStar).toBe("");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("HANDOFF_MARKERS_INVALID");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("HANDOFF_INCOMPLETE");
  expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("CACHE_MISSING");
});

test("--help works outside a Promptus project", () => {
  const result = spawnSync(process.execPath, [join(SCRIPTS, "promptus-session-doctor.ts"), "--help"], { encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("read-only");
  expect(result.stdout).toContain("--artifacts");
});
