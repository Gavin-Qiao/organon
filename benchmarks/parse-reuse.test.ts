import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { COMPONENTS, controlPath, PATH_CAP, sha } from "./publication-fence.ts";
import { createFixture, SCRIPTS } from "./publication-fixture.ts";
import { stageReuseRuntime } from "./parse-reuse-stage.ts";
import { PARSE_CACHE } from "./parse-reuse.ts";
import { collectUnits } from "../promptus/scripts/lib/read-store.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";

const parent = mkdtempSync(join(tmpdir(), "organon-parse-test-"));
const runtime = stageReuseRuntime(parent);
const gate = await import(runtime.gate);
const lock = await import(join(runtime.runtime, "scripts/lib/store-lock.ts"));
afterAll(() => rmSync(parent, { recursive: true }));
const addArgs = (title: string, extra: string[] = []) => ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", title, "--json", ...extra];
function run(root: string, verb: string, args: string[] = [], fault = "", arm = "fenced") {
  const r = spawnSync(process.execPath, [runtime.cli, root, arm, verb, ...args], { encoding: "utf8", timeout: 40000,
    env: { ...process.env, ORGANON_PUBLICATION_METRICS: "0", ORGANON_PUBLICATION_FAULT: fault, ORGANON_PUBLICATION_CRASH: "0" } });
  let value: any; try { value = JSON.parse(r.stdout); } catch {}
  const stats = (r.stderr + "\n" + (value?.diagnostics ?? "")).split("\n").filter(s => s.startsWith("PARSE_REUSE ")).map(s => JSON.parse(s.slice(12)));
  return { ...r, value, stats };
}
function ok(root: string, verb: string, args: string[] = [], arm = "fenced") {
  const r = run(root, verb, args, "", arm);
  expect(r.status, r.stderr).toBe(0); return r;
}
function setup() { const root = createFixture(parent, runtime); ok(root, "index"); return root; }
function cache(root: string) { return JSON.parse(gunzipSync(readFileSync(join(root, ".promptus/cache", PARSE_CACHE))).toString()); }
function state(root: string) { return JSON.parse(readFileSync(controlPath(root), "utf8")); }
// Never force a candidate rebuild here: compare the actual incremental output first.
function parity(root: string) {
  const before = COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))));
  const raw = cache(root).entries.flatMap((e: any) => e.units);
  expect(raw).toEqual(JSON.parse(JSON.stringify(collectUnits(root, loadVocab(root)))));
  const source = hashStore(root).hash;
  ok(root, "index", [], "baseline");
  expect(COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))))).toEqual(before);
  expect(hashStore(root).hash).toBe(source);
}
function mutate(root: string, paths: string[], action: () => void) {
  gate.configure(root);
  lock.withStoreLock(root, () => { for (const path of paths) gate.beforeReplace(root, join(root, path)); action(); });
}
function replace(root: string, path: string, content: string) {
  gate.configure(root); lock.withStoreLock(root, () => lock.atomicStoreWrite(root, join(root, path), content));
}

test("parse candidate refuses the real checkout", () => expect(run(join(import.meta.dir, ".."), "index").status).not.toBe(0));
test("append reparses exactly the physical ledger including its preceding unit", () => {
  const root = setup(), old = cache(root).entries[0].units.at(-1).text;
  ok(root, "add", addArgs("First append")); ok(root, "add", addArgs("Second append"));
  const result = ok(root, "find", ["freshquartzsignal"]);
  expect(result.stats[0].filesParsed).toBe(1); expect(result.stats[0].filesReused).toBe(4);
  expect(result.stats[0].unitsParsed).toBe(10); expect(result.stats[0].sourceBytesRead).toBe(readFileSync(join(root, ".promptus/ledger/RESEARCH-LEDGER.md")).length);
  expect(cache(root).entries[0].units[7].text).not.toBe(old);
  expect(result.value.result.output).toContain("Second append"); parity(root);
});
test("effective supersession never contaminates raw cache and relation removal restores target", () => {
  const root = setup(), path = ".promptus/docs/page-1.md", file = join(root, path), original = readFileSync(file, "utf8");
  replace(root, path, original.replace("status: VALIDATED", "status: VALIDATED\nrelations: [supersedes:finding-page-0]"));
  const result = ok(root, "find", ["pageword0", "--status", "SUPERSEDED"]);
  expect(result.value.result.output).toContain("Synthetic page 0");
  expect(result.stats[0].filesReused).toBe(4);
  expect(cache(root).entries.flatMap((e: any) => e.units).find((u: any) => u.id === "finding-page-0").status).toBe("VALIDATED");
  parity(root);
  replace(root, path, original);
  expect(ok(root, "find", ["pageword0", "--status", "VALIDATED"]).value.result.output).toContain("Synthetic page 0"); parity(root);
});
test("amend reuses pages, publishes once, preserves alias and query contracts", () => {
  const root = setup();
  const result = ok(root, "amend", ["--path", ".promptus/docs/page-0.md", "--substrate", "finding", "--kind", "CLAIM", "--status", "REFUTED", "--alias", "new-alias"]);
  expect(result.stats[0].filesParsed).toBe(1); expect(result.stats[0].filesReused).toBe(4);
  expect(state(root).phase).toBe("CLEAN"); expect(ok(root, "find", ["amber"]).value.metrics.rebuilds).toBe(0);
  for (const args of [["\"Exact amber phrase\""], ["+amber +pageword0"], ["amber pageword0", "--all"], ["pageword0", "--status", "REFUTED"], ["pageword0", "--include-inactive", "--hops", "1"], ["pageword0", "--history"], ["new-alias"]])
    expect(ok(root, "find", args).value.result.output).toBe(ok(root, "find", args, "baseline").value.output);
  parity(root);
});
test("new, renamed, deleted and archived paths preserve original discovery and scope", () => {
  const root = setup(), old = ".promptus/docs/page-0.md", moved = ".promptus/docs/sub/moved.md", archived = ".promptus/docs/archive/moved.md";
  mkdirSync(join(root, ".promptus/docs/sub")); mkdirSync(join(root, ".promptus/docs/archive"));
  mutate(root, [old, moved], () => renameSync(join(root, old), join(root, moved)));
  ok(root, "find", ["pageword0"]); parity(root);
  mutate(root, [moved, archived], () => renameSync(join(root, moved), join(root, archived)));
  expect(ok(root, "find", ["pageword0"]).value.result.output).not.toContain("Synthetic page 0");
  expect(ok(root, "find", ["pageword0", "--history"]).value.result.output).toContain("Synthetic page 0"); parity(root);
  mutate(root, [archived], () => unlinkSync(join(root, archived)));
  ok(root, "find", ["amber"]); parity(root);
});
test("configuration changes invalidate reuse, nested stores retain longest ownership and order-sensitive lifecycle", () => {
  const root = setup(), vp = join(root, ".promptus/schema/kb-vocab.json"), vocab = JSON.parse(readFileSync(vp, "utf8"));
  vocab.substrates.custom = { ...vocab.substrates.finding, store: ".promptus/docs/custom" };
  vocab.relations.retire = { ...vocab.relations.supersedes, inverse_status: "REFUTED", inverse_status_by_substrate: { finding: "REFUTED" } };
  mkdirSync(join(root, ".promptus/docs/custom"));
  writeFileSync(join(root, ".promptus/docs/custom/first.md"), "---\nid: custom-first\nstatus: VALIDATED\nrelations: [retire:finding-page-0]\n---\n# Custom first\n");
  writeFileSync(join(root, ".promptus/docs/last.md"), "---\nid: custom-last\nstatus: VALIDATED\nrelations: [supersedes:finding-page-0]\n---\n# Later projected edge\n");
  writeFileSync(vp, JSON.stringify(vocab));
  const result = ok(root, "find", ["amber"]); expect(result.stats[0].filesReused).toBe(0); parity(root);
  expect(cache(root).entries.flatMap((e: any) => e.units).find((u: any) => u.id === "custom-first").substrate).toBe("custom");
  ok(root, "add", addArgs("Ordering reuse"));
  expect(ok(root, "find", ["amber"]).stats[0].filesReused).toBe(6); parity(root);
});
test("legacy identities, colliding aliases and fenced fake ledger headers survive CRLF reuse", () => {
  const root = setup(), ledger = ".promptus/ledger/RESEARCH-LEDGER.md";
  const page = ".promptus/docs/legacy.md";
  replace(root, page, "---\nstatus: VALIDATED\naliases: [legacy-page-0]\n---\n# Legacy no stable identity\nLegacy text.\n");
  replace(root, ledger, readFileSync(join(root, ledger), "utf8").replace("<!-- kb:append-point -->", "```\n### [2026-01-02 00:00:00] RESULT/VALIDATED — Fake header\n<!-- kb:id fake-id -->\n```\n<!-- kb:append-point -->").replaceAll("\n", "\r\n"));
  ok(root, "find", ["amber"]); parity(root);
  expect(cache(root).entries.flatMap((e: any) => e.units).some((u: any) => u.id === "fake-id")).toBe(false);
  ok(root, "add", addArgs("Reuse legacy")); ok(root, "find", ["amber"]); parity(root);
});
for (const fault of ["before-parse-cache", "after-parse-cache", "after-CATALOG.md", "after-search.json", "before-clean"]) {
  test(`interrupted ${fault} fails closed and retry performs full parsing`, () => {
    const root = setup(); ok(root, "add", addArgs("Cache interrupted", ["--supersedes", "finding-page-0"]));
    const source = hashStore(root).hash;
    expect(run(root, "find", ["amber"], fault).status).not.toBe(0); expect(state(root).phase).not.toBe("CLEAN");
    expect(hashStore(root).hash).toBe(source);
    const result = ok(root, "find", ["pageword0", "--status", "SUPERSEDED"]);
    expect(result.stats[0].filesReused).toBe(0); expect(result.value.result.output).toContain("Synthetic page 0"); parity(root);
  });
}
test("cache loss/corruption and runtime identity changes force complete reconstruction", () => {
  const root = setup(), path = join(root, ".promptus/cache", PARSE_CACHE);
  for (const action of [() => writeFileSync(path, "corrupt"), () => unlinkSync(path), () => {
    const markerPath = join(root, "fixture.json"), marker = JSON.parse(readFileSync(markerPath, "utf8")); marker.runtimeHash = "synthetic-code-change"; writeFileSync(markerPath, JSON.stringify(marker));
  }]) {
    action(); expect(ok(root, "find", ["amber"]).stats[0].filesReused).toBe(0); parity(root);
  }
});
test("dirty overflow falls back to full parse", () => {
  const root = setup();
  for (let i = 0; i <= PATH_CAP; i++) replace(root, `.promptus/docs/new-${i}.md`, `---\nstatus: VALIDATED\n---\n# Overflow ${i}\n`);
  expect(state(root).dirty).toBe("ALL"); expect(ok(root, "find", ["amber"]).stats[0].filesReused).toBe(0); parity(root);
});
test("outside body edit remains explicitly uncertified until forced reconciliation", () => {
  const root = setup(), path = join(root, ".promptus/docs/page-0.md"), text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace("pageword0", "newword00"));
  ok(root, "add", addArgs("Unrelated governed write"));
  const stale = ok(root, "find", ["pageword0"]);
  expect(stale.value.receipt.snapshotCertified).toBe(false); expect(stale.value.receipt.outsideEdits).toBe("unknown-unbounded");
  expect(stale.value.result.output).toContain("Synthetic page 0");
  expect(ok(root, "get", [".promptus/docs/page-0.md", "--expected-revision", sha(text)]).value.result.changedSinceSelection).toBe(true);
  expect(ok(root, "index").stats[0].filesReused).toBe(0);
  expect(ok(root, "find", ["newword00"]).value.result.output).toContain("Synthetic page 0"); parity(root);
});
test("source certification bypasses cache and preserves same-buffer source hash", () => {
  const root = setup(); ok(root, "add", addArgs("Certify"));
  const code = `const gate = await import(${JSON.stringify(runtime.gate)}); const {buildIndex} = await import(${JSON.stringify(join(runtime.runtime, "scripts/kb-index.ts"))}); gate.readThrough(${JSON.stringify(root)}, () => { if (buildIndex(["--root", ${JSON.stringify(root)}, "--quiet", "--source-hash"]).exitCode) throw Error("certification failed"); }, () => null);`;
  const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 40000 });
  expect(r.status, r.stderr).toBe(0);
  expect(r.stderr).toContain('"reason":"source-certification"'); expect(r.stderr).toContain('"filesReused":0');
  // The certified build adds sourceHash metadata; compare to the same canonical mode.
  const before = COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))));
  const b = spawnSync(process.execPath, [join(SCRIPTS, "kb-index.ts"), "--root", root, "--quiet", "--source-hash"], { encoding: "utf8" });
  expect(b.status).toBe(0); expect(COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))))).toEqual(before);
});
