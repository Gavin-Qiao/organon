import { expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const templates = resolve(import.meta.dir, "../../templates/latex");
const hasTeX = spawnSync("pdflatex", ["--version"], { encoding: "utf8" }).status === 0;

test.skipIf(!hasTeX)("section preview compiles bound numbers, shared macros and identity", () => {
  const root = mkdtempSync(join(tmpdir(), "editio-preview-"));
  try {
    mkdirSync(join(root, "front")); mkdirSync(join(root, "sections"));
    copyFileSync(join(templates, "preview.tex"), join(root, "preview.tex"));
    copyFileSync(join(templates, "editio.sty"), join(root, "editio.sty"));
    writeFileSync(join(root, "front/numbers.tex"), "\\expandafter\\def\\csname editionum@threshold\\endcsname{17}\n");
    writeFileSync(join(root, "front/macros.tex"), "\\newcommand{\\Gain}{g}\n");
    writeFileSync(join(root, "front/identity.tex"), "\\newcommand{\\PaperTitle}{Synthetic preview}\n");
    writeFileSync(join(root, "sections/methods.tex"), "\\section{Methods}\n\\PaperTitle{} uses $\\Gain=\\editionum{threshold}$.\n");
    const result = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "preview.tex"], { cwd: root, encoding: "utf8", timeout: 30_000 });
    expect(result.status).toBe(0);
    expect(existsSync(join(root, "preview.pdf"))).toBe(true);
    const log = readFileSync(join(root, "preview.log"), "utf8");
    expect(log).not.toContain("unbound number handle");
    expect(log).not.toContain("Undefined control sequence");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
