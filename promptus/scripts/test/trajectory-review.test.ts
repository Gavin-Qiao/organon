/** Bounded trajectory-review contracts: evidence, continuation, poison cases, and persistence. */
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { portablePath } from "../lib/trajectory-review.ts";

const PROMPTUS = join(import.meta.dir, "..", "..");
const SCRIPTS = join(PROMPTUS, "scripts");
const VOCAB = join(PROMPTUS, "templates", "schema", "kb-vocab.json");
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const ID = {
  a: "finding-20260101T000000Z-endeavour-a",
  b: "finding-20260101T000001Z-endeavour-b",
  positive: "finding-20260101T000002Z-positive-a",
  bStep: "event-20260101T000003Z-b-step",
  refuted: "finding-20260101T000004Z-refuted-a",
  dead: "event-20260101T000005Z-dead-a",
  old: "finding-20260101T000006Z-old-a",
  repair: "finding-20260101T000007Z-repair-a",
  open: "event-20260101T000008Z-open-a",
  thinker: "lit-20260101T000009Z-thinker-a",
  verified: "finding-20260101T000010Z-verified-a",
  bFinal: "event-20260101T000011Z-b-final",
};

interface Page {
  id: string;
  title: string;
  substrate?: "finding" | "lit" | "memory";
  kind?: string;
  status?: string;
  created?: string;
  relations?: string[];
  source?: string;
  artifacts?: string[];
  review?: { scope?: string; since?: string; through?: string; fingerprint?: string };
  body?: string;
}

interface Entry {
  id: string;
  stamp: string;
  title: string;
  kind: string;
  status: string;
  relations?: string[];
  body?: string;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function writePage(root: string, page: Page): string {
  const substrate = page.substrate ?? "finding";
  const dir = substrate === "lit" ? join(root, ".promptus", "docs", "lit")
    : substrate === "memory" ? join(root, ".promptus", "memory")
    : join(root, ".promptus", "docs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slug(page.title)}.md`);
  const lines = [
    "---",
    `id: ${page.id}`,
    ...(substrate !== "memory" ? [`substrate: ${substrate}`, `kind: ${page.kind ?? "RESULT"}`] : [`name: ${slug(page.title)}`, `type: ${page.kind ?? "project"}`]),
    `status: ${page.status ?? (substrate === "memory" ? "validated" : "VALIDATED")}`,
    ...(page.created ? [`created: "${page.created}"`] : []),
    ...(page.source ? [`source: "${page.source}"`] : []),
    ...(page.relations?.length ? [`relations: [${page.relations.map((item) => JSON.stringify(item)).join(", ")}]`] : []),
    ...(page.artifacts?.length ? [`artifacts: [${page.artifacts.map((item) => JSON.stringify(item)).join(", ")}]`] : []),
    ...(page.review?.scope ? [`review_scope: ${JSON.stringify(page.review.scope)}`] : []),
    ...(page.review?.since ? [`review_since: ${JSON.stringify(page.review.since)}`] : []),
    ...(page.review?.through ? [`review_through: ${JSON.stringify(page.review.through)}`] : []),
    ...(page.review?.fingerprint ? [`review_source_fingerprint: ${page.review.fingerprint}`] : []),
    "---",
    `# ${page.title}`,
    "",
    page.body ?? `${page.title} body.`,
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  return path;
}

function writeLedger(root: string, entries: Entry[]): void {
  const latest = entries.at(-1)?.id ?? "EMPTY";
  const blocks = entries.map((entry) => [
    `### [${entry.stamp}] ${entry.kind}/${entry.status} — ${entry.title}`,
    `<!-- kb:id ${entry.id} -->`,
    entry.body ?? `${entry.title} body.`,
    ...(entry.relations ?? []).map((relation) => {
      const split = relation.indexOf(":");
      return `↳ ${relation.slice(0, split)} ${relation.slice(split + 1)}`;
    }),
    "",
  ].join("\n")).join("\n");
  writeFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), `# Research Ledger — trajectory test

<!-- now:start -->
## NOW
<!-- kb:now-through ${latest} -->
The bounded test trajectory is current.

## Open frontier
- [ ] Decide the next branch.

## Next actions
1. Run a decisive check.

## <<< RESUME HERE >>>
Resume from the bounded test frontier.
<!-- now:end -->

## Log

${blocks}<!-- kb:append-point -->
`);
}

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus trajectory review "));
  roots.push(root);
  for (const dir of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(root, ".promptus", dir), { recursive: true });
  copyFileSync(VOCAB, join(root, ".promptus", "schema", "kb-vocab.json"));
  writeFileSync(join(root, ".promptus", "TELOS.md"), `# Telos — trajectory test

## North star
Establish one useful result without forgetting what failed.
`);
  writeFileSync(join(root, ".promptus", "memory", "MEMORY.md"), "# Memory\n\n<!-- kb:append-point -->\n");

  writePage(root, { id: ID.a, title: "Endeavour A", kind: "CONCEPT", created: "2026-01-01 00:00:00", body: "Success means a reproducible A result." });
  writePage(root, { id: ID.b, title: "Endeavour B", kind: "CONCEPT", created: "2026-01-01 00:00:01", body: "Success means a reproducible B result." });
  writePage(root, { id: ID.positive, title: "Positive A", created: "2026-01-01 00:00:02", relations: [`extends:${ID.a}`] });
  writePage(root, { id: ID.refuted, title: "Refuted A conjecture", kind: "CLAIM", status: "REFUTED", created: "2026-01-01 00:00:04", relations: [`extends:${ID.a}`] });
  writePage(root, { id: ID.old, title: "Old A result", created: "2026-01-01 00:00:06", relations: [`extends:${ID.a}`] });
  writePage(root, { id: ID.repair, title: "Repair A", created: "2026-01-01 00:00:07", relations: [`extends:${ID.a}`, `supersedes:${ID.old}`] });
  writePage(root, { id: ID.thinker, title: "Thinker A return", substrate: "lit", kind: "NOTE", status: "UNTRUSTED", created: "2026-01-01 00:00:09", source: "external-thinker:test-a", relations: [`extends:${ID.a}`] });
  writePage(root, { id: ID.verified, title: "Independently verified A", created: "2026-01-01 00:00:10", relations: [`extends:${ID.a}`, `derives-from:${ID.thinker}`], body: "Independent reconstruction, not thinker authority." });
  writeLedger(root, [
    { id: ID.bStep, stamp: "2026-01-01 00:00:03", title: "B step", kind: "RESULT", status: "VALIDATED", relations: [`extends:${ID.b}`] },
    { id: ID.dead, stamp: "2026-01-01 00:00:05", title: "A dead end", kind: "DEADEND", status: "REFUTED", relations: [`extends:${ID.a}`] },
    { id: ID.open, stamp: "2026-01-01 00:00:08", title: "A open plan", kind: "PLAN", status: "OPEN", relations: [`extends:${ID.a}`] },
    { id: ID.bFinal, stamp: "2026-01-01 00:00:11", title: "B final", kind: "RESULT", status: "VALIDATED", relations: [`extends:${ID.b}`] },
  ]);
  return root;
}

function run(script: string, root: string, args: string[] = [], input = "") {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), "--root", root, ...args], { input, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function check(root: string) { return run("promptus-check.ts", root); }

function collect(root: string, args: string[] = []) {
  const result = run("promptus-trajectory-review.ts", root, [...args, "--json"]);
  return { ...result, json: JSON.parse(result.stdout) };
}

function sourceFingerprint(root: string): string {
  return JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8")).storeHash;
}

function addReview(
  root: string,
  title: string,
  scope: string,
  since: string,
  through: string,
  prior?: string,
) {
  const args = [
    "--substrate", "finding", "--kind", "REVIEW", "--status", "VALIDATED", "--title", title,
    "--review-scope", scope, "--review-since", since, "--review-through", through,
    "--review-fingerprint", sourceFingerprint(root),
    ...(prior ? ["--rel", `extends:${prior}`] : []),
  ];
  const result = run("kb-add.ts", root, args, `Review ${title}. Facts and inferences are explicitly separated.`);
  const id = /\(id ([^)]+)\)/.exec(result.stdout)?.[1];
  return { ...result, id };
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function treeReceipt(root: string): string {
  const base = join(root, ".promptus");
  const hash = createHash("sha256");
  for (const path of filesUnder(base).sort()) {
    hash.update(relative(base, path).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update(String(statSync(path).mtimeMs));
  }
  return hash.digest("hex");
}

test("an endeavour packet preserves positive, negative, superseded, open, and untrusted evidence without reading bodies", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const before = treeReceipt(root);
  const result = collect(root, ["--scope", ID.a, "--max-units", "100"]);
  expect(result.status).toBe(0);
  expect(treeReceipt(root)).toBe(before);
  const packet = result.json;
  expect(packet.schema).toBe("promptus.trajectory-review.packet.v1");
  expect(packet.scope.key).toBe(`endeavour:${ID.a}`);
  expect(packet.units.some((unit: { id: string }) => unit.id === ID.bFinal)).toBe(false);
  expect(packet.dispositionGroups.refuted).toContain(ID.refuted);
  expect(packet.dispositionGroups.deadEnd).toContain(ID.dead);
  expect(packet.dispositionGroups.superseded).toContain(ID.old);
  expect(packet.dispositionGroups.open).toContain(ID.open);
  expect(packet.dispositionGroups.untrusted).toEqual([ID.thinker]);
  expect(packet.resultCandidates.positive).toContain(ID.positive);
  expect(packet.resultCandidates.negative).toEqual(expect.arrayContaining([ID.refuted, ID.dead, ID.old]));
  const old = packet.units.find((unit: { id: string }) => unit.id === ID.old);
  expect(old.sourceStatus).toBe("VALIDATED");
  expect(old.status).toBe("SUPERSEDED");
  const thinker = packet.units.find((unit: { id: string }) => unit.id === ID.thinker);
  const verified = packet.units.find((unit: { id: string }) => unit.id === ID.verified);
  expect(thinker.status).toBe("UNTRUSTED");
  expect(verified.status).toBe("VALIDATED");
  expect(packet.causalRelations.some((edge: { type: string; from: string; to: string }) =>
    edge.type === "supersedes" && edge.from === ID.repair && edge.to === ID.old)).toBe(true);
  expect(packet.guarantee).toContain("No source or derived file was written");
});

test("a whole-project review uses an unambiguous path-plus-title marker for pre-ID history", () => {
  const root = scaffold();
  writeFileSync(join(root, ".promptus", "docs", "legacy-observation.md"), `---
substrate: finding
kind: RESULT
status: VALIDATED
created: "2025-12-31 23:59:59"
---
# Legacy observation

Predates stable IDs but has an immutable page identity and source timestamp.
`);
  expect(check(root).status).toBe(0);
  const result = collect(root, ["--scope", "project", "--through", ID.bFinal, "--max-units", "100"]);
  expect(result.status).toBe(0);
  const legacy = result.json.units.find((unit: { title: string }) => unit.title === "Legacy observation");
  expect(legacy.id).toBeUndefined();
  expect(legacy.marker).toBe("path:.promptus/docs/legacy-observation.md::title:Legacy%20observation");
  expect(legacy.chronologySource).toBe("created");
});

test("interleaved endeavours continue from their own unique prior review", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const a = addReview(root, "A review one", `endeavour:${ID.a}`, "START", ID.verified);
  expect(a.status).toBe(0);
  expect(a.id).toBeTruthy();
  expect(check(root).status).toBe(0);
  const b = addReview(root, "B review one", `endeavour:${ID.b}`, "START", ID.bFinal);
  expect(b.status).toBe(0);
  expect(b.id).toBeTruthy();
  expect(check(root).status).toBe(0);
  const next = "finding-20260101T000012Z-next-a";
  writePage(root, { id: next, title: "Next A", created: "2026-01-01 00:00:12", relations: [`extends:${ID.a}`] });
  expect(check(root).status).toBe(0);

  const result = collect(root, ["--scope", ID.a, "--max-units", "100"]);
  expect(result.status).toBe(0);
  expect(result.json.boundary.priorReview.id).toBe(a.id);
  expect(result.json.boundary.priorReview.id).not.toBe(b.id);
  expect(result.json.boundary.since.marker).toBe(ID.verified);
  expect(result.json.units.map((unit: { id: string }) => unit.id)).toEqual([next]);
});

test("explicit persistence writes one immutable REVIEW, indexes it, and requires its predecessor for a successor", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const first = addReview(root, "A persisted review one", `endeavour:${ID.a}`, "START", ID.verified);
  expect(first.status).toBe(0);
  expect(first.id).toBeTruthy();
  const firstPath = join(root, ".promptus", "docs", "a-persisted-review-one.md");
  const firstBytes = readFileSync(firstPath);
  expect(readFileSync(firstPath, "utf8")).toContain(`review_scope: "endeavour:${ID.a}"`);
  expect(check(root).status).toBe(0);

  const next = "finding-20260101T000013Z-decisive-a";
  writePage(root, { id: next, title: "Decisive A", created: "2026-01-01 00:00:13", relations: [`extends:${ID.a}`] });
  expect(check(root).status).toBe(0);
  const packet = collect(root, ["--scope", ID.a, "--max-units", "100"]).json;

  const missingPrior = addReview(root, "A successor without relation", packet.scope.key, packet.boundary.since.marker, packet.boundary.through.marker);
  expect(missingPrior.status).toBe(1);
  expect(missingPrior.stderr).toContain("REVIEW_PRIOR_RELATION_REQUIRED");
  const second = addReview(root, "A persisted review two", packet.scope.key, packet.boundary.since.marker, packet.boundary.through.marker, first.id);
  expect(second.status).toBe(0);
  expect(readFileSync(firstPath)).toEqual(firstBytes);
  expect(run("kb-index.ts", root).status).toBe(0);
  expect(check(root).status).toBe(0);
  const catalog = readFileSync(join(root, ".promptus", "cache", "CATALOG.md"), "utf8");
  expect(catalog).toContain("finding:VALIDATED · A persisted review two");
  expect(readFileSync(join(root, ".promptus", "docs", "a-persisted-review-two.md"), "utf8")).toContain(`relations: ["extends:${first.id}"]`);
});

test("a stored REVIEW with missing scope fails closed even when health and retrieval are current", () => {
  const root = scaffold();
  writePage(root, {
    id: "finding-20260101T000020Z-malformed-review",
    title: "Malformed review",
    kind: "REVIEW",
    created: "2026-01-01 00:00:20",
    review: { since: "START", through: ID.verified, fingerprint: "a".repeat(64) },
  });
  expect(check(root).status).toBe(0);
  const result = collect(root, ["--scope", ID.a]);
  expect(result.status).toBe(1);
  expect(result.json.code).toBe("REVIEW_SCOPE_MISSING");
});

test("parallel tail reviews for one scope fail closed instead of choosing the globally latest review", () => {
  const root = scaffold();
  const scope = `endeavour:${ID.a}`;
  for (const [suffix, second] of [["one", "20"], ["two", "21"]]) {
    writePage(root, {
      id: `finding-20260101T0000${second}Z-review-${suffix}`,
      title: `Parallel review ${suffix}`,
      kind: "REVIEW",
      created: `2026-01-01 00:00:${second}`,
      review: { scope, since: "START", through: ID.verified, fingerprint: "b".repeat(64) },
    });
  }
  expect(check(root).status).toBe(0);
  const result = collect(root, ["--scope", ID.a]);
  expect(result.status).toBe(1);
  expect(result.json.code).toBe("PRIOR_REVIEW_AMBIGUOUS");
  expect(result.json.details.tails).toHaveLength(2);
  const explicit = collect(root, ["--scope", ID.a, "--since", "START", "--through", ID.verified, "--max-units", "100"]);
  expect(explicit.status).toBe(0);
  expect(explicit.json.boundary.priorReview).toBeNull();
  expect(explicit.json.unresolved.priorReview.code).toBe("PRIOR_REVIEW_AMBIGUOUS");
});

test("an oversized range fails without silent truncation and preserves every source and derived byte", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const before = treeReceipt(root);
  const result = collect(root, ["--scope", ID.a, "--max-units", "2"]);
  expect(result.status).toBe(1);
  expect(result.json.code).toBe("RANGE_TOO_LARGE");
  expect(result.json.details.selected).toBeGreaterThan(2);
  expect(treeReceipt(root)).toBe(before);
});

test("same-second units use stable marker ordering and explicit boundaries", () => {
  const root = scaffold();
  const alpha = "finding-20260101T000012Z-alpha-a";
  const beta = "finding-20260101T000012Z-beta-a";
  writePage(root, { id: beta, title: "Beta same second", created: "2026-01-01 00:00:12", relations: [`extends:${ID.a}`] });
  writePage(root, { id: alpha, title: "Alpha same second", created: "2026-01-01 00:00:12", relations: [`extends:${ID.a}`] });
  expect(check(root).status).toBe(0);
  const result = collect(root, ["--scope", ID.a, "--since", ID.verified, "--through", beta, "--max-units", "100"]);
  expect(result.status).toBe(0);
  expect(result.json.units.map((unit: { marker: string }) => unit.marker)).toEqual([alpha, beta]);
  expect(result.json.boundary.since.inclusive).toBe(false);
  expect(result.json.boundary.through.inclusive).toBe(true);
});

test("stale source/index state stops collection through existing preflight semantics", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const path = join(root, ".promptus", "docs", "positive-a.md");
  writeFileSync(path, readFileSync(path, "utf8") + "changed after health\n");
  const result = collect(root, ["--scope", ID.a]);
  expect(result.status).toBe(1);
  expect(result.json.code).toBe("PREFLIGHT_FAILED");
  expect(result.json.details.issues.map((issue: { code: string }) => issue.code)).toContain("CACHE_STALE");
});

test("a current hard-health failure stops collection rather than becoming retrospective prose", () => {
  const root = scaffold();
  writePage(root, {
    id: "finding-20260101T000014Z-bad-artifact-a",
    title: "Bad artifact A",
    created: "2026-01-01 00:00:14",
    relations: [`extends:${ID.a}`],
    artifacts: [`evidence|missing-evidence.txt|${"0".repeat(64)}`],
  });
  expect(check(root).status).toBe(1);
  const result = collect(root, ["--scope", ID.a]);
  expect(result.status).toBe(1);
  expect(result.json.code).toBe("PREFLIGHT_FAILED");
  expect(result.json.details.issues.map((issue: { code: string }) => issue.code)).toContain("ARTIFACT_DEBT");
});

test("the persistence gate rejects a packet fingerprint after any intervening source write", () => {
  const root = scaffold();
  expect(check(root).status).toBe(0);
  const packet = collect(root, ["--scope", ID.a, "--max-units", "100"]).json;
  writePage(root, { id: "finding-20260101T000015Z-late-a", title: "Late A", created: "2026-01-01 00:00:15", relations: [`extends:${ID.a}`] });
  const result = run("kb-add.ts", root, [
    "--substrate", "finding", "--kind", "REVIEW", "--status", "VALIDATED", "--title", "Stale packet review",
    "--review-scope", packet.scope.key, "--review-since", packet.boundary.since.marker,
    "--review-through", packet.boundary.through.marker, "--review-fingerprint", packet.source.fingerprint,
  ], "Must not land.");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("REVIEW_SOURCE_CHANGED");
  expect(() => readFileSync(join(root, ".promptus", "docs", "stale-packet-review.md"))).toThrow();
});

test("portable paths preserve spaced Linux roots and normalize Windows separators", () => {
  const root = scaffold();
  expect(root).toContain(" ");
  expect(check(root).status).toBe(0);
  const result = collect(root, ["--scope", ID.a, "--max-units", "100"]);
  expect(result.status).toBe(0);
  expect(result.json.root).toBe(root.replace(/\\/g, "/"));
  expect(portablePath("C:\\Research Files\\MoT\\.promptus")).toBe("C:/Research Files/MoT/.promptus");
});
