#!/usr/bin/env bun
/** Bounded source-only navigation. Relations describe evidence, never certify truth. */
import { realpathSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { collectEffectiveUnits, type Unit } from "./lib/read-store.ts";
import { loadVocab } from "./lib/vocab.ts";
import { findProjectRoot } from "./lib/paths.ts";
import { createRelationResolver } from "./lib/relation-lifecycle.ts";
import { checkArtifacts, parseArtifactSpec } from "./lib/artifacts.ts";
import { parseFrontmatter } from "./lib/frontmatter.ts";

export function evidence(root: string, handle: string | undefined, options: { open?: boolean; limit?: number; bodies?: boolean; maxBytes?: number } = {}) {
  const limit = options.limit ?? 20, maxBytes = options.maxBytes ?? 65536;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576) throw Error("EVIDENCE_LIMIT_INVALID: limit 1..200 and max-bytes 1..1048576 required");
  const units = collectEffectiveUnits(root, loadVocab(root));
  const project = realpathSync(root);
  for (const unit of units) {
    const rel = relative(project, realpathSync(join(root, unit.relPath.split("#")[0])));
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw Error("EVIDENCE_PATH_UNSAFE: source escapes project");
  }
  const resolver = createRelationResolver(units);
  const resolve = (target: string) => {
    const matches = units.filter(unit => [unit.id, unit.slug, unit.relPath, ...unit.aliases].includes(target));
    if (matches.length > 1) throw Error(`IDENTITY_AMBIGUOUS: ${target}; use a unique stable ID`);
    return matches[0] ?? resolver.resolve(target);
  };
  const selected = handle ? resolve(handle) : undefined;
  if (handle && !selected) throw Error(`EVIDENCE_UNKNOWN: ${handle}; search the source catalog; absence is not a truth verdict`);
  if (!selected && !options.open) throw Error("provide a stable ID/slug/alias or --open");
  const key = (unit: Unit) => unit.id ?? unit.relPath;
  const edges: Array<{ from: string; type: string; to: string; resolved: boolean }> = [];
  const picked = new Set<Unit>(selected ? [selected] : []);
  for (const unit of units) for (const relation of unit.relations) {
    const target = resolve(relation.target);
    if (selected && (unit === selected || target === selected)) {
      edges.push({ from: key(unit), type: relation.type, to: target ? key(target) : relation.target, resolved: !!target });
      picked.add(unit); if (target) picked.add(target);
    }
  }
  if (options.open) for (const unit of units) if (unit.status.toUpperCase() === "OPEN" && !unit.cold) picked.add(unit);
  const ordered = [...picked].sort((a, b) => a === selected ? -1 : b === selected ? 1 : key(a).localeCompare(key(b)));
  let remaining = maxBytes;
  const cards = ordered.slice(0, limit).map(unit => {
    const size = Buffer.byteLength(unit.text), include = !!options.bodies && size <= remaining;
    if (include) remaining -= size;
    const artifacts = checkArtifacts(root, unit.artifacts.slice(0, limit).map(parseArtifactSpec));
    return { id: key(unit), title: unit.title, path: unit.relPath, substrate: unit.substrate, status: unit.status, cold: unit.cold,
      source: parseFrontmatter(unit.text).data.source ?? null, artifacts, artifactsTotal: unit.artifacts.length,
      ...(include ? { body: unit.text } : {}), bodyState: include ? "included" : options.bodies ? "over-budget-fetch-with-kb-get" : "fetch-with-kb-get" };
  });
  return { schema: "promptus.evidence.v1", root, selected: selected ? key(selected) : null, cards, total: ordered.length,
    edges: edges.slice(0, limit), edgesTotal: edges.length, truncated: ordered.length > limit || edges.length > limit,
    issues: cards.flatMap(card => card.artifacts.filter(artifact => !artifact.ok).map(artifact => ({ code: "EVIDENCE_ARTIFACT_FAILED", owner: card.id, path: artifact.path, outcome: artifact.outcome,
      recovery: "Inspect the source owner and obtain or correct the evidence with scoped authority; reindexing cannot restore it." }))),
    interpretation: "Typed support is recorded attribution, not proof. Effective status is preserved. OPEN lists explicit current OPEN records, not every unresolved scientific question. Missing relations do not establish absence of evidence. Fetch omitted bodies before asserting claims.",
    guarantee: "Read-only; no index refresh, annotation, source repair or scientific promotion." };
}

export function main(args: string[]) {
  if (args.includes("--help")) { console.log("kb-evidence [ID|slug|alias] [--open] [--bodies] [--limit 20] [--max-bytes 65536] [--root project]\nJSON source-only support/replacement/open-work navigation. Bodies and output are bounded."); return 0; }
  let handle: string | undefined, root = process.cwd(); const options: Parameters<typeof evidence>[2] = {}, seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) { if (handle) throw Error("one evidence handle only"); handle = arg; continue; }
    if (seen.has(arg)) throw Error(`duplicate flag ${arg}`); seen.add(arg);
    if (arg === "--open") options.open = true;
    else if (arg === "--bodies") options.bodies = true;
    else if (["--root", "--limit", "--max-bytes"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) {
      const value = args[++i]; if (arg === "--root") root = value; else if (arg === "--limit") options.limit = Number(value); else options.maxBytes = Number(value);
    } else throw Error(`invalid argument ${arg}`);
  }
  console.log(JSON.stringify(evidence(findProjectRoot(root), handle, options), null, 2)); return 0;
}
if (import.meta.main) try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.log(JSON.stringify({ code: "EVIDENCE_NAVIGATION_FAILED", message: String(error), recovery: "Inspect the source identity and named dependencies; no repair was performed." })); process.exitCode = 1; }
