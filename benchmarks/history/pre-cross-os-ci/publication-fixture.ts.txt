/** Synthetic-only fixture and narrowly instrumented runtime staging. */
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MARKER, sha } from "./publication-fence.ts";
export const SCRIPTS = resolve(import.meta.dir, "../promptus/scripts");
export function treeHashes(dir: string, prefix = ""): Record<string, string> {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(dir, entry.name), rel = prefix + entry.name;
    return entry.isDirectory() ? Object.entries(treeHashes(path, rel + "/")) : [[rel, sha(readFileSync(path))]];
  }));
}
export function stageRuntime(parent: string) {
  const runtime = mkdtempSync(join(parent, "publication-runtime-"));
  cpSync(SCRIPTS, join(runtime, "scripts"), { recursive: true });
  // Scripts can resolve their own packaged schema/templates.
  cpSync(resolve(SCRIPTS, "../templates"), join(runtime, "templates"), { recursive: true });
  const hooks = JSON.stringify(join(import.meta.dir, "publication-fence.ts"));
  const hashes: Record<string, { original: string; instrumented: string }> = {};
  const patch = (name: string, edits: Array<[string, string]>, prefix = "") => {
    const path = join(runtime, "scripts", name), original = readFileSync(path, "utf8");
    let next = original;
    for (const [from, to] of edits) {
      if (next.split(from).length !== 2) throw Error(`instrumentation anchor drift: ${name}`);
      next = next.replace(from, to);
    }
    next = prefix + next;
    writeFileSync(path, next);
    hashes[name] = { original: sha(original), instrumented: sha(next) };
  };
  // Preserve the pre-integration experiment contract: its fence owns publication and
  // its parse trial owns raw caching. Production lock/cache behavior has separate tests.
  // Original staging bytes are retained under history/pre-release-integration/.
  patch("kb-index.ts", [
    ["return withStoreLock(root, () => buildLockedIndex(argv));", "return buildLockedIndex(argv);"],
    ['const raw = createParseCache(root, cache, argv.includes("--source-hash"));', 'const raw = { reuse: undefined, save: () => ({ diagnostic: "" }) };'],
    ["const units = collectUnits(root, vocab, cache, raw.reuse);", "const units = collectUnits(root, vocab, cache);"],
  ]);
  patch("kb-find.ts", [["if (existsSync(state)) try {", "if (false) try {"]]);
  patch("lib/store-lock.ts", [
    ["const deadline = Date.now() + timeoutMs;", "const deadline = Date.now() + timeoutMs;\n  const trialWaiting = performance.now();"],
    ["return action();", "return aroundWriter(root, action, performance.now() - trialWaiting);"],
    ['writeFileSync(temporary, content, { flag: "wx" });', 'beforeReplace(root, path);\n    writeFileSync(temporary, content, { flag: "wx" });\n    afterTemporary(root, path, content);'],
    ["renameSync(temporary, path);", "renameSync(temporary, path);\n    afterReplace(root, path);"],
  ], `import {aroundWriter, beforeReplace, afterTemporary, afterReplace} from ${hooks};\n`);
  for (const name of ["kb-add.ts", "kb-amend.ts"]) {
    const edits: Array<[string, string]> = [["#!/usr/bin/env bun\n", `#!/usr/bin/env bun\nimport {configureFromArgv, completeExistingIndex} from ${hooks};\nconfigureFromArgv();\n`]];
    if (name === "kb-amend.ts") {
      const anchor = 'if (indexStatus !== 0) fail("unit was amended but authoritative re-indexing failed");';
      edits.push([anchor, anchor + "\n    completeExistingIndex(root);"]);
    }
    patch(name, edits);
  }
  const sourceTree = treeHashes(SCRIPTS), candidateTree = treeHashes(join(runtime, "scripts"));
  const runtimeHash = sha(JSON.stringify(candidateTree) + sha(readFileSync(join(import.meta.dir, "publication-fence.ts"))));
  writeFileSync(join(runtime, "instrumentation.json"), JSON.stringify({ hashes, runtimeHash, sourceTree, candidateTree }, null, 2));
  return { runtime, runtimeHash, hashes };
}
export function createFixture(parent: string, runtime: ReturnType<typeof stageRuntime>, pages = 4, events = 8, ballast = 0) {
  const root = mkdtempSync(join(parent, "publication-fixture-"));
  for (const dir of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(root, ".promptus", dir), { recursive: true });
  copyFileSync(resolve(SCRIPTS, "../templates/schema/kb-vocab.json"), join(root, ".promptus/schema/kb-vocab.json"));
  writeFileSync(join(root, ".promptus/TELOS.md"), "# Synthetic publication fixture\nNo scientific evidence.\n");
  writeFileSync(join(root, ".promptus/memory/MEMORY.md"), "# Memory\n<!-- kb:append-point -->\n");
  const padding = "Repeated synthetic context about evidence custody, source history and retrieval. ".repeat(ballast);
  const entries = Array.from({ length: events }, (_, i) => `### [2026-01-01 ${String(Math.floor(i / 3600)).padStart(2, "0")}:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}] RESULT/VALIDATED — Synthetic event ${i}\n<!-- kb:id event-synthetic-${i} -->\n\nSynthetic evidence amber cobalt ledgerword${i}. ${padding}\n`);
  writeFileSync(join(root, ".promptus/ledger/RESEARCH-LEDGER.md"), `# Ledger\n\n${entries.join("\n")}\n<!-- kb:append-point -->\n`);
  for (let i = 0; i < pages; i++) writeFileSync(join(root, `.promptus/docs/page-${i}.md`), `---\nid: finding-page-${i}\nsubstrate: finding\nkind: CLAIM\nstatus: VALIDATED\naliases: [legacy-page-${i}]\nlinks: [page-${(i + 1) % pages}]\n---\n# Synthetic page ${i}\n\nExact amber phrase pageword${i}. Fictional benchmark evidence only. ${padding}\n`);
  writeFileSync(join(root, "fixture.json"), JSON.stringify({ schema: MARKER, root, runtime: runtime.runtime, runtimeHash: runtime.runtimeHash }));
  return root;
}
