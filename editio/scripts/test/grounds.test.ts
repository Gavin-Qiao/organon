import { afterAll, expect, test } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { storeUnits } from "../grounds.ts";
import { renderSection } from "../editio-render.ts";
import { syncReader } from "../../../promptus/scripts/sync-reader.ts";

const repo = resolve(import.meta.dir, "../../..");
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "organon-grounds-")); roots.push(root);
  for (const dir of [".promptus/docs/lit", ".promptus/ledger", ".promptus/memory", ".editio/paper/sections"]) mkdirSync(join(root, dir), { recursive: true });
  return root;
}
function page(root: string, name: string, metadata: string, body = "Evidence") {
  writeFileSync(join(root, ".promptus/docs", name + ".md"), `---\n${metadata}\n---\n# ${name}\n${body}\n`);
}
function gate(root: string, claim: string, script = join(repo, "editio/scripts/editio-status.ts")) {
  writeFileSync(join(root, ".editio/paper/sections/results.md"), "# Results\n\n" + claim + "\n");
  const result = spawnSync(process.execPath, [script, "--root", root, "--gate"], { encoding: "utf8" });
  return { code: result.status, output: result.stdout + result.stderr };
}

test("canonical ID, slug and unique alias share effective lifecycle without mutating source", () => {
  const root = fixture();
  page(root, "old", "id: finding-old\nstatus: VALIDATED\naliases: [former]");
  page(root, "new", "id: finding-new\nstatus: VALIDATED\nrelations: [supersedes:finding-old]");
  const source = readFileSync(join(root, ".promptus/docs/old.md"), "utf8");
  const units = storeUnits(root);
  for (const key of ["old", "finding-old", "former"]) expect(units.get(key)?.status).toBe("SUPERSEDED");
  expect(units.get("new")).toEqual(units.get("finding-new"));
  expect(gate(root, "[Old proposition]{.claim .validated grounds=finding-old}").code).toBe(1);
  expect(gate(root, "[New proposition]{.claim .validated grounds=finding-new}").code).toBe(0);
  expect(readFileSync(join(root, ".promptus/docs/old.md"), "utf8")).toBe(source);
  expect(existsSync(join(root, ".promptus/cache"))).toBe(false);
  rmSync(join(root, ".promptus/docs/new.md"));
  expect(storeUnits(root).get("finding-old")?.status).toBe("VALIDATED"); // fresh direct source read
});

test("ledger IDs and legacy titles resolve while fenced fake entries do not", () => {
  const root = fixture();
  writeFileSync(join(root, ".promptus/ledger/RESEARCH-LEDGER.md"), "### [2026-01-01 10:00:00] RESULT/VALIDATED — Real result\n<!-- kb:id event-real -->\nRecorded.\n```\n### [2026-01-01 10:00:01] RESULT/VALIDATED — Fake\n<!-- kb:id event-fake -->\n```\n");
  expect(storeUnits(root).get("event-real")).toEqual(storeUnits(root).get("real-result"));
  expect(storeUnits(root).has("event-fake")).toBe(false);
  expect(gate(root, "[Recorded]{.claim .validated grounds=event-real}").code).toBe(0);
});

test("explicit manuscript grounds survive archiving with cross-boundary lifecycle intact", () => {
  const root = fixture();
  page(root, "old", "id: finding-old\nstatus: VALIDATED");
  page(root, "current", "id: finding-current\nstatus: VALIDATED\nrelations: [supersedes:finding-old]");
  page(root, "durable", "id: finding-durable\nstatus: VALIDATED");
  mkdirSync(join(root, ".promptus/docs/archive"));
  for (const name of ["old", "durable"]) renameSync(join(root, ".promptus/docs", name + ".md"), join(root, ".promptus/docs/archive", name + ".md"));
  const units = storeUnits(root);
  expect(units.get("finding-old")?.status).toBe("SUPERSEDED");
  expect(units.get("finding-old")?.path).toBe(".promptus/docs/archive/old.md");
  expect(gate(root, "[Earlier result was superseded.]{.claim .historical grounds=finding-old}").code).toBe(0);
  expect(gate(root, "[Current result.]{.claim .validated grounds=finding-current}").code).toBe(0);
  expect(gate(root, "[Still-valid archived evidence.]{.claim .validated grounds=finding-durable}").code).toBe(0);
  expect(gate(root, "[Old proposition.]{.claim .validated grounds=finding-old}").code).toBe(1);
  mkdirSync(join(root, ".promptus/ledger/archive"));
  writeFileSync(join(root, ".promptus/ledger/archive/2026-01.md"), "### [2026-01-01 10:00:00] DEADEND/REFUTED — Rejected archived route\n<!-- kb:id event-archived-deadend -->\nRejected in controlled testing.\n");
  expect(gate(root, "[The route failed.]{.claim .historical grounds=event-archived-deadend}").code).toBe(0);
});

test("historical role retains rejection and does not excuse positive endorsement", () => {
  const root = fixture();
  page(root, "rejected", "id: finding-rejected\nstatus: REFUTED");
  const historical = "[The record reports rejection.]{.claim .historical grounds=finding-rejected}";
  const result = gate(root, historical);
  expect(result.code).toBe(0);
  expect(result.output).toContain("historical-only finding-rejected = finding:REFUTED");
  expect(result.output).not.toContain("1 override");
  const rendered = renderSection(historical, "results");
  expect(rendered).toContain("\\claimG{");
  expect(rendered).toContain("historical: finding-rejected");
  expect(rendered).not.toContain("\\claimV{");
  for (const attrs of [".validated", ".conjectured", '.conjectured override="ignore"', ".historical .validated", '.historical override="ignore"']) {
    expect(gate(root, `[Endorsement]{.claim ${attrs} grounds=finding-rejected}`).code).toBe(1);
  }
});

test("historical and mixed support fail closed on absent, untrusted or non-closed evidence", () => {
  const root = fixture();
  page(root, "firm", "status: VALIDATED");
  page(root, "unknown", "status: UNTRUSTED");
  page(root, "closed", "status: SUPERSEDED");
  for (const grounds of ["", "grounds=missing", "grounds=firm", "grounds=unknown", "grounds=closed,missing"]) {
    expect(gate(root, `[History]{.claim .historical ${grounds}}`).code).toBe(1);
  }
  expect(gate(root, "[Claim]{.claim .validated grounds=firm,missing}").code).toBe(1);
  const overridden = gate(root, '[Accepted exception]{.claim .validated grounds=missing override="author accepts this unsupported statement"}');
  expect(overridden.code).toBe(0);
  expect(overridden.output).toContain("validated, overridden");
  expect(overridden.output).toContain("author accepts this unsupported statement");
});

test("duplicate IDs and unresolved lifecycle relations cannot become firm support", () => {
  const root = fixture();
  page(root, "a", "id: repeated\nstatus: VALIDATED");
  page(root, "b", "id: repeated\nstatus: VALIDATED");
  expect(() => storeUnits(root)).toThrow("duplicate stable IDs");
  page(root, "b", "id: unique\nstatus: VALIDATED\nrelations: [supersedes:missing]");
  expect(() => storeUnits(root)).toThrow("lifecycle target");
});

test("custom stores, nested pages and memory retirement use the canonical vocabulary", () => {
  const root = fixture();
  const vocab = JSON.parse(readFileSync(join(repo, "promptus/templates/schema/kb-vocab.json"), "utf8"));
  vocab.substrates.finding.store = ".promptus/research";
  mkdirSync(join(root, ".promptus/schema")); mkdirSync(join(root, ".promptus/research/nested"), { recursive: true });
  writeFileSync(join(root, ".promptus/schema/kb-vocab.json"), JSON.stringify(vocab));
  writeFileSync(join(root, ".promptus/memory/old.md"), "---\nid: memory-old\nstatus: validated\n---\n# Old\n");
  writeFileSync(join(root, ".promptus/research/nested/new.md"), "---\nid: finding-new\nstatus: VALIDATED\nrelations: [supersedes:memory-old]\n---\n# New\n");
  expect(storeUnits(root).get("memory-old")?.status).toBe("retired");
  expect(storeUnits(root).get("finding-new")?.path).toBe(".promptus/research/nested/new.md");
});

test("packaged Editio works without a sibling Promptus installation and vendor drift is detected", () => {
  expect(syncReader(repo)).toEqual([]);
  const root = fixture();
  const plugin = join(root, "isolated-plugin");
  cpSync(join(repo, "editio/scripts"), join(plugin, "scripts"), { recursive: true });
  page(root, "current", "id: finding-current\nstatus: VALIDATED");
  expect(gate(root, "[Current]{.claim .validated grounds=finding-current}", join(plugin, "scripts/editio-status.ts")).code).toBe(0);
  const staged = join(root, "staged");
  cpSync(join(repo, "promptus/scripts/lib"), join(staged, "promptus/scripts/lib"), { recursive: true });
  mkdirSync(join(staged, "promptus/templates/schema"), { recursive: true });
  copyFileSync(join(repo, "promptus/templates/schema/kb-vocab.json"), join(staged, "promptus/templates/schema/kb-vocab.json"));
  expect(syncReader(staged, true)).toHaveLength(8);
  expect(syncReader(staged)).toEqual([]);
  writeFileSync(join(staged, "editio/scripts/vendor/promptus/ids.ts"), "// drift\n");
  expect(syncReader(staged)).toHaveLength(1);
});
