#!/usr/bin/env bun
import { findProjectRoot } from "./lib/paths.ts";
import { configureSemantic, updateSemantic, semanticSnapshot } from "./lib/semantic.ts";
import { cacheUsage } from "./lib/parse-cache.ts";
import { recoveryFor } from "./lib/diagnostics.ts";
const HELP = `kb-semantic — explicit offline QMD setup and refresh
  kb-semantic preview [--root <project>]
  kb-semantic configure --package <QMD package directory> --node <Node executable> --model <local GGUF> [--root <project>]
  kb-semantic update [--root <project>]
Requires separately installed QMD 2.8.3, Node >=22 and a local embedding model.
Preview is read-only: reports projection size and unknown third-party database growth.
No dependencies or models are downloaded. Configure/update write only .promptus/cache/semantic.
Then: kb-find "conceptual question" --semantic. Ordinary retrieval remains lexical.`;
export function main(args: string[]): number {
  if (args.includes("--help") || !args.length) { console.log(HELP); return 0; }
  const [action, ...rest] = args, flags: Record<string, string> = {};
  const allowed = action === "configure" ? ["--root", "--package", "--node", "--model"] : ["update", "preview"].includes(action) ? ["--root"] : [];
  if (!allowed.length) throw new Error("unknown semantic action");
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--") || flags[rest[i]]) throw new Error(`invalid argument: ${rest[i]}`);
    flags[rest[i]] = rest[i + 1];
  }
  const root = findProjectRoot(flags["--root"] ?? process.cwd());
  if (action === "preview") {
    const snapshot = semanticSnapshot(root);
    console.log(JSON.stringify({ ...cacheUsage(root), units: snapshot.documents.length,
      projectedMarkdownBytes: snapshot.documents.reduce((sum, doc) => sum + Buffer.byteLength(`# ${doc.title}\n\n${doc.text}`), 0),
      databaseAndModelGrowthBytes: null, bounded: false,
      warning: "QMD database/model and transient build space are not capped by PROMPTUS_PARSE_CACHE_BYTES. Do not enable semantic builds on a tight disk without a separately enforced filesystem quota. Lexical retrieval needs neither QMD nor a model." }, null, 2)); return 0;
  }
  if (action === "configure" && ["--package", "--node", "--model"].some(key => !flags[key])) throw new Error("configure requires --package, --node and --model");
  console.log(JSON.stringify(action === "configure" ? configureSemantic(root, { packageRoot: flags["--package"], node: flags["--node"], model: flags["--model"] }) : updateSemantic(root), null, 2));
  return 0;
}
if (import.meta.main) { try { process.exitCode = main(process.argv.slice(2)); } catch (error) {
  console.error(JSON.stringify({ code: "SEMANTIC_UNAVAILABLE", message: String(error), ...recoveryFor("SEMANTIC_UNAVAILABLE", process.cwd()) })); process.exitCode = 1;
} }
