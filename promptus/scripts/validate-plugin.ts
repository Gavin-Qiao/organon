#!/usr/bin/env bun
/**
 * validate-plugin.ts — offline structural validation of both Organon agent adapters.
 *
 * Validates the Claude Code and Codex marketplace manifests, then every plugin they reference —
 * adapter-manifest parity, command/skill/agent frontmatter, hook wiring, and (where a
 * plugin ships one) the controlled vocab — so CI and the pre-push hook can gate a
 * change without needing either host CLI, an account, or the network. Exits
 * non-zero on any problem, printing each one.
 *
 * Usage: validate-plugin.ts [--root <repo>]   (default: this script's own repo)
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { syncReader } from "./sync-reader.ts";

function arg(argv: string[], k: string): string | undefined {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}
const repo = arg(process.argv.slice(2), "root") ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const problems: string[] = [];
const pass = (m: string) => console.log(`  ok   ${m}`);
const fail = (m: string) => {
  problems.push(m);
  console.log(`  FAIL ${m}`);
};

function readJSON(rel: string): any | null {
  const p = join(repo, rel);
  if (!existsSync(p)) {
    fail(`${rel} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${rel} is not valid JSON — ${(e as Error).message}`);
    return null;
  }
}

function checkComponent(rel: string, required: string[]) {
  const { data } = parseFrontmatter(readFileSync(join(repo, rel), "utf8"));
  const missing = required.filter((k) => !data[k] || String(data[k]).trim() === "");
  if (missing.length) fail(`${rel} frontmatter missing: ${missing.join(", ")}`);
  else pass(rel);
}

function pluginPath(value: string): string {
  return value.replace(/^\.\//, "").replace(/\/$/, "");
}

function checkHooks(rel: string, codex = false) {
  const hk = readJSON(rel);
  if (!hk) return;
  if (!hk.hooks || typeof hk.hooks !== "object") {
    fail(`${rel} has no hooks object`);
    return;
  }
  const supported = new Set([
    "SessionStart", "PreToolUse", "PermissionRequest", "PostToolUse", "PreCompact",
    "PostCompact", "UserPromptSubmit", "SubagentStart", "SubagentStop", "Stop",
  ]);
  let count = 0;
  for (const event of Object.keys(hk.hooks)) {
    if (codex && !supported.has(event)) fail(`${rel} uses unsupported Codex event ${event}`);
    for (const group of hk.hooks[event] || []) {
      for (const h of group.hooks || []) {
        count++;
        if (h.type !== "command") continue;
        if (codex && !h.command) fail(`${rel} ${event} hook has no POSIX command`);
        if (codex && !h.commandWindows) fail(`${rel} ${event} hook has no commandWindows override`);
        for (const command of [h.command, h.commandWindows].filter((x) => typeof x === "string")) {
          const m = command.match(/\$\{(?:CLAUDE_)?PLUGIN_ROOT\}\/([^"\s]+)/) ??
            command.match(/%PLUGIN_ROOT%\/([^"\s]+)/);
          if (m) {
            const dir = rel.split("/")[0];
            if (!existsSync(join(repo, dir, m[1]))) fail(`${rel} references missing ${m[1]}`);
          }
        }
      }
    }
  }
  pass(`${rel} (${Object.keys(hk.hooks).length} event(s), ${count} hook(s))`);
}

// 1. Claude Code marketplace — every plugin source must resolve on disk.
const mkt = readJSON(".claude-plugin/marketplace.json");
const pluginDirs: string[] = [];
const claudeSources = new Map<string, string>();
if (mkt) {
  for (const f of ["name", "owner"]) if (!mkt[f]) fail(`marketplace.json missing "${f}"`);
  if (!Array.isArray(mkt.plugins) || mkt.plugins.length === 0) {
    fail("marketplace.json has no plugins[]");
  } else {
    for (const pl of mkt.plugins) {
      if (!pl.name) {
        fail("a marketplace plugin entry has no name");
        continue;
      }
      if (!pl.source) {
        fail(`marketplace plugin "${pl.name}" has no source`);
        continue;
      }
      const rel = pluginPath(pl.source);
      if (!rel || !existsSync(join(repo, rel))) {
        fail(`marketplace plugin "${pl.name}" source "${pl.source}" does not resolve`);
      } else {
        pluginDirs.push(rel);
        claudeSources.set(pl.name, rel);
      }
    }
    pass(`marketplace.json (${mkt.name}: ${mkt.plugins.length} plugin(s))`);
  }
}

// 2. Native Codex marketplace — it must expose the same plugin set and roots.
const codexMkt = readJSON(".agents/plugins/marketplace.json");
const codexSources = new Map<string, string>();
if (codexMkt) {
  if (!codexMkt.name) fail('Codex marketplace.json missing "name"');
  if (!codexMkt.interface?.displayName) fail("Codex marketplace.json missing interface.displayName");
  if (!Array.isArray(codexMkt.plugins) || codexMkt.plugins.length === 0) {
    fail("Codex marketplace.json has no plugins[]");
  } else {
    for (const pl of codexMkt.plugins) {
      const raw = typeof pl.source === "string" ? pl.source : pl.source?.path;
      if (!pl.name || !raw) {
        fail("a Codex marketplace plugin entry is missing name or source.path");
        continue;
      }
      const rel = pluginPath(raw);
      codexSources.set(pl.name, rel);
      if (!existsSync(join(repo, rel))) fail(`Codex marketplace plugin "${pl.name}" source "${raw}" does not resolve`);
      if (!pl.policy?.installation || !pl.policy?.authentication || !pl.category)
        fail(`Codex marketplace plugin "${pl.name}" is missing policy/category metadata`);
    }
    pass(`Codex marketplace.json (${codexMkt.name}: ${codexMkt.plugins.length} plugin(s))`);
  }
  if (mkt?.name && codexMkt.name !== mkt.name) fail("Claude and Codex marketplace names differ");
  for (const [name, rel] of claudeSources) {
    if (!codexSources.has(name)) fail(`Codex marketplace is missing plugin "${name}"`);
    else if (codexSources.get(name) !== rel) fail(`marketplace adapters disagree on "${name}" source`);
  }
  for (const name of codexSources.keys()) if (!claudeSources.has(name)) fail(`Claude marketplace is missing plugin "${name}"`);
}

// 3. Each plugin the marketplaces reference.
for (const dir of pluginDirs) {
  console.log(`\n${dir}/`);

  // 3a. Adapter manifests must agree on identity and version.
  const plugin = readJSON(`${dir}/.claude-plugin/plugin.json`);
  const codexPlugin = readJSON(`${dir}/.codex-plugin/plugin.json`);
  for (const [kind, manifest] of [["Claude", plugin], ["Codex", codexPlugin]] as const) {
    if (!manifest) continue;
    for (const f of ["name", "version", "description"]) if (!manifest[f]) fail(`${dir}/${kind} plugin.json missing "${f}"`);
    if (manifest.version && !/^\d+\.\d+\.\d+([-+].+)?$/.test(manifest.version))
      fail(`${dir}/${kind} plugin.json version "${manifest.version}" is not semver`);
  }
  if (plugin?.name) pass(`${dir}/.claude-plugin/plugin.json (${plugin.name} v${plugin.version})`);
  if (codexPlugin?.name) pass(`${dir}/.codex-plugin/plugin.json (${codexPlugin.name} v${codexPlugin.version})`);
  if (plugin && codexPlugin) {
    for (const field of ["name", "version", "description"])
      if (plugin[field] !== codexPlugin[field]) fail(`${dir} adapter manifests disagree on ${field}`);
    for (const field of ["skills", "hooks"]) {
      const value = codexPlugin[field];
      if (typeof value === "string") {
        const rel = pluginPath(value);
        if (!existsSync(join(repo, dir, rel))) fail(`${dir}/.codex-plugin/plugin.json references missing ${rel}`);
      }
    }
  }

  // 3b. Components — commands take their name from the filename; skills and agents
  //     must declare name + description in frontmatter.
  const entries = (d: string) => (existsSync(join(repo, dir, d)) ? readdirSync(join(repo, dir, d)) : []);
  for (const f of entries("commands")) if (f.endsWith(".md")) checkComponent(`${dir}/commands/${f}`, ["description"]);
  for (const f of entries("agents")) if (f.endsWith(".md")) checkComponent(`${dir}/agents/${f}`, ["name", "description"]);
  for (const s of entries("skills")) {
    const sk = `${dir}/skills/${s}/SKILL.md`;
    if (existsSync(join(repo, sk))) checkComponent(sk, ["name", "description"]);
    else if (statSync(join(repo, dir, "skills", s)).isDirectory()) fail(`${dir}/skills/${s}/ has no SKILL.md`);
  }

  // 3c. Controlled vocabulary (plugins that ship one) must parse.
  if (existsSync(join(repo, dir, "templates/schema/kb-vocab.json"))) {
    if (readJSON(`${dir}/templates/schema/kb-vocab.json`)) pass(`${dir}/templates/schema/kb-vocab.json`);
  }

  // 3d. Hook adapters (optional) — every referenced script exists; Codex uses supported events.
  if (existsSync(join(repo, dir, "hooks", "hooks.json"))) {
    checkHooks(`${dir}/hooks/hooks.json`);
  }
  if (typeof codexPlugin?.hooks === "string") checkHooks(`${dir}/${pluginPath(codexPlugin.hooks)}`, true);
}

if (existsSync(join(repo, "promptus/scripts/lib/read-store.ts"))) {
  try {
    const drift = syncReader(repo);
    if (drift.length) fail("Editio canonical reader drift; run bun promptus/scripts/sync-reader.ts --write");
    else pass("Editio canonical reader matches Promptus source");
  } catch (error) { fail(`canonical reader: ${String(error)}`); }
}

console.log("");
if (problems.length) {
  console.error(`${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log("All marketplace + plugin adapter checks passed.");
