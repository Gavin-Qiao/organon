#!/usr/bin/env bun

/**
 * Evaluate Promptus continuity and traceability in a generated, disposable store.
 *
 * The runner deliberately accepts data-only suites, never a project root. Every
 * Promptus command is bound to a newly-created, marked workspace under the OS
 * temporary directory. This makes accidental mutation of a live project a
 * rejected state rather than a convention the operator has to remember.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { checkArtifact, parseArtifactSpec } from "../promptus/scripts/lib/artifacts.ts";
import { parseFrontmatter } from "../promptus/scripts/lib/frontmatter.ts";
import {
  SEARCH_INDEX_SCHEMA, searchIndex, type SearchDocument, type SearchIndex,
} from "../promptus/scripts/lib/search.ts";
import { unitText } from "../promptus/scripts/lib/units.ts";

export const CONTINUITY_SUITE_SCHEMA = "promptus.continuity-suite.v1" as const;
export const CONTINUITY_REPORT_SCHEMA = "promptus.continuity-report.v1" as const;
export const CONTINUITY_RESPONSES_SCHEMA = "promptus.continuity-responses.v1" as const;
const FIXTURE_MARKER_SCHEMA = "promptus.continuity-fixture.v1" as const;
const REPO_ROOT = resolve(import.meta.dir, "..");
const SCRIPT_ROOT = join(REPO_ROOT, "promptus", "scripts");
const TEMPLATE_ROOT = join(REPO_ROOT, "promptus", "templates");
const DEFAULT_SUITE = join(import.meta.dir, "continuity-cases.json");
const HANDLE = /^[a-z][a-z0-9-]*$/;

type Substrate = "ledger" | "finding" | "lit" | "memory";

interface RelationSpec {
  type: string;
  target: string;
}

interface ArtifactFixture {
  handle: string;
  role: string;
  path: string;
  body: string;
}

interface UnitFixture {
  handle: string;
  substrate: Substrate;
  kind: string;
  status: string;
  title: string;
  body: string;
  source?: string;
  relations?: RelationSpec[];
  artifacts?: string[];
}

interface RetrievalExpectation {
  all?: string[];
  none?: string[];
  first?: string;
  order?: [string, string][];
  statuses?: Record<string, string>;
  zeroHits?: boolean;
  nowThrough?: string;
  nowContains?: string[];
}

interface TraceExpectation {
  start: string;
  reachable: string[];
  sourceHandles: string[];
  artifactRoles: string[];
}

interface ContinuityCase {
  id: string;
  capability: string;
  query?: string;
  limit?: number;
  includeInactive?: boolean;
  expect?: RetrievalExpectation;
  trace?: TraceExpectation;
  prompt?: string;
  choices?: string[];
  expectedAnswer?: string;
  expectedEvidence?: string[];
  forbiddenEvidence?: string[];
}

export interface ContinuitySuite {
  schema: typeof CONTINUITY_SUITE_SCHEMA;
  name: string;
  description: string;
  classification: "synthetic" | "sanitized-export";
  telos: string;
  artifacts: ArtifactFixture[];
  units: UnitFixture[];
  now: string;
  cases: ContinuityCase[];
}

interface UnitReceipt {
  handle: string;
  id: string;
  path: string;
  title: string;
  substrate: Substrate;
}

interface GraphEdge {
  from: string;
  type: string;
  to: string;
  resolved: boolean;
}

interface GraphArtifact {
  from: string;
  spec: string;
  status: string;
}

interface GraphReceipt {
  relations: GraphEdge[];
  artifacts: GraphArtifact[];
}

export interface ReplayResponse {
  caseId: string;
  answer: string;
  evidence: string[];
  abstained?: boolean;
}

export interface ReplayResponses {
  schema: typeof CONTINUITY_RESPONSES_SCHEMA;
  responses: ReplayResponse[];
}

interface ReplayPacket {
  caseId: string;
  capability: string;
  prompt: string;
  choices: string[];
  evidence: Array<{
    handle: string;
    substrate: string;
    status: string;
    title: string;
    body: string;
  }>;
}

interface CaseResult {
  id: string;
  capability: string;
  passed: boolean;
  failures: string[];
  details: Record<string, unknown>;
}

interface RunOptions {
  keepWorkspace?: boolean;
  responses?: ReplayResponses;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${context} must be an object`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${context} must be an array of non-empty strings`);
  }
  return value as string[];
}

function safeRelativePath(value: string, context: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (isAbsolute(value) || normalized.split("/").includes("..") || !normalized.startsWith("artifacts/")) {
    throw new Error(`${context} must stay beneath artifacts/`);
  }
  return normalized;
}

function containsPromptusStore(path: string): boolean {
  return resolve(path).replace(/\\/g, "/").split("/").includes(".promptus");
}

function safeInputDataPath(path: string, context: string): string {
  const absolute = realpathSync(resolve(path));
  if (containsPromptusStore(absolute)) throw new Error(`${context} cannot be read from a .promptus store`);
  return absolute;
}

function safeOutputDataPath(path: string, context: string): string {
  const absolute = resolve(path);
  try {
    if (lstatSync(absolute).isSymbolicLink()) {
      throw new Error(`${context} cannot target a symbolic link`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let ancestor = absolute;
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    suffix.unshift(basename(ancestor));
    ancestor = parent;
  }
  const physical = resolve(realpathSync(ancestor), ...suffix);
  if (containsPromptusStore(physical)) throw new Error(`${context} cannot be written into a .promptus store`);
  return absolute;
}

function validateSuite(value: unknown): ContinuitySuite {
  const suite = asRecord(value, "suite");
  if (suite.schema !== CONTINUITY_SUITE_SCHEMA) throw new Error(`suite schema must be ${CONTINUITY_SUITE_SCHEMA}`);
  if (typeof suite.name !== "string" || !suite.name.trim()) throw new Error("suite.name is required");
  if (typeof suite.description !== "string" || !suite.description.trim()) throw new Error("suite.description is required");
  if (!new Set(["synthetic", "sanitized-export"]).has(String(suite.classification))) {
    throw new Error("suite.classification must be synthetic or sanitized-export");
  }
  if (typeof suite.telos !== "string" || !suite.telos.includes("## North star")) {
    throw new Error("suite.telos must contain a North star heading");
  }
  if (typeof suite.now !== "string" || !suite.now.trim()) throw new Error("suite.now is required");
  if (!Array.isArray(suite.artifacts) || !Array.isArray(suite.units) || !Array.isArray(suite.cases)) {
    throw new Error("suite artifacts, units, and cases must be arrays");
  }

  const artifactHandles = new Set<string>();
  for (const [index, raw] of suite.artifacts.entries()) {
    const artifact = asRecord(raw, `artifact ${index}`);
    if (typeof artifact.handle !== "string" || !HANDLE.test(artifact.handle) || artifactHandles.has(artifact.handle)) {
      throw new Error(`artifact ${index} has an invalid or duplicate handle`);
    }
    artifactHandles.add(artifact.handle);
    if (typeof artifact.role !== "string" || !/^[a-z][a-z0-9_-]*$/i.test(artifact.role)) {
      throw new Error(`artifact ${artifact.handle} has an invalid role`);
    }
    if (typeof artifact.path !== "string") throw new Error(`artifact ${artifact.handle} path is required`);
    safeRelativePath(artifact.path, `artifact ${artifact.handle} path`);
    if (typeof artifact.body !== "string") throw new Error(`artifact ${artifact.handle} body is required`);
  }

  const handles = new Set<string>();
  for (const [index, raw] of suite.units.entries()) {
    const unit = asRecord(raw, `unit ${index}`);
    if (typeof unit.handle !== "string" || !HANDLE.test(unit.handle) || handles.has(unit.handle)) {
      throw new Error(`unit ${index} has an invalid or duplicate handle`);
    }
    if (!new Set(["ledger", "finding", "lit", "memory"]).has(String(unit.substrate))) {
      throw new Error(`unit ${unit.handle} has an invalid substrate`);
    }
    for (const field of ["kind", "status", "title", "body"] as const) {
      if (typeof unit[field] !== "string" || !unit[field].trim()) throw new Error(`unit ${unit.handle} ${field} is required`);
    }
    if (unit.source !== undefined && (typeof unit.source !== "string" || !unit.source.trim())) {
      throw new Error(`unit ${unit.handle} source must be a non-empty string`);
    }
    if (unit.artifacts !== undefined) {
      for (const artifact of strings(unit.artifacts, `unit ${unit.handle} artifacts`)) {
        if (!artifactHandles.has(artifact)) throw new Error(`unit ${unit.handle} references unknown artifact ${artifact}`);
      }
    }
    if (unit.relations !== undefined) {
      if (!Array.isArray(unit.relations)) throw new Error(`unit ${unit.handle} relations must be an array`);
      for (const relationRaw of unit.relations) {
        const relation = asRecord(relationRaw, `unit ${unit.handle} relation`);
        if (typeof relation.type !== "string" || !relation.type.trim()) throw new Error(`unit ${unit.handle} relation type is required`);
        if (typeof relation.target !== "string" || !handles.has(relation.target)) {
          throw new Error(`unit ${unit.handle} relation target must name an earlier unit: ${String(relation.target)}`);
        }
      }
    }
    handles.add(unit.handle);
  }

  const caseIds = new Set<string>();
  for (const [index, raw] of suite.cases.entries()) {
    const item = asRecord(raw, `case ${index}`);
    if (typeof item.id !== "string" || !HANDLE.test(item.id) || caseIds.has(item.id)) {
      throw new Error(`case ${index} has an invalid or duplicate id`);
    }
    caseIds.add(item.id);
    if (typeof item.capability !== "string" || !item.capability.trim()) throw new Error(`case ${item.id} capability is required`);
    if (item.query !== undefined && (typeof item.query !== "string" || !item.query.trim())) throw new Error(`case ${item.id} query is invalid`);
    if (item.limit !== undefined && (!Number.isInteger(item.limit) || Number(item.limit) < 1)) throw new Error(`case ${item.id} limit is invalid`);
    const expect = item.expect === undefined ? undefined : asRecord(item.expect, `case ${item.id} expect`);
    for (const field of ["all", "none", "nowContains"] as const) {
      if (expect?.[field] !== undefined) for (const handle of strings(expect[field], `case ${item.id} ${field}`)) {
        if (field !== "nowContains" && !handles.has(handle)) throw new Error(`case ${item.id} references unknown unit ${handle}`);
      }
    }
    if (typeof expect?.first === "string" && !handles.has(expect.first)) throw new Error(`case ${item.id} references unknown first unit`);
    if (typeof expect?.nowThrough === "string" && !handles.has(expect.nowThrough)) throw new Error(`case ${item.id} references unknown NOW unit`);
    if (expect?.statuses !== undefined) for (const handle of Object.keys(asRecord(expect.statuses, `case ${item.id} statuses`))) {
      if (!handles.has(handle)) throw new Error(`case ${item.id} references unknown status unit ${handle}`);
    }
    if (expect?.order !== undefined) {
      if (!Array.isArray(expect.order)) throw new Error(`case ${item.id} order must be an array`);
      for (const pair of expect.order) {
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some((handle) => typeof handle !== "string" || !handles.has(handle))) {
          throw new Error(`case ${item.id} has an invalid order pair`);
        }
      }
    }
    if (item.trace !== undefined) {
      const trace = asRecord(item.trace, `case ${item.id} trace`);
      for (const field of ["start"] as const) {
        if (typeof trace[field] !== "string" || !handles.has(trace[field])) throw new Error(`case ${item.id} trace ${field} is invalid`);
      }
      for (const field of ["reachable", "sourceHandles"] as const) for (const handle of strings(trace[field], `case ${item.id} trace ${field}`)) {
        if (!handles.has(handle)) throw new Error(`case ${item.id} trace references unknown unit ${handle}`);
      }
      strings(trace.artifactRoles, `case ${item.id} trace artifactRoles`);
    }
    if (item.expectedAnswer !== undefined) {
      if (typeof item.prompt !== "string" || !item.prompt.trim()) throw new Error(`case ${item.id} prompt is required for replay scoring`);
      const choices = strings(item.choices, `case ${item.id} choices`);
      if (typeof item.expectedAnswer !== "string" || !choices.includes(item.expectedAnswer)) {
        throw new Error(`case ${item.id} expectedAnswer must be one of its choices`);
      }
      for (const field of ["expectedEvidence", "forbiddenEvidence"] as const) {
        if (item[field] !== undefined) for (const handle of strings(item[field], `case ${item.id} ${field}`)) {
          if (!handles.has(handle)) throw new Error(`case ${item.id} references unknown evidence ${handle}`);
        }
      }
    }
  }
  return suite as unknown as ContinuitySuite;
}

export function loadContinuitySuite(path = DEFAULT_SUITE): ContinuitySuite {
  return validateSuite(JSON.parse(readFileSync(safeInputDataPath(path, "suite"), "utf8")));
}

function markerPath(root: string): string {
  return join(root, ".promptus-benchmark-fixture.json");
}

export function assertDisposableWorkspace(root: string, suiteHash: string): void {
  const project = realpathSync(resolve(root));
  const temporary = realpathSync(resolve(tmpdir()));
  if (project === temporary || !project.startsWith(temporary + sep)) {
    throw new Error("continuity benchmark workspace must be a child of the OS temporary directory");
  }
  if (existsSync(join(project, ".git"))) throw new Error("continuity benchmark refuses a Git working tree");
  const marker = markerPath(project);
  if (!existsSync(marker)) throw new Error("continuity benchmark workspace marker is missing");
  const value = JSON.parse(readFileSync(marker, "utf8")) as Record<string, unknown>;
  if (value.schema !== FIXTURE_MARKER_SCHEMA || value.suiteHash !== suiteHash) {
    throw new Error("continuity benchmark workspace marker does not match the suite");
  }
}

function runScript(root: string, suiteHash: string, script: string, args: string[], stdin = ""): string {
  assertDisposableWorkspace(root, suiteHash);
  const result = spawnSync(process.execPath, [join(SCRIPT_ROOT, script), ...args, "--root", root], {
    cwd: root,
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, OPENROUTER_API_KEY: "" },
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed (${result.status ?? "signal"}): ${(result.stderr || result.stdout).trim()}`);
  }
  if (result.stderr.trim()) throw new Error(`${script} wrote unexpected stderr: ${result.stderr.trim()}`);
  return result.stdout;
}

function ledgerScaffold(name: string): string {
  return [
    `# Research Ledger — ${name}`,
    "",
    "**Updated:** <generated>  ·  **Operator:** synthetic benchmark  ·  **Agent:** deterministic harness",
    "**Timezone:** UTC",
    "",
    "## Mandate",
    "Exercise continuity and traceability without using a live project store.",
    "",
    "<!-- now:start -->",
    "## NOW",
    "<!-- kb:now-through EMPTY -->",
    "Fixture construction is in progress.",
    "",
    "## Open frontier",
    "- Finish fixture construction.",
    "",
    "## Next actions",
    "1. Build the synthetic units.",
    "",
    "## <<< RESUME HERE AFTER COMPACTION >>>",
    "Resume fixture construction.",
    "",
    "<!-- now:end -->",
    "",
    "## Log",
    "",
    "<!-- kb:append-point -->",
    "",
  ].join("\n");
}

function createWorkspace(suite: ContinuitySuite, suiteHash: string): string {
  const root = mkdtempSync(join(tmpdir(), "promptus-continuity-"));
  writeFileSync(markerPath(root), `${JSON.stringify({ schema: FIXTURE_MARKER_SCHEMA, suiteHash }, null, 2)}\n`);
  assertDisposableWorkspace(root, suiteHash);
  const store = join(root, ".promptus");
  mkdirSync(join(store, "ledger"), { recursive: true });
  mkdirSync(join(store, "docs", "lit"), { recursive: true });
  mkdirSync(join(store, "memory"), { recursive: true });
  mkdirSync(join(store, "schema"), { recursive: true });
  writeFileSync(join(store, "TELOS.md"), suite.telos.replace(/\n*$/, "\n"));
  writeFileSync(join(store, "ledger", "RESEARCH-LEDGER.md"), ledgerScaffold(suite.name));
  writeFileSync(join(store, "memory", "MEMORY.md"), `# Memory — ${suite.name}\n\n<!-- kb:append-point -->\n`);
  copyFileSync(join(TEMPLATE_ROOT, "schema", "kb-vocab.json"), join(store, "schema", "kb-vocab.json"));
  return root;
}

function materializeFixture(
  root: string,
  suiteHash: string,
  suite: ContinuitySuite,
): { receipts: UnitReceipt[]; artifacts: Record<string, string> } {
  const artifacts: Record<string, string> = {};
  for (const artifact of suite.artifacts) {
    assertDisposableWorkspace(root, suiteHash);
    const path = join(root, safeRelativePath(artifact.path, `artifact ${artifact.handle} path`));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, artifact.body);
    artifacts[artifact.handle] = `${artifact.role}|${artifact.path}|${sha256(Buffer.from(artifact.body))}`;
  }

  const receipts: UnitReceipt[] = [];
  const byHandle = new Map<string, UnitReceipt>();
  for (const unit of suite.units) {
    const args = [
      "--substrate", unit.substrate,
      "--kind", unit.kind,
      "--status", unit.status,
      "--title", unit.title,
      "--json",
    ];
    if (unit.source) args.push("--source", unit.source);
    for (const relation of unit.relations ?? []) {
      const target = byHandle.get(relation.target);
      if (!target) throw new Error(`unit ${unit.handle} relation target was not materialized: ${relation.target}`);
      args.push("--rel", `${relation.type}:${target.id}`);
    }
    for (const artifact of unit.artifacts ?? []) args.push("--artifact", artifacts[artifact]);
    const result = JSON.parse(runScript(root, suiteHash, "kb-add.ts", args, `${unit.body.trim()}\n`)) as Record<string, unknown>;
    if (typeof result.id !== "string" || typeof result.path !== "string") throw new Error(`kb-add returned an invalid receipt for ${unit.handle}`);
    const receipt: UnitReceipt = {
      handle: unit.handle,
      id: result.id,
      path: result.path,
      title: unit.title,
      substrate: unit.substrate,
    };
    receipts.push(receipt);
    byHandle.set(unit.handle, receipt);
  }
  runScript(root, suiteHash, "kb-now.ts", [], suite.now);
  runScript(root, suiteHash, "kb-index.ts", ["--quiet"]);
  return { receipts, artifacts };
}

function loadIndex(root: string): SearchIndex {
  const index = JSON.parse(readFileSync(join(root, ".promptus", "cache", "search.json"), "utf8")) as SearchIndex;
  if (index.schema !== SEARCH_INDEX_SCHEMA) throw new Error("fixture search index has an unexpected schema");
  return index;
}

function boundedBody(value: string, maxBytes = 2_000): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let body = "";
  for (const point of value) {
    if (Buffer.byteLength(body + point, "utf8") > maxBytes - 3) break;
    body += point;
  }
  return `${body}...`;
}

function retrievalHits(
  root: string,
  index: SearchIndex,
  item: ContinuityCase,
  idToHandle: Map<string, string>,
): Array<{ handle: string; document: SearchDocument; body: string }> {
  if (!item.query) return [];
  return searchIndex(index, item.query, {
    includeInactive: item.includeInactive,
  }, (document) => unitText(root, document.path, document.title))
    .slice(0, item.limit ?? 10)
    .map((hit) => ({
      handle: idToHandle.get(hit.document.id ?? hit.document.key) ?? hit.document.key,
      document: hit.document,
      body: unitText(root, hit.document.path, hit.document.title),
    }));
}

function evaluateRetrievalCase(
  item: ContinuityCase,
  hits: Array<{ handle: string; document: SearchDocument }>,
  statusByHandle: Map<string, string>,
): CaseResult {
  const failures: string[] = [];
  const handles = hits.map((hit) => hit.handle);
  const expect = item.expect ?? {};
  for (const handle of expect.all ?? []) if (!handles.includes(handle)) failures.push(`missing expected hit ${handle}`);
  for (const handle of expect.none ?? []) if (handles.includes(handle)) failures.push(`included forbidden hit ${handle}`);
  if (expect.first && handles[0] !== expect.first) failures.push(`first hit was ${handles[0] ?? "none"}, expected ${expect.first}`);
  if (expect.zeroHits && handles.length) failures.push(`expected no hits, received ${handles.join(", ")}`);
  for (const [left, right] of expect.order ?? []) {
    const leftRank = handles.indexOf(left);
    const rightRank = handles.indexOf(right);
    if (leftRank < 0 || rightRank < 0 || leftRank >= rightRank) failures.push(`expected ${left} to rank above ${right}`);
  }
  for (const [handle, expected] of Object.entries(expect.statuses ?? {})) {
    const actual = statusByHandle.get(handle);
    if (actual !== expected) failures.push(`${handle} status was ${actual ?? "missing"}, expected ${expected}`);
  }
  return {
    id: item.id,
    capability: item.capability,
    passed: failures.length === 0,
    failures,
    details: {
      query: item.query,
      hits: hits.map((hit, index) => ({ rank: index + 1, handle: hit.handle, status: hit.document.status, title: hit.document.title })),
    },
  };
}

function evaluateResumeCase(
  root: string,
  item: ContinuityCase,
  idToHandle: Map<string, string>,
  sessionReady: boolean,
): CaseResult {
  const failures: string[] = [];
  const ledger = readFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "utf8");
  const throughId = /<!-- kb:now-through (\S+) -->/.exec(ledger)?.[1];
  const throughHandle = throughId ? idToHandle.get(throughId) : undefined;
  const expect = item.expect ?? {};
  if (expect.nowThrough && throughHandle !== expect.nowThrough) failures.push(`NOW through was ${throughHandle ?? throughId ?? "missing"}, expected ${expect.nowThrough}`);
  for (const phrase of expect.nowContains ?? []) if (!ledger.toLowerCase().includes(phrase.toLowerCase())) failures.push(`NOW is missing phrase: ${phrase}`);
  if (!sessionReady) failures.push("session doctor did not report READY");
  return {
    id: item.id,
    capability: item.capability,
    passed: failures.length === 0,
    failures,
    details: { nowThrough: throughHandle ?? throughId ?? null, sessionReady },
  };
}

function evaluateTraceCase(
  root: string,
  item: ContinuityCase,
  graph: GraphReceipt,
  receipts: Map<string, UnitReceipt>,
  idToHandle: Map<string, string>,
): CaseResult {
  const failures: string[] = [];
  const trace = item.trace!;
  const start = receipts.get(trace.start);
  if (!start) throw new Error(`trace start is unavailable: ${trace.start}`);
  const seen = new Set([start.id]);
  let frontier = [start.id];
  while (frontier.length) {
    const next: string[] = [];
    for (const from of frontier) for (const edge of graph.relations) {
      if (edge.resolved && edge.from === from && !seen.has(edge.to)) {
        seen.add(edge.to);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  const reachable = new Set([...seen].map((id) => idToHandle.get(id)).filter((handle): handle is string => Boolean(handle)));
  for (const handle of trace.reachable) if (!reachable.has(handle)) failures.push(`trace cannot reach ${handle}`);

  const sources: Record<string, string> = {};
  for (const handle of trace.sourceHandles) {
    const receipt = receipts.get(handle)!;
    const source = parseFrontmatter(unitText(root, receipt.path, receipt.title)).data.source;
    if (typeof source !== "string" || !source.trim()) failures.push(`${handle} has no source`);
    else sources[handle] = source;
  }

  const artifactChecks = graph.artifacts
    .filter((artifact) => seen.has(artifact.from))
    .map((artifact) => ({ from: idToHandle.get(artifact.from) ?? artifact.from, check: checkArtifact(root, parseArtifactSpec(artifact.spec)) }));
  for (const role of trace.artifactRoles) {
    const matching = artifactChecks.filter((entry) => entry.check.role === role);
    if (!matching.length) failures.push(`trace has no ${role} artifact`);
    else if (matching.some((entry) => !entry.check.ok)) failures.push(`${role} artifact failed verification`);
  }
  return {
    id: item.id,
    capability: item.capability,
    passed: failures.length === 0,
    failures,
    details: {
      start: trace.start,
      reachable: [...reachable].sort(),
      sources,
      artifacts: artifactChecks.map((entry) => ({ from: entry.from, ...entry.check })),
    },
  };
}

function replayPackets(
  suite: ContinuitySuite,
  root: string,
  hitsByCase: Map<string, Array<{ handle: string; document: SearchDocument; body: string }>>,
  receipts: Map<string, UnitReceipt>,
  index: SearchIndex,
): ReplayPacket[] {
  return suite.cases.filter((item) => item.expectedAnswer).map((item) => {
    const hits = hitsByCase.get(item.id) ?? [];
    const evidence = hits.map((hit) => ({
      handle: hit.handle,
      substrate: hit.document.substrate,
      status: hit.document.status,
      title: hit.document.title,
      body: boundedBody(hit.body),
    }));
    if (item.capability === "resume") {
      for (const handle of ["ledger-resume", "ledger-decision"]) {
        const receipt = receipts.get(handle);
        const document = receipt
          ? index.documents.find((candidate) => candidate.id === receipt.id)
          : undefined;
        if (receipt && document && !evidence.some((entry) => entry.handle === handle)) {
          evidence.push({
            handle,
            substrate: document.substrate,
            status: document.status,
            title: document.title,
            body: boundedBody(unitText(root, document.path, document.title)),
          });
        }
      }
    }
    return {
      caseId: item.id,
      capability: item.capability,
      prompt: item.prompt!,
      choices: item.choices!,
      evidence,
    };
  });
}

export function scoreReplayResponses(suite: ContinuitySuite, responses: ReplayResponses): Record<string, unknown> {
  if (responses.schema !== CONTINUITY_RESPONSES_SCHEMA || !Array.isArray(responses.responses)) {
    throw new Error(`responses schema must be ${CONTINUITY_RESPONSES_SCHEMA}`);
  }
  const byCase = new Map<string, ReplayResponse>();
  for (const response of responses.responses) {
    if (!response || typeof response.caseId !== "string" || typeof response.answer !== "string" || !Array.isArray(response.evidence)) {
      throw new Error("every replay response requires caseId, answer, and evidence");
    }
    if (byCase.has(response.caseId)) throw new Error(`duplicate replay response: ${response.caseId}`);
    byCase.set(response.caseId, response);
  }
  const scorable = suite.cases.filter((item) => item.expectedAnswer);
  const cases = scorable.map((item) => {
    const response = byCase.get(item.id);
    const answerCorrect = response?.answer === item.expectedAnswer;
    const evidence = new Set(response?.evidence ?? []);
    const evidenceComplete = (item.expectedEvidence ?? []).every((handle) => evidence.has(handle));
    const forbiddenEvidenceAbsent = (item.forbiddenEvidence ?? []).every((handle) => !evidence.has(handle));
    const abstentionCorrect = item.expectedAnswer === "ABSTAIN"
      ? response?.answer === "ABSTAIN" && response.abstained === true && evidence.size === 0
      : response?.abstained !== true;
    return {
      id: item.id,
      answerCorrect,
      evidenceComplete,
      forbiddenEvidenceAbsent,
      abstentionCorrect,
      traceableCorrect: Boolean(response) && answerCorrect && evidenceComplete && forbiddenEvidenceAbsent && abstentionCorrect,
    };
  });
  const count = cases.length;
  const rate = (field: keyof typeof cases[number]) => count
    ? cases.filter((item) => item[field] === true).length / count
    : 0;
  return {
    status: "scored",
    cases,
    metrics: {
      cases: count,
      answerAccuracy: rate("answerCorrect"),
      evidenceCompleteness: rate("evidenceComplete"),
      traceableAccuracy: rate("traceableCorrect"),
    },
  };
}

export function runContinuityBenchmark(suite: ContinuitySuite, options: RunOptions = {}): Record<string, unknown> {
  const suiteHash = sha256(JSON.stringify(suite));
  const root = createWorkspace(suite, suiteHash);
  let report: Record<string, unknown>;
  try {
    const fixture = materializeFixture(root, suiteHash, suite);
    const receipts = new Map(fixture.receipts.map((receipt) => [receipt.handle, receipt]));
    const idToHandle = new Map(fixture.receipts.map((receipt) => [receipt.id, receipt.handle]));
    const check = JSON.parse(runScript(root, suiteHash, "promptus-check.ts", ["--strict", "--json"])) as Record<string, unknown>;
    const doctor = JSON.parse(runScript(root, suiteHash, "promptus-session-doctor.ts", ["--json"])) as Record<string, unknown>;
    const sessionReady = doctor.sessionReady === true;
    const index = loadIndex(root);
    const statusByHandle = new Map<string, string>();
    for (const document of index.documents) {
      const handle = idToHandle.get(document.id ?? document.key);
      if (handle) statusByHandle.set(handle, document.status);
    }
    const graph = JSON.parse(readFileSync(join(root, ".promptus", "cache", "graph.json"), "utf8")) as GraphReceipt;
    const hitsByCase = new Map<string, Array<{ handle: string; document: SearchDocument; body: string }>>();
    const caseResults: CaseResult[] = [];
    for (const item of suite.cases) {
      if (item.capability === "resume") {
        caseResults.push(evaluateResumeCase(root, item, idToHandle, sessionReady));
      } else if (item.trace) {
        caseResults.push(evaluateTraceCase(root, item, graph, receipts, idToHandle));
      } else {
        const hits = retrievalHits(root, index, item, idToHandle);
        hitsByCase.set(item.id, hits);
        caseResults.push(evaluateRetrievalCase(item, hits, statusByHandle));
      }
    }
    const packets = replayPackets(suite, root, hitsByCase, receipts, index);
    const passed = caseResults.filter((item) => item.passed).length;
    const deterministic = {
      passed,
      total: caseResults.length,
      passRate: caseResults.length ? passed / caseResults.length : 0,
      cases: caseResults,
    };
    report = {
      schema: CONTINUITY_REPORT_SCHEMA,
      generatedAt: new Date().toISOString(),
      suite: {
        name: suite.name,
        description: suite.description,
        classification: suite.classification,
        sha256: suiteHash,
      },
      isolation: {
        mode: "generated-marked-temp-workspace",
        acceptsProjectRoot: false,
        liveProjectRootsRead: [],
        liveProjectRootsWritten: [],
        workspaceRoot: options.keepWorkspace ? root : null,
        workspaceRemoved: !options.keepWorkspace,
      },
      fixture: {
        units: fixture.receipts.length,
        artifacts: suite.artifacts.length,
        strictGatePassed: check.healthy === true,
        sessionReady,
      },
      deterministic,
      packets,
      agentReplay: options.responses
        ? scoreReplayResponses(suite, options.responses)
        : { status: "not-run", reason: "No agent response file was supplied; packets are ready for a fresh-session replay." },
      limitations: [
        "The bundled suite is synthetic and validates the harness and Promptus mechanics, not effectiveness on Psi, MoT, Probatio, or Mensura.",
        "Action-use accuracy requires responses from a fresh agent; deterministic retrieval coverage alone is not an agent-behavior result.",
        "A sanitized, self-contained case bundle can be evaluated later without giving this runner a live project path.",
      ],
    };
  } finally {
    if (!options.keepWorkspace) rmSync(root, { recursive: true, force: true });
  }
  return report!;
}

function parseArgs(argv: string[]): Record<string, string | boolean> | "help" {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  const result: Record<string, string | boolean> = {};
  const valued = new Set(["--suite", "--output", "--packets", "--responses"]);
  const switches = new Set(["--keep-workspace"]);
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--root") throw new Error("--root is not supported; the benchmark always creates an isolated temporary fixture");
    if (switches.has(token)) { result[token.slice(2)] = true; continue; }
    if (!valued.has(token)) throw new Error(`unknown argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    result[token.slice(2)] = value;
    index++;
  }
  return result;
}

function writeJson(path: string, value: unknown): void {
  const absolute = safeOutputDataPath(path, "benchmark output");
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

const HELP = `promptus-continuity — isolated continuity and traceability benchmark

usage:
  bun benchmarks/promptus-continuity.ts [--suite <data-only.json>]
      [--output <report.json>] [--packets <packets.json>]
      [--responses <responses.json>] [--keep-workspace]

safety:
  The runner does not accept --root. It creates a marked store beneath the OS
  temporary directory and binds every Promptus command to that store. Suites
  contain fixture data, never paths to live project stores.

agent replay:
  Without --responses, the report validates deterministic continuity mechanics
  and emits fresh-session packets. A response file uses schema
  ${CONTINUITY_RESPONSES_SCHEMA} and is scored for answer plus cited evidence.`;

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === "help") { console.log(HELP); return 0; }
  const output = typeof args.output === "string" ? safeOutputDataPath(args.output, "report") : undefined;
  const packets = typeof args.packets === "string" ? safeOutputDataPath(args.packets, "packets") : undefined;
  const suite = loadContinuitySuite(typeof args.suite === "string" ? args.suite : DEFAULT_SUITE);
  const responses = typeof args.responses === "string"
    ? JSON.parse(readFileSync(safeInputDataPath(args.responses, "responses"), "utf8")) as ReplayResponses
    : undefined;
  const report = runContinuityBenchmark(suite, {
    keepWorkspace: args["keep-workspace"] === true,
    responses,
  });
  if (output) writeJson(output, report);
  if (packets) writeJson(packets, {
    schema: "promptus.continuity-packets.v1",
    suite: (report.suite as Record<string, unknown>).name,
    packets: report.packets,
  });
  console.log(JSON.stringify(report, null, 2));
  const deterministic = report.deterministic as { passed: number; total: number };
  return deterministic.passed === deterministic.total && (report.fixture as { sessionReady: boolean }).sessionReady ? 0 : 1;
}

if (import.meta.main) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (error) {
    console.error(`promptus-continuity: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
