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
 *                 [--alias <legacy-handle>]... [--root <dir>] [--dry-run]
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { nowISO, nowLocalStamp, stampUTC } from "./lib/clock.ts";
import { mintId } from "./lib/ids.ts";
import { parseFrontmatter, serializeFrontmatter } from "./lib/frontmatter.ts";
import { findProjectRoot } from "./lib/paths.ts";
import { loadVocab, validate, type UnitInput } from "./lib/vocab.ts";
import { collectUnits, main as rebuildIndex } from "./kb-index.ts";
import { createRelationResolver } from "./lib/relation-lifecycle.ts";
import { atomicStoreWrite, withStoreLock } from "./lib/store-lock.ts";

function value(argv: string[], name: string): string | undefined {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: kb-amend --path <file> --substrate <finding|lit|memory> --kind <K> --status <S> [--source <locator>] [--alias <legacy-handle>]... [--root <dir>] [--dry-run]");
    return 0;
  }

  const aliases: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") continue;
    if (!["--root", "--path", "--substrate", "--kind", "--status", "--source", "--alias"].includes(flag)) fail("unknown argument " + flag);
    const item = argv[++i];
    if (!item || item.startsWith("--")) fail(flag + " requires a value");
    if (/[\r\n]/.test(item)) fail(flag + " must be a single line");
    if (flag !== "--alias" && seen.has(flag)) fail("duplicate argument " + flag);
    seen.add(flag);
    if (flag === "--alias") {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item)) fail("--alias requires a plain legacy handle");
      aliases.push(item);
    }
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

  // Validate and re-read while holding the same lease used by kb-add and kb-now.
  // Dry runs call this without acquiring a lease or writing derived state.
  const prepare = () => {
    const physicalRoot = realpathSync(root);
    const physicalFile = realpathSync(file);
    const physicalStore = realpathSync(store);
    if (!inside(physicalRoot, physicalStore) || !inside(physicalStore, physicalFile)
        || physicalFile !== resolve(physicalRoot, relative(root, file))) {
      fail(relPath + " traverses a symlink or leaves the physical store");
    }
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
    if (aliases.length) {
      const units = collectUnits(root, vocab);
      const others = units.filter((unit) => resolve(root, unit.relPath.split("#")[0]) !== file);
      const resolver = createRelationResolver(others);
      for (const alias of aliases) {
        if (resolver.resolve(alias) || resolver.aliasCount(alias)) fail("alias already belongs to another unit: " + alias);
      }
      if (data.aliases !== undefined && !Array.isArray(data.aliases)) fail("existing aliases must be an inline list");
      data.aliases = [...new Set([...(Array.isArray(data.aliases) ? data.aliases : []), ...aliases])];
    }
    if (!data.created) data.created = nowLocalStamp();
    data.updated = nowLocalStamp();
    if (source) data.source = source;
    if (substrate === "memory") data.type = kind;
    const amended = serializeFrontmatter(data) + parsed.body;
    return { amended, id, title };
  };

  if (argv.includes("--dry-run")) {
    const { amended } = prepare();
    console.log("[dry-run] would amend " + relPath + ":");
    console.log(amended);
    return 0;
  }

  const { id, title } = withStoreLock(root, () => {
    const prepared = prepare();
    atomicStoreWrite(root, file, prepared.amended);
    const indexStatus = rebuildIndex(["--root", root, "--quiet"]);
    if (indexStatus !== 0) fail("unit was amended but authoritative re-indexing failed");
    return prepared;
  });
  console.log("kb-amend: " + substrate + ":" + status + " — " + title);
  console.log("  -> " + relPath.replace(/\\/g, "/") + "  (id " + id + ")");
  return 0;
}

if (import.meta.main) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    console.error("kb-amend: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
