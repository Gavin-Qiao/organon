---
id: finding-20260710T012734Z-editio-design-memo-claude-code-handoff
substrate: finding
kind: CONCEPT
status: SUPERSEDED
created: "2026-07-09 21:27:34"
updated: "2026-07-09 21:27:34"
---
# editio — Design Memo (Claude Code handoff)

**Author:** Mohan Qiao · **Date:** 2026-07-02 (rev. 2) · **License:** GPL-3.0 (© 2026 Mohan Qiao)
**Status:** Phase 1 (the spine) built and uncommitted; Phases 2–6 specified here, not built.
**Marketplace:** **Organon** (the research toolbox). **Plugin:** `promptus`. **Writing family:** `editio` (now owns `humanizer`).
**Paper home:** `.editio/paper/` (editio's own namespace, parallel to `.promptus/`).
**This file:** `.promptus/docs/editio-design-memo.md`.

## Guiding principle — skills, not stacks

editio ships **portable expertise and conventions**, not a fixed toolchain. The user defines the
concrete stack — the md→tex renderer, the plotting library, the TeX distribution, the venue class.
Every script editio ships is a **thin, swappable reference implementation**; the durable value is in
the SKILLs. Nothing below should read as "you must use tool X" — it reads as "here is how to do this
well; wire it to your tools."

## How to resume (read these first)

1. This memo.
2. `skills/editio/SKILL.md` — the orchestrator (written).
3. `templates/editio/schema/doco-deo.json` — the structure gate (written).
4. `templates/editio/latex/{editio.sty,main.tex,sections/introduction.tex}` — the render layer + worked example.
5. `README.md` + `AGENTS.md` + `skills/{promptus,recall}/SKILL.md` — the house it plugs into.

Then execute Phases 2–6 (§12). **Dogfood as you build:** record each build decision to the ledger via
`kb-add --substrate ledger --kind DECISION` — this is active practice in development, not optional.

---

## 0. TL;DR

editio is promptus's **paper read-port**: it turns what the store has VALIDATED into a defensible,
submittable paper. Content is authored as markdown (grounded, status-tagged) under `.editio/paper/`,
rendered per-section to LaTeX, assembled into one document with **three renders from one source** —
draft (author instrument), publish (camera-ready), blind (double-blind). Structure is grounded in the
SPAR DoCO/DEO ontologies; citations reuse the `lit:` store and CiTO export; grounding reuses `recall`;
voice and audit reuse `humanizer` (now an editio skill) and the `grounded-writing-reviewer` agent.

---

## 1. Thesis

The discipline that makes promptus trustworthy — calibrate to the evidence, name your sources, keep
your dead-ends — is what a paper needs. editio is the render side of that loop. Every claim on the
page traces to a store unit at a known status, and the draft render makes that status *visible* so the
author sees what is solid and what is air before a reviewer does.

---

## 2. Locked decisions (do not relitigate)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Home | One plugin `promptus` under the **Organon** marketplace; `editio` is a skill family in it | Reuse `recall` / `humanizer` in-process; keeping one plugin also avoids a promptus↔editio mutual dependency (see §3) |
| D2 | Family name | `editio`; sub-skills `editio-*` | Reads as the publish verb after STORE/KEEP/RETRIEVE |
| D3 | Domain | CS-first, general-science applicable | — |
| D4 | Structure grounding | SPAR **DoCO** + **DEO** | Same SPAR family as the `CiTO`/`PROV-O` already exported |
| D5 | Source of truth | markdown → rendered per-section `.tex`; polish typography in `.tex`, late | markdown is the only source of truth; `.tex` is derived & disposable |
| D6 | Render modes | one `\editiomode` switch → `draft` / `publish` / `blind` | one source, three artifacts |
| D7 | Workflow | per-section units, assembled by `main.tex` | lock one section while another churns |
| D8 | Scope | full lifecycle | — |
| D9 | Venues | IEEE, arXiv, Nature/Science, Elsevier, **+ ACM** | CS-first; a *seed* menu, not a mandate (D11) |
| D10 | Marketplace name | **Organon** — done | The research toolbox: promptus (store), editio (writing), more later |
| D11 | **Skills, not stacks** | editio = portable expertise; the **user defines the toolchain**; scripts are thin swappable reference impls | Skills travel; stacks don't |
| D12 | **`humanizer` → editio** | Reassigned from the promptus (store) family to the editio (writing) family | It's a writing tool; `grannie` still invokes it (same plugin) |
| D13 | **Paper home** | `.editio/paper/` (editio owns a `.editio/` namespace) | Parallel to `.promptus/`; never collides with the host project |
| D14 | **Audit loop** | Confirmed — `recall` + reviewer grade the claim-spans; author overrides (§6.6) | The hinge that keeps the draft honest |
| D15 | **Figure format** | Default **vector PDF**; `pgf` for exact font-match; raster only for pixel data — user-choosable | Quality + robustness (§9) |

**Only structural item left to confirm (§13):** whether editio should ever split into its *own*
plugin under Organon (sibling to `promptus`). Recommendation: **no** — keep one plugin, because
`grannie` (promptus) uses `humanizer` (now editio) while editio uses `recall` (promptus); one plugin
dissolves that cycle. If you do split, the fix is a second `marketplace.json` entry + `promptus` as a
documented prerequisite, and `grannie`'s humanizer use goes soft.

---

## 3. Reuse map (editio reuses, never forks)

| piece | owner now | editio uses it for |
|---|---|---|
| `recall` (kb-find → kb-get, status-gated) | promptus | ground every checkable claim before it hits the page |
| `humanizer` | **editio** (moved) | voice / de-AI pass on rendered prose |
| `grounded-writing-reviewer` agent | promptus (bridge; audits writing *via* the store) | grade claim-spans + flag tells (§6.6) |
| `lit:` store + `kb-export` (CiTO/PROV-O) | promptus | build `refs.bib`; type related-work citations |
| ledger `RESULT` units (artifact-coupled) | promptus | reproducibility statement; revision diff |
| the gate pattern (`core`/`extended`/`policy`) | promptus | the DoCO/DEO structure gate reuses it verbatim |
| `lib/` (frontmatter, paths, ids, clock) | promptus | shared by editio's reference scripts |

Note the dependency direction: **editio → promptus** (recall, store) and **promptus.grannie →
editio.humanizer**. That two-way link is why one plugin is cleanest (D1).

**Inherited invariant:** markdown is the only source of truth · index/`.tex`/figures are derived &
disposable · store writes go through the gate, never freehand · prefer a script over a server, and
**the user's stack is the user's** (D11) — TeX, the plotting lib, the renderer are external and
user-chosen, never vendored · add machinery only past a measured threshold.

---

## 4. Grounding ontologies

| axis | ontology | used where |
|---|---|---|
| what a paper is *made of* | **DEO** (Introduction, Background, Methods, Results, Discussion, Conclusion, RelatedWork, FutureWork, Contribution…) + **DoCO** (Section, Paragraph, Figure, Table, Formula, Abstract, Appendix, BibliographicReferenceList) | `doco-deo.json`, `editio-structure` |
| provenance of a claim | **PROV-O** | store; surfaced by the draft stamp |
| citation intent | **CiTO** (cites/extends/refutes/usesMethodIn/reusesDataFrom) | `editio-bib`, related-work |
| reproducibility | **ACM 4R** + **IRAO** | `editio-repro` |
| authorship / classification | **CRediT** + **ACM CCS** | `editio-venue` front-matter |

DoCO imports DEO; the class inventory in `doco-deo.json` is from the published DoCO spec.

---

## 5. Lifecycle → substrate → component map

| stage | anchor | promptus substrate (exists) | editio component |
|---|---|---|---|
| research / evidence | PROV-O | ledger, findings | — (done) |
| prior art | CiTO | `lit:` store | `editio-bib` |
| structure / draft | DoCO + DEO | recall feeds it | `editio-structure`, the renderer |
| figures | — | figure-as-unit | `editio-figures` |
| tables | — | table-as-unit | `editio-tables` |
| typeset | — | — | `editio-latex`, `editio.sty` |
| reproducibility | ACM 4R, IRAO | ledger artifacts | `editio-repro` |
| grounding + style audit | — | recall, humanizer, reviewer | — (reuse) |
| submit | venue + CRediT/CCS | — | `editio-venue` |
| peer-review response | — | ledger diff | `editio-rebuttal` |
| manuscript hygiene | — | the gate idea | `editio-lint`, notation registry |

---

## 6. Architecture

### 6.1 Sections are units, assembly is dumb
Each section is a unit mapped to a DEO/DoCO class by the gate. Authored as
`.editio/paper/sections/<slug>.md` (front-matter: `class`, `status`, `grounds: [[...]]`, `updated`),
rendered to `.editio/paper/sections/<slug>.tex`; `main.tex` `\input`s them in the archetype's `order`
via `\InputIfFileExists` (missing stub → skipped, so a partial paper still builds).

### 6.2 Source of truth & the md→tex render (skills, not stacks)
Content source of truth = the section `.md`; the `.tex` is derived/re-renderable; the **evidence**
source of truth stays in the store, which `recall` checks the prose against. Late, pure-typesetting
polish may live in the `.tex` — keep it minimal so a re-render never stomps real work (track with a diff).

**Claim-span convention** (how status reaches the page) — mark graded claims in the `.md`; the
renderer maps them to `editio.sty` macros:

- `[…]{.claim .validated}` → `\claimV{…}` (clean)
- `[…]{.claim .conjectured}` → `\claimC{…}` (amber)
- `[…]{.claim .unsourced}` → `\claimU{…}` (vermilion + TODO)

Front-matter `updated` + `grounds` → `\editiostamp{…}{…}`.

**Renderer = user-defined (D11).** The SKILL specifies the *mapping* (spans + front-matter → macros),
not the tool. A pandoc + Lua-filter implementation and a bespoke `editio-render.ts` are both fine;
ship one thin reference impl behind a stable interface so it can be swapped. Do **not** hard-require pandoc.

### 6.3 Three renders, one source — `editio.sty` (BUILT)
`main.tex` sets `\def\editiomode{draft|publish|blind}` before `\usepackage{editio}`. The package sets
`\ifeditiodraft/\ifeditioblind/\ifeditiopublish` and defines the annotation macros. In `publish`/`blind`
the macros collapse to identity; `blind` also masks `\selfcite` and drops `\blindhide{…}`. Tints are
Okabe–Ito (colourblind-safe). Venue class is swapped by `editio-latex` (orthogonal to mode).

### 6.4 The structure gate — `doco-deo.json` (BUILT)
`policy: "strict"` — every section maps to a `core`/`extended` DEO/DoCO class; no ad-hoc sections.
`orders` gives archetype sequences (`imrad`, `cs-systems`, `theory`). Tune `extended` + add venue
`orders` per project, like `kb-vocab.json`.

### 6.5 Reuse mechanics
editio ships in the promptus plugin, so each `editio-*/SKILL.md` invokes `recall` / `humanizer` by
name and hands drafts to the reviewer agent — no cross-plugin wiring. Keep that explicit in each SKILL.

### 6.6 The audit loop (CONFIRMED — D14)
This is the hinge. Six steps:

1. **Draft** — `editio-structure` / the author writes section prose in `.editio/paper/sections/<slug>.md`, wrapping factual claims in spans (ungraded or best-guess).
2. **Retrieve** — `recall` looks up each claim in the store (`kb-find` → `kb-get`), returns `substrate:status`.
3. **Grade** — the `grounded-writing-reviewer` agent sets each span's class: `finding:VALIDATED` / `lit:CITE` → `.validated`; only `CONJECTURED`/`provisional` → `.conjectured`; nothing found → `.unsourced`; `DEADEND`/`REFUTED` → **overclaim** flag. The same pass runs the humanizer style audit (tells).
4. **Override** — the author accepts, overrides *with a reason*, or fixes (store the evidence, soften, or cut).
5. **Render** — the renderer maps graded spans → `\claimV/\claimC/\claimU`; the draft build shows them on the page.
6. **Gate** — publish target: **zero `.unsourced`, no overclaims**. `publish`/`blind` strip every tint.

The status→confidence rubric is `recall`'s; the reviewer agent is the enforcement pass. Authoring can
start with plain prose — grading is what turns prose into a defensible draft.

---

## 7. Phase 1 — the spine (BUILT, uncommitted)

| file | role |
|---|---|
| `templates/editio/schema/doco-deo.json` | the DoCO/DEO section gate + orders + modes |
| `skills/editio/SKILL.md` | orchestrator: spine, modes, decision table, invariant |
| `commands/editio.md` | `/editio` — start/resume a paper end to end |
| `templates/editio/latex/editio.sty` | the draft/publish/blind render layer + macros |
| `templates/editio/latex/main.tex` | the assembly (class per venue; `\input` per section) |
| `templates/editio/latex/sections/introduction.tex` | worked example: stamp + graded claims + self-cite |

Not yet compile-tested (no TeX in the authoring sandbox). Phase 6 dogfoods a real build. When
`editio-latex` scaffolds, `main.tex` + `editio.sty` land in `.editio/paper/`.

---

## 8. Component specs (Phases 2–6, TO BUILD)

Each: **role · in · out · notes · done-when.** Scripts are **reference implementations** — the SKILL is
the deliverable; the script is swappable for the user's stack (D11).

### 8.1 `editio-structure` (skill)
- **role:** pick an `order`; ground contribution/gap/abstract/title via `recall`; emit one `sections/<slug>.md` stub per class, front-matter set.
- **in:** the store; `doco-deo.json`. **out:** `.editio/paper/sections/*.md` + a grounded narrative arc.
- **notes:** highest-leverage skill — frames the argument (funnel, gap, contribution list, abstract/title). "One claim per contribution, each traceable to a finding."
- **done-when:** gate-valid section set + a grounded abstract for a real project.

### 8.2 `editio-latex` (skill) + `scripts/editio-scaffold.ts` (reference impl)
- **role:** lay down / rebuild `.editio/paper/` for a venue; drive the user's LaTeX build (latexmk or other).
- **out:** `.editio/paper/{main.tex, editio.sty, front/metadata.tex, refs.bib, sections/}`; class per venue; mode default `draft`.
- **notes:** idempotent; venue = class swap, orthogonal to mode. Package set is a *default*, user-overridable.
- **done-when:** a scaffolded skeleton builds in all three modes.

### 8.3 The renderer (skill spec + one reference impl) — see §6.2
- **role:** `sections/<slug>.md` → `sections/<slug>.tex`, mapping spans + front-matter to macros.
- **notes:** tool-agnostic contract; ship one thin impl (pandoc+filter *or* bespoke), swappable.
- **done-when:** the worked introduction round-trips md→tex and compiles (annotated in draft, clean in publish).

### 8.4 `editio-figures` (skill) + `references/` + `templates/editio/editio.mplstyle` (a default, not a mandate)
- See §9. **done-when:** a figure built through the reference style drops into a column at the right
  size, fonts matching the body, colourblind-safe, **vector PDF**; a PGF path documented; figure-as-unit layout created.

### 8.5 `editio-tables` (skill)
- **role:** publication tables (booktabs, no vertical rules; siunitx `S` columns; threeparttable notes) from CSV/store.
- **notes:** table-as-unit (data + script + caption + the claim). **done-when:** a numeric table renders aligned with a source-stamped caption.

### 8.6 `editio-bib` (skill) + `scripts/editio-bib.ts` (reference impl)
- **role:** build `.editio/paper/refs.bib` from the `lit:` store; preserve CiTO types for related-work.
- **in:** `.promptus/docs/lit/*.md` front-matter + `kb-export`. **out:** `refs.bib` + unresolved-DOI list + CiTO edges.
- **notes:** reuse `kb-export`; flag any cited claim whose lit unit is missing. **done-when:** `\cite` keys resolve from the store.

### 8.7 `editio-repro` (skill)
- **role:** reproducibility / artifact statement + checklist from artifact-coupled ledger `RESULT`s (ACM 4R + IRAO; NeurIPS-style checklist).
- **done-when:** emits `sections/reproducibility.md` grounded in real ledger artifacts + a venue checklist.

### 8.8 `editio-venue` (skill)
- **role:** package + format-comply per venue; required front-matter (CRediT, ACM CCS / keywords); submission checklist; length/figure rules; arXiv/blind packaging.
- **venue map (a seed, user-extensible):**

| venue | class | cols | ~col width | bib style | notes |
|---|---|---|---|---|---|
| ieee | IEEEtran | 2 | 3.5 in | IEEEtran | B&W-safe figures; strict page limit |
| arxiv | article/lapreprint | 1 | 5.5 in | plainnat | cleaner strips comments |
| nature | sn-jnl | 1 | 5.0 in | sn-nature | sans-serif; structured abstract |
| elsevier | elsarticle | 1 | 5.5 in | elsarticle-num | — |
| acm | acmart | 2 | 3.3 in | ACM-Reference-Format | CCS concepts required; teaser figure |

- **done-when:** each venue builds a camera-ready + a passing checklist.

### 8.9 `editio-rebuttal` (skill) + a revision diff
- **role:** response-to-reviewers + cover letter; map reviewer comment → change → ledger entry; a `latexdiff`-style change-bar build (tool user-chosen).
- **in:** reviewer text; ledger units since the `submission` tag. **done-when:** a diff PDF + a grounded response letter.

### 8.10 Notation registry (skill or fold into `editio-latex`)
- **role:** every symbol defined once; a notation table; shared math macros; a check that each symbol is defined once and used.

### 8.11 `scripts/editio-lint.ts` (paper linter — a gate for the manuscript)
- **checks:** acronym-on-first-use; one-term-one-meaning; US/UK; no undefined refs (`??`); every `\cite` used & every entry cited; every float referenced; caption present; figures vector.
- **done-when:** runs on a built paper, reports actionable findings; wire as an optional pre-submit gate.

---

## 9. Figures — the aggregated craft (`editio-figures/references/`)

A menu of expertise; the user picks tools (D11). Split so the SKILL body stays short.

- **`principles.md`** — Rougier et al., *Ten Simple Rules for Better Figures*; Tufte data-ink; Cleveland's perception ranking (position > length > angle > area/colour); Wilke, *Fundamentals of Data Visualization*.
- **`color-accessibility.md`** — **Okabe–Ito** categorical palette (hex + the style cycle); **viridis/cividis** sequential (never jet); redundant encoding (linestyle/marker + colour) for greyscale.
- **`tools-by-job.md`** — data plots: matplotlib+SciencePlots / seaborn / any lib. LaTeX-native: PGFPlots/TikZ. Diagrams: TikZ / Mermaid / Graphviz. Domain: PlotNeuralNet, tikz-feynman/JaxoDraw, chemfig, BioRender. A menu, not a mandate.
- **`chart-selection.md`** — the **FT Visual Vocabulary** (40+ charts by data relationship).
- **`domain-figures.md`** — per-field conventions.
- **`editio.mplstyle`** (a default) — serif/sans per venue + usetex/pgf; `figure.figsize` = column width; Okabe–Ito cycle; thin spines; `constrained_layout`.

**Output format (D15 — your Q7 answered):** default **vector PDF** — crisp at any zoom, fonts
embedded, works with every engine; set the plotting lib's fonts to the body font (or usetex) for
consistency. Use **PGF/PGFPlots** (LaTeX typesets the text) only when exact font/math match matters
and the plot is light — slower, chokes on dense data. Use **raster (≥600 dpi)** only for inherently
pixel content (photos, microscopy, dense heatmaps). So: PDF is the better default; pgf is the
specialist upgrade.

**Figure-as-unit:** `.editio/paper/figures/<name>/` = `data.*` + `plot.(py|tex)` + `caption.md` + the
claim it supports, regenerable via a build target. Draft caption carries a source stamp. Size at
creation to the column; never post-scale (it desyncs fonts).

---

## 10. Directory layout

```
Organon (marketplace)  ──  .claude-plugin/marketplace.json  (name: organon)
└── promptus (plugin)
    skills/
      # store family
      promptus/ recall/ grannie/ telos/ research-ledger/
      # writing family — editio
      editio/SKILL.md                 (built)  orchestrator
      editio-structure/  editio-latex/  editio-figures/(+references/)
      editio-tables/  editio-bib/  editio-repro/  editio-venue/  editio-rebuttal/
      humanizer/                      (moved into the editio family — D12)
    commands/  editio.md              (built)  + existing promptus commands
    agents/    grounded-writing-reviewer.md
    scripts/   editio-scaffold.ts  editio-render.ts  editio-bib.ts  editio-lint.ts  (reference impls)  + kb-*
    templates/editio/
      schema/doco-deo.json            (built)
      latex/{editio.sty,main.tex,sections/introduction.tex}  (built)
      editio.mplstyle
      venues/{ieee,arxiv,nature,elsevier,acm}/

.editio/            ← editio's runtime namespace (per project), parallel to .promptus/
  paper/
    main.tex  editio.sty  refs.bib  front/  sections/*.md → *.tex  figures/<name>/
```

Wiring edits (Phase 6): `marketplace.json` (name → organon), `README.md` (editio section + reassign
humanizer to editio), `AGENTS.md` (editio cadence), `plugin.json` (description + keywords).

---

## 11. House conventions

- **Skills, not stacks (D11)** — the SKILL is the deliverable; scripts are thin, swappable; never hard-require a tool.
- **Scripts:** TypeScript on bun, stdlib-first, reuse `lib/*`, resolve via `${CLAUDE_PLUGIN_ROOT}`.
- **The gate pattern:** new vocab = `core` + `extended` + `policy`, like `kb-vocab.json` (done for `doco-deo.json`).
- **SKILL.md:** front-matter `name` (== dir) + trigger-worthy `description`; decision table + "when NOT to use"; agents add `tools:`.
- **Commits:** Conventional Commits, flat `-` bullets, omit `Co-Authored-By`, no emoji, never `--no-verify`, forward slashes. **Don't commit/push unless asked.**
- **License:** GPL-3.0; humanizer's MIT NOTICE stays intact (now under the editio family).
- **Dogfood in development (D-confirmed):** log build decisions to the ledger via `kb-add` as you go.
- **External deps** (TeX, plotting lib, renderer) are user-chosen prerequisites documented in README, invoked by scripts — never vendored.

---

## 12. Build sequence & acceptance (Phases 2–6)

- **Phase 2 — structure + latex:** `editio-structure`, `editio-latex`, `editio-scaffold.ts`, the renderer (+ its reference impl). *Done:* `/editio arxiv` on a real project yields a gate-valid section set and a paper that builds in draft under `.editio/paper/`.
- **Phase 3 — figures:** `editio-figures` + `references/` + `editio.mplstyle`. *Done:* §8.4.
- **Phase 4 — tables · bib · repro:** `editio-tables`, `editio-bib` (+ script), `editio-repro`. *Done:* `refs.bib` from the store resolves; a numeric table + grounded repro statement render.
- **Phase 5 — submission + review loop:** `editio-venue`, `editio-rebuttal` (+ diff), notation registry, `editio-lint.ts`. *Done:* camera-ready per venue + a diff'd rebuttal + a passing lint.
- **Phase 6 — wire + dogfood:** README/AGENTS/plugin.json; marketplace name → organon; move humanizer into the editio family; **compile-test** a sample paper end to end in all three modes. *Done:* `bun run check` green; sample paper builds.

---

## 13. Open questions / decisions for you

1. **Plugin boundary** — keep one plugin (recommended, dissolves the promptus↔editio cycle) or split editio into its own plugin under Organon (then `promptus` is a documented prerequisite and grannie's humanizer use goes soft). *All other naming/structure is settled.*
2. **Notation** — its own skill vs folded into `editio-latex`.
3. **Renderer reference impl** — pandoc+Lua vs bespoke `editio-render.ts` (interface is fixed either way).

Resolved since rev. 1: marketplace = **Organon**; toolchain = **user-defined** (skills not stacks);
`humanizer` → **editio**; paper home = **`.editio/paper/`**; **audit loop confirmed** (§6.6); figures
default = **vector PDF**.

---

## 14. References

**Ontologies:** DoCO `https://sparontologies.github.io/doco/current/doco.html` · DEO
`https://github.com/sparontologies/deo` · SPAR `https://www.sparontologies.net/ontologies` · CiTO/PROV-O
(exported by `kb-export`) · ACM 4R `https://arxiv.org/pdf/2312.11028` · IRAO
`https://www.researchgate.net/publication/353377169_Ontology_for_Informatics_Research_Artifacts` ·
publication lifecycle `https://pressbooks.pub/researchlifecycle/chapter/publication-models-and-process/`.

**Figure canon:** Rougier et al. `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4161295/` · Wong,
*Color blindness* `https://www.nature.com/articles/nmeth.1618` · Okabe–Ito
`https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference` · Wilke
`https://clauswilke.com/dataviz/` · SciencePlots `https://github.com/garrettj403/SciencePlots` ·
PGFPlots `https://pgfplots.sourceforge.net/pgfplots.pdf` · FT Visual Vocabulary
`https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary` · PlotNeuralNet
`https://github.com/HarisIqbal88/PlotNeuralNet` · TikZ-Feynman `https://arxiv.org/pdf/1601.05437`.

---

*End of memo (rev. 2). Phase 1 artifacts are in the tree (uncommitted). Start at §12 Phase 2.*
