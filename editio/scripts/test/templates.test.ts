/**
 * templates.test.ts — the template data is schema-sound and identity-clean.
 * The no-identity sweep enforces the open-source rule mechanically: nobody's
 * real name ships in editio's templates, skills, or scripts (plugin.json's
 * authorship and NOTICE's upstream credit live outside these dirs by design).
 */
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EDITIO = join(import.meta.dir, "..", "..");
const TEMPLATES = join(EDITIO, "templates");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test("every template JSON parses", () => {
  for (const p of walk(TEMPLATES).filter((p) => p.endsWith(".json"))) {
    expect(() => JSON.parse(readFileSync(p, "utf8"))).not.toThrow();
  }
});

test("the structure gate is strict, ordered, and slug-complete", () => {
  const gate = JSON.parse(readFileSync(join(TEMPLATES, "schema", "doco-deo.json"), "utf8"));
  expect(gate.policy).toBe("strict");
  expect(gate.classes.core.length).toBeGreaterThan(10);
  expect(Object.keys(gate.orders).length).toBeGreaterThanOrEqual(3);
  for (const [id, order] of Object.entries<string[]>(gate.orders)) {
    for (const cls of order) {
      const known = gate.classes.core.includes(cls) || gate.classes.extended.includes(cls);
      expect(known, `${id}: ${cls} not in the gate's classes`).toBe(true);
      expect(gate.section_slugs[cls], `${id}: ${cls} has no section slug`).toBeTruthy();
    }
  }
  expect(gate.modes).toEqual(["draft", "publish", "blind"]);
});

test("every venue file carries the fields scaffold and figures need", () => {
  const venues = readdirSync(join(TEMPLATES, "venues"));
  expect(venues).toContain("arxiv");
  expect(venues).toContain("tpami");
  for (const v of venues) {
    const j = JSON.parse(readFileSync(join(TEMPLATES, "venues", v, "venue.json"), "utf8"));
    for (const f of ["id", "class", "bib_style", "columns", "column_width_mm", "full_width_mm", "figure_font_pt", "author_format"]) {
      expect(j[f], `${v}: missing ${f}`).toBeDefined();
    }
    expect(j.id).toBe(v);
    expect(j.full_width_mm, `${v}: full width narrower than a column`).toBeGreaterThanOrEqual(j.column_width_mm);
  }
});

test("the mplstyle template carries the venue tokens and the Okabe-Ito cycle", () => {
  const mpl = readFileSync(join(TEMPLATES, "figures", "editio.mplstyle"), "utf8");
  for (const token of ["EDITIO_VENUE", "EDITIO_FIG_W_IN", "EDITIO_FIG_H_IN", "EDITIO_FULL_W_IN", "EDITIO_FONT_PT"]) {
    expect(mpl, `missing token ${token}`).toContain(token);
  }
  for (const hex of ["0072B2", "D55E00", "009E73", "E69F00", "56B4E9", "CC79A7", "F0E442"]) {
    expect(mpl, `Okabe-Ito ${hex} missing from the cycle`).toContain(hex);
  }
  expect(mpl).toContain("figure.constrained_layout.use: True");
  expect(mpl).not.toContain("bbox_inches: tight");
});

test("no-identity sweep: templates, skills, and scripts carry no real name", () => {
  const dirs = [TEMPLATES, join(EDITIO, "skills"), join(EDITIO, "scripts")];
  const leak = /mohan|qiao|gavin/i;
  for (const d of dirs) {
    for (const p of walk(d)) {
      if (p.endsWith("templates.test.ts")) continue; // this sweep carries the pattern itself
      const hit = readFileSync(p, "utf8").match(leak);
      expect(hit, `${p} leaks "${hit?.[0]}"`).toBeNull();
    }
  }
});

test("the paper.json template assumes nobody: placeholders and empty contact fields", () => {
  const meta = JSON.parse(readFileSync(join(TEMPLATES, "paper.json"), "utf8"));
  expect(meta.authors[0].name).toBe("Author One");
  expect(meta.authors[0].affiliation).toBe("Affiliation One");
  expect(meta.authors[0].email).toBe("");
  expect(meta.authors[0].orcid).toBe("");
  expect(meta.title).toBe("Untitled");
});
