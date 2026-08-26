#!/usr/bin/env bun

/**
 * Benchmark Promptus maintenance on an isolated snapshot.
 *
 * Markdown remains authoritative. This harness never mutates the source project:
 * `stage` copies its Promptus store and declared artifact dependencies, while `run`
 * performs all write/index/check trials only inside that copy.
 */

import {
  copyFileSync,
  closeSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { collectUnits } from "../promptus/scripts/kb-index.ts";
import { checkArtifact, parseArtifactSpec, type ArtifactSpec } from "../promptus/scripts/lib/artifacts.ts";
import { parseFrontmatter } from "../promptus/scripts/lib/frontmatter.ts";
import { hashStore } from "../promptus/scripts/lib/store-hash.ts";
import { inspectThinkerExchange, refreshThinkerReadSurfaces } from "../promptus/scripts/lib/thinker.ts";
import { loadVocab } from "../promptus/scripts/lib/vocab.ts";

type Args = Record<string, string | boolean>;

type TimeReceipt = {
  elapsedSeconds: number;
  userSeconds: number;
  systemSeconds: number;
  maxRssKiB: number;
  majorFaults: number;
  minorFaults: number;
  fsInputs: number;
  fsOutputs: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
  exitStatus: number;
};

export type Trial = TimeReceipt & {
  profile: string;
  filesystem: string;
  operation: string;
  iteration: number;
  stdoutBytes: number;
  stdoutSha256: string;
  details?: Record<string, unknown>;
};

type ArtifactRecord = { from: string; spec: string; status?: string };

type Operation = {
  name: string;
  repetitions: number;
  command: (iteration: number) => string[];
  stdin?: (iteration: number) => string;
  parseDetails?: (stdout: string) => Record<string, unknown> | undefined;
};

const REPO_ROOT = resolve(import.meta.dir, "..");
const SCRIPT_ROOT = join(REPO_ROOT, "promptus", "scripts");
const TIME_MARKER = "__PROMPTUS_TIME__";
const TIME_FORMAT = `${TIME_MARKER} elapsed=%e user=%U system=%S rss=%M major=%F minor=%R inputs=%I outputs=%O voluntary=%w involuntary=%c exit=%x`;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      out[key] = value;
      index++;
    } else out[key] = true;
  }
  return out;
}

function required(args: Args, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new Error(`--${name} is required`);
  return value;
}

function within(root: string, path: string): boolean {
  const project = resolve(root);
  const target = resolve(path);
  return target === project || target.startsWith(project + sep);
}

function readGraph(root: string): { artifacts: ArtifactRecord[] } {
  const path = join(root, ".promptus", "cache", "graph.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  return { artifacts: Array.isArray(value.artifacts) ? value.artifacts : [] };
}

function artifactPath(spec: string): string {
  return parseArtifactSpec(spec).path;
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const bytes = readFileSync(path);
  hash.update(bytes);
  return hash.digest("hex");
}

/** Exact SHA-256 with bounded resident memory, for artifact files that may be hundreds of MiB. */
export function sha256FileStreaming(path: string, bufferBytes = 1024 * 1024): string {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(bufferBytes);
  const hash = createHash("sha256");
  try {
    while (true) {
      const bytes = readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function stage(sourceRoot: string, targetRoot: string, artifactMode: "copy" | "hardlink"): Record<string, unknown> {
  const source = realpathSync(resolve(sourceRoot));
  const target = resolve(targetRoot);
  if (within(source, target) || within(target, source)) {
    throw new Error("source and target roots must be distinct and non-nested");
  }
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);

  const started = performance.now();
  mkdirSync(target, { recursive: true });
  cpSync(join(source, ".promptus"), join(target, ".promptus"), {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });

  const records = readGraph(source).artifacts;
  const paths = [...new Set(records.map((record) => artifactPath(record.spec)))].sort();
  let files = 0;
  let directories = 0;
  let missing = 0;
  let bytes = 0;
  let hardlinks = 0;
  let copies = 0;

  for (const relativePath of paths) {
    if (relativePath === ".promptus" || relativePath.startsWith(".promptus/")) continue;
    const sourcePath = resolve(source, relativePath);
    const targetPath = resolve(target, relativePath);
    if (!within(source, sourcePath) || !within(target, targetPath)) throw new Error(`artifact escapes root: ${relativePath}`);
    if (!existsSync(sourcePath)) { missing++; continue; }
    const sourceStat = lstatSync(sourcePath);
    if (sourceStat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      directories++;
      continue;
    }
    const resolvedSource = sourceStat.isSymbolicLink() ? realpathSync(sourcePath) : sourcePath;
    const resolvedStat = statSync(resolvedSource);
    if (!resolvedStat.isFile()) { directories++; mkdirSync(targetPath, { recursive: true }); continue; }
    mkdirSync(dirname(targetPath), { recursive: true });
    if (artifactMode === "hardlink") {
      try {
        linkSync(resolvedSource, targetPath);
        hardlinks++;
      } catch {
        copyFileSync(resolvedSource, targetPath);
        copies++;
      }
    } else {
      copyFileSync(resolvedSource, targetPath);
      copies++;
    }
    files++;
    bytes += resolvedStat.size;
  }

  const sourceHash = hashStore(source);
  const targetHash = hashStore(target);
  if (sourceHash.hash !== targetHash.hash || sourceHash.files !== targetHash.files) {
    throw new Error(`staged Markdown mismatch: ${sourceHash.hash}/${sourceHash.files} != ${targetHash.hash}/${targetHash.files}`);
  }

  return {
    schema: "promptus.maintenance-stage.v1",
    artifactMode,
    artifactRecords: records.length,
    uniqueArtifactPaths: paths.length,
    files,
    directories,
    missing,
    bytes,
    hardlinks,
    copies,
    storeHash: sourceHash.hash,
    sourceFiles: sourceHash.files,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
  };
}

function outcomeCount(outcomes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes) counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
}

function checkWithCachedRoot(root: string, spec: ArtifactSpec, project: string): ReturnType<typeof checkArtifact> {
  const file = resolve(root, spec.path);
  if (!existsSync(file)) return { ...spec, ok: false, outcome: "missing" };
  const realFile = realpathSync(file);
  if (realFile !== project && !realFile.startsWith(project + sep)) return { ...spec, ok: false, outcome: "outside-root" };
  if (!statSync(realFile).isFile()) return { ...spec, ok: false, outcome: "not-file" };
  if (!spec.sha256) return { ...spec, ok: true, outcome: "ok" };
  const actualSha256 = sha256File(realFile);
  return actualSha256 === spec.sha256
    ? { ...spec, actualSha256, ok: true, outcome: "ok" }
    : { ...spec, actualSha256, ok: false, outcome: "hash-mismatch" };
}

function verifyArtifacts(root: string, mode: "current" | "cached-root" | "unique-path" | "unique-path-streaming"): Record<string, unknown> {
  const records = readGraph(root).artifacts;
  const outcomes: string[] = [];
  let bytesRead = 0;
  const project = realpathSync(resolve(root));

  if (mode === "current" || mode === "cached-root") {
    for (const record of records) {
      const spec = parseArtifactSpec(record.spec);
      const checked = mode === "current" ? checkArtifact(root, spec) : checkWithCachedRoot(root, spec, project);
      outcomes.push(checked.outcome);
      if (spec.sha256 && (checked.outcome === "ok" || checked.outcome === "hash-mismatch")) {
        bytesRead += statSync(resolve(root, spec.path)).size;
      }
    }
  } else {
    const grouped = new Map<string, Array<{ spec: ArtifactSpec }>>();
    for (const record of records) {
      const spec = parseArtifactSpec(record.spec);
      grouped.set(spec.path, [...(grouped.get(spec.path) ?? []), { spec }]);
    }
    for (const [path, group] of grouped) {
      const file = resolve(root, path);
      if (!existsSync(file)) { outcomes.push(...group.map(() => "missing")); continue; }
      const realFile = realpathSync(file);
      if (realFile !== project && !realFile.startsWith(project + sep)) {
        outcomes.push(...group.map(() => "outside-root"));
        continue;
      }
      if (!statSync(realFile).isFile()) { outcomes.push(...group.map(() => "not-file")); continue; }
      const needsHash = group.some(({ spec }) => Boolean(spec.sha256));
      const actualSha256 = needsHash
        ? mode === "unique-path-streaming" ? sha256FileStreaming(realFile) : sha256File(realFile)
        : undefined;
      if (needsHash) bytesRead += statSync(realFile).size;
      for (const { spec } of group) {
        outcomes.push(!spec.sha256 || spec.sha256 === actualSha256 ? "ok" : "hash-mismatch");
      }
    }
  }

  const counts = outcomeCount(outcomes);
  return {
    mode,
    records: records.length,
    uniqueSpecs: new Set(records.map((record) => record.spec)).size,
    uniquePaths: new Set(records.map((record) => artifactPath(record.spec))).size,
    bytesRead,
    outcomes: counts,
    outcomeDigest: createHash("sha256").update(outcomes.join("\n")).digest("hex"),
    failures: outcomes.length - (counts.ok ?? 0),
  };
}

function findingFiles(dir: string, top = true): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "archive" || (top && entry.name === "lit")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findingFiles(path, false));
    else if (entry.isFile() && entry.name.endsWith(".md") && !["index.md", "readme.md"].includes(entry.name.toLowerCase())) files.push(path);
  }
  return files;
}

function bindingReceipt(bindings: string[]): { bindings: number; bindingHash: string } {
  const normalized = [...bindings].sort();
  return {
    bindings: normalized.length,
    bindingHash: createHash("sha256").update(normalized.join("\n")).digest("hex"),
  };
}

function thinkerCurrent(root: string): Record<string, unknown> {
  const report = inspectThinkerExchange(root);
  const bindings = report.rounds.flatMap((round) => round.findings.map((finding) =>
    `${round.roundId}|${finding.path}|${finding.id}|${finding.status}|${finding.sha256}`,
  ));
  return {
    rounds: report.rounds.length,
    issues: report.issues.length,
    findingFilesScanned: report.findingFilesScanned,
    statuses: outcomeCount(report.rounds.map((round) => round.status)),
    ...bindingReceipt(bindings),
  };
}

function thinkerSinglePass(root: string): Record<string, unknown> {
  const roundsDir = join(root, ".promptus", "thinker", "rounds");
  const quarantineToRound = new Map<string, string>();
  for (const entry of readdirSync(roundsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const intakePath = join(roundsDir, entry.name, "intake.json");
    if (!existsSync(intakePath)) continue;
    try {
      const intake = JSON.parse(readFileSync(intakePath, "utf8"));
      if (typeof intake?.quarantine?.id === "string") quarantineToRound.set(intake.quarantine.id, entry.name);
    } catch { /* current verifier owns malformed-intake reporting */ }
  }
  const files = findingFiles(join(root, ".promptus", "docs"));
  const bindings: string[] = [];
  for (const path of files) {
    const raw = readFileSync(path);
    const { data } = parseFrontmatter(raw.toString("utf8"));
    if (data.substrate !== "finding" || typeof data.id !== "string" || typeof data.status !== "string") continue;
    const relations = Array.isArray(data.relations) ? data.relations : typeof data.relations === "string" ? [data.relations] : [];
    for (const relation of relations) {
      if (typeof relation !== "string" || !relation.startsWith("derives-from:")) continue;
      const quarantine = relation.slice("derives-from:".length);
      const round = quarantineToRound.get(quarantine);
      if (!round) continue;
      bindings.push(`${round}|${relative(root, path).replace(/\\/g, "/")}|${data.id}|${data.status}|${createHash("sha256").update(raw).digest("hex")}`);
    }
  }
  return {
    roundsWithQuarantine: quarantineToRound.size,
    findingFilesScanned: files.length,
    ...bindingReceipt(bindings),
  };
}

function phase(root: string, name: string): Record<string, unknown> {
  if (name === "collect-units") {
    const units = collectUnits(root, loadVocab(root));
    return { units: units.length, live: units.filter((unit) => !unit.cold).length, cold: units.filter((unit) => unit.cold).length };
  }
  if (name === "hash-store") return hashStore(root);
  if (name === "artifacts-current") return verifyArtifacts(root, "current");
  if (name === "artifacts-cached-root") return verifyArtifacts(root, "cached-root");
  if (name === "artifacts-unique-path") return verifyArtifacts(root, "unique-path");
  if (name === "artifacts-unique-path-streaming") return verifyArtifacts(root, "unique-path-streaming");
  if (name === "thinker-inspect") return thinkerCurrent(root);
  if (name === "thinker-single-pass") return thinkerSinglePass(root);
  if (name === "thinker-refresh") {
    refreshThinkerReadSurfaces(root);
    return { refreshed: true };
  }
  throw new Error(`unknown phase: ${name}`);
}

export function parseTimeReceipt(stderr: string): TimeReceipt {
  const line = stderr.split(/\r?\n/).findLast((value) => value.startsWith(TIME_MARKER));
  if (!line) throw new Error(`missing ${TIME_MARKER} receipt`);
  const values = Object.fromEntries([...line.matchAll(/(\w+)=([0-9.]+)/g)].map((match) => [match[1], Number(match[2])]));
  return {
    elapsedSeconds: values.elapsed,
    userSeconds: values.user,
    systemSeconds: values.system,
    maxRssKiB: values.rss,
    majorFaults: values.major,
    minorFaults: values.minor,
    fsInputs: values.inputs,
    fsOutputs: values.outputs,
    voluntaryContextSwitches: values.voluntary,
    involuntaryContextSwitches: values.involuntary,
    exitStatus: values.exit,
  };
}

async function runTimed(
  command: string[],
  options: { cwd: string; stdin?: string; cpuList?: string },
): Promise<{ receipt: TimeReceipt; stdout: string; stderr: string }> {
  const inner = options.cpuList ? ["taskset", "-c", options.cpuList, ...command] : command;
  const timed = ["/usr/bin/time", "-f", TIME_FORMAT, ...inner];
  const process = Bun.spawn(timed, {
    cwd: options.cwd,
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  const receipt = parseTimeReceipt(stderr);
  if (exit !== receipt.exitStatus) throw new Error(`time/child exit disagreement: ${exit}/${receipt.exitStatus}`);
  return { receipt, stdout, stderr };
}

function jsonDetails(stdout: string): Record<string, unknown> | undefined {
  try { return JSON.parse(stdout); }
  catch { return undefined; }
}

function doctorDetails(stdout: string): Record<string, unknown> | undefined {
  const value = jsonDetails(stdout);
  if (!value) return undefined;
  return {
    sessionReady: value.sessionReady,
    timingMs: value.timingMs,
    scale: value.scale,
    rssBytes: (value.performance as Record<string, unknown> | undefined)?.rssBytes,
  };
}

function operationPlan(root: string, profile: string, suite: string): Operation[] {
  const bun = process.execPath;
  const self = import.meta.path;
  const target = /<!-- kb:now-through (\S+) -->/.exec(readFileSync(join(root, ".promptus", "ledger", "RESEARCH-LEDGER.md"), "utf8"))?.[1];
  if (!target) throw new Error("cannot locate the frozen relation target from NOW");
  const slug = profile.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const phaseCommand = (name: string) => [bun, self, "phase", "--root", root, "--phase", name];
  if (suite === "thinker") return [
    { name: "thinker-inspect", repetitions: 1, command: () => phaseCommand("thinker-inspect"), parseDetails: jsonDetails },
    { name: "thinker-single-pass", repetitions: 1, command: () => phaseCommand("thinker-single-pass"), parseDetails: jsonDetails },
    { name: "thinker-refresh", repetitions: 1, command: () => phaseCommand("thinker-refresh"), parseDetails: jsonDetails },
  ];
  const common: Operation[] = [
    {
      name: "status",
      repetitions: 5,
      command: () => [bun, join(SCRIPT_ROOT, "promptus-status.ts"), "--json", "--root", root],
      parseDetails: (stdout) => {
        const value = jsonDetails(stdout);
        return value ? { schema: value.schema } : undefined;
      },
    },
    {
      name: "retrieval",
      repetitions: 5,
      command: () => [bun, join(SCRIPT_ROOT, "kb-find.ts"), "finite alphabet marked upper certificate", "--limit", "10", "--root", root],
    },
    {
      name: "session-doctor",
      repetitions: 1,
      command: () => [bun, join(SCRIPT_ROOT, "promptus-session-doctor.ts"), "--json", "--root", root],
      parseDetails: doctorDetails,
    },
    { name: "collect-units", repetitions: 2, command: () => phaseCommand("collect-units"), parseDetails: jsonDetails },
    { name: "hash-store", repetitions: 2, command: () => phaseCommand("hash-store"), parseDetails: jsonDetails },
    { name: "artifacts-current", repetitions: 1, command: () => phaseCommand("artifacts-current"), parseDetails: jsonDetails },
    { name: "artifacts-cached-root", repetitions: 1, command: () => phaseCommand("artifacts-cached-root"), parseDetails: jsonDetails },
    { name: "artifacts-unique-path", repetitions: 1, command: () => phaseCommand("artifacts-unique-path"), parseDetails: jsonDetails },
    { name: "artifacts-unique-path-streaming", repetitions: 1, command: () => phaseCommand("artifacts-unique-path-streaming"), parseDetails: jsonDetails },
    {
      name: "index",
      repetitions: 2,
      command: () => [bun, join(SCRIPT_ROOT, "kb-index.ts"), "--quiet", "--root", root],
    },
    {
      name: "check-no-index",
      repetitions: 1,
      command: () => [bun, join(SCRIPT_ROOT, "promptus-check.ts"), "--strict", "--no-index", "--json", "--root", root],
    },
    {
      name: "check-full",
      repetitions: 1,
      command: () => [bun, join(SCRIPT_ROOT, "promptus-check.ts"), "--strict", "--json", "--root", root],
    },
    {
      name: "kb-add-no-relation",
      repetitions: 1,
      command: (iteration) => [bun, join(SCRIPT_ROOT, "kb-add.ts"), "--substrate", "ledger", "--kind", "EXP", "--status", "VALIDATED", "--title", `Maintenance benchmark ${slug} no relation ${iteration}`, "--root", root, "--json"],
      stdin: () => "Isolated benchmark write. This unit exists only in the disposable benchmark snapshot.\n",
      parseDetails: (stdout) => {
        const value = jsonDetails(stdout);
        return value ? { schema: value.schema, substrate: value.substrate, status: value.status } : undefined;
      },
    },
    {
      name: "kb-add-relation-dry-run",
      repetitions: 2,
      command: (iteration) => [bun, join(SCRIPT_ROOT, "kb-add.ts"), "--substrate", "ledger", "--kind", "EXP", "--status", "VALIDATED", "--title", `Maintenance benchmark ${slug} relation dry ${iteration}`, "--rel", `supports:${target}`, "--root", root, "--dry-run", "--json"],
      stdin: () => "Isolated benchmark dry run.\n",
      parseDetails: jsonDetails,
    },
    {
      name: "kb-add-relation",
      repetitions: 1,
      command: (iteration) => [bun, join(SCRIPT_ROOT, "kb-add.ts"), "--substrate", "ledger", "--kind", "EXP", "--status", "VALIDATED", "--title", `Maintenance benchmark ${slug} relation ${iteration}`, "--rel", `supports:${target}`, "--root", root, "--json"],
      stdin: () => "Isolated benchmark write with one typed relation. This unit exists only in the disposable benchmark snapshot.\n",
      parseDetails: (stdout) => {
        const value = jsonDetails(stdout);
        return value ? { schema: value.schema, substrate: value.substrate, status: value.status } : undefined;
      },
    },
  ];
  if (suite === "full") return common;
  if (suite === "read") return common.filter((operation) => ["status", "retrieval", "session-doctor", "collect-units", "hash-store"].includes(operation.name));
  if (suite === "maintenance") return common.filter((operation) => !["status", "retrieval", "session-doctor", "kb-add-no-relation", "kb-add-relation-dry-run", "kb-add-relation"].includes(operation.name));
  if (suite === "hotpath") return common.filter((operation) => [
    "session-doctor", "index", "check-no-index", "check-full",
    "kb-add-no-relation", "kb-add-relation-dry-run", "kb-add-relation",
  ].includes(operation.name));
  if (suite === "index") return common.filter((operation) => operation.name === "index");
  throw new Error(`unknown suite: ${suite}`);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summarizeTrials(trials: Trial[]): Array<Record<string, unknown>> {
  const grouped = new Map<string, Trial[]>();
  for (const trial of trials) grouped.set(trial.operation, [...(grouped.get(trial.operation) ?? []), trial]);
  return [...grouped.entries()].map(([operation, values]) => ({
    operation,
    n: values.length,
    medianSeconds: percentile(values.map((value) => value.elapsedSeconds), 0.5),
    minSeconds: Math.min(...values.map((value) => value.elapsedSeconds)),
    maxSeconds: Math.max(...values.map((value) => value.elapsedSeconds)),
    medianUserSeconds: percentile(values.map((value) => value.userSeconds), 0.5),
    medianSystemSeconds: percentile(values.map((value) => value.systemSeconds), 0.5),
    maxRssMiB: Math.max(...values.map((value) => value.maxRssKiB)) / 1024,
  }));
}

async function run(root: string, profile: string, filesystem: string, output: string, suite: string, cpuList?: string): Promise<Record<string, unknown>> {
  const plan = operationPlan(root, profile, suite);
  const trials: Trial[] = [];
  for (const operation of plan) {
    for (let iteration = 1; iteration <= operation.repetitions; iteration++) {
      console.error(`[${profile}] ${operation.name} ${iteration}/${operation.repetitions}`);
      const result = await runTimed(operation.command(iteration), { cwd: root, stdin: operation.stdin?.(iteration), cpuList });
      if (result.receipt.exitStatus !== 0) {
        throw new Error(`${operation.name} failed (${result.receipt.exitStatus}): ${result.stderr.slice(0, 1000)}`);
      }
      trials.push({
        profile,
        filesystem,
        operation: operation.name,
        iteration,
        ...result.receipt,
        stdoutBytes: Buffer.byteLength(result.stdout),
        stdoutSha256: createHash("sha256").update(result.stdout).digest("hex"),
        details: operation.parseDetails?.(result.stdout),
      });
    }
  }
  const health = JSON.parse(readFileSync(join(root, ".promptus", "cache", "health.json"), "utf8"));
  const report = {
    schema: "promptus.maintenance-benchmark.v1",
    generatedAt: new Date().toISOString(),
    profile,
    filesystem,
    suite,
    cpuList: cpuList ?? "inherited",
    environment: {
      platform: platform(),
      release: release(),
      bun: Bun.version,
      logicalCpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? "unknown",
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtCompletion: freemem(),
    },
    sourceReceipt: {
      storeHash: health.storeHash,
      sourceFiles: health.sourceFiles,
      units: health.units,
      artifactRecords: Array.isArray(health.artifactChecks) ? health.artifactChecks.length : null,
    },
    plan: plan.map(({ name, repetitions }) => ({ name, repetitions })),
    trials,
    summary: summarizeTrials(trials),
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function help(): void {
  console.log(`promptus-maintenance — isolated maintenance benchmark

usage:
  promptus-maintenance stage --source-root <project> --target-root <snapshot> [--artifact-mode copy|hardlink]
  promptus-maintenance phase --root <snapshot> --phase <collect-units|hash-store|artifacts-current|artifacts-cached-root|artifacts-unique-path|artifacts-unique-path-streaming|thinker-inspect|thinker-single-pass|thinker-refresh>
  promptus-maintenance run --root <snapshot> --profile <name> --filesystem <name> --output <json> [--suite full|read|maintenance|hotpath|index|thinker] [--cpu-list <list>]

The source project is read-only. Run trials only against a staged snapshot.`);
}

async function main(argv: string[]): Promise<number> {
  const [command] = argv;
  const args = parseArgs(argv.slice(1));
  if (!command || command === "help" || args.help === true) { help(); return 0; }
  if (command === "stage") {
    const mode = (typeof args["artifact-mode"] === "string" ? args["artifact-mode"] : "copy") as "copy" | "hardlink";
    if (!new Set(["copy", "hardlink"]).has(mode)) throw new Error("--artifact-mode must be copy or hardlink");
    console.log(JSON.stringify(stage(required(args, "source-root"), required(args, "target-root"), mode), null, 2));
    return 0;
  }
  if (command === "phase") {
    console.log(JSON.stringify(phase(required(args, "root"), required(args, "phase")), null, 2));
    return 0;
  }
  if (command === "run") {
    const report = await run(
      required(args, "root"),
      required(args, "profile"),
      required(args, "filesystem"),
      required(args, "output"),
      typeof args.suite === "string" ? args.suite : "full",
      typeof args["cpu-list"] === "string" ? args["cpu-list"] : undefined,
    );
    console.log(JSON.stringify({ schema: report.schema, profile: report.profile, output: resolve(required(args, "output")), summary: report.summary }, null, 2));
    return 0;
  }
  throw new Error(`unknown command: ${command}`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
    console.error(`promptus-maintenance: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
