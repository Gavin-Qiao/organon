/** Private-copy trial plumbing; never imported by production. */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertSnapshot, digest, manifest } from "./local-retrieval-snapshot.ts";
import { stageReuseRuntime } from "./parse-reuse-stage.ts";
import { MARKER, sha } from "./publication-fence.ts";
import { SCRIPTS, treeHashes, stageRuntime } from "./publication-fixture.ts";

export const LIMITS = { cacheBytes: 16 * 1024 * 1024, scratchBytes: 256 * 1024 * 1024, rssKiB: 1024 * 1024, commandMs: 60_000, outputBytes: 8 * 1024 * 1024 };
export function privateParent(input: string) {
  const root = resolve(input), repo = resolve(import.meta.dir, "..");
  if (root !== realpathSync(root) || lstatSync(root).isSymbolicLink() || !basename(root).startsWith("organon-private-parse-") || root === repo || root.startsWith(repo + "/")) throw Error("unsafe-private-parent");
  return root;
}
export function fileSizes(root: string, prefix = ""): Record<string, number> {
  if (!existsSync(root)) return {};
  const result: Record<string, number> = {};
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name), k = prefix + e.name;
    if (e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) throw Error("unsafe-work-entry");
    if (e.isDirectory()) Object.assign(result, fileSizes(p, k + "/")); else result[k] = statSync(p).size;
  }
  return result;
}
export const sumBytes = (sizes: Record<string, number>) => Object.values(sizes).reduce((a,b) => a+b, 0);
export function replacementBound(before: Record<string, number>, after: Record<string, number>) {
  const maxima = [...new Set([...Object.keys(before), ...Object.keys(after)])].map(k => Math.max(before[k] ?? 0, after[k] ?? 0));
  return maxima.reduce((a,b) => a+b, 0) + Math.max(0, ...maxima) + 1024;
}
export function cloneFrozen(snapshot: string, parent: string, runtime: ReturnType<typeof stageRuntime>) {
  const captured = assertSnapshot(snapshot), root = mkdtempSync(join(privateParent(parent), "publication-fixture-"));
  for (const entry of captured.manifest) {
    const path = join(root, ".promptus", entry.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); copyFileSync(join(snapshot, ".promptus", entry.path), path);
  }
  if (digest(JSON.stringify(manifest(root))) !== captured.manifestHash) throw Error("copied-source-mismatch");
  writeFileSync(join(root, "fixture.json"), JSON.stringify({ schema: MARKER, root, runtime: runtime.runtime, runtimeHash: runtime.runtimeHash, privateCaptureHash: captured.manifestHash }), { flag: "wx", mode: 0o600 });
  return root;
}
export function stageBudgetedRuntime(parent: string, cap = LIMITS.cacheBytes) {
  if (!Number.isSafeInteger(cap) || cap < 0) throw Error("invalid-cache-cap");
  const staged = stageReuseRuntime(parent), local = join(staged.runtime, "budgeted-parses.ts"), original = join(import.meta.dir, "parse-reuse.ts");
  let code = readFileSync(original, "utf8");
  for (const [from, to] of [
    ['"../promptus/scripts/lib/read-store.ts"', JSON.stringify(join(SCRIPTS, "lib/read-store.ts"))],
    ['"../promptus/scripts/lib/store-lock.ts"', JSON.stringify(join(SCRIPTS, "lib/store-lock.ts"))],
    ['"./publication-fence.ts"', JSON.stringify(join(import.meta.dir, "publication-fence.ts"))],
    ['const compressed = gzipSync(json);', `const compressed = gzipSync(json);\n    if (compressed.length > ${cap}) throw Error("private-trial-cache-budget");`],
  ]) { if (code.split(from).length !== 2) throw Error("budget-anchor-drift"); code = code.replace(from, to); }
  writeFileSync(local, code);
  for (const name of ["kb-index.ts", "lib/read-store.ts"]) {
    const file = join(staged.runtime, "scripts", name), before = readFileSync(file, "utf8");
    if (before.split(JSON.stringify(original)).length !== 2) throw Error("budget-import-drift");
    writeFileSync(file, before.replace(JSON.stringify(original), JSON.stringify(local)));
  }
  const tree = treeHashes(join(staged.runtime, "scripts"));
  const runtimeHash = sha(JSON.stringify(tree) + readFileSync(staged.gate) + readFileSync(staged.cli) + code);
  return { ...staged, runtimeHash };
}
function treeRss(pid: number, seen = new Set<number>()): number {
  if (seen.has(pid)) return 0; seen.add(pid);
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8"), rss = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0);
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim().split(/\s+/).filter(Boolean).map(Number);
    return rss + children.reduce((sum, child) => sum + treeRss(child, seen), 0);
  } catch { return 0; } // process exited between samples
}
export async function boundedCommand(argv: string[], log: string, options: { rssKiB?: number; timeoutMs?: number } = {}) {
  if (process.platform !== "linux") throw Error("private-trial-platform: Linux /proc and GNU time are required for certified RSS telemetry");
  const start = performance.now(); let stdout = "", stderr = "", sampledTreeRssKiB = 0, killed: string | null = null;
  const child = spawn("/usr/bin/time", ["-f", "__PRIVATE_RESOURCE__ %M", ...argv], { detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ORGANON_PUBLICATION_METRICS: "0", ORGANON_PUBLICATION_FAULT: "", ORGANON_PUBLICATION_CRASH: "0", CUDA_VISIBLE_DEVICES: "", HF_HUB_OFFLINE: "1" } });
  function stop(reason: string) { if (killed) return; killed = reason; try { process.kill(-child.pid!, "SIGKILL"); } catch {} }
  const timer = setInterval(() => {
    sampledTreeRssKiB = Math.max(sampledTreeRssKiB, treeRss(child.pid!));
    if (sampledTreeRssKiB > (options.rssKiB ?? LIMITS.rssKiB)) stop("rss-budget");
    if (performance.now() - start > (options.timeoutMs ?? LIMITS.commandMs)) stop("command-timeout");
  }, 100);
  child.stdout.on("data", bytes => { stdout += bytes; if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > LIMITS.outputBytes) stop("output-budget"); });
  child.stderr.on("data", bytes => { stderr += bytes; if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > LIMITS.outputBytes) stop("output-budget"); });
  let code: number | null;
  try { code = await new Promise<number | null>((res, rej) => { child.once("error", rej); child.once("close", res); }); }
  finally { clearInterval(timer); }
  const ms = performance.now() - start;
  writeFileSync(log, JSON.stringify({ argv, code, killed, stdout, stderr, ms, sampledTreeRssKiB }) + "\n", { flag: "wx", mode: 0o600 });
  return { stdout, stderr, ms, code, killed, sampledTreeRssKiB, maxProcessRssKiB: Number(/__PRIVATE_RESOURCE__ (\d+)/.exec(stderr)?.[1] ?? 0) };
}
const STAT_KEYS = ["filesParsed", "filesReused", "unitsParsed", "unitsReused", "sourceBytesRead", "directoryCalls", "directoryEntries", "loadMs", "parseMs", "saveMs", "cacheBytesRead", "cacheBytesWritten", "cacheBytes", "rawJsonBytes"];
export function publicStats(raw: string) {
  return raw.split("\n").filter(s => s.startsWith("PARSE_REUSE ")).map(line => {
    const parsed = JSON.parse(line.slice(12));
    return { ...Object.fromEntries(STAT_KEYS.filter(k => Number.isFinite(parsed[k])).map(k => [k, parsed[k]])), knownDirtyReuse: parsed.reason === "known-dirty-reuse" };
  });
}
export function publicCommand(r: Awaited<ReturnType<typeof boundedCommand>>) {
  return { ms: r.ms, code: r.code, stopped: r.killed, sampledTreeRssKiB: r.sampledTreeRssKiB, maxProcessRssKiB: r.maxProcessRssKiB };
}
