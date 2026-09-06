#!/usr/bin/env bun
/** Deterministic source vendoring: one parser implementation, independently installable plugins. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const READER_FILES = ["read-store.ts", "frontmatter.ts", "links.ts", "units.ts", "vocab.ts", "relation-lifecycle.ts", "ids.ts"];

export function syncReader(root: string, write = false): string[] {
  const pairs = READER_FILES.map(file => [join(root, "promptus/scripts/lib", file), join(root, "editio/scripts/vendor/promptus", file)]);
  pairs.push([join(root, "promptus/templates/schema/kb-vocab.json"), join(root, "editio/scripts/vendor/promptus/default-vocab.json")]);
  const drift: string[] = [];
  for (const [source, target] of pairs) {
    let expected = readFileSync(source);
    if (target.endsWith("default-vocab.json")) {
      // The standalone reader needs the vocabulary, not export URLs or template prose.
      const { _doc, export_context, ...readerDefaults } = JSON.parse(expected.toString("utf8"));
      expected = Buffer.from(JSON.stringify(readerDefaults, null, 2) + "\n");
    }
    if (existsSync(target) && readFileSync(target).equals(expected)) continue;
    drift.push(target);
    if (write) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, expected); }
  }
  return drift;
}

if (import.meta.main) {
  if (process.argv.slice(2).some(arg => !["--write", "--check"].includes(arg))) throw new Error("usage: sync-reader.ts [--check|--write]");
  const write = process.argv.includes("--write");
  const drift = syncReader(resolve(import.meta.dir, "../.."), write);
  console.log(`Promptus reader copies: ${drift.length} ${write ? "updated" : "drifted"}`);
  if (!write && drift.length) { console.error("Run bun promptus/scripts/sync-reader.ts --write"); process.exitCode = 1; }
}
