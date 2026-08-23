#!/usr/bin/env bun
/** Deterministic one-screen read port for a Promptus project's live state. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot, storePath } from "./lib/paths.ts";
import { loadVocab } from "./lib/vocab.ts";

const HELP = `promptus-status — one-screen project orientation
usage: promptus-status [--json] [--root <dir>]
Reads the Telos north star and the ledger NOW, Open frontier, Next actions, and
RESUME sections. It does not infer progress or mutate the store.`;

function arg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf("--" + name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : undefined;
}

function section(text: string, name: RegExp): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^#{1,4}\s+/.test(line) && name.test(line.replace(/^#{1,4}\s+/, "").trim()));
  if (start < 0) return "";
  const level = /^#+/.exec(lines[start])![0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const heading = /^(#+)\s+/.exec(lines[index]);
    if (heading && heading[1].length <= level) { end = index; break; }
  }
  return lines.slice(start + 1, end)
    .filter((line) => !/^<!-- kb:(?:now-through|id) /.test(line.trim()))
    .join("\n").trim();
}

function firstParagraph(value: string): string {
  return value.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)?.replace(/\s+/g, " ") ?? "";
}

function firstAction(value: string): string {
  const line = value.split("\n").map((item) => item.trim()).find((item) => /^(?:[-*]|\d+[.)])\s+/.test(item));
  return (line ?? firstParagraph(value)).replace(/^(?:[-*]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s*/, "").trim();
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const root = findProjectRoot(arg(argv, "root") ?? process.cwd());
  const vocab = loadVocab(root);
  const telos = readFileSync(join(root, ".promptus", "TELOS.md"), "utf8");
  const ledger = readFileSync(storePath(root, vocab, "ledger"), "utf8");
  const nowStart = ledger.indexOf("<!-- now:start -->");
  const nowEnd = ledger.indexOf("<!-- now:end -->");
  const live = nowStart >= 0 && nowEnd > nowStart ? ledger.slice(nowStart, nowEnd) : ledger;
  const result = {
    project: /^#\s+(.+)$/m.exec(telos)?.[1] ?? root.split(/[\\/]/).pop(),
    northStar: firstParagraph(section(telos, /^(?:North star|Mandate)$/i)),
    now: firstParagraph(section(live, /^NOW$/i)),
    blocker: firstAction(section(live, /^Open frontier$/i)),
    next: firstAction(section(live, /^Next actions$/i)),
    resume: firstParagraph(section(live, /RESUME HERE/i)),
  };
  if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.project);
    console.log(`North star: ${result.northStar || "not recorded"}`);
    console.log(`Now: ${result.now || "not recorded"}`);
    console.log(`Blocking edge: ${result.blocker || "none recorded"}`);
    console.log(`Next: ${result.next || "not recorded"}`);
    console.log(`Resume: ${result.resume || "not recorded"}`);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
