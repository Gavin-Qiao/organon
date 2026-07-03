#!/usr/bin/env bun
/**
 * validate-plugin.ts — offline structural validation of the Organon marketplace.
 *
 * Validates the root marketplace manifest, then every plugin it references —
 * manifest fields, command/skill/agent frontmatter, hook wiring, and (where a
 * plugin ships one) the controlled vocab — so CI and the pre-push hook can gate a
 * change without needing the Claude CLI, an account, or the network. Mirrors the
 * structural half of `claude plugin validate` (run that locally for the full
 * check). Exits non-zero on any problem, printing each one.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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

// 1. Marketplace manifest — every plugin source must resolve on disk.
const mkt = readJSON(".claude-plugin/marketplace.json");
const pluginDirs: string[] = [];
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
      const rel = pl.source.replace(/^\.\//, "").replace(/\/$/, "");
      if (!rel || !existsSync(join(repo, rel))) {
        fail(`marketplace plugin "${pl.name}" source "${pl.source}" does not resolve`);
      } else {
        pluginDirs.push(rel);
      }
    }
    pass(`marketplace.json (${mkt.name}: ${mkt.plugins.length} plugin(s))`);
  }
}

// 2. Each plugin the marketplace references.
for (const dir of pluginDirs) {
  console.log(`\n${dir}/`);

  // 2a. Plugin manifest.
  const plugin = readJSON(`${dir}/.claude-plugin/plugin.json`);
  if (plugin) {
    for (const f of ["name", "version", "description"]) if (!plugin[f]) fail(`${dir}/plugin.json missing "${f}"`);
    if (plugin.version && !/^\d+\.\d+\.\d+([-+].+)?$/.test(plugin.version))
      fail(`${dir}/plugin.json version "${plugin.version}" is not semver`);
    if (plugin.name) pass(`${dir}/.claude-plugin/plugin.json (${plugin.name} v${plugin.version})`);
  }

  // 2b. Components — commands take their name from the filename; skills and agents
  //     must declare name + description in frontmatter.
  const entries = (d: string) => (existsSync(join(repo, dir, d)) ? readdirSync(join(repo, dir, d)) : []);
  for (const f of entries("commands")) if (f.endsWith(".md")) checkComponent(`${dir}/commands/${f}`, ["description"]);
  for (const f of entries("agents")) if (f.endsWith(".md")) checkComponent(`${dir}/agents/${f}`, ["name", "description"]);
  for (const s of entries("skills")) {
    const sk = `${dir}/skills/${s}/SKILL.md`;
    if (existsSync(join(repo, sk))) checkComponent(sk, ["name", "description"]);
    else if (statSync(join(repo, dir, "skills", s)).isDirectory()) fail(`${dir}/skills/${s}/ has no SKILL.md`);
  }

  // 2c. Controlled vocabulary (plugins that ship one) must parse.
  if (existsSync(join(repo, dir, "templates/schema/kb-vocab.json"))) {
    if (readJSON(`${dir}/templates/schema/kb-vocab.json`)) pass(`${dir}/templates/schema/kb-vocab.json`);
  }

  // 2d. Hooks (optional) — the manifest parses and every referenced script exists.
  if (existsSync(join(repo, dir, "hooks", "hooks.json"))) {
    const hk = readJSON(`${dir}/hooks/hooks.json`);
    if (hk && hk.hooks && typeof hk.hooks === "object") {
      let count = 0;
      for (const event of Object.keys(hk.hooks)) {
        for (const group of hk.hooks[event] || []) {
          for (const h of group.hooks || []) {
            count++;
            const m = typeof h.command === "string" && h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/);
            if (m && !existsSync(join(repo, dir, m[1]))) fail(`${dir}/hooks/hooks.json references missing ${m[1]}`);
          }
        }
      }
      pass(`${dir}/hooks/hooks.json (${Object.keys(hk.hooks).length} event(s), ${count} hook(s))`);
    } else if (hk) {
      fail(`${dir}/hooks/hooks.json has no hooks object`);
    }
  }
}

console.log("");
if (problems.length) {
  console.error(`${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log("All marketplace + plugin checks passed.");
