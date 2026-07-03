/**
 * links.ts — extract the [[wikilink]] graph edges out of a unit's body.
 *
 * Contract:
 *   extractLinks(text): unique link targets found as [[target]] or [[target|alias]].
 *                       Returns the target (left of the pipe), de-duplicated,
 *                       in first-seen order.
 *
 * The [[links]] in markdown ARE the graph (see the invariant) — kb-index walks
 * these to build graph.json; kb-find walks them for multi-hop retrieval.
 */

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // ignore [[...]] inside code (fenced blocks or inline spans): those are mentions of the
  // syntax, not graph edges — e.g. documenting `[[concept-handle]]` in prose.
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose)) !== null) {
    const target = m[1].split("|")[0].trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}
