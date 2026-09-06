/** Bounded production acceptance on existing synthetic fixture construction; no live stores. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createFixture, SCRIPTS } from "./publication-fixture.ts";
import { cacheUsage, sha } from "../promptus/scripts/lib/parse-cache.ts";

const parent = mkdtempSync(join(tmpdir(), "organon-runtime-acceptance-"));
const rows: Array<{ arm: string; round: number; indexMs: number; phraseMs: number; getMs: number; outputHash: string; projections: string[] }> = [];
function run(root: string, enabled: boolean, script: string, args: string[]) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), "--root", root, ...args], {
    encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PROMPTUS_PARSE_CACHE_BYTES: enabled ? "16777216" : "0" },
  });
  if (result.status !== 0) throw Error(`${script} failed: ${result.stderr}`);
  return { ms: performance.now() - start, output: result.stdout };
}
try {
  const fixtures = [false, true].map(enabled => {
    const root = createFixture(parent, { runtime: "unused", runtimeHash: "production-acceptance", hashes: {} }, 512, 1024, 10);
    run(root, enabled, "kb-index.ts", []); return { root, enabled };
  });
  for (let round = 0; round < 3; round++) for (const fixture of round % 2 ? [...fixtures].reverse() : fixtures) {
    const path = join(fixture.root, ".promptus/docs/page-0.md");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original + `\nAcceptance update ${round}.\n`);
    const index = run(fixture.root, fixture.enabled, "kb-index.ts", []);
    const phrase = run(fixture.root, fixture.enabled, "kb-find.ts", ['"amber cobalt"']);
    const get = run(fixture.root, fixture.enabled, "kb-get.ts", [".promptus/docs/page-0.md"]);
    if (!get.output.includes(`Acceptance update ${round}`)) throw Error("exact fetch omitted committed source");
    rows.push({ arm: fixture.enabled ? "reuse" : "disabled", round, indexMs: index.ms, phraseMs: phrase.ms, getMs: get.ms,
      outputHash: sha(phrase.output), projections: ["CATALOG.md", "graph.json", "search.json"].map(name => sha(readFileSync(join(fixture.root, ".promptus/cache", name)))) });
  }
  for (let round = 0; round < 3; round++) {
    const pair = rows.filter(row => row.round === round);
    if (JSON.stringify(pair[0].projections) !== JSON.stringify(pair[1].projections) || pair[0].outputHash !== pair[1].outputHash) throw Error("canonical parity failed");
  }
  console.log(JSON.stringify({ schema: "organon.production-acceptance.v1", created: new Date().toISOString(),
    scope: "Three alternating updates per arm, 512 synthetic pages + 1024 ledger entries, OS-temp filesystem. Cache disabled vs production cache enabled. Not a live-project speedup or statistical benchmark.",
    sourceFiles: Object.fromEntries(["kb-index.ts", "kb-find.ts", "lib/parse-cache.ts", "lib/read-store.ts"].map(file => [file, sha(readFileSync(join(SCRIPTS, file)))])),
    rows, parity: true, parseCacheBytes: cacheUsage(fixtures[1].root).parseBytes }, null, 2));
} finally { rmSync(parent, { recursive: true, force: true }); }
