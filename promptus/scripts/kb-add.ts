#!/usr/bin/env bun
/**
 * kb-add.ts — the gated writer-jig. The ONE way knowledge enters a project.
 * The LLM supplies only the prose body (on stdin); the script owns everything
 * else: the envelope, the metadata, the timestamp, the id, the placement, the
 * incremental index update, and the validation gate.
 *
 * Usage:
 *   kb-add --substrate <ledger|finding|lit|memory> --kind <K> --status <S>
 *          --title "<t>" [--source "<src#anchor>"] [--links "a,b"] [--reuse <r>]
 *          [--desc "<one-line>"] [--rel <type:target> ...] [--supersedes <id|ref>]
 *          [--root <dir>] [--dry-run]  < body.md
 *
 * Facets: KIND (the act), STATUS (the claim's epistemic state), RELATION (a typed
 * link: --rel supersedes:<id>, refutes:<id>, supports:<id>, extends:<id>, …;
 * --supersedes <id> is sugar for --rel supersedes:<id>).
 *
 * Envelope is substrate-aware:
 *   ledger  → `### [YYYY-MM-DD HH:MM:SS] KIND/STATUS — title` (local) before the sentinel,
 *             with any relations as `↳ <type> <target>` footer lines.
 *   finding → .promptus/docs/<slug>.md       : frontmatter (incl. relations) + `# title` + body
 *   lit     → .promptus/docs/lit/<slug>.md   : same, requires --source
 *   memory  → .promptus/memory/<slug>.md + a `- [title](slug.md) — hook` line in .promptus/memory/MEMORY.md
 *
 * The gate refuses an off-vocab unit on a STRICT substrate (finding/lit/memory) and
 * WARNS-but-writes on the PERMISSIVE ledger — printing the allowed set, commit-msg-hook
 * style. Low friction is a hard requirement — friction is what made the old script drift.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { nowISO, stampUTC, nowLocalStamp } from "./lib/clock.ts";
import { mintId, slugify } from "./lib/ids.ts";
import { extractLinks } from "./lib/links.ts";
import { serializeFrontmatter, type Frontmatter } from "./lib/frontmatter.ts";
import { loadVocab, validate, type Relation, type UnitInput, type Vocab } from "./lib/vocab.ts";
import { derivedDir, findProjectRoot, indexPath, insertBeforeSentinel, storePath } from "./lib/paths.ts";
import { parseArtifactSpec, serializeArtifactSpec } from "./lib/artifacts.ts";
import { THINKER_DIR, hasThinkerMarker, refreshThinkerReadSurfaces } from "./lib/thinker.ts";
import { atomicStoreWrite, withStoreLock } from "./lib/store-lock.ts";
import { ledgerHeads } from "./lib/units.ts";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const a: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) a[key] = true;
    else (a[key] = next), i++;
  }
  return a;
}

/** Relations can repeat, so collect them straight from argv (parseArgs keeps only the last). */
function parseRelations(argv: string[]): Relation[] {
  const rels: Relation[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rel" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const v = argv[i + 1];
      const c = v.indexOf(":");
      if (c > 0 && c < v.length - 1) rels.push({ type: v.slice(0, c), target: v.slice(c + 1) });
      i++;
    } else if (argv[i] === "--supersedes" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      rels.push({ type: "supersedes", target: argv[i + 1] });
      i++;
    }
  }
  return rels;
}

function parseArtifacts(argv: string[]): string[] {
  const artifacts: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--artifact") continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail("--artifact requires role|relative/path|sha256-or--");
    try { artifacts.push(serializeArtifactSpec(parseArtifactSpec(value))); }
    catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    i++;
  }
  return artifacts;
}

function str(a: Args, k: string): string | undefined {
  return typeof a[k] === "string" ? (a[k] as string) : undefined;
}

function fail(msg: string, allowed?: string[]): never {
  console.error(`kb-add: ${msg}`);
  if (allowed) console.error(`  allowed: ${allowed.join(", ")}`);
  process.exit(1);
}

function rel(root: string, p: string): string {
  return relative(root, p).replace(/\\/g, "/");
}

function statusDisplay(vocab: Vocab, status: string): string {
  return vocab.status_glyphs?.[status] ?? status;
}

function catalogLine(sub: string, status: string, title: string, relPath: string, id: string, links: string[]): string {
  const metadata = [`id:${id}`, ...links.map((l) => `[[${l}]]`)];
  const tail = metadata.length ? ` · ${metadata.join(" ")}` : "";
  return `${sub}:${status} · ${title} · ${relPath}${tail}`;
}

/** Keep the derived catalog fresh on every write; kb-index rebuilds it authoritatively. */
function appendCatalog(root: string, line: string): string {
  const dir = derivedDir(root);
  const catalog = join(dir, "CATALOG.md");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const head = "# Promptus card-catalog (DERIVED — rebuilt by kb-index; safe to delete)\n\n";
  const cur = existsSync(catalog) ? readFileSync(catalog, "utf8") : head;
  atomicStoreWrite(root, catalog, `${cur.replace(/\n*$/, "\n")}${line}\n`);
  return catalog;
}

function uniqueLedgerId(base: string, ledger: string): string {
  const ids = new Set([...ledger.matchAll(/^<!-- kb:id (\S+) -->$/gm)].map((match) => match[1]));
  if (!ids.has(base)) return base;
  let ordinal = 2;
  while (ids.has(`${base}-${ordinal}`)) ordinal++;
  return `${base}-${ordinal}`;
}

function uniqueLedgerStamp(base: string, ledger: string): string {
  const anchors = new Set(ledgerHeads(ledger.replace(/\r\n/g, "\n")).map((head) => head.anchor));
  const normalized = base.replace(/ /g, "T");
  if (!anchors.has(normalized)) return base;
  let ordinal = 1;
  while (anchors.has(`${normalized}.${String(ordinal).padStart(3, "0")}`)) ordinal++;
  return `${base}.${String(ordinal).padStart(3, "0")}`;
}

const TEMPLATE_VOCAB = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "schema", "kb-vocab.json");

const HELP = `kb-add — gated writer for Promptus knowledge units
usage: kb-add --substrate <ledger|finding|lit|memory> --kind <K> --status <S>
              --title "<title>" [--source "<source>"] [--links "a,b"]
              [--rel <type:target> ...] [--supersedes <id>]
              [--artifact "role|relative/path|sha256-or--" ...]
              [--root <dir>] [--dry-run] < body.md
Artifacts are project-relative reproducibility dependencies. '-' records an
existence-only dependency; a SHA-256 value makes promptus-check verify bytes.`;

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const a = parseArgs(argv);
  const root = findProjectRoot(str(a, "root") ?? process.cwd());
  // The root can resolve off the Telos while the vocab file itself is gone (a fresh
  // clone whose schema was git-ignored, a repo split). The gate is the ONE write
  // path — a hard fail here is what pushed a real project into hand-appending at
  // the sentinel. Degrade gracefully: re-seed the template vocab, loudly.
  const vocabFile = join(root, ".promptus", "schema", "kb-vocab.json");
  if (!existsSync(vocabFile)) {
    mkdirSync(dirname(vocabFile), { recursive: true });
    copyFileSync(TEMPLATE_VOCAB, vocabFile);
    console.error(`kb-add: warning: no vocab at ${rel(root, vocabFile)} — re-seeded the template vocab so the gate stays usable; if this project had a tuned vocab, restore it (git checkout, or promptus-doctor check)`);
  }
  const vocab = loadVocab(root);
  const relations = parseRelations(argv);
  const artifacts = parseArtifacts(argv);

  const unit: UnitInput = {
    substrate: str(a, "substrate") ?? "",
    kind: str(a, "kind") ?? "",
    status: str(a, "status") ?? "",
    title: (str(a, "title") ?? "").trim(),
    source: str(a, "source"),
    reuse: str(a, "reuse"),
    links: str(a, "links")?.split(",").map((s) => s.trim()).filter(Boolean),
    relations,
  };

  const v = validate(vocab, unit);
  if (!v.ok) fail(v.error, v.allowed);
  for (const w of v.warnings) console.error(`kb-add: warning: ${w}`);

  const sub = vocab.substrates[unit.substrate];
  const dry = a["dry-run"] === true;
  const body = process.stdin.isTTY ? "" : readFileSync(0, "utf8").replace(/\s+$/, "");
  const idBase = mintId(sub.prefix, stampUTC(nowISO()), unit.title);
  const slug = slugify(unit.title);
  const links = Array.from(new Set([...(unit.links ?? []), ...extractLinks(body)]));

  const prepare = () => {
    let id = idBase;
    let assembled: string;
    let unitFile: string;
    let catalogPath: string;
    const writes: Array<[string, string]> = [];

    if (sub.envelope === "log") {
      unitFile = storePath(root, vocab, unit.substrate);
      if (!existsSync(unitFile)) throw new Error(`ledger not found: ${rel(root, unitFile)} — run /promptus-init first`);
      const current = readFileSync(unitFile, "utf8");
      id = uniqueLedgerId(idBase, current);
      const linkFooter = (unit.links ?? []).length
        ? `\nRelated: ${Array.from(new Set(unit.links)).map((link) => `[[${link}]]`).join(" · ")}`
        : "";
      const relFooter = relations.length ? `\n${relations.map((r) => `↳ ${r.type} ${r.target}`).join("\n")}` : "";
      const artifactHeader = artifacts.length ? `${artifacts.map((artifact) => `<!-- kb:artifact ${artifact} -->`).join("\n")}\n` : "";
      const displayStamp = uniqueLedgerStamp(nowLocalStamp(), current);
      assembled = `### [${displayStamp}] ${unit.kind}/${statusDisplay(vocab, unit.status)} — ${unit.title}\n<!-- kb:id ${id} -->\n${artifactHeader}${body}${linkFooter}${relFooter}\n`;
      catalogPath = `${rel(root, unitFile)}#${displayStamp.replace(/ /g, "T")}`;
      writes.push([unitFile, insertBeforeSentinel(current, assembled, vocab.sentinel)]);
    } else if (sub.envelope === "page") {
      const fm: Frontmatter = { id, substrate: unit.substrate, kind: unit.kind, status: unit.status, created: nowLocalStamp() };
      if (unit.source) fm.source = unit.source;
      if (unit.reuse) fm.reuse = unit.reuse;
      if (relations.length) fm.relations = relations.map((r) => `${r.type}:${r.target}`);
      if (links.length) fm.links = links;
      if (artifacts.length) fm.artifacts = artifacts;
      const related = links.length ? `\n\nRelated: ${links.map((l) => `[[${l}]]`).join(" · ")}` : "";
      assembled = `${serializeFrontmatter(fm)}# ${unit.title}\n\n${body}${related}\n`;
      unitFile = storePath(root, vocab, unit.substrate, slug);
      catalogPath = rel(root, unitFile);
      if (existsSync(unitFile)) throw new Error(`a ${unit.substrate} already exists at ${rel(root, unitFile)} — pick a distinct title or edit it directly`);
      writes.push([unitFile, assembled]);
    } else {
      const fm: Frontmatter = { id, name: slug, description: str(a, "desc") ?? unit.title, type: unit.kind, status: unit.status };
      if (links.length) fm.links = links;
      if (artifacts.length) fm.artifacts = artifacts;
      assembled = `${serializeFrontmatter(fm)}\n${body}\n`;
      unitFile = storePath(root, vocab, unit.substrate, slug);
      catalogPath = rel(root, unitFile);
      if (existsSync(unitFile)) throw new Error(`a memory unit already exists at ${rel(root, unitFile)}`);
      writes.push([unitFile, assembled]);
      const idx = indexPath(root, vocab, unit.substrate);
      if (idx && existsSync(idx)) {
        const pointer = `- [${unit.title}](${slug}.md) — ${str(a, "desc") ?? unit.title}`;
        const cur = readFileSync(idx, "utf8");
        writes.push([idx, cur.includes(vocab.sentinel) ? insertBeforeSentinel(cur, pointer, vocab.sentinel) : `${cur.replace(/\n*$/, "\n")}${pointer}\n`]);
      }
    }
    return { id, assembled, unitFile, writes, catLine: catalogLine(unit.substrate, unit.status, unit.title, catalogPath, id, links) };
  };

  if (dry) {
    let prepared: ReturnType<typeof prepare>;
    try { prepared = prepare(); }
    catch (error) { console.error(`kb-add: ${error instanceof Error ? error.message : String(error)}`); return 1; }
    console.log(`[dry-run] would write ${rel(root, prepared.unitFile)}:`);
    console.log("----------------------------------------");
    console.log(prepared.assembled.replace(/\n$/, ""));
    console.log("----------------------------------------");
    console.log(`catalog += ${prepared.catLine}`);
    return 0;
  }

  let committed: ReturnType<typeof prepare> & { catalog: string };
  try {
    committed = withStoreLock(root, () => {
      const prepared = prepare();
      for (const [path, content] of prepared.writes) atomicStoreWrite(root, path, content);
      const catalog = appendCatalog(root, prepared.catLine);
      if (existsSync(join(root, THINKER_DIR)) && hasThinkerMarker(root)) refreshThinkerReadSurfaces(root);
      return { ...prepared, catalog };
    });
  } catch (error) {
    console.error(`kb-add: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  console.log(`kb-add: ${unit.substrate}:${unit.status} — ${unit.title}`);
  console.log(`  -> ${rel(root, committed.unitFile)}  (id ${committed.id})`);
  console.log(`  catalog: ${rel(root, committed.catalog)}  ·  run \`bun scripts/kb-index.ts\` to rebuild authoritatively`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
