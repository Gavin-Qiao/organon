/** Deterministic custody helpers for theory-only external thinker rounds. */

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";

export const THINKER_DIR = ".promptus/thinker";
export const THINKER_MARKER = "<!-- promptus:thinker-exchange v1 -->";
export const ROUND_ID = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export type IntakeDisposition = "QUARANTINED" | "WRONG_ROUND" | "PROMPT_ECHO" | "DUPLICATE";
export type RoundStatus =
  | "DRAFT"
  | "PREPARED"
  | "CAPTURE_INCOMPLETE"
  | "RECEIVED_UNTRUSTED"
  | "ADJUDICATED"
  | "WRONG_ROUND"
  | "PROMPT_ECHO"
  | "DUPLICATE";

export interface FileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface RoundReceipt {
  schema: "promptus.thinker-round.v1";
  round_id: string;
  title: string;
  prepared_at: string;
  prompt: FileRecord;
  validation_plan: FileRecord;
  response_contract: {
    first_line: string;
    source: string;
    status: "lit:UNTRUSTED";
  };
  context: {
    workspace: false;
    session_history: false;
    network: false;
    transport: "operator-mediated";
  };
}

export interface IntakeReceipt {
  schema: "promptus.thinker-round.intake.v1";
  round_id: string;
  received_at: string;
  disposition: IntakeDisposition;
  capture: "ATTACHMENT_BYTES" | "INLINE_TRANSCRIPT";
  response: FileRecord;
  declared_round_id: string | null;
  duplicate_of?: string;
  quarantine?: {
    path: string;
    id: string;
    source: string;
    status: "UNTRUSTED";
    content_sha256: string;
    wrapper_sha256: string;
  };
}

export interface FindingBinding {
  path: string;
  id: string;
  status: string;
  sha256: string;
}

export interface RoundPaths {
  dir: string;
  prompt: string;
  validationPlan: string;
  receipt: string;
  response: string;
  intake: string;
  readme: string;
}

export interface RoundSummary {
  roundId: string;
  title: string;
  status: RoundStatus;
  promptSha256: string | null;
  responseSha256: string | null;
  quarantinePath: string | null;
  findings: FindingBinding[];
  issues: string[];
}

export interface ThinkerExchangeReport {
  present: boolean;
  governed: boolean;
  markerValid: boolean;
  indexCurrent: boolean;
  rounds: RoundSummary[];
  issues: string[];
}

const HASH = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isFileRecord(value: unknown): value is FileRecord {
  return object(value) && typeof value.path === "string" && value.path.length > 0 && value.path.length <= 512 &&
    !value.path.includes("\0") && typeof value.bytes === "number" && Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 && value.bytes <= 2_000_000 &&
    typeof value.sha256 === "string" && HASH.test(value.sha256);
}

export function isRoundReceipt(value: unknown): value is RoundReceipt {
  if (!object(value) || value.schema !== "promptus.thinker-round.v1" ||
    typeof value.round_id !== "string" || !ROUND_ID.test(value.round_id) ||
    typeof value.title !== "string" || !value.title.trim() || /[\r\n]/.test(value.title) ||
    typeof value.prepared_at !== "string" || Number.isNaN(Date.parse(value.prepared_at)) || !isFileRecord(value.prompt) ||
    !isFileRecord(value.validation_plan) || !object(value.response_contract) ||
    !object(value.context)) return false;
  return value.response_contract.first_line === `ROUND_ID: ${value.round_id}` &&
    value.response_contract.source === `external-thinker:${value.round_id}` &&
    value.response_contract.status === "lit:UNTRUSTED" &&
    value.context.workspace === false && value.context.session_history === false &&
    value.context.network === false && value.context.transport === "operator-mediated";
}

export function isIntakeReceipt(value: unknown): value is IntakeReceipt {
  if (!object(value) || value.schema !== "promptus.thinker-round.intake.v1" ||
    typeof value.round_id !== "string" || !ROUND_ID.test(value.round_id) ||
    typeof value.received_at !== "string" || Number.isNaN(Date.parse(value.received_at)) ||
    !["QUARANTINED", "WRONG_ROUND", "PROMPT_ECHO", "DUPLICATE"].includes(String(value.disposition)) ||
    !["ATTACHMENT_BYTES", "INLINE_TRANSCRIPT"].includes(String(value.capture)) ||
    !isFileRecord(value.response) ||
    !(value.declared_round_id === null || typeof value.declared_round_id === "string")) return false;
  if (value.duplicate_of !== undefined && typeof value.duplicate_of !== "string") return false;
  if (value.disposition !== "QUARANTINED") return value.quarantine === undefined;
  const quarantine = value.quarantine;
  return object(quarantine) && typeof quarantine.path === "string" &&
    typeof quarantine.id === "string" && quarantine.source === `external-thinker:${value.round_id}` &&
    quarantine.status === "UNTRUSTED" && typeof quarantine.content_sha256 === "string" &&
    quarantine.content_sha256 === value.response.sha256 && typeof quarantine.wrapper_sha256 === "string" &&
    HASH.test(quarantine.wrapper_sha256);
}

export function fwd(path: string): string {
  return path.replace(/\\/g, "/");
}

export function projectRelative(root: string, path: string): string {
  return fwd(relative(root, path));
}

export function validateRoundId(value: string): string {
  if (!ROUND_ID.test(value)) {
    throw new Error("round id must be 3-64 lowercase letters/digits/hyphens, without edge hyphens");
  }
  return value;
}

export function roundPaths(root: string, roundId: string): RoundPaths {
  validateRoundId(roundId);
  const dir = join(root, THINKER_DIR, "rounds", roundId);
  return {
    dir,
    prompt: join(dir, "prompt.md"),
    validationPlan: join(dir, "validation-plan.md"),
    receipt: join(dir, "round.json"),
    response: join(dir, "response.md"),
    intake: join(dir, "intake.json"),
    readme: join(dir, "ROUND.md"),
  };
}

/**
 * One quarantine basename for a governed round. Short v0.8.1 names remain byte-for-byte
 * compatible; long names retain a readable prefix and bind the complete ID through a digest.
 */
export function thinkerQuarantineSlug(roundId: string): string {
  validateRoundId(roundId);
  const legacy = `external-thinker-${roundId}-response`;
  if (legacy.length <= 64) return legacy;
  const digest = createHash("sha256").update(roundId).digest("hex").slice(0, 12);
  const head = "external-thinker-";
  const tail = `-response-${digest}`;
  const readable = roundId.slice(0, 64 - head.length - tail.length).replace(/-+$/, "");
  return `${head}${readable}${tail}`;
}

export function quarantinePath(root: string, roundId: string): string {
  return join(root, ".promptus", "docs", "lit", `${thinkerQuarantineSlug(roundId)}.md`);
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Retain one stable regular-file snapshot; reject symlinks and replacement races. */
export function readStable(path: string, maximumBytes = 2_000_000): Buffer {
  if (!existsSync(path)) throw new Error(`not found: ${fwd(path)}`);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`symlink input refused: ${fwd(path)}`);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`not a regular file: ${fwd(path)}`);
    if (before.size <= 0 || before.size > maximumBytes) {
      throw new Error(`file size ${before.size} is outside 1-${maximumBytes} bytes: ${fwd(path)}`);
    }
    const raw = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs || raw.length !== before.size
    ) {
      throw new Error(`file changed during retention: ${fwd(path)}`);
    }
    return raw;
  } finally {
    closeSync(descriptor);
  }
}

export function decodeUtf8(raw: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error(`${label} must be valid UTF-8 text`);
  }
}

export function hasThinkerMarker(root: string): boolean {
  const protocol = join(root, THINKER_DIR, "PROTOCOL.md");
  try { return decodeUtf8(readStable(protocol, 128_000), "thinker protocol").includes(THINKER_MARKER); }
  catch { return false; }
}

export function fileRecord(root: string, path: string, raw?: Buffer): FileRecord {
  const value = raw ?? readStable(path);
  decodeUtf8(value, projectRelative(root, path));
  return { path: projectRelative(root, path), bytes: value.length, sha256: sha256Bytes(value) };
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeExclusive(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o644);
  try {
    const value = typeof content === "string" ? Buffer.from(content) : content;
    let offset = 0;
    while (offset < value.length) offset += writeSync(descriptor, value, offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeJsonExclusive(path: string, value: unknown): void {
  writeExclusive(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { flag: "wx" });
  renameSync(temporary, path);
}

function h1(path: string, fallback: string): string {
  if (!existsSync(path)) return fallback;
  try { return /^#\s+(.+)$/m.exec(decodeUtf8(readStable(path), path))?.[1].trim() ?? fallback; }
  catch { return fallback; }
}

function textEquals(path: string, expected: string): boolean {
  try { return decodeUtf8(readStable(path), path) === expected; }
  catch { return false; }
}

function retainedPath(root: string, stored: string, label: string, issues: string[]): string | null {
  if (isAbsolute(stored) || /^[A-Za-z]:[\\/]/.test(stored) || stored.includes("\\")) {
    issues.push(`${label} path is not canonical project-relative: ${stored}`);
    return null;
  }
  const path = resolve(root, stored);
  const rel = relative(root, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    issues.push(`${label} escapes the project: ${stored}`);
    return null;
  }
  return path;
}

function verifyRecord(root: string, record: FileRecord, label: string, issues: string[]): void {
  const path = retainedPath(root, record.path, label, issues);
  if (!path) return;
  if (!existsSync(path)) {
    issues.push(`${label} missing: ${record.path}`);
    return;
  }
  try {
    const observed = fileRecord(root, path);
    if (observed.sha256 !== record.sha256 || observed.bytes !== record.bytes) issues.push(`${label} drifted: ${record.path}`);
  } catch (error) {
    issues.push(`${label} unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function verifyExpectedPath(root: string, record: FileRecord, expected: string, label: string, issues: string[]): void {
  const wanted = projectRelative(root, expected);
  if (record.path !== wanted) issues.push(`${label} points to ${record.path}; expected ${wanted}`);
}

export function declaredRound(text: string): string | null {
  return /^ROUND_ID:\s*([a-z0-9-]+)$/.exec(text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].trim())?.[1] ?? null;
}

function findingFiles(dir: string, top = true): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "archive" || (top && entry.name === "lit")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findingFiles(path, false));
    else if (entry.isFile() && entry.name.endsWith(".md") &&
      !["index.md", "readme.md"].includes(entry.name.toLowerCase())) out.push(path);
  }
  return out;
}

function derivedFindings(root: string, quarantineId: string | undefined): FindingBinding[] {
  if (!quarantineId) return [];
  const docs = join(root, ".promptus", "docs");
  if (!existsSync(docs)) return [];
  const out: FindingBinding[] = [];
  for (const path of findingFiles(docs)) {
    const raw = readFileSync(path);
    const { data } = parseFrontmatter(raw.toString("utf8"));
    const relations = Array.isArray(data.relations) ? data.relations : typeof data.relations === "string" ? [data.relations] : [];
    if (data.substrate !== "finding" || !relations.includes(`derives-from:${quarantineId}`)) continue;
    if (typeof data.id !== "string" || typeof data.status !== "string") continue;
    out.push({ path: projectRelative(root, path), id: data.id, status: data.status, sha256: sha256Bytes(raw) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function inspectRound(root: string, roundId: string): RoundSummary {
  const paths = roundPaths(root, roundId);
  const issues: string[] = [];
  const roundValue = readJson<unknown>(paths.receipt);
  const intakeValue = readJson<unknown>(paths.intake);
  const round = isRoundReceipt(roundValue) ? roundValue : null;
  const intake = isIntakeReceipt(intakeValue) ? intakeValue : null;
  if (existsSync(paths.receipt) && !round) issues.push("round receipt invalid");
  if (existsSync(paths.intake) && !intake) issues.push("intake receipt invalid");
  if (!existsSync(paths.prompt)) issues.push("prompt.md missing");
  if (!existsSync(paths.validationPlan)) issues.push("validation-plan.md missing");
  if (existsSync(paths.response) && !existsSync(paths.intake)) issues.push("captured response lacks intake receipt");
  if (round) {
    if (round.round_id !== roundId) issues.push("round receipt invalid");
    else {
      verifyExpectedPath(root, round.prompt, paths.prompt, "prepared prompt", issues);
      verifyExpectedPath(root, round.validation_plan, paths.validationPlan, "prepared validation plan", issues);
      verifyRecord(root, round.prompt, "prepared prompt", issues);
      verifyRecord(root, round.validation_plan, "prepared validation plan", issues);
    }
  }
  if (intake) {
    if (!round) issues.push("intake exists before preparation");
    if (intake.round_id !== roundId) issues.push("intake receipt invalid");
    verifyExpectedPath(root, intake.response, paths.response, "captured response", issues);
    verifyRecord(root, intake.response, "captured response", issues);
    if (existsSync(paths.response)) {
      try {
        const observed = declaredRound(decodeUtf8(readStable(paths.response), "captured response"));
        if (observed !== intake.declared_round_id) issues.push("captured response round declaration disagrees with intake receipt");
      } catch (error) {
        issues.push(`captured response unreadable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (round && new Date(intake.received_at).getTime() < new Date(round.prepared_at).getTime()) {
      issues.push("intake predates round preparation");
    }
    if ((intake.disposition === "QUARANTINED" || intake.disposition === "DUPLICATE") && intake.declared_round_id !== roundId) {
      issues.push(`${intake.disposition} intake does not declare this round`);
    }
    if (intake.disposition === "WRONG_ROUND" && intake.declared_round_id === roundId) issues.push("WRONG_ROUND intake declares this round");
    if (intake.disposition === "PROMPT_ECHO" && round && intake.response.sha256 !== round.prompt.sha256) issues.push("PROMPT_ECHO intake does not match the sealed prompt");
    if (intake.disposition === "DUPLICATE" && !intake.duplicate_of) issues.push("DUPLICATE intake lacks duplicate_of");
    if (intake.disposition === "QUARANTINED") {
      if (!intake.quarantine) issues.push("intake lacks quarantine binding");
      else {
        const path = retainedPath(root, intake.quarantine.path, "quarantine unit", issues);
        if (!path) { /* path issue already recorded */ }
        else if ((() => {
          const lit = join(root, ".promptus", "docs", "lit");
          const rel = relative(lit, path);
          return rel.startsWith("..") || isAbsolute(rel);
        })()) {
          issues.push(`quarantine unit is outside .promptus/docs/lit/: ${intake.quarantine.path}`);
        } else if (!existsSync(path)) issues.push(`quarantine unit missing: ${intake.quarantine.path}`);
        else {
          try {
            const raw = readStable(path);
            const { data } = parseFrontmatter(raw.toString("utf8"));
            if (
              data.id !== intake.quarantine.id || data.status !== "UNTRUSTED" ||
              data.source !== intake.quarantine.source || data.content_sha256 !== intake.response.sha256 ||
              sha256Bytes(raw) !== intake.quarantine.wrapper_sha256
            ) {
              issues.push(`quarantine binding drifted: ${intake.quarantine.path}`);
            }
          } catch (error) {
            issues.push(`quarantine unit unreadable: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }
  const findings = derivedFindings(root, intake?.quarantine?.id);
  let status: RoundStatus = "DRAFT";
  if (round) status = "PREPARED";
  if (existsSync(paths.response) && !intake) status = "CAPTURE_INCOMPLETE";
  if (intake) status = intake.disposition === "QUARANTINED" ? (findings.length ? "ADJUDICATED" : "RECEIVED_UNTRUSTED") : intake.disposition;
  return {
    roundId,
    title: round?.title ?? h1(paths.prompt, roundId),
    status,
    promptSha256: round?.prompt.sha256 ?? null,
    responseSha256: intake?.response.sha256 ?? null,
    quarantinePath: intake?.quarantine?.path ?? null,
    findings,
    issues,
  };
}

export function renderRoundReadme(summary: RoundSummary): string {
  const lines = [
    "<!-- DERIVED by thinker-round; edit prompt.md or validation-plan.md instead. -->",
    `# Thinker round — ${summary.title}`,
    "",
    `- Status: \`${summary.status}\``,
    `- Prompt: \`${summary.promptSha256 ?? "not prepared"}\``,
    `- Response: \`${summary.responseSha256 ?? "not received"}\``,
    `- Quarantine: ${summary.quarantinePath ? `\`${summary.quarantinePath}\`` : "none"}`,
  ];
  if (summary.findings.length) {
    lines.push("", "## Project adjudication", "", ...summary.findings.map((item) => `- \`${item.status}\` [[${item.id}]]`));
  }
  if (summary.issues.length) lines.push("", "## Integrity issues", "", ...summary.issues.map((issue) => `- ${issue}`));
  return `${lines.join("\n")}\n`;
}

export function renderExchangeIndex(rounds: RoundSummary[]): string {
  const lines = [
    THINKER_MARKER,
    "<!-- DERIVED by thinker-round; safe to rebuild. -->",
    "# External thinker rounds",
    "",
    "A small operator-mediated exchange, not a fifth store. Raw returns stay `lit:UNTRUSTED`;",
    "linked project findings show what survived independent checking.",
    "",
    "| round | status | question | project findings |",
    "|---|---|---|---|",
  ];
  for (const round of rounds.sort((a, b) => a.roundId.localeCompare(b.roundId))) {
    const findings = round.findings.length ? round.findings.map((item) => item.status).join(", ") : "—";
    lines.push(`| \`${round.roundId}\` | \`${round.status}\` | ${round.title.replace(/\|/g, "\\|")} | ${findings} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function inspectThinkerExchange(root: string): ThinkerExchangeReport {
  const exchange = join(root, THINKER_DIR);
  if (!existsSync(exchange)) return { present: false, governed: false, markerValid: false, indexCurrent: false, rounds: [], issues: [] };
  const markerValid = hasThinkerMarker(root);
  const issues: string[] = [];
  if (!markerValid) issues.push("missing governed-exchange marker in .promptus/thinker/PROTOCOL.md");
  const roundsDir = join(exchange, "rounds");
  const rounds: RoundSummary[] = [];
  if (!existsSync(roundsDir)) issues.push("missing .promptus/thinker/rounds/");
  else {
    for (const entry of readdirSync(roundsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ROUND_ID.test(entry.name)) {
        issues.push(`unexpected round entry: ${entry.name}`);
        continue;
      }
      const summary = inspectRound(root, entry.name);
      rounds.push(summary);
      for (const issue of summary.issues) issues.push(`${entry.name}: ${issue}`);
      const readme = roundPaths(root, entry.name).readme;
      if (!textEquals(readme, renderRoundReadme(summary))) {
        issues.push(`derived ${projectRelative(root, readme)} is absent or stale`);
      }
    }
  }
  const index = join(exchange, "INDEX.md");
  const indexCurrent = textEquals(index, renderExchangeIndex(rounds));
  if (!indexCurrent) issues.push("derived .promptus/thinker/INDEX.md is absent or stale");
  return { present: true, governed: markerValid && issues.length === 0, markerValid, indexCurrent, rounds, issues };
}

export function refreshThinkerReadSurfaces(root: string): void {
  const roundsDir = join(root, THINKER_DIR, "rounds");
  mkdirSync(roundsDir, { recursive: true });
  const rounds: RoundSummary[] = [];
  for (const entry of readdirSync(roundsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ROUND_ID.test(entry.name)) continue;
    const summary = inspectRound(root, entry.name);
    rounds.push(summary);
    writeAtomic(roundPaths(root, entry.name).readme, renderRoundReadme(summary));
  }
  writeAtomic(join(root, THINKER_DIR, "INDEX.md"), renderExchangeIndex(rounds));
}
