#!/usr/bin/env bun
/** Explicit resource inspection and narrowly targeted optional-cache eviction. */
import { findProjectRoot } from "./lib/paths.ts";
import { cacheUsage, evictParseCache } from "./lib/parse-cache.ts";

export function main(args: string[]): number {
  if (!args.length || args.includes("--help")) {
    console.log("kb-cache status|evict [--root <project>] [--apply]\nJSON output. Evict previews by default; --apply removes only parsed-units-v1.json.gz under the source-writer lease. PROMPTUS_PARSE_CACHE_BYTES defaults to 0 (disabled); set an explicit byte limit to opt in. No models or source files are removed."); return 0;
  }
  const [action, ...rest] = args; let rootArg = process.cwd(), apply = false;
  const seen = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]; if (seen.has(flag)) throw Error(`duplicate flag: ${flag}`); seen.add(flag);
    if (flag === "--root" && rest[i + 1] && !rest[i + 1].startsWith("--")) rootArg = rest[++i];
    else if (flag === "--apply" && action === "evict") apply = true;
    else throw Error(`invalid flag: ${flag}`);
  }
  const root = findProjectRoot(rootArg);
  if (!["status", "evict"].includes(action)) throw Error("unknown cache action");
  console.log(JSON.stringify(action === "status" ? cacheUsage(root) : evictParseCache(root, apply), null, 2)); return 0;
}
if (import.meta.main) try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(JSON.stringify({ code: "CACHE_OPERATION_FAILED", message: String(error), recovery: "Inspect the named path or resource limit; no source repair is implied." })); process.exitCode = 1; }
