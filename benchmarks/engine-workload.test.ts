import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, rankingMetrics, syntheticSources, validateFixture } from "./engine-workload.ts";
import { openEngine } from "./engine-workload-adapters.ts";
const fixture = JSON.parse(readFileSync(join(import.meta.dir, "engine-workload-cases.json"), "utf8"));

test("frozen synthetic cases have explicit active relevance and deterministic scale", () => {
  validateFixture(fixture);
  const a = syntheticSources(fixture, 500), b = syntheticSources(fixture, 500);
  expect(a).toEqual(b); expect(a).toHaveLength(500);
  expect(new Set(a.map(d => d.id)).size).toBe(500);
  expect(a.every(d => d.status === "VALIDATED")).toBe(true);
  expect(() => syntheticSources(fixture, 1)).toThrow();
  const invalid = structuredClone(fixture); invalid.cases[0].relevant = ["u003"];
  expect(() => validateFixture(invalid)).toThrow("relevance");
});

test("workload metrics do not count absence candidates as false assertions", () => {
  const result = rankingMetrics([["x"], ["y"]], [{ id: "a", query: "a", kind: "semantic", relevant: ["x"] }, { id: "b", query: "b", kind: "absence", relevant: [] }]);
  expect(result.groups["all-positive"].top1).toBe(1);
  expect(result.groups["all-positive"].cases).toBe(1);
  expect(result.absence[0].candidateCount).toBe(1);
});

test("workload CLI rejects live-root and malformed engine requests", async () => {
  await expect(main(["--root", "/operator/project"])).rejects.toThrow("invalid argument");
  await expect(main(["--cold", "bad", "/tmp", "/tmp", "query"])).rejects.toThrow("invalid cold request");
});

for (const name of ["promptus-lexical", "sqlite-fts5"] as const) test(`${name} projection reopens and reflects edit/add/delete`, async () => {
  const root = mkdtempSync(join(tmpdir(), "organon-workload-test-"));
  mkdirSync(join(root, "units"));
  let engine;
  try {
    const source = syntheticSources(fixture, 30).find(d => d.id === "probe")!;
    writeFileSync(join(root, "units/probe.md"), source.text);
    engine = await openEngine(name, root, ""); await engine.update([source]);
    expect(await engine.query("apricotbranchomega")).toContain("probe");
    await engine.close(); engine = await openEngine(name, root, "");
    expect(await engine.query("apricotbranchomega")).toContain("probe");
    const changed = { ...source, text: "cobaltpressurezeta submarine" };
    writeFileSync(join(root, "units/probe.md"), changed.text); await engine.update([changed]);
    expect(await engine.query("cobaltpressurezeta")).toContain("probe");
    expect(await engine.query("apricotbranchomega")).not.toContain("probe");
    expect(await engine.indexedText("probe")).toContain("cobaltpressurezeta");
    expect(await engine.indexedText("probe")).not.toContain("apricotbranchomega");
    unlinkSync(join(root, "units/probe.md")); await engine.update([]);
    expect(await engine.query("cobaltpressurezeta")).toEqual([]);
    expect(await engine.indexedText("probe")).toBeNull();
  } finally { await engine?.close(); rmSync(root, { recursive: true, force: true }); }
});
