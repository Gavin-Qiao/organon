#!/usr/bin/env bun
/** Deterministic, bounded evidence packet for an agentic trajectory review. */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createRelationResolver } from "./lib/relation-lifecycle.ts";
import { findProjectRoot } from "./lib/paths.ts";
import { loadVocab } from "./lib/vocab.ts";
import {
  collectStoredReviews,
  compareTrajectoryUnits,
  DEFAULT_REVIEW_BOUND,
  isReviewUnit,
  loadTrajectoryUnits,
  normalizeStatus,
  portablePath,
  resolveBoundaryUnit,
  resolvePriorReview,
  resolveReviewScope,
  REVIEW_ERROR_SCHEMA,
  REVIEW_SCHEMA,
  REVIEW_START,
  sourceMarker,
  TRAJECTORY_RELATIONS,
  TrajectoryReviewError,
  type ReviewUnit,
  type TrajectoryUnit,
} from "./lib/trajectory-review.ts";

type Args = Record<string, string | boolean>;

interface DoctorReport {
  schema?: string;
  sessionReady?: boolean;
  readOnly?: boolean;
  orientation?: Record<string, string>;
  orientationSource?: { northStarHeading?: string | null };
  handoff?: { markers?: string[]; expected?: string; fresh?: boolean };
  source?: { fingerprint?: string; files?: number; bytes?: number };
  schemaCompatibility?: unknown;
  issues?: Array<{ severity?: string; code?: string; message?: string }>;
  guarantee?: string;
}

const HELP = `promptus-trajectory-review — bounded, read-only trajectory evidence
usage: promptus-trajectory-review [--scope project|<stable-root-id>]
       [--since START|<source-marker>] [--through <source-marker>]
       [--max-units <n>] [--json] [--root <dir>]

The exclusive --since boundary defaults to the unique prior review's through
marker for this exact scope, or START. A source marker is a stable ID when one
exists, otherwise the packet's unambiguous legacy path-plus-title marker. The inclusive --through boundary defaults
to the latest non-review unit in scope. Scope roots are exact stable IDs; titles
and lexical queries are never guessed. Exceeding --max-units fails without a
partial packet or any write.`;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const name = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[name] = true;
    else { args[name] = next; index++; }
  }
  return args;
}

function stringArg(args: Args, name: string): string | undefined {
  return typeof args[name] === "string" ? String(args[name]) : undefined;
}

function runPreflight(root: string): DoctorReport {
  const result = spawnSync(
    process.execPath,
    [join(import.meta.dir, "promptus-session-doctor.ts"), "--root", root, "--json"],
    { encoding: "utf8" },
  );
  let report: DoctorReport | null = null;
  try { report = JSON.parse(result.stdout || "null") as DoctorReport | null; }
  catch { /* reported below */ }
  if (!report || result.status === 2) {
    throw new TrajectoryReviewError(
      "PREFLIGHT_UNAVAILABLE",
      "the read-only session doctor did not return a usable JSON receipt",
      { status: result.status, stderr: String(result.stderr ?? "").trim().slice(0, 1000) },
    );
  }
  if (result.status !== 0 || report.sessionReady !== true) {
    throw new TrajectoryReviewError(
      "PREFLIGHT_FAILED",
      "trajectory collection stopped because the existing Promptus session preflight is not READY",
      {
        issues: (report.issues ?? []).filter((issue) => issue.severity === "error"),
        remediation: "Run promptus-session-doctor directly, repair the named state through existing operator-authorized workflows, then collect again.",
      },
    );
  }
  return report;
}

function unitRef(unit: TrajectoryUnit, resolver: ReturnType<typeof createRelationResolver<TrajectoryUnit>>) {
  return {
    marker: unit.marker,
    id: unit.id,
    chronology: unit.chronology?.split("\0")[0] ?? null,
    substrate: unit.substrate,
    kind: unit.kind,
    status: unit.status,
    sourceStatus: unit.sourceStatus,
    title: unit.title,
    path: portablePath(unit.relPath),
    created: unit.created ?? null,
    chronologySource: unit.chronologySource,
    cold: unit.cold,
    source: unit.source ?? null,
    relations: unit.relations.map((relation) => {
      const target = resolver.resolve(relation.target);
      return {
        type: relation.type,
        target: relation.target,
        resolved: Boolean(target),
        resolvedId: target?.id ?? null,
        resolvedPath: target ? portablePath(target.relPath) : null,
      };
    }),
  };
}

function countsBy(units: TrajectoryUnit[], key: (unit: TrajectoryUnit) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) counts[key(unit)] = (counts[key(unit)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

const markers = (units: TrajectoryUnit[]): string[] => units.map((unit) => unit.marker).sort();

function stopped(unit: TrajectoryUnit): boolean {
  const status = normalizeStatus(unit.status);
  return ["REFUTED", "SUPERSEDED", "RETIRED", "WONTFIX"].includes(status)
    || ["DEADEND", "MISTAKE"].includes(unit.kind.toUpperCase());
}

function collectContext(
  selected: TrajectoryUnit[],
  allUnits: TrajectoryUnit[],
  maximum: number,
  initialContext: TrajectoryUnit[] = [],
) {
  const resolver = createRelationResolver(allUnits);
  const selectedMarkers = new Set(markers(selected));
  const context = new Map<string, TrajectoryUnit>(initialContext.map((unit) => [unit.marker, unit]));
  if (selected.length + context.size > maximum) {
    throw new TrajectoryReviewError(
      "RANGE_TOO_LARGE",
      `the bounded evidence range plus non-chronological memory needs more than ${maximum} units; narrow the scope or raise --max-units explicitly`,
      { selected: selected.length, context: context.size, maximum },
    );
  }
  const queue = [...selected, ...initialContext];
  const edges = new Map<string, {
    from: string; type: string; target: string; to: string | null;
    resolved: boolean; fromInBoundary: boolean; toInBoundary: boolean;
  }>();
  const unresolved: Array<{ from: string; type: string; target: string }> = [];
  while (queue.length) {
    const unit = queue.shift()!;
    for (const relation of unit.relations) {
      if (!TRAJECTORY_RELATIONS.has(relation.type)) continue;
      const target = resolver.resolve(relation.target);
      const from = unit.marker;
      const to = target ? sourceMarker(target) : null;
      const edge = {
        from,
        type: relation.type,
        target: relation.target,
        to,
        resolved: Boolean(target),
        fromInBoundary: selectedMarkers.has(from),
        toInBoundary: Boolean(to && selectedMarkers.has(to)),
      };
      edges.set(`${from}\0${relation.type}\0${relation.target}`, edge);
      if (!target) {
        unresolved.push({ from, type: relation.type, target: relation.target });
        continue;
      }
      if (isReviewUnit(target) || selectedMarkers.has(target.marker) || context.has(target.marker)) continue;
      if (!target.chronology && target.substrate !== "memory") {
        throw new TrajectoryReviewError(
          "CONTEXT_NOT_ORDERABLE",
          `causal context ${target.relPath} has no timestamped stable ID`,
          { from, relation: relation.type },
        );
      }
      if (!context.has(target.marker)) {
        context.set(target.marker, target);
        queue.push(target);
        if (selected.length + context.size > maximum) {
          throw new TrajectoryReviewError(
            "RANGE_TOO_LARGE",
            `the bounded evidence closure needs more than ${maximum} units; narrow --since/--through or raise --max-units explicitly`,
            { selected: selected.length, contextAtFailure: context.size, maximum },
          );
        }
      }
    }
  }
  return {
    resolver,
    context: [...context.values()].sort(compareTrajectoryUnits),
    edges: [...edges.values()].sort((left, right) =>
      left.from.localeCompare(right.from) || left.type.localeCompare(right.type) || left.target.localeCompare(right.target)
    ),
    unresolved,
  };
}

function priorRef(prior: ReviewUnit | null) {
  return prior ? {
    id: prior.id,
    title: prior.title,
    path: portablePath(prior.path),
    status: prior.status,
    through: prior.metadata.through,
    sourceFingerprint: prior.metadata.sourceFingerprint,
  } : null;
}

export function collectTrajectoryReview(argv: string[]) {
  const args = parseArgs(argv);
  const root = findProjectRoot(stringArg(args, "root") ?? process.cwd());
  const maximumRaw = stringArg(args, "max-units") ?? String(DEFAULT_REVIEW_BOUND);
  const maximum = Number(maximumRaw);
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new TrajectoryReviewError("BOUND_INVALID", `--max-units must be a positive integer, received ${maximumRaw}`);
  }

  const preflight = runPreflight(root);
  const vocab = loadVocab(root);
  const allUnits = loadTrajectoryUnits(root, vocab);
  const requestedScope = stringArg(args, "scope") ?? "project";
  const scope = resolveReviewScope(allUnits, requestedScope);
  const explicitSince = stringArg(args, "since");
  let reviews: ReviewUnit[] = [];
  let prior: ReviewUnit | null = null;
  let priorReviewIssue: { code: string; message: string; details: Record<string, unknown> } | null = null;
  try {
    reviews = collectStoredReviews(allUnits);
    prior = resolvePriorReview(reviews, scope);
  } catch (error) {
    if (!(explicitSince && error instanceof TrajectoryReviewError && /^(?:REVIEW|PRIOR_REVIEW)_/.test(error.code))) throw error;
    priorReviewIssue = { code: error.code, message: error.message, details: error.details };
  }
  const sinceMarker = explicitSince ?? prior?.metadata.through ?? REVIEW_START;
  const explicitThrough = stringArg(args, "through");
  const latest = scope.units.at(-1);
  if (!latest) throw new TrajectoryReviewError("SCOPE_EMPTY", `${scope.key} has no reviewable source units`);
  const throughMarker = explicitThrough ?? latest.marker;
  const since = resolveBoundaryUnit(scope, sinceMarker, "since");
  const through = resolveBoundaryUnit(scope, throughMarker, "through");
  if (!through || (since && compareTrajectoryUnits(since, through) >= 0)) {
    throw new TrajectoryReviewError(
      "BOUNDARY_INVALID",
      "--since is exclusive and must chronologically precede inclusive --through",
      { since: sinceMarker, through: throughMarker },
    );
  }
  const selected = scope.units.filter((unit) =>
    (!since || compareTrajectoryUnits(unit, since) > 0) && compareTrajectoryUnits(unit, through) <= 0
  );
  if (!selected.length) {
    throw new TrajectoryReviewError("RANGE_EMPTY", `no ${scope.key} units occur after ${sinceMarker} through ${throughMarker}`);
  }
  if (selected.length > maximum) {
    throw new TrajectoryReviewError(
      "RANGE_TOO_LARGE",
      `the requested range contains ${selected.length} units, above the explicit bound ${maximum}; narrow --since/--through or raise --max-units`,
      { selected: selected.length, maximum, first: selected[0].marker, last: selected.at(-1)?.marker },
    );
  }

  const closure = collectContext(selected, allUnits, maximum, scope.timelessContext);
  const statuses = (wanted: string) => selected.filter((unit) => normalizeStatus(unit.status) === wanted);
  const kinds = (wanted: string) => selected.filter((unit) => unit.kind.toUpperCase() === wanted);
  const inactive = new Set(["SUPERSEDED", "REFUTED", "RETIRED"]);
  const active = selected.filter((unit) => !unit.cold && !inactive.has(normalizeStatus(unit.status)));
  const positiveKinds = new Set(["RESULT", "FINDING", "CLAIM", "METHOD", "CONCEPT"]);
  const positive = selected.filter((unit) => normalizeStatus(unit.status) === "VALIDATED" && positiveKinds.has(unit.kind.toUpperCase()));
  const negative = selected.filter((unit) => stopped(unit));
  const missingSources = [...selected, ...closure.context]
    .filter((unit) => unit.substrate === "lit" && !unit.source)
    .map((unit) => ({ id: unit.id, path: portablePath(unit.relPath), status: unit.status }));
  const byMarker = new Map(allUnits.map((unit) => [unit.marker, unit]));
  const reopenRelations = new Set(["challenges", "extends", "fixes", "supports"]);
  const reopenCandidates = closure.edges.flatMap((edge) => {
    if (!edge.to || !edge.fromInBoundary || !reopenRelations.has(edge.type)) return [];
    const target = byMarker.get(edge.to);
    if (!target || !stopped(target)) return [];
    return [{
      unit: edge.from,
      relation: edge.type,
      stoppedTarget: edge.to,
      targetDisposition: normalizeStatus(target.status),
      targetKind: target.kind,
      interpretation: "candidate only — inspect both bodies before calling this route reopened",
    }];
  });

  const dispositionGroups = {
    active: markers(active),
    superseded: markers(statuses("SUPERSEDED")),
    refuted: markers(statuses("REFUTED")),
    retired: markers(statuses("RETIRED")),
    confounded: markers(statuses("CONFOUNDED")),
    deadEnd: markers(kinds("DEADEND")),
    open: markers(statuses("OPEN")),
    conjectured: markers(statuses("CONJECTURED")),
    untrusted: markers(statuses("UNTRUSTED")),
  };

  return {
    schema: REVIEW_SCHEMA,
    readOnly: true,
    root: portablePath(root),
    source: {
      fingerprint: preflight.source?.fingerprint ?? null,
      files: preflight.source?.files ?? null,
      bytes: preflight.source?.bytes ?? null,
      boundedNowMarker: preflight.handoff?.markers?.[0] ?? null,
      boundedNowExpected: preflight.handoff?.expected ?? null,
    },
    frontier: {
      telos: { path: ".promptus/TELOS.md", heading: preflight.orientationSource?.northStarHeading ?? null },
      now: { path: portablePath(vocab.substrates.ledger.store), marker: preflight.handoff?.markers?.[0] ?? null },
      orientation: preflight.orientation ?? {},
      policy: "Bounded references and orientation only; no Telos, NOW, or ledger body dump is embedded.",
    },
    scope: {
      key: scope.key,
      mode: scope.mode,
      rootId: scope.rootId,
      rootTitle: scope.rootId ? scope.units.find((unit) => unit.id === scope.rootId)?.title ?? null : null,
      membershipRelations: [...TRAJECTORY_RELATIONS].sort(),
      reviewableUnits: scope.units.length,
      nonChronologicalMemoryUnits: scope.timelessContext.length,
      resolution: scope.mode === "project" ? "whole project" : "exact stable-ID root plus inbound causal-relation closure",
    },
    boundary: {
      since: { marker: sinceMarker, inclusive: false, resolution: explicitSince ? "explicit" : prior ? "prior-review" : "scope-start" },
      through: { marker: throughMarker, inclusive: true, resolution: explicitThrough ? "explicit" : "latest-in-scope" },
      priorReview: priorRef(prior),
    },
    bounds: { maximumEvidenceUnits: maximum, selectedUnits: selected.length, causalContextUnits: closure.context.length },
    counts: {
      byStatus: countsBy(selected, (unit) => normalizeStatus(unit.status) || "?"),
      byKind: countsBy(selected, (unit) => unit.kind || "?"),
      bySubstrate: countsBy(selected, (unit) => unit.substrate),
    },
    dispositionGroups,
    resultCandidates: {
      positive: markers(positive),
      negative: markers(negative),
      policy: "Positive means an active VALIDATED result-like metadata candidate; negative means an explicit stopped status or DEADEND/MISTAKE kind. Scientific sign still requires body review.",
    },
    reopenCandidates,
    units: selected.map((unit) => unitRef(unit, closure.resolver)),
    causalContext: closure.context.map((unit) => unitRef(unit, closure.resolver)),
    causalRelations: closure.edges,
    unresolved: {
      relations: closure.unresolved,
      missingSources,
      priorReview: priorReviewIssue,
      preflightWarnings: (preflight.issues ?? []).filter((issue) => issue.severity !== "error"),
    },
    schemaCompatibility: preflight.schemaCompatibility ?? null,
    interpretationBoundary: [
      "Counts and groups are navigation aids, not research-quality or progress scores.",
      "No truth, causal importance, reopening, or spiralling judgement is inferred from titles, counts, graph rank, or thinker output.",
      "The packet contains headers and relations only; every claim in a review still requires kb-get of the cited unit body.",
      "Review labels such as main spine, supporting material, reusable method, parked branch, and retired branch are agent judgements, never source statuses.",
    ],
    preflight: {
      schema: preflight.schema ?? null,
      sessionReady: preflight.sessionReady,
      readOnly: preflight.readOnly,
      guarantee: preflight.guarantee ?? null,
    },
    guarantee: "No source or derived file was written, rebuilt, repaired, refreshed, truncated, or reclassified.",
  };
}

function printHuman(packet: ReturnType<typeof collectTrajectoryReview>): void {
  console.log(`promptus-trajectory-review: ${packet.scope.key}`);
  console.log(`  source: ${String(packet.source.fingerprint).slice(0, 12)} · NOW ${packet.source.boundedNowMarker}`);
  console.log(`  boundary: (${packet.boundary.since.marker}, ${packet.boundary.through.marker}] · ${packet.bounds.selectedUnits} unit(s) + ${packet.bounds.causalContextUnits} causal context`);
  console.log(`  candidates: ${packet.resultCandidates.positive.length} positive · ${packet.resultCandidates.negative.length} negative · ${packet.reopenCandidates.length} possible reopen/challenge`);
  console.log("  chronology:");
  for (const unit of packet.units) {
    console.log(`    ${unit.chronology} · ${unit.substrate}:${unit.status} · ${unit.kind} · ${unit.title} · ${unit.marker}`);
  }
  if (packet.causalContext.length) {
    console.log("  causal context outside the boundary:");
    for (const unit of packet.causalContext) console.log(`    ${unit.substrate}:${unit.status} · ${unit.title} · ${unit.marker}`);
  }
  console.log(`  ${packet.guarantee}`);
}

function printError(error: TrajectoryReviewError, json: boolean): void {
  const result = {
    schema: REVIEW_ERROR_SCHEMA,
    readOnly: true,
    code: error.code,
    message: error.message,
    details: error.details,
    guarantee: "No trajectory-review source or derived write was attempted.",
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.error(`promptus-trajectory-review: ${error.code}: ${error.message}`);
    if (Object.keys(error.details).length) console.error(`  ${JSON.stringify(error.details)}`);
  }
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const json = argv.includes("--json");
  try {
    const packet = collectTrajectoryReview(argv);
    if (json) console.log(JSON.stringify(packet, null, 2));
    else printHuman(packet);
    return 0;
  } catch (error) {
    const known = error instanceof TrajectoryReviewError
      ? error
      : new TrajectoryReviewError("COLLECTOR_FAILED", error instanceof Error ? error.message : String(error));
    printError(known, json);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
