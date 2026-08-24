import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cosineSimilarity, documentChunks, evaluateRankings, reciprocalRankFusion,
} from "./promptus-retrieval.ts";

test("cosineSimilarity ranks aligned vectors above orthogonal vectors", () => {
  expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
  expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
});

test("documentChunks keeps the asymmetric prefix and byte-bounds every passage", () => {
  const chunks = documentChunks(
    { key: "finding-1", title: "A useful title" },
    `---\nstatus: VALIDATED\n---\n# A useful title\n\n${"paragraph words 漢字 ".repeat(40)}`,
    140,
    "passage: ",
  );
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((chunk) => chunk.text.startsWith("passage: A useful title\n"))).toBe(true);
  expect(chunks.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= 140)).toBe(true);
});

test("reciprocalRankFusion rewards agreement while retaining semantic-only candidates", () => {
  const fused = reciprocalRankFusion([["a", "b"], ["b", "c"]], 1);
  expect(fused[0]).toBe("b");
  expect(fused).toContain("c");
});

test("evaluateRankings reports recall, reciprocal rank, and lifecycle contamination", () => {
  const documents = new Map([
    ["a", { status: "VALIDATED" }],
    ["b", { status: "SUPERSEDED" }],
    ["c", { status: "VALIDATED" }],
  ]);
  const metrics = evaluateRankings([["b", "a"], ["c", "a"]], [new Set(["a"]), new Set(["c"])], documents);
  expect(metrics.recallAt5).toBe(1);
  expect(metrics.recallAt10).toBe(1);
  expect(metrics.mrr).toBeCloseTo(0.75);
  expect(metrics.inactiveAt10).toBeCloseTo(0.25);
});

test("dry-run exercises an indexed live corpus without a key, network, or cache write", () => {
  const repo = join(import.meta.dir, "..");
  const searchPath = join(repo, ".promptus", "cache", "search.json");
  const indexed = spawnSync(process.execPath, [
    join(repo, "promptus", "scripts", "kb-index.ts"), "--root", repo,
  ], { cwd: repo, encoding: "utf8" });
  expect(indexed.status).toBe(0);
  const before = readFileSync(searchPath);
  const result = spawnSync(process.execPath, [
    join(import.meta.dir, "promptus-retrieval.ts"), "--dry-run", "--root", repo,
  ], {
    cwd: repo,
    env: { ...process.env, OPENROUTER_API_KEY: "" },
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Promptus retrieval benchmark");
  expect(result.stdout).toContain("No network calls or files were written.");
  expect(result.stderr).toBe("");
  expect(readFileSync(searchPath)).toEqual(before);
});
