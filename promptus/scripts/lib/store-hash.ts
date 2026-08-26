/** Canonical fingerprint of Promptus Markdown truth and governed custody sources. */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "cache" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/**
 * Hash source files in stable relative-path order. Derived thinker read surfaces are
 * excluded exactly like `.promptus/cache/`: their authoritative inputs are already hashed.
 */
export function hashStore(root: string, sourceBytes?: ReadonlyMap<string, Uint8Array>): { hash: string; files: number } {
  const base = join(root, ".promptus");
  const paths = filesUnder(base).filter((path) => {
    const rel = relative(base, path).replace(/\\/g, "/");
    return rel !== "thinker/INDEX.md" && !/^thinker\/rounds\/[^/]+\/ROUND\.md$/.test(rel);
  }).sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(relative(base, path).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(sourceBytes?.get(path) ?? readFileSync(path));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), files: paths.length };
}
