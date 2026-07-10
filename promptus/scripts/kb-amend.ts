#!/usr/bin/env bun
/**
 * kb-amend.ts — gated metadata transitions for existing file units.
 *
 * Use this instead of hand-editing finding, literature, or memory frontmatter.
 * The body is preserved byte-for-byte; the script validates the requested
 * substrate/kind/status, mints a missing id, stamps updated, and re-indexes.
 *
 * Usage: kb-amend --path <project-relative.md> --substrate <finding|lit|memory>
 *                 --kind <K> --status <S> [--source <locator>]
 *                 [--root <dir>] [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { nowISO, nowLocalStamp, stampUTC } from "./lib/clock.ts";
import { mintId } from "./lib/ids.ts";
import { parseFrontmatter, serializeFrontmatter } from "./lib/frontmatter.ts";
import { findProjectRoot } from "./lib/paths.ts";
import { loadVocab, validate, type UnitInput } from "./lib/vocab.ts";
import { main as rebuildIndex } from "./kb-index.ts";

function value(argv: string[], name: string): string | undefined {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error("kb-amend: " + message);
  process.exit(1);
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: kb-amend --path <file> --substrate <finding|lit|memory> --kind <K> --status <S> [--source <locator>] [--root <dir>] [--dry-run]");
    return 0;
  }

  const root = findProjectRoot(value(argv, "root") ?? process.cwd());
  const relPath = value(argv, "path");
  const substrate = value(argv, "substrate") ?? "";
  const kind = value(argv, "kind") ?? "";
  const status = value(argv, "status") ?? "";
  if (!relPath) fail("--path is required");

  const vocab = loadVocab(root);
  const sub = vocab.substrates[substrate];
  if (!sub) fail("unknown substrate " + substrate);
  if (sub.envelope === "log") fail("ledger transitions are new kb-add entries with --supersedes, not in-place amendments");

  const file = resolve(root, relPath);
  const store = resolve(root, sub.store);
  if (!inside(root, file) || !inside(store, file)) fail(relPath + " is outside the " + substrate + " store");
  if (!existsSync(file)) fail(relPath + " does not exist");

  const text = readFileSync(file, "utf8");
  const parsed = parseFrontmatter(text);
  const h1 = /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim();
  const title = h1 ?? String(parsed.data.description ?? parsed.data.name ?? "").trim();
  if (!title) fail("cannot determine a title from the unit");
  const source = value(argv, "source") ?? (typeof parsed.data.source === "string" ? parsed.data.source : undefined);
  const unit: UnitInput = { substrate, kind, status, title, source, relations: [] };
  const checked = validate(vocab, unit);
  if (!checked.ok) fail(checked.error + (checked.allowed?.length ? " (allowed: " + checked.allowed.join(", ") + ")" : ""));
  for (const warning of checked.warnings) console.error("kb-amend: warning: " + warning);

  const id = typeof parsed.data.id === "string" && parsed.data.id
    ? parsed.data.id
    : mintId(sub.prefix, stampUTC(nowISO()), title);
  const data = { ...parsed.data, id, substrate, kind, status };
  if (!data.created) data.created = nowLocalStamp();
  data.updated = nowLocalStamp();
  if (source) data.source = source;
  if (substrate === "memory") data.type = kind;
  const amended = serializeFrontmatter(data) + parsed.body;

  if (argv.includes("--dry-run")) {
    console.log("[dry-run] would amend " + relPath + ":");
    console.log(amended);
    return 0;
  }

  writeFileSync(file, amended);
  const indexStatus = rebuildIndex(["--root", root, "--quiet"]);
  if (indexStatus !== 0) fail("unit was amended but authoritative re-indexing failed");
  console.log("kb-amend: " + substrate + ":" + status + " — " + title);
  console.log("  -> " + relPath.replace(/\\/g, "/") + "  (id " + id + ")");
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
