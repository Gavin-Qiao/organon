/** Shared, source-only contracts for bounded trajectory reviews. */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import { hashStore } from "./store-hash.ts";
import { createRelationResolver, inverseLifecycleStatus } from "./relation-lifecycle.ts";
import type { Relation, Vocab } from "./vocab.ts";
import { collectUnits, type Unit } from "../kb-index.ts";

export const REVIEW_KIND = "REVIEW";
export const REVIEW_SCHEMA = "promptus.trajectory-review.packet.v1";
export const REVIEW_ERROR_SCHEMA = "promptus.trajectory-review.error.v1";
export const REVIEW_START = "START";
export const DEFAULT_REVIEW_BOUND = 200;

/** Relations that can establish membership in one causal research trajectory. */
export const TRAJECTORY_RELATIONS = new Set([
  "extends", "derives-from", "fixes", "supersedes", "refutes", "challenges", "supports",
]);

export interface ReviewMetadata {
  scope: string;
  since: string;
  through: string;
  sourceFingerprint: string;
}

export interface ReviewWriteFields {
  scope?: string;
  since?: string;
  through?: string;
  sourceFingerprint?: string;
}

export interface TrajectoryUnit {
  substrate: string;
  kind: string;
  sourceStatus: string;
  status: string;
  title: string;
  slug: string | null;
  relPath: string;
  links: string[];
  aliases: string[];
  relations: Relation[];
  artifacts: string[];
  text: string;
  cold: boolean;
  id?: string;
  created?: string;
  source?: string;
  review?: ReviewMetadata;
  marker: string;
  chronology?: string;
  chronologySource: "created" | "stable-id" | "missing";
}

export interface ReviewUnit {
  id: string;
  title: string;
  path: string;
  status: string;
  metadata: ReviewMetadata;
  relations: Relation[];
  chronology: string;
}

export interface ResolvedScope {
  key: string;
  mode: "project" | "endeavour";
  rootId: string | null;
  units: TrajectoryUnit[];
  timelessContext: TrajectoryUnit[];
}

export class TrajectoryReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TrajectoryReviewError";
  }
}

export const portablePath = (value: string): string => value.replace(/\\/g, "/");

export const normalizeStatus = (value: string | undefined): string =>
  String(value ?? "").replace(/^[★⚠↩]/, "").trim().toUpperCase();

export function chronologyFromId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const match = /-(\d{8}T\d{6}Z)(?:-|$)/.exec(id);
  return match ? `${match[1]}\0${id}` : undefined;
}

function chronologyFromCreated(created: string | undefined): string | undefined {
  if (!created) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(created);
  return match ? `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}${match[7] ? `.${match[7]}` : ""}` : undefined;
}

/** Stable ID where available; otherwise the existing path+title identity used by retrieval. */
export function sourceMarker(unit: Pick<TrajectoryUnit, "id" | "relPath" | "title">): string {
  return unit.id ?? `path:${portablePath(unit.relPath)}::title:${encodeURIComponent(unit.title)}`;
}

export function compareTrajectoryUnits(left: TrajectoryUnit, right: TrajectoryUnit): number {
  return String(left.chronology).localeCompare(String(right.chronology))
    || left.marker.localeCompare(right.marker)
    || left.relPath.localeCompare(right.relPath)
    || left.title.localeCompare(right.title);
}

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function reviewMetadata(data: Record<string, string | string[]>): ReviewMetadata | undefined {
  const scope = scalar(data.review_scope);
  const since = scalar(data.review_since);
  const through = scalar(data.review_through);
  const sourceFingerprint = scalar(data.review_source_fingerprint);
  if (!scope && !since && !through && !sourceFingerprint) return undefined;
  if (!scope) {
    throw new TrajectoryReviewError(
      "REVIEW_SCOPE_MISSING",
      "a stored REVIEW has bounded metadata but no review_scope; continuation cannot guess which endeavour it belongs to. Pass explicit --since for a draft, then repair or archive the malformed review before persistence",
      { since: since ?? null, through: through ?? null },
    );
  }
  if (!scope || !since || !through || !sourceFingerprint) {
    throw new TrajectoryReviewError(
      "REVIEW_METADATA_INCOMPLETE",
      "a stored REVIEW must carry review_scope, review_since, review_through, and review_source_fingerprint",
      { scope: scope ?? null, since: since ?? null, through: through ?? null, sourceFingerprint: sourceFingerprint ?? null },
    );
  }
  if (!/^project$|^endeavour:.+/.test(scope)) {
    throw new TrajectoryReviewError("REVIEW_SCOPE_INVALID", `stored review scope is not canonical: ${scope}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(sourceFingerprint)) {
    throw new TrajectoryReviewError("REVIEW_FINGERPRINT_INVALID", "stored review_source_fingerprint must be a SHA-256 digest", { scope });
  }
  return { scope, since, through, sourceFingerprint: sourceFingerprint.toLowerCase() };
}

function parseUnit(unit: Unit): TrajectoryUnit {
  const sourceStatus = unit.status;
  if (unit.substrate === "ledger") {
    const head = /^### \[([^\]]+)\] ([^/\n]+)\//m.exec(unit.text);
    const created = head?.[1]?.trim();
    const byCreated = chronologyFromCreated(created);
    const chronology = byCreated ?? chronologyFromId(unit.id);
    const marker = unit.id ?? `path:${portablePath(unit.relPath)}::title:${encodeURIComponent(unit.title)}`;
    return {
      ...unit,
      kind: head?.[2]?.trim() ?? "?",
      sourceStatus,
      created,
      marker,
      chronology,
      chronologySource: byCreated ? "created" : chronology ? "stable-id" : "missing",
    };
  }
  const { data } = parseFrontmatter(unit.text);
  const kind = scalar(data.kind) ?? scalar(data.type) ?? "?";
  const created = scalar(data.created);
  const byCreated = chronologyFromCreated(created);
  const chronology = byCreated ?? chronologyFromId(unit.id);
  const marker = unit.id ?? `path:${portablePath(unit.relPath)}::title:${encodeURIComponent(unit.title)}`;
  return {
    ...unit,
    kind,
    sourceStatus,
    created,
    source: scalar(data.source),
    review: kind.toUpperCase() === REVIEW_KIND ? reviewMetadata(data) : undefined,
    marker,
    chronology,
    chronologySource: byCreated ? "created" : chronology ? "stable-id" : "missing",
  };
}

/** Load source units and apply lifecycle status only to this in-memory projection. */
export function loadTrajectoryUnits(root: string, vocab: Vocab): TrajectoryUnit[] {
  const source = collectUnits(root, vocab).map((unit) => ({
    ...unit,
    links: [...unit.links],
    aliases: [...unit.aliases],
    relations: unit.relations.map((relation) => ({ ...relation })),
    artifacts: [...unit.artifacts],
  }));
  const sourceStatuses = new Map(source.map((unit) => [unit, unit.status]));
  const resolver = createRelationResolver(source);
  for (const unit of source) {
    for (const relation of unit.relations) {
      const target = resolver.resolve(relation.target);
      const projected = target ? inverseLifecycleStatus(vocab, relation, target) : undefined;
      if (target && projected) target.status = projected;
    }
  }
  return source.map((unit) => {
    const parsed = parseUnit(unit);
    parsed.sourceStatus = sourceStatuses.get(unit) ?? unit.status;
    return parsed;
  });
}

export function isReviewUnit(unit: TrajectoryUnit): boolean {
  return unit.substrate === "finding" && unit.kind.toUpperCase() === REVIEW_KIND;
}

function splitOrdered(units: TrajectoryUnit[], context: string): { ordered: TrajectoryUnit[]; timeless: TrajectoryUnit[] } {
  const timeless = units.filter((unit) => !unit.chronology && unit.substrate === "memory");
  const missingTime = units.filter((unit) => !unit.chronology && unit.substrate !== "memory").map((unit) => unit.marker);
  if (missingTime.length) {
    throw new TrajectoryReviewError(
      "SCOPE_NOT_ORDERABLE",
      `${context} contains units without a source timestamp; add or amend an unambiguous created marker before reviewing this scope`,
      { missingTimestamp: missingTime.slice(0, 20) },
    );
  }
  return {
    ordered: units.filter((unit) => Boolean(unit.chronology)).sort(compareTrajectoryUnits),
    timeless: timeless.sort((left, right) => left.marker.localeCompare(right.marker)),
  };
}

/** Resolve only `project` or an exact stable-ID root; never guess from a query or title. */
export function resolveReviewScope(units: TrajectoryUnit[], requested = "project"): ResolvedScope {
  const research = units.filter((unit) => !isReviewUnit(unit));
  const token = requested.startsWith("endeavour:") ? requested.slice("endeavour:".length) : requested;
  if (token === "project") {
    const split = splitOrdered(research, "the project scope");
    return { key: "project", mode: "project", rootId: null, units: split.ordered, timelessContext: split.timeless };
  }
  const matches = research.filter((unit) => unit.id === token);
  if (matches.length !== 1) {
    throw new TrajectoryReviewError(
      matches.length ? "SCOPE_ROOT_AMBIGUOUS" : "SCOPE_ROOT_MISSING",
      `endeavour scope requires one exact stable-ID root; found ${matches.length} match(es) for ${token}`,
      { requested },
    );
  }
  const resolver = createRelationResolver(research);
  const selected = new Set<string>([matches[0].marker]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of research) {
      if (selected.has(unit.marker)) continue;
      const belongs = unit.relations.some((relation) => {
        if (!TRAJECTORY_RELATIONS.has(relation.type)) return false;
        const target = resolver.resolve(relation.target);
        return Boolean(target && selected.has(sourceMarker(target)));
      });
      if (belongs) {
        selected.add(unit.marker);
        changed = true;
      }
    }
  }
  const scoped = research.filter((unit) => selected.has(unit.marker));
  const split = splitOrdered(scoped, `endeavour ${token}`);
  return { key: `endeavour:${token}`, mode: "endeavour", rootId: token, units: split.ordered, timelessContext: split.timeless };
}

export function collectStoredReviews(units: TrajectoryUnit[]): ReviewUnit[] {
  const reviews: ReviewUnit[] = [];
  for (const unit of units.filter(isReviewUnit)) {
    if (!unit.review) {
      throw new TrajectoryReviewError(
        "REVIEW_SCOPE_MISSING",
        `stored REVIEW ${unit.id ?? unit.relPath} has no complete machine-readable review scope`,
        { path: unit.relPath },
      );
    }
    if (!unit.id || !unit.chronology) {
      throw new TrajectoryReviewError("REVIEW_ID_INVALID", `stored REVIEW ${unit.relPath} has no timestamped stable ID`);
    }
    reviews.push({
      id: unit.id,
      title: unit.title,
      path: unit.relPath,
      status: unit.status,
      metadata: unit.review,
      relations: unit.relations,
      chronology: unit.chronology,
    });
  }
  return reviews.sort((left, right) => left.chronology.localeCompare(right.chronology) || left.id.localeCompare(right.id));
}

export function resolveBoundaryUnit(scope: ResolvedScope, marker: string, name: "since" | "through"): TrajectoryUnit | null {
  if (name === "since" && marker === REVIEW_START) return null;
  const matches = scope.units.filter((unit) => unit.marker === marker);
  if (matches.length !== 1) {
    throw new TrajectoryReviewError(
      `${name.toUpperCase()}_BOUNDARY_${matches.length ? "AMBIGUOUS" : "MISSING"}`,
      `${name} boundary ${marker} does not resolve exactly once inside ${scope.key}`,
      { scope: scope.key, marker, matches: matches.length },
    );
  }
  return matches[0];
}

function validateReviewBoundary(review: ReviewUnit, scope: ResolvedScope): void {
  const since = resolveBoundaryUnit(scope, review.metadata.since, "since");
  const through = resolveBoundaryUnit(scope, review.metadata.through, "through");
  if (!through || (since && compareTrajectoryUnits(since, through) >= 0)) {
    throw new TrajectoryReviewError(
      "REVIEW_BOUNDARY_INVALID",
      `stored review ${review.id} does not have an exclusive since boundary before its inclusive through boundary`,
      { since: review.metadata.since, through: review.metadata.through },
    );
  }
}

/** Find the unique tail review for this exact scope; parallel or malformed chains fail closed. */
export function resolvePriorReview(
  reviews: ReviewUnit[],
  scope: ResolvedScope,
): ReviewUnit | null {
  const scoped = reviews.filter((review) => review.metadata.scope === scope.key);
  for (const review of scoped) validateReviewBoundary(review, scope);
  if (!scoped.length) return null;
  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const referenced = new Set<string>();
  for (const review of scoped) {
    const prior = review.relations
      .filter((relation) => relation.type === "extends")
      .map((relation) => reviewById.get(relation.target))
      .filter((unit): unit is ReviewUnit => Boolean(unit));
    if (prior.length > 1) {
      throw new TrajectoryReviewError("PRIOR_REVIEW_AMBIGUOUS", `review ${review.id} extends more than one stored review`);
    }
    if (prior.length === 1) {
      if (prior[0].metadata.scope !== scope.key) {
        throw new TrajectoryReviewError(
          "PRIOR_REVIEW_SCOPE_MISMATCH",
          `review ${review.id} extends a review from ${prior[0].metadata.scope}, not ${scope.key}`,
        );
      }
      if (review.metadata.since !== prior[0].metadata.through) {
        throw new TrajectoryReviewError(
          "PRIOR_REVIEW_BOUNDARY_GAP",
          `review ${review.id} starts at ${review.metadata.since}, not at prior through marker ${prior[0].metadata.through}`,
        );
      }
      referenced.add(prior[0].id);
    }
  }
  const tails = scoped.filter((review) => !referenced.has(review.id));
  if (tails.length !== 1) {
    throw new TrajectoryReviewError(
      "PRIOR_REVIEW_AMBIGUOUS",
      `scope ${scope.key} has ${tails.length} review-chain tails; pass explicit --since to collect a draft without claiming continuation, then repair or explicitly archive the ambiguity before persistence`,
      { tails: tails.map((review) => review.id) },
    );
  }
  return tails[0];
}

function readJSON(path: string): any | null {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

/** Validate REVIEW-specific metadata and continuation inside kb-add's write transaction. */
export function validateReviewPersistence(
  root: string,
  vocab: Vocab,
  unit: { substrate: string; kind: string },
  relations: Relation[],
  fields: ReviewWriteFields,
): void {
  const supplied = Object.values(fields).some((value) => value !== undefined);
  const review = unit.kind.toUpperCase() === REVIEW_KIND;
  if (!review) {
    if (supplied) throw new TrajectoryReviewError("REVIEW_METADATA_WITHOUT_REVIEW", "--review-* metadata is allowed only with finding kind REVIEW");
    return;
  }
  if (unit.substrate !== "finding") {
    throw new TrajectoryReviewError("REVIEW_SUBSTRATE_INVALID", "trajectory reviews are immutable finding pages, not ledger, literature, or memory units");
  }
  if (!fields.scope || !fields.since || !fields.through || !fields.sourceFingerprint) {
    throw new TrajectoryReviewError(
      "REVIEW_METADATA_INCOMPLETE",
      "finding kind REVIEW requires --review-scope, --review-since, --review-through, and --review-fingerprint",
    );
  }
  const fingerprint = fields.sourceFingerprint.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new TrajectoryReviewError("REVIEW_FINGERPRINT_INVALID", "--review-fingerprint must be a SHA-256 digest");
  }
  const source = hashStore(root);
  if (source.hash !== fingerprint) {
    throw new TrajectoryReviewError(
      "REVIEW_SOURCE_CHANGED",
      "the Promptus source changed after packet collection; collect the trajectory packet again before persisting",
      { supplied: fingerprint, current: source.hash },
    );
  }
  const healthPath = join(root, ".promptus", "cache", "health.json");
  const health = existsSync(healthPath) ? readJSON(healthPath) : null;
  if (!health || health.storeHash !== fingerprint || health.healthy !== true) {
    throw new TrajectoryReviewError(
      "REVIEW_HEALTH_NOT_CURRENT",
      "persistence requires a current healthy Promptus receipt for the packet fingerprint",
      { healthPresent: Boolean(health), healthFingerprint: health?.storeHash ?? null, healthy: health?.healthy ?? null },
    );
  }

  const units = loadTrajectoryUnits(root, vocab);
  const scope = resolveReviewScope(units, fields.scope);
  if (scope.key !== fields.scope) {
    throw new TrajectoryReviewError("REVIEW_SCOPE_NOT_CANONICAL", `use canonical review scope ${scope.key}`);
  }
  const reviews = collectStoredReviews(units);
  const prior = resolvePriorReview(reviews, scope);
  const since = resolveBoundaryUnit(scope, fields.since, "since");
  const through = resolveBoundaryUnit(scope, fields.through, "through");
  if (!through || (since && compareTrajectoryUnits(since, through) >= 0)) {
    throw new TrajectoryReviewError("REVIEW_BOUNDARY_INVALID", "review since is exclusive and must precede inclusive through");
  }
  const selected = scope.units.filter((candidate) =>
    (!since || compareTrajectoryUnits(candidate, since) > 0) && compareTrajectoryUnits(candidate, through) <= 0
  );
  if (!selected.length) throw new TrajectoryReviewError("REVIEW_RANGE_EMPTY", "the requested persisted review range contains no source units");

  const reviewExtends = relations.filter((relation) => relation.type === "extends" && reviews.some((candidate) => candidate.id === relation.target));
  if (prior) {
    if (fields.since !== prior.metadata.through) {
      throw new TrajectoryReviewError(
        "REVIEW_CONTINUATION_MISMATCH",
        `successor review must start after prior through marker ${prior.metadata.through}`,
      );
    }
    if (reviewExtends.length !== 1 || reviewExtends[0].target !== prior.id) {
      throw new TrajectoryReviewError(
        "REVIEW_PRIOR_RELATION_REQUIRED",
        `successor review must carry exactly --rel extends:${prior.id}`,
      );
    }
  } else if (reviewExtends.length) {
    throw new TrajectoryReviewError("REVIEW_PRIOR_RELATION_UNEXPECTED", `scope ${scope.key} has no prior review to extend`);
  }
}
