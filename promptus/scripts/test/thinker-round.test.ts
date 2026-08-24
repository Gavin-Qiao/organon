/** End-to-end contract for the small, operator-mediated external thinker loop. */
import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const SCRIPTS = join(REPO, "scripts");
const VOCAB = join(REPO, "templates", "schema", "kb-vocab.json");
const tmps: string[] = [];

afterAll(() => {
  for (const path of tmps) {
    try { rmSync(path, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-thinker-"));
  tmps.push(root);
  const store = join(root, ".promptus");
  mkdirSync(join(store, "ledger"), { recursive: true });
  mkdirSync(join(store, "docs", "lit"), { recursive: true });
  mkdirSync(join(store, "memory"), { recursive: true });
  mkdirSync(join(store, "schema"), { recursive: true });
  writeFileSync(join(store, "TELOS.md"), "# Telos — thinker test\n");
  writeFileSync(join(store, "ledger", "RESEARCH-LEDGER.md"), "# Research Ledger\n\n<!-- kb:append-point -->\n");
  writeFileSync(join(store, "memory", "MEMORY.md"), "# Memory\n\n<!-- kb:append-point -->\n");
  copyFileSync(VOCAB, join(store, "schema", "kb-vocab.json"));
  return root;
}

function sourceManifest(root: string): Record<string, string> {
  const base = join(root, ".promptus");
  const manifest: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = path.slice(base.length + 1).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (rel === "cache") continue;
        walk(path);
      } else if (entry.isFile() && rel !== "thinker/INDEX.md" && !/^thinker\/rounds\/[^/]+\/ROUND\.md$/.test(rel)) {
        manifest[rel] = new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  walk(base);
  return Object.fromEntries(Object.entries(manifest).sort(([left], [right]) => left.localeCompare(right)));
}

function run(script: string, root: string | null, args: string[], stdin = "") {
  const full = root ? [...args, "--root", root] : args;
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...full], {
    cwd: root ?? undefined,
    input: stdin,
    encoding: "utf8",
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const thinker = (root: string, args: string[]) => run("thinker-round.ts", root, args);
const roundDir = (root: string, id: string) => join(root, ".promptus", "thinker", "rounds", id);

function validPrompt(id: string, title = "Can the bound be strict?"): string {
  return `# ${title}

**Round:** \`${id}\`

## Role and context boundary

You have no workspace, tools, network, or earlier context. Reason only from this complete prompt.

## Complete problem

Let x be a real number with 0 <= x <= 1. Decide whether x(1-x) < 1/4 always holds.

## Settled facts and failed routes

Differentiation is deliberately unavailable; completing the square is allowed.

## Bounded question

Prove the strict bound for every allowed x or give the smallest counterexample.

## Required response

Begin with ROUND_ID: ${id}. Give a verdict, numbered claims, assumptions, proof, edge cases, and scope.

## Claim and scope rules

Mark claims proved, disproved, or conjectured. The return will be checked independently.
`;
}

function validPlan(id: string, title = "Can the bound be strict?"): string {
  return `# Validation plan — ${title}

**Round:** \`${id}\`\x20\x20
**Status:** \`FROZEN_BEFORE_RESPONSE\`

## Target and stop rule

Close only with an independently checked proof or an explicit x in [0,1] attaining 1/4.

## Premise audit

Recheck the domain and expand the completed square exactly.

## Refute-first checks

Plug in both endpoints and x = 1/2 before considering the proposed proof.

## Claim adjudication

Classify each claim as VALIDATED, REFUTED, UNRESOLVED, or OUT_OF_SCOPE. The raw answer remains lit:UNTRUSTED.

## Authorization boundary

No implementation or release follows from this round.
`;
}

function draftAndPrepare(root: string, id: string, title = "Can the bound be strict?"): void {
  expect(thinker(root, ["draft", "--id", id, "--title", title, "--apply"]).status).toBe(0);
  const dir = roundDir(root, id);
  writeFileSync(join(dir, "prompt.md"), validPrompt(id, title));
  writeFileSync(join(dir, "validation-plan.md"), validPlan(id, title));
  expect(thinker(root, ["prepare", "--id", id, "--apply"]).status).toBe(0);
}

test("help works without a project", () => {
  const result = run("thinker-round.ts", null, ["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("usage:");
});

test("draft is dry-run safe and untouched templates cannot be sealed", () => {
  const root = scaffold();
  const dir = roundDir(root, "strict-bound");
  const dry = thinker(root, ["draft", "--id", "strict-bound", "--title", "Can the bound be strict?"]);
  expect(dry.status).toBe(0);
  expect(dry.stdout).toContain("dry-run");
  expect(existsSync(dir)).toBe(false);

  expect(thinker(root, ["draft", "--id", "strict-bound", "--title", "Can the bound be strict?", "--apply"]).status).toBe(0);
  expect(existsSync(join(dir, "prompt.md"))).toBe(true);
  expect(readFileSync(join(root, ".promptus", "thinker", "INDEX.md"), "utf8")).toContain("DRAFT");
  const premature = thinker(root, ["prepare", "--id", "strict-bound"]);
  expect(premature.status).toBe(1);
  expect(premature.stderr).toMatch(/missing: lit:UNTRUSTED|template placeholders\/comments/);
  expect(existsSync(join(dir, "round.json"))).toBe(false);
});

test("prepare seals prompt and project-side checks, then detects either one drifting", () => {
  const root = scaffold();
  draftAndPrepare(root, "strict-bound");
  const dir = roundDir(root, "strict-bound");
  const receipt = JSON.parse(readFileSync(join(dir, "round.json"), "utf8"));
  expect(receipt.context).toEqual({ workspace: false, session_history: false, network: false, transport: "operator-mediated" });
  expect(receipt.response_contract.first_line).toBe("ROUND_ID: strict-bound");
  expect(thinker(root, ["status", "--id", "strict-bound", "--json"]).stdout).toContain('"status": "PREPARED"');

  writeFileSync(join(dir, "validation-plan.md"), validPlan("strict-bound") + "POST_RESPONSE: changed too early.\n");
  const drift = thinker(root, ["status", "--id", "strict-bound"]);
  expect(drift.status).toBe(1);
  expect(drift.stdout).toContain("prepared validation plan drifted");
});

test("receive preserves exact bytes, records capture mode, and quarantines before interpretation", () => {
  const root = scaffold();
  draftAndPrepare(root, "strict-bound");
  const response = Buffer.from("ROUND_ID: strict-bound\n\nVerdict: DISPROVED. x = 1/2 gives equality.\n", "utf8");
  writeFileSync(join(root, "return.md"), response);

  const dry = thinker(root, ["receive", "--id", "strict-bound", "--response", "return.md", "--capture", "attachment"]);
  expect(dry.status).toBe(0);
  expect(dry.stdout).toContain("dry-run");
  expect(existsSync(join(roundDir(root, "strict-bound"), "response.md"))).toBe(false);

  const applied = thinker(root, ["receive", "--id", "strict-bound", "--response", "return.md", "--capture", "attachment", "--apply"]);
  expect(applied.status).toBe(0);
  const dir = roundDir(root, "strict-bound");
  expect(readFileSync(join(dir, "response.md"))).toEqual(response);
  const intake = JSON.parse(readFileSync(join(dir, "intake.json"), "utf8"));
  expect(intake.disposition).toBe("QUARANTINED");
  expect(intake.capture).toBe("ATTACHMENT_BYTES");
  const lit = readFileSync(join(root, intake.quarantine.path), "utf8");
  expect(lit).toContain("status: UNTRUSTED");
  expect(lit).toContain('source: "external-thinker:strict-bound"');
  expect(lit.endsWith(response)).toBe(true);
  expect(thinker(root, ["status", "--id", "strict-bound", "--json"]).stdout).toContain('"status": "RECEIVED_UNTRUSTED"');

  const checked = run("promptus-check.ts", root, []);
  expect(checked.status).toBe(0);
  expect(checked.stdout).toContain("thinker exchange: 1 round(s)");
  const preflight = run("promptus-session-doctor.ts", root, ["--json"]);
  const report = JSON.parse(preflight.stdout);
  expect(report.thinkerExchange.governed).toBe(true);
  expect(report.extraTrees).toEqual([]);
});

test("long round IDs receive into distinct canonical wrappers with returned custody bindings", () => {
  const root = scaffold();
  const common = `long-round-${"a".repeat(44)}`;
  const ids = [`${common}-one`, `${common}-two`];
  const paths = new Set<string>();
  for (const [index, id] of ids.entries()) {
    draftAndPrepare(root, id, `Long quarantine ${index + 1}`);
    const response = Buffer.from(`ROUND_ID: ${id}\n\nDistinct response ${index + 1}.\n`, "utf8");
    const returned = join(root, `return-${index + 1}.md`);
    writeFileSync(returned, response);
    const received = thinker(root, ["receive", "--id", id, "--response", `return-${index + 1}.md`, "--capture", "attachment", "--apply"]);
    expect(received.status).toBe(0);
    const intake = JSON.parse(readFileSync(join(roundDir(root, id), "intake.json"), "utf8"));
    paths.add(intake.quarantine.path);
    expect(intake.round_id).toBe(id);
    expect(intake.quarantine.source).toBe(`external-thinker:${id}`);
    expect(intake.quarantine.content_sha256).toBe(new Bun.CryptoHasher("sha256").update(response).digest("hex"));
    const wrapper = readFileSync(join(root, intake.quarantine.path));
    expect(intake.quarantine.wrapper_sha256).toBe(new Bun.CryptoHasher("sha256").update(wrapper).digest("hex"));
    expect(wrapper.subarray(wrapper.length - response.length).equals(response)).toBe(true);
    const status = thinker(root, ["status", "--id", id, "--json"]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).status).toBe("RECEIVED_UNTRUSTED");
  }
  expect(paths.size).toBe(2);
  for (const path of paths) {
    expect(path).toMatch(/external-thinker-long-round-a+-response-[a-f0-9]{12}\.md$/);
    expect(path.split("/").at(-1)!.replace(/\.md$/, "").length).toBeLessThanOrEqual(64);
  }
});

test("status accepts an already-bound v0.8.1 quarantine path without renaming it", () => {
  const root = scaffold();
  const id = `historical-${"b".repeat(48)}`;
  draftAndPrepare(root, id, "Historical long quarantine");
  writeFileSync(join(root, "historical-return.md"), `ROUND_ID: ${id}\nHistorical response.\n`);
  expect(thinker(root, ["receive", "--id", id, "--response", "historical-return.md", "--capture", "attachment", "--apply"]).status).toBe(0);
  const intakePath = join(roundDir(root, id), "intake.json");
  const intake = JSON.parse(readFileSync(intakePath, "utf8"));
  const canonical = join(root, intake.quarantine.path);
  const historicalSlug = `external-thinker-${id}-response`.slice(0, 64).replace(/-+$/, "");
  const historicalRel = `.promptus/docs/lit/${historicalSlug}.md`;
  const historical = join(root, historicalRel);
  renameSync(canonical, historical);
  intake.quarantine.path = historicalRel;
  writeFileSync(intakePath, JSON.stringify(intake, null, 2) + "\n");

  const status = thinker(root, ["status", "--id", id, "--json"]);
  expect(status.status).toBe(0);
  expect(JSON.parse(status.stdout).status).toBe("RECEIVED_UNTRUSTED");
  expect(existsSync(historical)).toBe(true);
  expect(existsSync(canonical)).toBe(false);
});

test("kb-ingest target slug rejects traversal and symlink destinations", () => {
  const root = scaffold();
  writeFileSync(join(root, "raw.md"), "ROUND_ID: slug-round\nresponse\n");
  const traversal = run("kb-ingest.ts", root, [
    "quarantine", "raw.md", "--source", "external-thinker:slug-round", "--target-slug", "../escape", "--apply",
  ]);
  expect(traversal.status).not.toBe(0);
  expect(traversal.stderr).toContain("--target-slug");

  const outside = join(root, "outside.md");
  writeFileSync(outside, "do not overwrite\n");
  const destination = join(root, ".promptus", "docs", "lit", "linked-destination.md");
  symlinkSync(outside, destination);
  const linked = run("kb-ingest.ts", root, [
    "quarantine", "raw.md", "--source", "external-thinker:slug-round", "--target-slug", "linked-destination", "--apply",
  ]);
  expect(linked.status).not.toBe(0);
  expect(linked.stderr).toContain("symlink destination refused");
  expect(readFileSync(outside, "utf8")).toBe("do not overwrite\n");
});

test("a v0.8.1 governed round and historical memory open read-only with a byte-stable source manifest", () => {
  const root = scaffold();
  draftAndPrepare(root, "legacy-short", "Legacy governed round");
  writeFileSync(join(root, "legacy-return.md"), "ROUND_ID: legacy-short\nLegacy exact bytes.\n");
  expect(thinker(root, ["receive", "--id", "legacy-short", "--response", "legacy-return.md", "--capture", "attachment", "--apply"]).status).toBe(0);
  expect(run("kb-add.ts", root, [
    "--substrate", "memory", "--kind", "project", "--status", "validated", "--title", "Historical memory fact",
  ], "This historical memory body must not change.").status).toBe(0);
  writeFileSync(join(root, ".gitignore"), "/.promptus/cache/\n");

  const vocabPath = join(root, ".promptus", "schema", "kb-vocab.json");
  const oldVocab = JSON.parse(readFileSync(vocabPath, "utf8"));
  delete oldVocab.substrates.lit.derived_statuses;
  delete oldVocab.relations.supersedes.inverse_status_by_substrate;
  delete oldVocab.relations.fixes.inverse_status_by_substrate;
  writeFileSync(vocabPath, JSON.stringify(oldVocab, null, 2) + "\n");
  expect(run("promptus-check.ts", root, []).status).toBe(0);
  const beforeStatus = JSON.parse(thinker(root, ["status", "--id", "legacy-short", "--json"]).stdout);
  const before = sourceManifest(root);

  expect(run("kb-index.ts", root, []).status).toBe(0);
  expect(run("promptus-check.ts", root, []).status).toBe(0);
  const diagnosed = run("promptus-doctor.ts", root, ["check", "--strict", "--json"]);
  expect(diagnosed.status).toBe(0);
  expect(JSON.parse(diagnosed.stdout).healthReceiptFresh).toBe(true);
  const afterStatus = JSON.parse(thinker(root, ["status", "--id", "legacy-short", "--json"]).stdout);
  expect(afterStatus.quarantinePath).toBe(beforeStatus.quarantinePath);
  expect(afterStatus.responseSha256).toBe(beforeStatus.responseSha256);
  expect(sourceManifest(root)).toEqual(before);
});

test("wrong-round returns stop before quarantine while preserving the declared capture", () => {
  const wrongRoot = scaffold();
  draftAndPrepare(wrongRoot, "wrong-round");
  writeFileSync(join(wrongRoot, "wrong.md"), "ROUND_ID: another-round\nNo answer.\n");
  const wrong = thinker(wrongRoot, ["receive", "--id", "wrong-round", "--response", "wrong.md", "--capture", "inline", "--apply"]);
  expect(wrong.status).toBe(1);
  expect(wrong.stderr).toContain("WRONG_ROUND");
  expect(JSON.parse(readFileSync(join(roundDir(wrongRoot, "wrong-round"), "intake.json"), "utf8")).capture).toBe("INLINE_TRANSCRIPT");
  expect(readdirSync(join(wrongRoot, ".promptus", "docs", "lit"))).toEqual([]);
});

test("prompt echo and a response hash already present in lit are rejected", () => {
  const echoRoot = scaffold();
  draftAndPrepare(echoRoot, "echo-round");
  const prompt = join(roundDir(echoRoot, "echo-round"), "prompt.md");
  const echo = thinker(echoRoot, ["receive", "--id", "echo-round", "--response", prompt, "--capture", "attachment", "--apply"]);
  expect(echo.status).toBe(1);
  expect(echo.stderr).toContain("PROMPT_ECHO");

  const duplicateRoot = scaffold();
  draftAndPrepare(duplicateRoot, "duplicate-round");
  const response = "ROUND_ID: duplicate-round\nA repeated answer.\n";
  writeFileSync(join(duplicateRoot, "duplicate.md"), response);
  const hash = new Bun.CryptoHasher("sha256").update(response).digest("hex");
  writeFileSync(join(duplicateRoot, ".promptus", "docs", "lit", "already.md"), `---\nid: lit-existing\nsubstrate: lit\nkind: NOTE\nstatus: UNTRUSTED\nsource: external-thinker:old\ncontent_sha256: ${hash}\n---\nold wrapper\n`);
  const duplicate = thinker(duplicateRoot, ["receive", "--id", "duplicate-round", "--response", "duplicate.md", "--capture", "attachment", "--apply"]);
  expect(duplicate.status).toBe(1);
  expect(duplicate.stderr).toContain("DUPLICATE");
  expect(existsSync(join(duplicateRoot, ".promptus", "docs", "lit", "external-thinker-duplicate-round-response.md"))).toBe(false);
});

test("a normal derives-from finding is the adjudication; raw evidence stays untrusted", () => {
  const root = scaffold();
  draftAndPrepare(root, "strict-bound");
  writeFileSync(join(root, "return.md"), "ROUND_ID: strict-bound\nThe strict claim is false at x=1/2.\n");
  expect(thinker(root, ["receive", "--id", "strict-bound", "--response", "return.md", "--capture", "attachment", "--apply"]).status).toBe(0);
  const intake = JSON.parse(readFileSync(join(roundDir(root, "strict-bound"), "intake.json"), "utf8"));
  const added = run("kb-add.ts", root, [
    "--substrate", "finding", "--kind", "RESULT", "--status", "VALIDATED",
    "--title", "Strict bound is refuted by equality", "--rel", `derives-from:${intake.quarantine.id}`,
  ], "Direct substitution gives x(1-x)=1/4 at x=1/2; the strict universal claim is refuted.");
  expect(added.status).toBe(0);
  const status = thinker(root, ["status", "--id", "strict-bound", "--json"]);
  expect(status.status).toBe(0);
  expect(status.stdout).toContain('"status": "ADJUDICATED"');
  expect(status.stdout).toContain("Strict bound is refuted by equality".toLowerCase().replaceAll(" ", "-"));
  expect(readFileSync(join(root, ".promptus", "thinker", "INDEX.md"), "utf8")).toContain("ADJUDICATED");
  expect(readFileSync(join(root, intake.quarantine.path), "utf8")).toContain("status: UNTRUSTED");
});

test("response retention refuses symlinks and status does not rewrite evidence", () => {
  const root = scaffold();
  draftAndPrepare(root, "stable-round");
  writeFileSync(join(root, "real.md"), "ROUND_ID: stable-round\nAnswer.\n");
  symlinkSync(join(root, "real.md"), join(root, "link.md"));
  expect(lstatSync(join(root, "link.md")).isSymbolicLink()).toBe(true);
  const linked = thinker(root, ["receive", "--id", "stable-round", "--response", "link.md", "--capture", "attachment"]);
  expect(linked.status).toBe(1);
  expect(linked.stderr).toContain("symlink input refused");

  const receipt = join(roundDir(root, "stable-round"), "round.json");
  const before = readFileSync(receipt);
  expect(thinker(root, ["status", "--id", "stable-round"]).status).toBe(0);
  expect(readFileSync(receipt)).toEqual(before);
});

test("an interrupted intake is visible and recoverable only with the same retained bytes", () => {
  const root = scaffold();
  draftAndPrepare(root, "recovery-round");
  const responsePath = join(roundDir(root, "recovery-round"), "response.md");
  const response = "ROUND_ID: recovery-round\nA recoverable response.\n";
  writeFileSync(responsePath, response);
  const partial = thinker(root, ["status", "--id", "recovery-round"]);
  expect(partial.status).toBe(1);
  expect(partial.stdout).toContain("CAPTURE_INCOMPLETE");
  expect(partial.stdout).toContain("captured response lacks intake receipt");

  const recovered = thinker(root, [
    "receive", "--id", "recovery-round", "--response",
    ".promptus/thinker/rounds/recovery-round/response.md", "--capture", "attachment", "--apply",
  ]);
  expect(recovered.status).toBe(0);
  expect(readFileSync(responsePath, "utf8")).toBe(response);
  expect(thinker(root, ["status", "--id", "recovery-round"]).stdout).toContain("RECEIVED_UNTRUSTED");
});

test("corrupt receipts and escaping retained paths are diagnosed without being followed", () => {
  const malformedRoot = scaffold();
  expect(thinker(malformedRoot, ["draft", "--id", "broken-round", "--title", "Broken receipt", "--apply"]).status).toBe(0);
  writeFileSync(join(roundDir(malformedRoot, "broken-round"), "round.json"), "{not-json\n");
  const malformed = thinker(malformedRoot, ["status", "--id", "broken-round"]);
  expect(malformed.status).toBe(1);
  expect(malformed.stdout).toContain("round receipt invalid");

  const escapingRoot = scaffold();
  draftAndPrepare(escapingRoot, "escaping-round");
  const receiptPath = join(roundDir(escapingRoot, "escaping-round"), "round.json");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  receipt.prompt.path = "../../outside.md";
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  const escaping = thinker(escapingRoot, ["status", "--id", "escaping-round"]);
  expect(escaping.status).toBe(1);
  expect(escaping.stdout).toContain("prepared prompt escapes the project");
  const gate = run("promptus-check.ts", escapingRoot, []);
  expect(gate.status).toBe(1);
  expect(gate.stdout).toContain("FAIL thinker exchange");
});
