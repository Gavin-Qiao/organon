/** Extend the previous isolated runtime; do not edit its source or receipts. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stageRuntime, SCRIPTS, treeHashes } from "./publication-fixture.ts";
import { sha } from "./publication-fence.ts";

export function stageReuseRuntime(parent: string) {
  const staged = stageRuntime(parent), gate = join(staged.runtime, "parse-gate.ts"), cli = join(staged.runtime, "cli.ts");
  const oldGate = join(import.meta.dir, "publication-fence.ts"), reuse = JSON.stringify(join(import.meta.dir, "parse-reuse.ts"));
  const changed: Record<string, { before: string; after: string }> = {};
  function transform(path: string, edits: Array<[string, string]>) {
    const before = readFileSync(path, "utf8"); let next = before;
    for (const [from, to] of edits) {
      if (next.split(from).length !== 2) throw Error(`parse instrumentation anchor drift: ${path}`);
      next = next.replace(from, to);
    }
    writeFileSync(path, next); changed[path.replace(staged.runtime + "/", "")] = { before: sha(before), after: sha(next) };
  }
  writeFileSync(gate, readFileSync(oldGate));
  transform(gate, [
    ['"../promptus/scripts/lib/store-lock.ts"', JSON.stringify(join(SCRIPTS, "lib/store-lock.ts"))],
    ['"../promptus/scripts/lib/units.ts"', JSON.stringify(join(SCRIPTS, "lib/units.ts"))],
    ['["CATALOG.md", "graph.json", "search.json"]', '["CATALOG.md", "graph.json", "search.json", "raw-parses.json.gz"]'],
    ['if (force || state.phase !== "CLEAN" || !matches(root)) {', 'if (force || state.phase !== "CLEAN" || !matches(root)) {\n      if (force || state.phase !== "DIRTY") state.dirty = "ALL";'],
  ]);
  for (const name of ["lib/store-lock.ts", "kb-add.ts", "kb-amend.ts"]) transform(join(staged.runtime, "scripts", name), [[JSON.stringify(oldGate), JSON.stringify(gate)]]);
  const reader = join(staged.runtime, "scripts/lib/read-store.ts");
  transform(reader, [
    ['import { existsSync, readFileSync, readdirSync } from "node:fs";', `import { existsSync, readFileSync, readdirSync as originalReaddir } from "node:fs";\nimport {reuseFile, noteDiscovery} from ${reuse};\nfunction readdirSync(...args: any[]): any { const rows = (originalReaddir as any)(...args); noteDiscovery(rows.length); return rows; }`],
    ["function parseLedgerFile(", "function parseLedgerFileUncached("],
    ["function parsePage(", "function parsePageUncached("],
  ]);
  writeFileSync(reader, readFileSync(reader, "utf8") + `
function parseLedgerFile(root: string, file: string, cold = false, cache?: Map<string, Buffer>): Unit[] {
  if (!existsSync(file)) return [];
  return reuseFile(root, file, "ledger:" + cold, cache, bytes => parseLedgerFileUncached(root, file, cold, bytes));
}
function parsePage(root: string, substrate: string, file: string, cold = false, cache?: Map<string, Buffer>): Unit {
  return reuseFile(root, file, "page:" + substrate + ":" + cold, cache, bytes => [parsePageUncached(root, substrate, file, cold, bytes)])[0];
}
`);
  const indexer = join(staged.runtime, "scripts/kb-index.ts");
  transform(indexer, [["const units = collectUnits(root, vocab, cache);", "const units = withParsedReuse(root, vocab, Boolean(cache), () => collectUnits(root, vocab, cache));"]]);
  transform(indexer, [["#!/usr/bin/env bun\n", `#!/usr/bin/env bun\nimport {withParsedReuse} from ${reuse};\n`]]);
  writeFileSync(cli, readFileSync(join(import.meta.dir, "publication-cli.ts")));
  transform(cli, [
    ['"./publication-fence.ts"', JSON.stringify(gate)],
    ['"./publication-fixture.ts"', JSON.stringify(join(import.meta.dir, "publication-fixture.ts"))],
  ]);
  const candidateTree = treeHashes(join(staged.runtime, "scripts"));
  const runtimeHash = sha(JSON.stringify(candidateTree) + readFileSync(gate) + readFileSync(cli) + readFileSync(join(import.meta.dir, "parse-reuse.ts")));
  writeFileSync(join(staged.runtime, "parse-instrumentation.json"), JSON.stringify({ changed, candidateTree, runtimeHash }, null, 2));
  return { ...staged, runtimeHash, cli, gate };
}
