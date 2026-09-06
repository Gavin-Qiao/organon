/** Shared target resolution and lifecycle projection for typed relations. */

import { slugify } from "./ids.ts";
import { known, type Relation, type Vocab } from "./vocab.ts";

export interface RelationUnit {
  substrate: string;
  title: string;
  slug: string | null;
  aliases: string[];
  relPath: string;
  id?: string;
}

export interface RelationResolver<T extends RelationUnit> {
  resolve(target: string): T | undefined;
  aliasCount(target: string): number;
}

/** Resolve the same stable IDs, slugs, aliases, and legacy ledger IDs everywhere. */
export function createRelationResolver<T extends RelationUnit>(units: T[]): RelationResolver<T> {
  const byId = new Map(units.filter((unit) => unit.id).map((unit) => [unit.id!, unit]));
  const bySlug = new Map(units.filter((unit) => unit.slug).map((unit) => [unit.slug!, unit]));
  const byAlias = new Map<string, T[]>();
  for (const unit of units) {
    for (const alias of unit.aliases) byAlias.set(alias, [...(byAlias.get(alias) ?? []), unit]);
  }
  const ledgerByTitle = new Map<string, T[]>();
  for (const unit of units.filter((item) => item.substrate === "ledger")) {
    const titleSlug = slugify(unit.title);
    ledgerByTitle.set(titleSlug, [...(ledgerByTitle.get(titleSlug) ?? []), unit]);
  }
  return {
    resolve(target: string): T | undefined {
      const direct = byId.get(target) ?? bySlug.get(target);
      if (direct) return direct;
      const aliasMatches = byAlias.get(target) ?? [];
      if (aliasMatches.length === 1) return aliasMatches[0];
      const legacy = /^event-\d{8}T\d{6}Z-(.+)$/.exec(target)?.[1];
      if (!legacy) return undefined;
      const matches = ledgerByTitle.get(legacy) ?? [];
      return matches.length === 1 ? matches[0] : undefined;
    },
    aliasCount(target: string): number {
      return byAlias.get(target)?.length ?? 0;
    },
  };
}

/**
 * Return a relation's derived target status and prove that it is legal for that substrate.
 * Source Markdown is never changed; this status exists only in catalog/graph projections.
 */
export function inverseLifecycleStatus(
  vocab: Vocab,
  relation: Relation,
  target: RelationUnit,
): string | undefined {
  const spec = vocab.relations[relation.type];
  if (!spec) return undefined;
  const mapped = spec.inverse_status_by_substrate != null &&
    Object.prototype.hasOwnProperty.call(spec.inverse_status_by_substrate, target.substrate);
  const status = mapped ? spec.inverse_status_by_substrate![target.substrate] : spec.inverse_status;
  if (status === undefined) return undefined;
  if (typeof status !== "string" || !status.trim()) {
    throw new Error(`relation "${relation.type}" has an invalid inverse status mapping for ${target.substrate}`);
  }
  const substrate = vocab.substrates[target.substrate];
  if (!substrate) {
    throw new Error(`relation "${relation.type}" targets unknown substrate "${target.substrate}"`);
  }
  const legal = [...known(substrate.statuses), ...(substrate.derived_statuses ?? [])];
  if (!legal.includes(status)) {
    throw new Error(
      `relation "${relation.type}" requests inverse status "${status}" for ${target.substrate}, ` +
        `but that substrate allows: ${legal.join(", ")}`,
    );
  }
  return status;
}
