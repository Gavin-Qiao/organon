/**
 * ids.ts — deterministic slugs and unit ids. No randomness (keeps runs
 * reproducible given the same clock; the script, not the model, mints these).
 *
 * Contract:
 *   slugify(title):              lowercase, ascii-folded, hyphenated, capped ~64 chars,
 *                                never empty (fall back to "untitled").
 *   mintId(prefix, stamp, title): "<prefix>-<stamp>-<slug>",
 *                                 e.g. "event-20260628T001234Z-chose-bun".
 */

export function slugify(title: string): string {
  const slug = String(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "") // drop punctuation / accents left by NFKD
    .trim()
    .replace(/[\s_]+/g, "-") // whitespace & underscores -> hyphen
    .replace(/-+/g, "-") // collapse runs
    .replace(/^-|-$/g, "") // trim leading/trailing hyphen
    .slice(0, 64)
    .replace(/-$/, ""); // a trailing hyphen the slice may have left
  return slug || "untitled";
}

export function mintId(prefix: string, stamp: string, title: string): string {
  return `${prefix}-${stamp}-${slugify(title)}`;
}
