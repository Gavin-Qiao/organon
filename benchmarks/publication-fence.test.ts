import { afterAll, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, utimesSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPONENTS, controlPath, PATH_CAP, sha } from "./publication-fence.ts";
import { createFixture, stageRuntime } from "./publication-fixture.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";

const parent = mkdtempSync(join(tmpdir(), "organon-publication-test-"));
const runtime = stageRuntime(parent);
afterAll(() => rmSync(parent, { recursive: true, force: true }));
const cli = join(import.meta.dir, "publication-cli.ts");
const addArgs = (title: string, extra: string[] = []) => ["--substrate", "ledger", "--kind", "RESULT", "--status", "VALIDATED", "--title", title, "--json", ...extra];
function run(root: string, verb: string, args: string[] = [], arm = "fenced", fault = "", crash = false) {
  const r = spawnSync(process.execPath, [cli, root, arm, verb, ...args], { encoding: "utf8", timeout: 40000,
    env: { ...process.env, ORGANON_PUBLICATION_FAULT: fault, ORGANON_PUBLICATION_CRASH: crash ? "1" : "0" } });
  let value: any;
  try { value = JSON.parse(r.stdout); } catch { /* failed invocations have no result */ }
  return { ...r, value };
}
function ok(root: string, verb: string, args: string[] = [], arm = "fenced") {
  const r = run(root, verb, args, arm);
  expect(r.stderr).toBe(""); expect(r.status).toBe(0); return r.value;
}
function setup() { const root = createFixture(parent, runtime); ok(root, "index"); return root; }
function state(root: string) { return JSON.parse(readFileSync(controlPath(root), "utf8")); }
function parity(root: string) {
  ok(root, "index");
  const before = COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))));
  ok(root, "index", [], "baseline");
  expect(COMPONENTS.map(f => sha(readFileSync(join(root, ".promptus/cache", f))))).toEqual(before);
}

test("scope guard refuses the real checkout", () => {
  expect(run(join(import.meta.dir, ".."), "index").status).not.toBe(0);
});
test("fresh process consumes acknowledged append and fetches exact new/previous ledger units", () => {
  const root = setup(), before = ok(root, "get", [".promptus/ledger/RESEARCH-LEDGER.md#2026-01-01T00:00:07"]).result.body;
  const added = ok(root, "add", addArgs("Visibility probe"));
  expect(added.diagnostics).toContain('"acknowledged":true');
  expect(state(root).phase).toBe("DIRTY");
  expect(state(root).dirty).toEqual([".promptus/ledger/RESEARCH-LEDGER.md"]);
  const found = ok(root, "find", ["freshquartzsignal"]);
  expect(found.result.output).toContain("Visibility probe"); expect(found.metrics.rebuilds).toBe(1);
  const card = found.result.output.split("\n").find((s: string) => s.includes("Visibility probe"));
  const path = card.split(" · ")[2];
  expect(ok(root, "get", [path, "--title", "Visibility probe"]).result.body).toContain("freshquartzsignal");
  expect(ok(root, "get", [".promptus/ledger/RESEARCH-LEDGER.md#2026-01-01T00:00:07"]).result.body).not.toBe(before);
  parity(root);
});
test("unchanged target gets lifecycle projection; production lookup now detects stale publication", () => {
  const root = setup();
  ok(root, "add", addArgs("Replace old result", ["--supersedes", "finding-page-0"]));
  expect(ok(root, "find", ["pageword0", "--status", "VALIDATED"], "baseline").output).not.toContain("Synthetic page 0");
  expect(ok(root, "find", ["pageword0", "--status", "VALIDATED"]).result.output).not.toContain("Synthetic page 0");
  expect(ok(root, "find", ["pageword0", "--status", "SUPERSEDED"]).result.output).toContain("Synthetic page 0");
  parity(root);
});
test("metadata amendment preserves bodies and alias/exact query contracts", () => {
  const root = setup(), file = join(root, ".promptus/docs/page-0.md");
  const body = readFileSync(file, "utf8").split("# Synthetic")[1];
  ok(root, "amend", ["--path", ".promptus/docs/page-0.md", "--substrate", "finding", "--kind", "CLAIM", "--status", "REFUTED", "--alias", "new-alias"]);
  expect(readFileSync(file, "utf8").split("# Synthetic")[1]).toBe(body);
  expect(readFileSync(file, "utf8")).toContain("new-alias");
  expect(state(root).phase).toBe("CLEAN");
  expect(ok(root, "find", ["pageword0"]).metrics.rebuilds).toBe(0);
  for (const args of [["\"Exact amber phrase\""], ["+amber +pageword0"], ["amber pageword0", "--all"], ["pageword0", "--status", "REFUTED"], ["pageword0", "--include-inactive", "--hops", "1"], ["pageword0", "--history"], ["new-alias"]]) {
    expect(ok(root, "find", args).result.output).toBe(ok(root, "find", args, "baseline").output);
  }
  parity(root);
});

for (const fault of ["before-intent", "after-intent", "before-path-intent", "after-source-temp", "after-source-rename", "before-ack"]) {
  test(`write cut ${fault} never acknowledges and source remains recoverable`, () => {
    const root = setup(), before = hashStore(root).hash;
    const failed = run(root, "add", addArgs(`Fault ${fault}`), "fenced", fault);
    expect(failed.status).not.toBe(0); expect(failed.stderr).not.toContain('"acknowledged":true');
    if (["after-source-rename", "before-ack"].includes(fault)) expect(hashStore(root).hash).not.toBe(before);
    else expect(hashStore(root).hash).toBe(before);
    if (fault !== "before-intent") expect(state(root).phase).not.toBe("CLEAN");
    parity(root);
  });
}
for (const fault of ["before-publishing", "after-CATALOG.md", "after-graph.json", "after-search.json", "before-clean"]) {
  test(`publication cut ${fault} refuses a mixed generation and retries safely`, () => {
    const root = setup(); ok(root, "add", addArgs("Publication interruption", ["--supersedes", "finding-page-0"]));
    const source = hashStore(root).hash;
    const failed = run(root, "find", ["pageword0"], "fenced", fault);
    expect(failed.status).not.toBe(0); expect(state(root).phase).not.toBe("CLEAN");
    expect(hashStore(root).hash).toBe(source);
    expect(ok(root, "find", ["pageword0", "--status", "SUPERSEDED"]).result.output).toContain("Synthetic page 0");
    parity(root);
  });
}
test("killed source writer leaves exact lease; verified dead owner can be cleared without deleting cache", () => {
  const root = setup();
  expect(run(root, "add", addArgs("Killed writer"), "fenced", "after-source-rename", true).status).not.toBe(0);
  const lock = join(root, ".promptus/cache/.locks/store.lock"), lease = readFileSync(lock, "utf8"), owner = JSON.parse(lease);
  expect(() => process.kill(owner.pid, 0)).toThrow();
  expect(run(root, "find", ["freshquartzsignal"]).status).not.toBe(0);
  expect(readFileSync(lock, "utf8")).toBe(lease);
  unlinkSync(lock); // exact fixture owner is confirmed dead above
  expect(ok(root, "find", ["freshquartzsignal"]).result.output).toContain("Killed writer");
  parity(root);
});
test("corrupt/missing control and components reconstruct from source; corrupt control changes epoch", () => {
  const root = setup(), source = hashStore(root).hash, epoch = state(root).epoch;
  writeFileSync(controlPath(root), "{broken");
  ok(root, "find", ["amber"]); expect(state(root).epoch).not.toBe(epoch);
  for (const component of COMPONENTS) {
    writeFileSync(join(root, ".promptus/cache", component), "corrupt");
    expect(ok(root, "find", ["amber"]).metrics.rebuilds).toBe(1);
    unlinkSync(join(root, ".promptus/cache", component));
    expect(ok(root, "find", ["amber"]).metrics.rebuilds).toBe(1);
  }
  unlinkSync(controlPath(root)); ok(root, "find", ["amber"]);
  expect(hashStore(root).hash).toBe(source);
  expect(existsSync(join(root, ".promptus/cache/.locks/store.lock"))).toBe(false);
});
test("dirty map coalesces, overflows to ALL, and has no per-write history", () => {
  const root = createFixture(parent, runtime, PATH_CAP + 2); ok(root, "index");
  for (let i = 0; i < PATH_CAP + 2; i++) ok(root, "add", ["--title", `Dirty page ${i}`, "--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--json"]);
  expect(state(root).dirty).toBe("ALL");
  expect(statSync(controlPath(root)).size).toBeLessThan(1500);
  expect(ok(root, "find", ["amber"]).metrics.rebuilds).toBe(1);
  expect(state(root).dirty).toEqual([]);
});
test("outside same-metadata edit and unseen supersession do not obtain global freshness", () => {
  const root = setup(), file = join(root, ".promptus/docs/page-0.md"), old = readFileSync(file, "utf8"), stat = statSync(file);
  writeFileSync(file, old.replace("pageword0", "newword00")); utimesSync(file, stat.atime, stat.mtime);
  writeFileSync(join(root, ".promptus/docs/outside.md"), "---\nid: outside-superseder\nstatus: VALIDATED\nrelations: [supersedes:finding-page-0]\n---\n# Outside evidence\n");
  const observed = ok(root, "find", ["pageword0", "--status", "VALIDATED"]);
  expect(observed.receipt.outsideEdits).toBe("unknown-unbounded"); expect(observed.receipt.snapshotCertified).toBe(false);
  expect(observed.result.output).toContain("Synthetic page 0"); // intentional limit, not an absence/freshness certificate
  const fetched = ok(root, "get", [".promptus/docs/page-0.md", "--expected-revision", sha(old)]).result;
  expect(fetched.changedSinceSelection).toBe(true);
  expect(fetched.body).toContain("newword00"); expect(fetched.sourceSha256).toBe(sha(readFileSync(file)));
  ok(root, "index");
  expect(ok(root, "find", ["newword00", "--status", "SUPERSEDED"]).result.output).toContain("Synthetic page 0");
  unlinkSync(join(root, ".promptus/docs/outside.md")); ok(root, "index");
  expect(ok(root, "find", ["newword00", "--status", "VALIDATED"]).result.output).toContain("Synthetic page 0");
  mkdirSync(join(root, ".promptus/docs/archive")); renameSync(file, join(root, ".promptus/docs/archive/page-0.md")); ok(root, "index");
  expect(ok(root, "find", ["newword00"]).result.output).not.toContain("Synthetic page 0");
  expect(ok(root, "find", ["newword00", "--history"]).result.output).toContain("Synthetic page 0");
  parity(root);
});

test("eager amendment publication failure remains dirty and cannot acknowledge", () => {
  const root = setup();
  const result = run(root, "amend", ["--path", ".promptus/docs/page-0.md", "--substrate", "finding", "--kind", "CLAIM", "--status", "REFUTED"], "fenced", "before-clean");
  expect(result.status).not.toBe(0); expect(result.stderr).not.toContain('"acknowledged":true');
  expect(state(root).phase).not.toBe("CLEAN");
  expect(ok(root, "find", ["pageword0", "--status", "REFUTED"]).result.output).toContain("Synthetic page 0");
});
test("quiescent whole-cache loss changes epoch without changing source", () => {
  const root = setup(), oldEpoch = state(root).epoch, source = hashStore(root).hash;
  expect(existsSync(join(root, ".promptus/cache/.locks/store.lock"))).toBe(false);
  rmSync(join(root, ".promptus/cache"), { recursive: true }); // generated fixture, no actor alive
  const read = ok(root, "find", ["amber"]);
  expect(read.receipt.epoch).not.toBe(oldEpoch); expect(read.metrics.rebuilds).toBe(1);
  expect(hashStore(root).hash).toBe(source);
});
test("interrupted multi-file memory addition reports failure, preserves actual prefix, never retries blindly", () => {
  const root = setup(), index = join(root, ".promptus/memory/MEMORY.md"), before = readFileSync(index, "utf8");
  const args = ["--substrate", "memory", "--kind", "project", "--status", "validated", "--title", "Partial memory probe", "--json"];
  const failure = run(root, "add", args, "fenced", "after-source-rename");
  expect(failure.status).not.toBe(0); expect(readFileSync(index, "utf8")).toBe(before);
  expect(existsSync(join(root, ".promptus/memory/partial-memory-probe.md"))).toBe(true);
  expect(ok(root, "find", ["freshquartzsignal"]).result.output).toContain("Partial memory probe");
  const source = hashStore(root).hash;
  expect(run(root, "add", args).status).not.toBe(0); expect(hashStore(root).hash).toBe(source);
});

test("concurrent fresh writers/readers share the lease without losing acknowledged units", async () => {
  const root = setup();
  function concurrent(verb: string, args: string[]) {
    return new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, root, "fenced", verb, ...args], { env: { ...process.env, ORGANON_PUBLICATION_FAULT: "", ORGANON_PUBLICATION_CRASH: "0" } });
      let output = "", error = "";
      child.stdout.on("data", d => output += String(d)); child.stderr.on("data", d => error += String(d));
      child.on("error", reject); child.on("close", code => resolve({ code, output, error }));
    });
  }
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => Promise.all([
    concurrent("add", addArgs(`Concurrent fence ${i}`)), concurrent("find", ["amber"]),
  ])));
  for (const pair of results) for (const r of pair) { expect(r.error).toBe(""); expect(r.code).toBe(0); }
  const found = ok(root, "find", ["freshquartzsignal"]).result.output;
  for (let i = 0; i < 6; i++) expect(found).toContain(`Concurrent fence ${i}`);
  expect(state(root).ticket).toBe(6);
  parity(root);
});
