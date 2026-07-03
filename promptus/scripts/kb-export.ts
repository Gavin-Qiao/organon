#!/usr/bin/env bun
/**
 * kb-export.ts — emit the typed relation graph as CiTO/PROV JSON-LD.
 *
 * The interoperability payoff of grounding the vocab: the [[markdown]] knowledge
 * graph exports to the same relation vocabularies the literature uses — CiTO
 * (Citation Typing Ontology) and PROV-O — so a Promptus store can feed a real
 * triplestore or be merged with published nanopublications without rework.
 *
 * Usage: kb-export [--root <dir>]   > graph.jsonld
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadVocab } from "./lib/vocab.ts";
import { derivedDir, findProjectRoot } from "./lib/paths.ts";

interface Edge { from: string; type: string; to: string; cito?: string; prov?: string }

function main(argv: string[]): number {
  const ri = argv.indexOf("--root");
  const root = findProjectRoot(ri >= 0 ? argv[ri + 1] : process.cwd());
  const vocab = loadVocab(root);
  const graphFile = join(derivedDir(root), "graph.json");
  if (!existsSync(graphFile)) {
    console.error("kb-export: no graph — run `bun scripts/kb-index.ts` first.");
    return 1;
  }
  const g = JSON.parse(readFileSync(graphFile, "utf8")) as { relations?: Edge[] };

  const ref = (id: string) => `promptus:${id}`;
  const statements = (g.relations ?? []).map((e) => ({
    "@id": ref(e.from),
    [e.cito ?? e.prov ?? "promptus:relatesTo"]: { "@id": ref(e.to) },
  }));

  console.log(JSON.stringify({ "@context": vocab.export_context ?? {}, "@graph": statements }, null, 2));
  return 0;
}

process.exit(main(process.argv.slice(2)));
