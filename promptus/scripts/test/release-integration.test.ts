import { afterAll, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { collectUnits } from "../lib/read-store.ts";
import { loadVocab } from "../lib/vocab.ts";
import { cachedUnitText, createParseCache, evictParseCache, PARSE_CACHE, requireCacheSpace, sha } from "../lib/parse-cache.ts";
import { withStoreLock } from "../lib/store-lock.ts";
import { evidence } from "../kb-evidence.ts";
import { recoveryFor } from "../lib/diagnostics.ts";
import { applyUpgrade, upgradePlan } from "../promptus-upgrade.ts";
import { hashStore } from "../lib/store-hash.ts";

const scripts = join(import.meta.dir, ".."), roots: string[] = [];
afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "organon-release-test-")); roots.push(root);
  for (const dir of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(root, ".promptus", dir), { recursive: true });
  copyFileSync(join(scripts, "../templates/schema/kb-vocab.json"), join(root, ".promptus/schema/kb-vocab.json"));
  writeFileSync(join(root, ".promptus/TELOS.md"), "# Telos\n## North star\nPreserve evidence.\n");
  writeFileSync(join(root, ".promptus/ledger/RESEARCH-LEDGER.md"), `# Ledger
<!-- now:start -->
## NOW
<!-- kb:now-through EMPTY -->
Current.
## Open frontier
One bounded task.
## Next actions
Check source.
## <<< RESUME HERE >>>
Resume the task.
<!-- now:end -->
## Log
<!-- kb:append-point -->
`);
  writeFileSync(join(root, "AGENTS.md"), "# Custom policy\nDo not replace my instructions.\n");
  return root;
}
function page(root: string, name: string, body = "precise needle", extra = "", status = "VALIDATED") {
  const path = join(root, ".promptus/docs", name + ".md");
  writeFileSync(path, `---\nid: ${name}\nsubstrate: finding\nkind: CLAIM\nstatus: ${status}\n${extra}---\n# ${name}\n\n${body}\n`); return path;
}
function run(root: string, script: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [join(scripts, script), "--root", root, ...args], { encoding: "utf8", env: { ...process.env, PROMPTUS_PARSE_CACHE_BYTES: "16777216", ...env }, timeout: 15000 });
}
function receipt(root: string) {
  const parts: string[] = [];
  const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, e.name); if (e.isDirectory()) walk(file); else parts.push(relative(root, file) + sha(readFileSync(file)) + statSync(file).mtimeMs);
  } }; walk(root); return sha(parts.sort().join("\n"));
}
function projections(root: string) { return ["CATALOG.md", "search.json", "graph.json"].map(file => sha(readFileSync(join(root, ".promptus/cache", file)))); }

test("production parse reuse matches canonical projections and sees stat-preserving edits, moves and deletions", () => {
  const root = fixture(), path = page(root, "one"); page(root, "two");
  expect(run(root, "kb-index.ts").status).toBe(0);
  const first = projections(root), warm = run(root, "kb-index.ts", ["--cache-stats"]);
  expect(warm.status).toBe(0); expect(warm.stderr).toContain('"reused":3'); expect(projections(root)).toEqual(first);
  const prior = statSync(path); writeFileSync(path, readFileSync(path, "utf8").replace("precise needle", "changed value")); utimesSync(path, prior.atime, prior.mtime);
  const delta = run(root, "kb-index.ts", ["--cache-stats"]); expect(delta.status).toBe(0); expect(delta.stderr).toContain('"parsed":1');
  const updated = projections(root); expect(run(root, "kb-index.ts", ["--source-hash"]).status).toBe(0); expect(projections(root)).toEqual(updated);
  mkdirSync(join(root, ".promptus/docs/archive")); renameSync(path, join(root, ".promptus/docs/archive/one.md")); rmSync(join(root, ".promptus/docs/two.md"));
  expect(run(root, "kb-index.ts").status).toBe(0); const moved = projections(root);
  expect(run(root, "kb-index.ts", [], { PROMPTUS_PARSE_CACHE_BYTES: "0" }).status).toBe(0); expect(projections(root)).toEqual(moved);
});

test("raw statuses are cloned before lifecycle projection and cache loss/corruption falls back", () => {
  const root = fixture(); page(root, "old"); page(root, "new", "body", "relations: [supersedes:old]\n");
  run(root, "kb-index.ts"); const expected = projections(root);
  const cache = join(root, ".promptus/cache", PARSE_CACHE);
  writeFileSync(cache, "corrupt gzip"); expect(run(root, "kb-index.ts").status).toBe(0); expect(projections(root)).toEqual(expected);
  rmSync(cache); expect(run(root, "kb-index.ts").status).toBe(0); expect(projections(root)).toEqual(expected);
  const bytes = new Map<string, Buffer>(), raw = createParseCache(root, bytes), units = collectUnits(root, loadVocab(root), bytes, raw.reuse);
  expect(units.find(unit => unit.id === "old")?.status).toBe("VALIDATED");
});

test("phrase reuse validates current bytes and preserves same-second ledger slicing", () => {
  const root = fixture(), path = page(root, "one");
  const ledger = join(root, ".promptus/ledger/RESEARCH-LEDGER.md");
  writeFileSync(ledger, "### [2026-01-01 00:00:00] RESULT/VALIDATED — first\nalpha\n### [2026-01-01 00:00:00] RESULT/VALIDATED — second\nbeta\n");
  run(root, "kb-index.ts");
  const text = cachedUnitText(root);
  expect(text(".promptus/docs/one.md", "one")).toBe(readFileSync(path, "utf8"));
  expect(text(".promptus/ledger/RESEARCH-LEDGER.md#2026-01-01T00:00:00", "second")).toContain("beta");
  writeFileSync(path, readFileSync(path, "utf8").replace("precise needle", "outside edited"));
  expect(cachedUnitText(root)(".promptus/docs/one.md", "one")).toContain("outside edited");
  expect(run(root, "kb-find.ts", ['"precise needle"']).stdout).not.toContain("one.md");
  expect(run(root, "kb-find.ts", ['"outside edited"']).stdout).toContain("one.md");
});

test("quota refusal keeps canonical indexing and preview/eviction preserve source and unrelated files", () => {
  const root = fixture(); page(root, "one"); const source = hashStore(root);
  const r = run(root, "kb-index.ts", [], { PROMPTUS_PARSE_CACHE_BYTES: "1" });
  expect(r.status).toBe(0); expect(r.stderr).toContain("CACHE_QUOTA"); expect(existsSync(join(root, ".promptus/cache", PARSE_CACHE))).toBe(false);
  run(root, "kb-index.ts"); writeFileSync(join(root, ".promptus/cache/unrelated.txt"), "keep");
  const before = receipt(root), plan = evictParseCache(root); expect(plan.applied).toBe(false); expect(receipt(root)).toBe(before);
  const result = evictParseCache(root, true); expect(result.applied).toBe(true); expect(hashStore(root)).toEqual(source);
  expect(readFileSync(join(root, ".promptus/cache/unrelated.txt"), "utf8")).toBe("keep");
  expect(run(root, "kb-find.ts", ['"precise needle"']).status).toBe(0);
});

test("interrupted publication uses current source without repairing cache", () => {
  const root = fixture(); page(root, "one"); run(root, "kb-index.ts"); page(root, "two", "newly visible");
  writeFileSync(join(root, ".promptus/cache/index-state.json"), '{"phase":"writing"}'); const before = receipt(root);
  const r = run(root, "kb-find.ts", ["newly"]); expect(r.status).toBe(0); expect(r.stderr).toContain("INDEX_PUBLICATION_INCOMPLETE"); expect(r.stdout).toContain("two.md"); expect(receipt(root)).toBe(before);
});

test("insufficient replacement space and optional-cache write failures preserve the canonical fallback", () => {
  expect(() => requireCacheSpace(100, 1000, 99)).toThrow("CACHE_SPACE");
  expect(() => requireCacheSpace(100, 99, 1000)).toThrow("CACHE_QUOTA");
  expect(() => requireCacheSpace(100, 100, 100)).not.toThrow();
  const root = fixture(); page(root, "one"); const before = hashStore(root);
  mkdirSync(join(root, ".promptus/cache", PARSE_CACHE), { recursive: true });
  const r = run(root, "kb-index.ts"); expect(r.status).toBe(0); expect(r.stderr).toContain("CACHE_PATH_UNSAFE");
  expect(hashStore(root)).toEqual(before); expect(run(root, "kb-find.ts", ['"precise needle"']).stdout).toContain("one.md");
});

test("optional semantic resource preview is read-only and does not disguise uncapped third-party growth", () => {
  const root = fixture(); page(root, "one"); const before = receipt(root);
  // kb-semantic requires the action before flags, unlike positional-query scripts.
  const direct = spawnSync(process.execPath, [join(scripts, "kb-semantic.ts"), "preview", "--root", root], { encoding: "utf8" });
  expect(direct.status).toBe(0); const report = JSON.parse(direct.stdout);
  expect(report.bounded).toBe(false); expect(report.databaseAndModelGrowthBytes).toBeNull(); expect(report.projectedMarkdownBytes).toBeGreaterThan(0);
  expect(receipt(root)).toBe(before);
});

test("cache eviction refuses redirected files and writer contention is not silently cleared", () => {
  const root = fixture(); page(root, "one"); run(root, "kb-index.ts");
  const file = join(root, ".promptus/cache", PARSE_CACHE); rmSync(file);
  if (process.platform !== "win32") { symlinkSync(join(root, "AGENTS.md"), file); expect(() => evictParseCache(root, true)).toThrow("CACHE_PATH_UNSAFE"); rmSync(file); }
  const lock = join(root, ".promptus/cache/.locks/store.lock"); writeFileSync(lock, '{"pid":123}');
  expect(() => withStoreLock(root, () => {}, { timeoutMs: 1 })).toThrow("timed out"); expect(existsSync(lock)).toBe(true);
});

test("evidence navigation preserves replacement/refutation status, source bodies and missing-artifact diagnostics", () => {
  const root = fixture(); page(root, "old"); page(root, "new", "current", "relations: [supersedes:old]\n");
  page(root, "support", "reported result", "relations: [supports:old]\nartifacts: [data|missing.csv|-]\n", "REFUTED");
  const before = receipt(root), r = evidence(root, "old", { bodies: true });
  expect(r.cards.find(card => card.id === "old")?.status).toBe("SUPERSEDED");
  expect(r.cards.find(card => card.id === "support")?.status).toBe("REFUTED");
  expect(r.cards.find(card => card.id === "new")?.body).toContain("current");
  expect(r.issues[0].code).toBe("EVIDENCE_ARTIFACT_FAILED"); expect(receipt(root)).toBe(before);
  expect(() => evidence(root, "absent")).toThrow("EVIDENCE_UNKNOWN");
  page(root, "alias-one", "body", "aliases: [collision]\n"); page(root, "alias-two", "body", "aliases: [collision]\n");
  expect(() => evidence(root, "collision")).toThrow("IDENTITY_AMBIGUOUS");
});

test("evidence OPEN and body budgets are explicit and do not fabricate unresolved questions", () => {
  const root = fixture(); page(root, "one", "long body".repeat(20));
  const ledger = join(root, ".promptus/ledger/RESEARCH-LEDGER.md");
  writeFileSync(ledger, "### [2026-01-01 00:00:00] PLAN/OPEN — explicit work\n<!-- kb:id open-work -->\nInspect data.\n");
  const r = evidence(root, undefined, { open: true }); expect(r.cards.map(card => card.id)).toEqual(["open-work"]);
  const bounded = evidence(root, "one", { bodies: true, maxBytes: 1 }); expect(bounded.cards[0].body).toBeUndefined(); expect(bounded.cards[0].bodyState).toContain("over-budget");
});

test("diagnostics separate source evidence, identity, cache and optional runtime without automatic repairs", () => {
  const root = fixture();
  for (const [code, surface] of [["CACHE_STALE", "derived-retrieval"], ["ARTIFACTS_FAIL_NOW", "evidence"], ["SEARCH_KEY_COLLISION", "identity"], ["SEMANTIC_UNAVAILABLE", "optional-retrieval"]]) {
    const r = recoveryFor(code, root); expect(r.surface).toBe(surface); expect(r.automaticRepair).toBe(false); expect(r.paths.length).toBeGreaterThan(0);
  }
  const before = receipt(root), r = run(root, "promptus-session-doctor.ts", ["--json"]); expect(r.status).toBe(1);
  expect(JSON.parse(r.stdout).issues.find((issue: any) => issue.code === "CACHE_MISSING").recovery).toContain("promptus-check"); expect(receipt(root)).toBe(before);
});

test("upgrade preview is byte/mtime read-only, requires exact targets and refuses uninstalled/changed plans", () => {
  const root = fixture(); page(root, "one"); run(root, "promptus-check.ts", ["--strict"]);
  const before = receipt(root), plan = upgradePlan(root); expect(plan.installationRequired).toBe(true); expect(receipt(root)).toBe(before);
  expect(() => applyUpgrade(root, undefined, plan.planToken)).toThrow("UPGRADE_INSTALL_REQUIRED");
  expect(() => upgradePlan(join(root, ".promptus/docs"))).toThrow("UPGRADE_TARGET_NOT_EXACT");
  page(root, "two"); expect(() => applyUpgrade(root, undefined, plan.planToken)).toThrow("UPGRADE_PLAN_CHANGED");
});

test("authorized derived adoption is repeatable and preserves custom policy and scientific source", () => {
  const root = fixture(); page(root, "one"); run(root, "promptus-check.ts", ["--strict"]);
  // Explicitly use this source package as the installed fixture; no host cache is touched.
  const plugin = join(scripts, ".."), before = hashStore(root), policy = readFileSync(join(root, "AGENTS.md"));
  const plan = upgradePlan(root, plugin), first = applyUpgrade(root, plugin, plan.planToken);
  expect(first.ok).toBe(true); const again = upgradePlan(root, plugin); expect(applyUpgrade(root, plugin, again.planToken).ok).toBe(true);
  expect(hashStore(root)).toEqual(before); expect(readFileSync(join(root, "AGENTS.md")).equals(policy)).toBe(true);
  page(root, "broken", "body", "artifacts: [data|absent.bin|-]\n");
  const broken = upgradePlan(root, plugin);
  // A fresh source dependency can be absent from a stale cache: strict maintenance catches it.
  const applied = applyUpgrade(root, plugin, broken.planToken); expect(applied.ok).toBe(false); expect(applied.partialFailure).toBe(true);
});
