/** Offline installation-layout and legacy migration smoke tests in minted scratch roots. */
import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const repo = resolve(import.meta.dir, "..");
const run = (script: string, root: string, args: string[], input = "") => spawnSync(process.execPath, [script, ...args, "--root", root], { input, encoding: "utf8", timeout: 30_000 });

test("isolated plugin packages retain default recall, explicit root and standalone manuscript gates", () => {
  const scratch = mkdtempSync(join(tmpdir(), "organon-package-"));
  try {
    const p = join(scratch, "plugins/promptus"), e = join(scratch, "plugins/editio"), project = join(scratch, "project");
    cpSync(join(repo, "promptus"), p, { recursive: true }); cpSync(join(repo, "editio"), e, { recursive: true });
    for (const dir of ["schema", "ledger", "docs/lit", "memory"]) mkdirSync(join(project, ".promptus", dir), { recursive: true });
    cpSync(join(p, "templates/schema/kb-vocab.json"), join(project, ".promptus/schema/kb-vocab.json"));
    writeFileSync(join(project, ".promptus/TELOS.md"), "# Synthetic package test\n");
    writeFileSync(join(project, ".promptus/ledger/RESEARCH-LEDGER.md"), "# Ledger\n<!-- kb:append-point -->\n");
    writeFileSync(join(project, ".promptus/memory/MEMORY.md"), "# Memory\n<!-- kb:append-point -->\n");
    for (const plugin of [p, e]) {
      const claude = JSON.parse(readFileSync(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
      const codex = JSON.parse(readFileSync(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
      expect(claude.version).toBe(codex.version); expect(existsSync(join(plugin, codex.skills))).toBe(true);
    }
    for (const host of ["hooks.json", "codex.json"]) {
      const hooks = JSON.parse(readFileSync(join(p, "hooks", host), "utf8")).hooks;
      // Derived maintenance is an explicit target-bound command, not a shell heuristic.
      expect(hooks.PostToolUse).toBeUndefined(); expect(hooks.SessionStart).toHaveLength(1);
    }
    const add = run(join(p, "scripts/kb-add.ts"), project, ["--substrate", "finding", "--kind", "CLAIM", "--status", "VALIDATED", "--title", "Packaged boundary result", "--json"], "A synthetic package supports boundarytoken.\n");
    expect(add.status).toBe(0);
    const receipt = JSON.parse(add.stdout);
    expect(receipt.next_action.argv).toContain(project);
    expect(run(join(p, "scripts/kb-index.ts"), project, []).status).toBe(0);
    const lexical = run(join(p, "scripts/kb-find.ts"), project, ["boundarytoken"]);
    expect(lexical.status).toBe(0); expect(lexical.stdout).toContain(receipt.path);
    const semantic = run(join(p, "scripts/kb-find.ts"), project, ["boundarytoken", "--semantic"]);
    expect(semantic.status).toBe(0); expect(semantic.stdout).toContain("lexical-fallback"); expect(semantic.stderr).toContain("not configured");
    expect(existsSync(join(project, ".promptus/cache/semantic"))).toBe(false);
    expect(run(join(p, "scripts/kb-get.ts"), project, [receipt.path]).stdout).toContain("boundarytoken");
    mkdirSync(join(project, ".editio/paper/sections"), { recursive: true });
    writeFileSync(join(project, ".editio/paper/sections/results.md"), `# Results\n\n[Recorded boundary.]{.claim .validated grounds=${receipt.id}}\n`);
    // Remove the temporary sibling installation to prove packaged Editio is self-contained.
    rmSync(p, { recursive: true });
    expect(run(join(e, "scripts/editio-status.ts"), project, ["--gate"]).status).toBe(0);
    expect(run(join(e, "scripts/editio-render.ts"), project, ["--all"]).status).toBe(0);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("packaged doctor migrates a legacy store without changing evidence bytes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "organon-package-migrate-"));
  try {
    const plugin = join(scratch, "plugin"), root = join(scratch, "legacy");
    cpSync(join(repo, "promptus"), plugin, { recursive: true });
    for (const dir of ["schema", "ledger", "docs/lit", "memory", ".promptus"]) mkdirSync(join(root, dir), { recursive: true });
    const vocab = JSON.parse(readFileSync(join(plugin, "templates/schema/kb-vocab.json"), "utf8"));
    vocab.version = 3; // Legacy namespace contract, not a current-schema store with custom paths.
    for (const value of Object.values(vocab.substrates) as any[]) { value.store = value.store.replace(/^\.promptus\//, ""); if (value.index) value.index = value.index.replace(/^\.promptus\//, ""); }
    writeFileSync(join(root, "schema/kb-vocab.json"), JSON.stringify(vocab));
    const source = { "TELOS.md": "# Legacy synthetic direction\n", "ledger/RESEARCH-LEDGER.md": "# Ledger\n<!-- kb:append-point -->\n", "docs/retained.md": "# Retained historical result\n\nlegacyboundary 0.95.\n", "memory/MEMORY.md": "# Memory\n" };
    for (const [path, bytes] of Object.entries(source)) writeFileSync(join(root, path), bytes);
    const script = join(plugin, "scripts/promptus-doctor.ts");
    expect(run(script, root, ["migrate"]).status).toBe(0);
    for (const [path, bytes] of Object.entries(source)) expect(readFileSync(join(root, path), "utf8")).toBe(bytes);
    const applied = run(script, root, ["migrate", "--apply"]);
    expect(applied.status).toBe(0);
    for (const [path, bytes] of Object.entries(source)) expect(readFileSync(join(root, ".promptus", path), "utf8")).toBe(bytes);
    expect(run(join(plugin, "scripts/kb-index.ts"), root, []).status).toBe(0);
    expect(run(join(plugin, "scripts/kb-find.ts"), root, ["legacyboundary"]).stdout).toContain("retained.md");
    expect(run(script, root, ["migrate", "--apply"]).status).toBe(0);
    for (const [path, bytes] of Object.entries(source)) expect(readFileSync(join(root, ".promptus", path), "utf8")).toBe(bytes);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
