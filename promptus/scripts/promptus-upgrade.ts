#!/usr/bin/env bun
/** Preview-first project adoption, not a host plugin installer or source migration. */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { findProjectRoot } from "./lib/paths.ts";
import { hashStore } from "./lib/store-hash.ts";
import { cacheUsage, sha } from "./lib/parse-cache.ts";

function packageReceipt(plugin: string) {
  const root = realpathSync(plugin), files: Array<[string, string]> = [];
  const manifests = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"].map(file => JSON.parse(readFileSync(join(root, file), "utf8")));
  if (manifests.some(manifest => manifest.name !== "promptus") || manifests[0].version !== manifests[1].version) throw Error("UPGRADE_PACKAGE_INVALID: Promptus adapter names and versions must agree");
  const walk = (rel: string) => {
    const dir = join(root, rel);
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name), child = `${rel}/${entry.name}`;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw Error(`UPGRADE_PACKAGE_UNSAFE: ${child}`);
      if (stat.isDirectory()) walk(child); else files.push([child, sha(readFileSync(file))]);
    }
  };
  for (const rel of [".codex-plugin", ".claude-plugin", "scripts", "templates", "skills", "commands", "hooks"]) walk(rel);
  return { root, version: String(manifests[0].version), fingerprint: sha(JSON.stringify(files)) };
}

function run(plugin: string, root: string, script: string, flags: string[] = []) {
  const result = spawnSync(process.execPath, [join(plugin, "scripts", script), "--root", root, ...flags], { encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  let report: any = null; try { report = JSON.parse(result.stdout); } catch { /* bounded raw diagnostic retained below */ }
  return { exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, report,
    stdout: result.stdout?.slice(0, 16000) ?? "", stderr: result.stderr?.slice(0, 16000) ?? "" };
}

export function upgradePlan(rootArg: string, installedPlugin?: string) {
  const root = realpathSync(rootArg);
  if (realpathSync(findProjectRoot(root)) !== root) throw Error("UPGRADE_TARGET_NOT_EXACT: supply the project root, not an ancestor or subdirectory");
  const candidate = packageReceipt(resolve(import.meta.dir, ".."));
  const installed = installedPlugin ? packageReceipt(installedPlugin) : null;
  const source = hashStore(root), agents = join(root, "AGENTS.md");
  const customPolicyHash = existsSync(agents) ? sha(readFileSync(agents)) : null;
  const identity = { root, candidate, installed, source, customPolicyHash, parseLimitBytes: cacheUsage(root).limitBytes };
  const preflight = run(candidate.root, root, "promptus-session-doctor.ts", ["--json", "--artifacts"]);
  return { schema: "promptus.upgrade.v1", ...identity, planToken: sha(JSON.stringify(identity)), preflight,
    resources: cacheUsage(root), installationRequired: !installed || installed.fingerprint !== candidate.fingerprint,
    actions: ["Verify/install the selected plugin through the host's supported update workflow separately.",
      "With --apply and the reviewed --expect-plan token, refresh derived state and verify read-only continuation.",
      "Preserve all research Markdown, custom vocabulary, AGENTS.md and manuscript files."],
    cadence: "After gated writes, batch kb-index or promptus-check --strict; before resuming, session-doctor; retrieve with kb-find then kb-get. Review this against existing project policy; this tool never replaces AGENTS.md.",
    rollback: "Select the prior compatible plugin through the host; run its kb-index and session-doctor with this exact root. This tool changes only disposable derived state, so it requires no research-source rollback. Retain a recoverable project snapshot before any separately authorized policy/layout/manuscript change.",
    guarantee: "Preview is read-only. Installed location is operator-supplied, not proof that a running agent has reloaded it." };
}

export function applyUpgrade(root: string, installed: string | undefined, token: string) {
  const plan = upgradePlan(root, installed);
  if (plan.planToken !== token) throw Error("UPGRADE_PLAN_CHANGED: preview again; source, package, policy or resource limit changed");
  if (plan.installationRequired) throw Error("UPGRADE_INSTALL_REQUIRED: update the host separately and preview with its explicit installed-plugin path");
  const issues = plan.preflight.report?.issues;
  if (!Array.isArray(issues) || plan.preflight.exitCode === 2 || issues.some((issue: any) => issue.severity === "error" && issue.surface !== "derived-retrieval")) throw Error("UPGRADE_PREFLIGHT_BLOCKED: source/evidence/handoff problems require scoped review; no refresh attempted");
  const maintenance = run(plan.installed!.root, plan.root, "promptus-check.ts", ["--strict"]);
  const after = run(plan.installed!.root, plan.root, "promptus-session-doctor.ts", ["--json", "--artifacts"]);
  const sourceUnchanged = hashStore(plan.root).hash === plan.source.hash;
  const agents = join(plan.root, "AGENTS.md");
  const policyUnchanged = (existsSync(agents) ? sha(readFileSync(agents)) : null) === plan.customPolicyHash;
  const ok = maintenance.exitCode === 0 && after.exitCode === 0 && sourceUnchanged && policyUnchanged;
  return { ...plan, applied: true, ok, maintenance, after, sourceUnchanged, policyUnchanged,
    partialFailure: !ok, next: ok ? "Reload the project's agent session and perform its scoped retrieval/continuation smoke check; this receipt does not certify other projects." : "Derived refresh may be partial. Inspect maintenance/after diagnostics; preserve source and use the rollback instructions if needed." };
}

export function main(args: string[]) {
  if (!args.length || args.includes("--help")) { console.log("promptus-upgrade --root <exact-project> [--installed-plugin <path>] [--apply --expect-plan <token>]\nPreview-first JSON. No host installation, source migration, AGENTS replacement or evidence repair. Preview each project separately."); return 0; }
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; if (flag in flags) throw Error(`duplicate flag ${flag}`);
    if (flag === "--apply") flags[flag] = "true";
    else if (["--root", "--installed-plugin", "--expect-plan"].includes(flag) && args[i + 1] && !args[i + 1].startsWith("--")) flags[flag] = args[++i];
    else throw Error(`invalid flag ${flag}`);
  }
  if (!flags["--root"] || (flags["--apply"] && !flags["--expect-plan"]) || (!flags["--apply"] && flags["--expect-plan"])) throw Error("explicit --root required; --apply requires --expect-plan from preview");
  const result = flags["--apply"] ? applyUpgrade(flags["--root"], flags["--installed-plugin"], flags["--expect-plan"]) : upgradePlan(flags["--root"], flags["--installed-plugin"]);
  console.log(JSON.stringify(result, null, 2)); return "ok" in result && !result.ok ? 1 : 0;
}
if (import.meta.main) try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.log(JSON.stringify({ code: "UPGRADE_REFUSED", message: String(error), recovery: "Inspect the condition and re-preview the exact project; no automatic source repair or plugin installation." })); process.exitCode = 1; }
