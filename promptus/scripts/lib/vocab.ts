/**
 * vocab.ts — load .promptus/schema/kb-vocab.json and enforce the gate.
 *
 * Three orthogonal facets: KIND (the act/event), STATUS (the claim's epistemic
 * state), RELATION (a typed link). Each substrate carries a closed `core` plus a
 * blessed `extended` set, and a `policy`:
 *   - strict      (finding/lit/memory): an off-vocab kind/status is REFUSED with
 *                 the allowed set, like a failing commit-msg hook.
 *   - permissive  (the ledger): an off-vocab kind/status is WARNED about but still
 *                 written — the lab notebook stays low-friction; you curate later.
 * No single standard ontology covers "research events + epistemic statuses", so the
 * gate enforces a small grounded core and warns elsewhere. See
 * docs/vocab-grounding-no-single-standard-recommend-a-hybrid-gate.md.
 *
 * Contract:
 *   loadVocab(root):       parse <root>/.promptus/schema/kb-vocab.json into a typed Vocab.
 *   validate(vocab, unit): { ok: true, warnings } | { ok: false, error, allowed? }
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface KindStatusSet {
  core: string[];
  extended: string[];
}

export interface SubstrateSpec {
  prefix: string;
  store: string;
  placement: "sentinel" | "file";
  /** how kb-add assembles the unit: "log" (### [ts] KIND/STATUS — title),
   *  "page" (# title + frontmatter), or "memory" (memory frontmatter + index). */
  envelope: "log" | "page" | "memory";
  /** strict = refuse off-vocab; permissive = warn but write. */
  policy: "strict" | "permissive";
  kinds: KindStatusSet;
  statuses: KindStatusSet;
  requires?: string[];
  /** for "file" placement that also maintains an index file (memory). */
  index?: string;
}

export interface RelationSpec {
  /** if set, kb-index sets the relation TARGET to this status (supersedes → SUPERSEDED). */
  inverse_status?: string;
  cito?: string;
  prov?: string;
}

export interface Vocab {
  version: number;
  substrates: Record<string, SubstrateSpec>;
  relations: Record<string, RelationSpec>;
  lit_reuse: Record<string, string>;
  status_glyphs?: Record<string, string>;
  export_context?: Record<string, string>;
  sentinel: string;
}

export interface Relation {
  type: string;
  target: string;
}

export interface UnitInput {
  substrate: string;
  kind: string;
  status: string;
  title: string;
  source?: string;
  reuse?: string;
  links?: string[];
  relations?: Relation[];
}

export type ValidateResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string; allowed?: string[] };

/** The full known set for a facet — the closed core plus the blessed extensions. */
export const known = (s: KindStatusSet): string[] => [...s.core, ...s.extended];

export function loadVocab(root: string): Vocab {
  const p = join(root, ".promptus", "schema", "kb-vocab.json");
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    throw new Error(`vocab not found: ${p} — run /promptus-init to scaffold it`);
  }
  try {
    return JSON.parse(text) as Vocab;
  } catch (e) {
    throw new Error(`malformed vocab ${p}: ${(e as Error).message}`);
  }
}

export function validate(vocab: Vocab, unit: UnitInput): ValidateResult {
  const warnings: string[] = [];
  const sub = vocab.substrates[unit.substrate];
  if (!sub) {
    return { ok: false, error: `unknown substrate "${unit.substrate}"`, allowed: Object.keys(vocab.substrates) };
  }
  if (!unit.title || !unit.title.trim()) {
    return { ok: false, error: "empty title" };
  }

  // A facet value off the known set: a hard error under strict, a warning under permissive.
  const offVocab = (value: string, set: KindStatusSet, facet: "kind" | "status"): boolean => {
    if (known(set).includes(value)) return false;
    if (sub.policy === "permissive") {
      warnings.push(
        `${facet} "${value}" isn't in the ${unit.substrate} vocab — writing anyway; ` +
          `add it to .promptus/schema/kb-vocab.json if it's here to stay`,
      );
      return false;
    }
    return true;
  };

  if (offVocab(unit.kind, sub.kinds, "kind")) {
    return { ok: false, error: `kind "${unit.kind}" not allowed for substrate "${unit.substrate}"`, allowed: known(sub.kinds) };
  }
  if (offVocab(unit.status, sub.statuses, "status")) {
    return { ok: false, error: `status "${unit.status}" not allowed for substrate "${unit.substrate}"`, allowed: known(sub.statuses) };
  }

  for (const req of sub.requires ?? []) {
    const val = (unit as Record<string, unknown>)[req];
    if (typeof val !== "string" || val.trim() === "") {
      return { ok: false, error: `substrate "${unit.substrate}" requires --${req}` };
    }
  }

  // Reuse class and relation types are open: warn, never block.
  if (unit.reuse && !(unit.reuse in vocab.lit_reuse)) {
    warnings.push(`reuse class "${unit.reuse}" isn't known (${Object.keys(vocab.lit_reuse).join(", ")}) — recording anyway`);
  }
  for (const r of unit.relations ?? []) {
    if (!(r.type in vocab.relations)) {
      warnings.push(`relation "${r.type}" isn't a known type (${Object.keys(vocab.relations).join(", ")}) — recording anyway`);
    }
  }

  return { ok: true, warnings };
}
