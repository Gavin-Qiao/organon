#!/usr/bin/env bun
/** Seal a good theory question, preserve its return, and quarantine before interpretation. */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { findProjectRoot } from "./lib/paths.ts";
import {
  THINKER_DIR,
  declaredRound,
  decodeUtf8,
  fileRecord,
  hasThinkerMarker,
  inspectRound,
  inspectThinkerExchange,
  isIntakeReceipt,
  isRoundReceipt,
  projectRelative,
  quarantinePath,
  readJson,
  readStable,
  refreshThinkerReadSurfaces,
  roundPaths,
  sha256Bytes,
  validateRoundId,
  writeExclusive,
  writeJsonExclusive,
  type IntakeDisposition,
  type IntakeReceipt,
  type RoundReceipt,
} from "./lib/thinker.ts";

const HELP = `thinker-round — a useful, small external-theory loop
usage:
  thinker-round draft --id <round-id> --title <title> [--apply] [--root <dir>]
  thinker-round prepare --id <round-id> [--apply] [--root <dir>]
  thinker-round receive --id <round-id> --response <file> --capture <attachment|inline> [--apply] [--root <dir>]
  thinker-round status [--id <round-id>] [--json] [--root <dir>]

Mutations are dry-run by default. The main agent writes the question and validates the answer;
this tool only scaffolds, seals, preserves, hashes, and invokes kb-ingest quarantine.`;

const TEMPLATE_DIR = join(import.meta.dir, "..", "templates", "thinker");

const flag = (argv: string[], name: string) => argv.includes(`--${name}`);
function value(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  const next = index >= 0 ? argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}
function need(argv: string[], name: string): string {
  const found = value(argv, name);
  if (!found) throw new Error(`--${name} is required`);
  return found;
}
function template(name: string, values: Record<string, string> = {}): string {
  let out = readFileSync(join(TEMPLATE_DIR, name), "utf8");
  for (const [key, replacement] of Object.entries(values)) out = out.replaceAll(`{{${key}}}`, replacement);
  return out;
}
function mutation(command: string, apply: boolean, detail: string): void {
  console.log(`thinker-round ${command} ${apply ? "" : "(dry-run — pass --apply) "}— ${detail}`);
}
function oneLine(value: string, label: string, maximum: number): string {
  const out = value.trim();
  if (!out || out.length > maximum || /[\r\n]/.test(out)) throw new Error(`${label} must be one non-empty line of at most ${maximum} characters`);
  return out;
}

function draft(root: string, argv: string[], apply: boolean): number {
  const roundId = validateRoundId(need(argv, "id"));
  const title = oneLine(need(argv, "title"), "title", 160);
  const paths = roundPaths(root, roundId);
  if (existsSync(paths.dir)) throw new Error(`round already exists: ${roundId}`);
  const exchange = join(root, THINKER_DIR);
  const protocol = join(exchange, "PROTOCOL.md");
  if (existsSync(exchange)) {
    if (!hasThinkerMarker(root)) throw new Error(".promptus/thinker/ exists but is not a governed v1 exchange");
    const report = inspectThinkerExchange(root);
    const substantive = report.issues.filter((issue) => !issue.startsWith("derived "));
    if (substantive.length) throw new Error(`existing thinker exchange needs attention: ${substantive.join("; ")}`);
  }
  mutation("draft", apply, `${roundId} · ${title}`);
  if (!apply) return 0;
  mkdirSync(paths.dir, { recursive: true });
  if (!existsSync(protocol)) writeExclusive(protocol, template("PROTOCOL.md"));
  writeExclusive(paths.prompt, template("prompt.md", { ROUND_ID: roundId, TITLE: title }));
  writeExclusive(paths.validationPlan, template("validation-plan.md", { ROUND_ID: roundId, TITLE: title }));
  refreshThinkerReadSurfaces(root);
  console.log(`  edit ${projectRelative(root, paths.prompt)}; keep ${projectRelative(root, paths.validationPlan)} project-side.`);
  return 0;
}

function validatePrompt(roundId: string, text: string): void {
  for (const span of [
    `**Round:** \`${roundId}\``, "## Role and context boundary", "## Complete problem",
    "## Settled facts and failed routes", "## Bounded question", "## Required response",
    "## Claim and scope rules", `ROUND_ID: ${roundId}`, "no workspace",
  ]) if (!text.includes(span)) throw new Error(`prompt is missing: ${span}`);
  if (/\{\{[A-Z_]+\}\}|<!--/.test(text)) throw new Error("prompt still contains template placeholders/comments");
  for (const pattern of [
    /(?:^|[\s`])\.promptus\//m, /(?:^|[\s`])(?:scratchpad|outputs|results|tests|src)\//m,
    /(?:^|[\s`])\/(?:home|mnt|Users)\//m, /[A-Za-z]:\\/, /file:\/\//i,
    /see (?:the )?(?:attached|workspace|repository) file/i,
    /as (?:in|discussed in) (?:an )?(?:earlier|previous) (?:message|round|session)/i,
  ]) if (pattern.test(text)) throw new Error(`prompt leaks hidden/local context: ${pattern}`);
}

function validatePlan(roundId: string, text: string): void {
  for (const span of [
    `**Round:** \`${roundId}\``, "**Status:** `FROZEN_BEFORE_RESPONSE`", "## Target and stop rule",
    "## Premise audit", "## Refute-first checks", "## Claim adjudication", "lit:UNTRUSTED",
  ]) if (!text.includes(span)) throw new Error(`validation plan is missing: ${span}`);
  if (/\{\{[A-Z_]+\}\}|<!--/.test(text)) throw new Error("validation plan still contains template placeholders/comments");
}

function prepare(root: string, argv: string[], apply: boolean): number {
  const roundId = validateRoundId(need(argv, "id"));
  const paths = roundPaths(root, roundId);
  if (!existsSync(paths.prompt) || !existsSync(paths.validationPlan)) throw new Error(`round is not drafted: ${roundId}`);
  if (existsSync(paths.receipt) || existsSync(paths.response) || existsSync(paths.intake)) throw new Error(`round is already prepared or received: ${roundId}`);
  const promptRaw = readStable(paths.prompt);
  const planRaw = readStable(paths.validationPlan);
  const promptText = decodeUtf8(promptRaw, "prompt");
  const planText = decodeUtf8(planRaw, "validation plan");
  validatePrompt(roundId, promptText);
  validatePlan(roundId, planText);
  const title = oneLine(/^#\s+(.+)$/m.exec(promptText)?.[1] ?? roundId, "prompt title", 160);
  const receipt: RoundReceipt = {
    schema: "promptus.thinker-round.v1",
    round_id: roundId,
    title,
    prepared_at: new Date().toISOString(),
    prompt: fileRecord(root, paths.prompt, promptRaw),
    validation_plan: fileRecord(root, paths.validationPlan, planRaw),
    response_contract: { first_line: `ROUND_ID: ${roundId}`, source: `external-thinker:${roundId}`, status: "lit:UNTRUSTED" },
    context: { workspace: false, session_history: false, network: false, transport: "operator-mediated" },
  };
  mutation("prepare", apply, `${roundId} · prompt ${receipt.prompt.sha256}`);
  if (!apply) return 0;
  writeJsonExclusive(paths.receipt, receipt);
  refreshThinkerReadSurfaces(root);
  console.log(`  ready. Give the operator exactly ${projectRelative(root, paths.prompt)}.`);
  return 0;
}

function prepared(root: string, roundId: string): RoundReceipt {
  const paths = roundPaths(root, roundId);
  const receipt = readJson<unknown>(paths.receipt);
  if (!isRoundReceipt(receipt)) throw new Error(`round is not prepared: ${roundId}`);
  const summary = inspectRound(root, roundId);
  const blocking = summary.issues.filter((issue) => issue !== "captured response lacks intake receipt");
  if (blocking.length) throw new Error(`prepared round drifted: ${blocking.join("; ")}`);
  return receipt;
}

function duplicateOf(root: string, roundId: string, hash: string, target: string): string | null {
  const roundsDir = join(root, THINKER_DIR, "rounds");
  if (existsSync(roundsDir)) for (const entry of readdirSync(roundsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === roundId) continue;
    const intake = readJson<unknown>(roundPaths(root, entry.name).intake);
    if (isIntakeReceipt(intake) && intake.response.sha256 === hash) return `round:${entry.name}`;
  }
  const litDir = join(root, ".promptus", "docs", "lit");
  if (existsSync(litDir)) for (const name of readdirSync(litDir).filter((item) => item.endsWith(".md"))) {
    const path = join(litDir, name);
    if (resolve(path) === resolve(target)) continue;
    const { data } = parseFrontmatter(readFileSync(path, "utf8"));
    if (data.content_sha256 === hash) return `lit:${typeof data.id === "string" ? data.id : name}`;
  }
  return null;
}
function runQuarantine(root: string, roundId: string, response: string): void {
  const result = spawnSync(process.execPath, [
    join(import.meta.dir, "kb-ingest.ts"), "quarantine", projectRelative(root, response),
    "--source", `external-thinker:${roundId}`, "--title", `External thinker ${roundId} response`,
    "--apply", "--root", root,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`kb-ingest quarantine failed: ${(result.stderr || result.stdout).trim()}`);
}
function bindQuarantine(root: string, roundId: string, target: string, hash: string): NonNullable<IntakeReceipt["quarantine"]> {
  if (!existsSync(target)) throw new Error(`quarantine was not created: ${projectRelative(root, target)}`);
  const raw = readFileSync(target);
  const { data } = parseFrontmatter(raw.toString("utf8"));
  const source = `external-thinker:${roundId}`;
  if (data.substrate !== "lit" || data.status !== "UNTRUSTED" || data.source !== source || data.content_sha256 !== hash || typeof data.id !== "string") {
    throw new Error("quarantine does not bind the current response");
  }
  return { path: projectRelative(root, target), id: data.id, source, status: "UNTRUSTED", content_sha256: hash, wrapper_sha256: sha256Bytes(raw) };
}

function receive(root: string, argv: string[], apply: boolean): number {
  const roundId = validateRoundId(need(argv, "id"));
  const receipt = prepared(root, roundId);
  const paths = roundPaths(root, roundId);
  if (existsSync(paths.intake)) throw new Error(`response already received for ${roundId}`);
  const captureArg = need(argv, "capture");
  if (captureArg !== "attachment" && captureArg !== "inline") throw new Error("--capture must be attachment or inline");
  const raw = readStable(resolve(root, need(argv, "response")));
  const text = decodeUtf8(raw, "thinker response");
  const hash = sha256Bytes(raw);
  const declared = declaredRound(text);
  const target = quarantinePath(root, roundId);
  const duplicate = duplicateOf(root, roundId, hash, target);
  let disposition: IntakeDisposition = "QUARANTINED";
  if (hash === receipt.prompt.sha256) disposition = "PROMPT_ECHO";
  else if (declared !== roundId) disposition = "WRONG_ROUND";
  else if (duplicate) disposition = "DUPLICATE";
  mutation("receive", apply, `${roundId} · ${disposition} · ${hash}`);
  if (!apply) return disposition === "QUARANTINED" ? 0 : 1;
  if (!existsSync(paths.response)) writeExclusive(paths.response, raw);
  const retained = readStable(paths.response);
  if (!retained.equals(raw)) throw new Error("response.md does not byte-match the supplied return");
  let quarantine: IntakeReceipt["quarantine"];
  if (disposition === "QUARANTINED") {
    if (!existsSync(target)) runQuarantine(root, roundId, paths.response);
    quarantine = bindQuarantine(root, roundId, target, hash);
  }
  const intake: IntakeReceipt = {
    schema: "promptus.thinker-round.intake.v1",
    round_id: roundId,
    received_at: new Date().toISOString(),
    disposition,
    capture: captureArg === "attachment" ? "ATTACHMENT_BYTES" : "INLINE_TRANSCRIPT",
    response: fileRecord(root, paths.response, retained),
    declared_round_id: declared,
    ...(duplicate ? { duplicate_of: duplicate } : {}),
    ...(quarantine ? { quarantine } : {}),
  };
  writeJsonExclusive(paths.intake, intake);
  refreshThinkerReadSurfaces(root);
  if (quarantine) {
    console.log(`  quarantined as ${quarantine.path}. Now inspect, challenge, and reconstruct the claims.`);
    return 0;
  }
  console.error(`  stopped at ${disposition}; no claim was admitted to Promptus.`);
  return 1;
}

function status(root: string, argv: string[]): number {
  const roundId = value(argv, "id");
  if (roundId) {
    const summary = inspectRound(root, validateRoundId(roundId));
    if (flag(argv, "json")) console.log(JSON.stringify({ schema: "promptus.thinker-round.status.v1", ...summary }, null, 2));
    else {
      console.log(`${summary.roundId}: ${summary.status} — ${summary.title}`);
      console.log(`  raw evidence: ${summary.quarantinePath ?? "not received"}`);
      for (const finding of summary.findings) console.log(`  ${finding.status} ${finding.path}`);
      for (const issue of summary.issues) console.log(`  ISSUE ${issue}`);
    }
    return summary.issues.length ? 1 : 0;
  }
  const report = inspectThinkerExchange(root);
  if (flag(argv, "json")) console.log(JSON.stringify({ schema: "promptus.thinker-exchange.status.v1", ...report }, null, 2));
  else if (!report.present) console.log("thinker-round: no rounds yet.");
  else {
    console.log(`thinker-round: ${report.governed ? "healthy" : "needs attention"} · ${report.rounds.length} round(s)`);
    for (const round of report.rounds) console.log(`  ${round.roundId}: ${round.status} — ${round.title}`);
    for (const issue of report.issues) console.log(`  ISSUE ${issue}`);
  }
  return report.present && !report.governed ? 1 : 0;
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const command = argv.find((item) => !item.startsWith("--"));
  if (!command) { console.error(HELP); return 2; }
  const root = findProjectRoot(value(argv, "root") ?? process.cwd());
  const apply = flag(argv, "apply");
  if (command === "draft") return draft(root, argv, apply);
  if (command === "prepare") return prepare(root, argv, apply);
  if (command === "receive") return receive(root, argv, apply);
  if (command === "status") return status(root, argv);
  console.error(`thinker-round: unknown command ${command}`);
  console.error(HELP);
  return 2;
}

try { process.exit(main(process.argv.slice(2))); }
catch (error) { console.error(`thinker-round: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
