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
