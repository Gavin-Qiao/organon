#!/usr/bin/env bun
/** promptus-check.ts — authoritative whole-store integrity, freshness, and debt gate. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkArtifacts, parseArtifactSpec, type ArtifactSpec } from "./lib/artifacts.ts";
import { derivedDir, findProjectRoot, storePath } from "./lib/paths.ts";
import { ledgerEntries } from "./lib/units.ts";
import { loadVocab } from "./lib/vocab.ts";
import { inspectThinkerExchange } from "./lib/thinker.ts";
import { hashStore } from "./lib/store-hash.ts";
import { buildIndex, type IndexBuildResult } from "./kb-index.ts";

interface Card { substrate: string; status: string; title: string; path: string; id?: string }
interface Dangling { from: string; target: string; reason?: string }
interface Graph {
  nodes?: string[];
  out?: Record<string, string[]>;
  inDeg?: Record<string, number>;
  relationDegree?: Record<string, number>;
  relations?: Array<{ from: string; type: string; to: string; resolved?: boolean }>;
  dangling?: Dangling[];
  artifacts?: Array<{ from: string; spec: string; status?: string }>;
}
interface DebtBaseline {
  schema: "promptus.health-baseline.v1";
  recordedAt: string;
  unclassified: string[];
  dangling: string[];
  orphans: string[];
}

const HELP = `promptus-check — rebuild and verify the Promptus store
usage: promptus-check [--strict] [--strict-graph] [--ratchet]
                      [--record-baseline] [--no-index] [--json] [--root <dir>]
profiles:
  default          hard integrity, relation, NOW-freshness, artifact, and thinker-custody checks
  --strict         also reject every unclassified unit
  --strict-graph   also reject every dangling link and orphan
  --ratchet        reject only classification/graph debt not in the recorded baseline
  --record-baseline explicitly accept today's classification/graph debt as the ceiling
The ratchet baseline is source-controlled .promptus/schema/health-baseline.json.`;

function arg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf("--" + name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : undefined;
}

function parseCatalog(text: string): Card[] {
  const cards: Card[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(" · ");
    if (parts.length < 3) continue;
    const split = parts[0].indexOf(":");
    if (split < 1) continue;
    const metadata = parts.slice(3).join(" · ");
    cards.push({
      substrate: parts[0].slice(0, split),
      status: parts[0].slice(split + 1).trim(),
      title: parts[1],
      path: parts[2],
      id: /(?:^|\s)id:(\S+)/.exec(metadata)?.[1],
    });
  }
  return cards;
}

function readJSON(path: string): any {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function latestLedgerKey(ledger: string): string {
  const latest = ledgerEntries(ledger).at(-1);
  if (!latest) return "EMPTY";
  return /^<!-- kb:id (\S+) -->$/m.exec(latest.text)?.[1] ?? `anchor:${latest.anchor}`;
}

function nowFreshness(ledger: string) {
  const text = readFileSync(ledger, "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf("<!-- now:start -->");
  const end = text.indexOf("<!-- now:end -->");
  if (start < 0 || end < start) return { configured: false, fresh: true, expected: latestLedgerKey(ledger), markers: [] as string[] };
  const region = text.slice(start, end);
  const markers = [...region.matchAll(/<!-- kb:now-through (\S+) -->/g)].map((match) => match[1]);
  const expected = latestLedgerKey(ledger);
  return { configured: true, fresh: markers.length === 1 && markers[0] === expected, expected, markers };
}

const danglingKey = (item: Dangling) => `${item.from}→${item.target}`;
const isArchivalArtifactStatus = (status: string | undefined) => {
  const normalized = String(status ?? "").replace(/^[★⚠↩]/, "").trim().toUpperCase();
  return normalized === "SUPERSEDED" || normalized === "RETIRED";
};

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  if (argv.includes("--ratchet") && argv.includes("--record-baseline")) {
    console.error("promptus-check: --ratchet and --record-baseline are mutually exclusive");
    return 1;
  }
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const cache = derivedDir(root);
  const catalogPath = join(cache, "CATALOG.md");
  const graphPath = join(cache, "graph.json");
  const healthPath = join(cache, "health.json");
  const baselinePath = join(root, ".promptus", "schema", "health-baseline.json");
  const noIndex = argv.includes("--no-index");
  const strict = argv.includes("--strict");
  const strictGraph = argv.includes("--strict-graph");
  const ratchet = argv.includes("--ratchet");
  const recordBaseline = argv.includes("--record-baseline");
  const json = argv.includes("--json");

  let indexFailed = false;
  let indexError = "";
  let indexResult: IndexBuildResult | null = null;
  if (!noIndex) {
    try {
      indexResult = buildIndex(["--root", root, "--quiet", "--source-hash"]);
      indexFailed = indexResult.exitCode !== 0;
    }
    catch (error) { indexFailed = true; indexError = error instanceof Error ? error.message : String(error); }
  }

  let source = indexResult?.source ?? hashStore(root);
  const previous = readJSON(healthPath);
  const stale = noIndex && (!previous || previous.storeHash !== source.hash);
  const cards = existsSync(catalogPath) ? parseCatalog(readFileSync(catalogPath, "utf8")) : [];
  const graph = (readJSON(graphPath) ?? {}) as Graph;
  const unclassified = cards.filter((card) => !card.status || card.status === "?");
  const ids = new Map<string, Card[]>();
  for (const card of cards) if (card.id) ids.set(card.id, [...(ids.get(card.id) ?? []), card]);
  const duplicateIds = [...ids].filter(([, matches]) => matches.length > 1);
  const unresolvedRelations = (graph.relations ?? []).filter((edge) => edge.resolved === false);

  const nodes = new Set(graph.nodes ?? []);
  const out = graph.out ?? {};
  const dangling = graph.dangling ?? Object.entries(out).flatMap(([from, targets]) =>
    targets.filter((target) => !nodes.has(target)).map((target) => ({ from, target, reason: "legacy-derived" })),
  );
  const orphans = [...nodes].filter((node) =>
    (graph.inDeg?.[node] ?? 0) === 0 && (out[node] ?? []).length === 0 && (graph.relationDegree?.[node] ?? 0) === 0,
  );

  const artifactRecords = graph.artifacts ?? [];
  const parsedArtifacts: Array<{ index: number; spec: ArtifactSpec }> = [];
  const invalidArtifacts = new Map<number, { ok: false; outcome: "invalid-spec"; error: string }>();
  for (const [index, record] of artifactRecords.entries()) {
    try { parsedArtifacts.push({ index, spec: parseArtifactSpec(record.spec) }); }
    catch (error) {
      invalidArtifacts.set(index, {
        ok: false,
        outcome: "invalid-spec",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const verifiedArtifacts = checkArtifacts(root, parsedArtifacts.map((item) => item.spec));
  const verifiedByRecord = new Map(parsedArtifacts.map((item, index) => [item.index, verifiedArtifacts[index]]));
  const artifactChecks = artifactRecords.map((record, index) => ({
    from: record.from,
    spec: record.spec,
    status: record.status,
    ...(invalidArtifacts.get(index) ?? verifiedByRecord.get(index)!),
  }));
  const currentArtifactChecks = artifactChecks.filter((check) => !isArchivalArtifactStatus(check.status));
  const archivalArtifactChecks = artifactChecks.filter((check) => isArchivalArtifactStatus(check.status));
  const artifactFailures = currentArtifactChecks.filter((check) => !check.ok);
  const archivalArtifactWarnings = archivalArtifactChecks.filter((check) => !check.ok);

  const vocab = loadVocab(root);
  const ledger = storePath(root, vocab, "ledger");
  const now = nowFreshness(ledger);
  // A full check can reuse the exact post-refresh custody report returned by the
  // index it just ran. --no-index still inspects the live exchange independently.
  const thinkerExchange = indexResult?.thinkerExchange ?? inspectThinkerExchange(root);
  const thinkerInvalid = thinkerExchange.present && thinkerExchange.markerValid && !thinkerExchange.governed;

  const currentDebt = {
    unclassified: unclassified.map((card) => card.path).sort(),
    dangling: dangling.map(danglingKey).sort(),
    orphans: [...orphans].sort(),
  };
  if (recordBaseline) {
    const baseline: DebtBaseline = { schema: "promptus.health-baseline.v1", recordedAt: new Date().toISOString(), ...currentDebt };
    mkdirSync(join(root, ".promptus", "schema"), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
    source = hashStore(root);
  }
  const baseline = readJSON(baselinePath) as DebtBaseline | null;
  const baselineMissing = ratchet && baseline?.schema !== "promptus.health-baseline.v1";
  const extra = (current: string[], allowed: string[] | undefined) => current.filter((item) => !(allowed ?? []).includes(item));
  const newDebt = {
    unclassified: ratchet && !baselineMissing ? extra(currentDebt.unclassified, baseline?.unclassified) : [],
    dangling: ratchet && !baselineMissing ? extra(currentDebt.dangling, baseline?.dangling) : [],
    orphans: ratchet && !baselineMissing ? extra(currentDebt.orphans, baseline?.orphans) : [],
  };
  const ratchetErrors = Number(baselineMissing) + newDebt.unclassified.length + newDebt.dangling.length + newDebt.orphans.length;
  const baseErrors = Number(indexFailed) + Number(stale) + duplicateIds.length + unresolvedRelations.length
    + Number(now.configured && !now.fresh) + artifactFailures.length + Number(thinkerInvalid);
  const errors = baseErrors + (strict ? unclassified.length : 0)
    + (strictGraph ? dangling.length + orphans.length : 0) + ratchetErrors;

  const result = {
    root: root.replace(/\\/g, "/"), storeHash: source.hash, sourceFiles: source.files, units: cards.length,
    indexFailed, indexError, stale,
    now,
    unclassified: unclassified.map((card) => ({ title: card.title, path: card.path })),
    duplicateIds: duplicateIds.map(([id, matches]) => ({ id, paths: matches.map((card) => card.path) })),
    unresolvedRelations, dangling, orphans, artifactChecks, artifactFailures, archivalArtifactWarnings, thinkerExchange,
    ratchet: { enabled: ratchet, baselinePath: relative(root, baselinePath).replace(/\\/g, "/"), baselineMissing, newDebt },
    baselineRecorded: recordBaseline,
    healthy: errors === 0,
  };

  if (!noIndex) {
    mkdirSync(cache, { recursive: true });
    writeFileSync(healthPath, JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2) + "\n");
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`promptus-check: ${cards.length} units · ${source.files} source files · ${source.hash.slice(0, 12)}`);
    console.log(`  ${indexFailed ? "FAIL" : "ok  "} index${noIndex ? " (not rebuilt)" : " rebuilt"}`);
    console.log(`  ${stale ? "FAIL" : "ok  "} source/index freshness`);
    console.log(`  ${now.configured && !now.fresh ? "FAIL" : "ok  "} NOW freshness${now.configured ? `: ${now.markers[0] ?? "missing"} / expected ${now.expected}` : " (not configured)"}`);
    console.log(`  ${duplicateIds.length ? "FAIL" : "ok  "} duplicate ids: ${duplicateIds.length}`);
    console.log(`  ${unresolvedRelations.length ? "FAIL" : "ok  "} unresolved relation targets: ${unresolvedRelations.length}`);
    console.log(`  ${artifactFailures.length ? "FAIL" : "ok  "} current artifact dependencies: ${currentArtifactChecks.length - artifactFailures.length}/${currentArtifactChecks.length} verified`);
    console.log(`  ${archivalArtifactWarnings.length ? "WARN" : "ok  "} archival artifact drift: ${archivalArtifactWarnings.length}/${archivalArtifactChecks.length}`);
    if (thinkerExchange.present && thinkerExchange.markerValid) {
      console.log(`  ${thinkerInvalid ? "FAIL" : "ok  "} thinker exchange: ${thinkerExchange.rounds.length} round(s)`);
      for (const issue of thinkerExchange.issues.slice(0, 10)) console.log(`    thinker ${issue}`);
    }
    console.log(`  ${unclassified.length ? "FLAG" : "ok  "} unclassified units: ${unclassified.length}`);
    console.log(`  ${dangling.length ? "WARN" : "ok  "} dangling links: ${dangling.length}`);
    console.log(`  ${orphans.length ? "WARN" : "ok  "} orphans: ${orphans.length}`);
    if (recordBaseline) console.log(`  BASELINE recorded: ${relative(root, baselinePath).replace(/\\/g, "/")}`);
    if (ratchet) console.log(`  ${ratchetErrors ? "FAIL" : "ok  "} no-new-debt ratchet: ${ratchetErrors} new/missing-baseline issue(s)`);
    for (const card of unclassified.slice(0, 10)) console.log(`    unclassified ${card.path} — ${card.title}`);
    for (const [id] of duplicateIds.slice(0, 10)) console.log(`    duplicate id ${id}`);
    for (const edge of unresolvedRelations.slice(0, 10)) console.log(`    unresolved ${edge.type} ${edge.to} from ${edge.from}`);
    for (const failure of artifactFailures.slice(0, 10)) console.log(`    artifact ${failure.from}: ${failure.spec} — ${failure.outcome}`);
    for (const warning of archivalArtifactWarnings.slice(0, 10)) console.log(`    archival artifact ${warning.from}: ${warning.spec} — ${warning.outcome}`);
    for (const category of ["unclassified", "dangling", "orphans"] as const) for (const item of newDebt[category].slice(0, 10)) console.log(`    new ${category}: ${item}`);
    if (indexFailed && indexError) console.log(`    ${indexError.split(/\r?\n/)[0]}`);
  }
  return errors ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
