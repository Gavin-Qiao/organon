# Changelog — editio

All notable changes to the editio plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org).
Releases are git tags `editio-vX.Y.Z`.

## [Unreleased]

### Added

- **Phase 3 — `editio-figures`**: figures as arguments. The skill (claim-first captions,
  panel-first composition, the figure-as-unit provenance contract
  `figures/<name>/{data,plot,caption.md,pdf}`, statistical honesty in captions) plus cited
  craft references: principles (Rougier · Tufte · Cleveland & McGill · Wilke), color +
  accessibility (Okabe-Ito · viridis/cividis · redundant encoding), chart selection (the FT
  Visual Vocabulary), tools by job, and per-domain conventions.
- **`editio-figcheck.ts`** — the figure-size gate: reads a PDF's `/MediaBox` and fails any
  figure whose physical width doesn't match the venue slot (`column_width_mm` /
  `full_width_mm`, ±1mm) — post-scaling is caught at the source, before it shrinks fonts.
- **`figures/editio.mplstyle`** — generated per venue by the scaffold: single-column figsize
  from `venue.json`, print-size fonts (`figure_font_pt`), the Okabe-Ito color cycle,
  constrained layout (and a warning against `bbox_inches='tight'`).
- **Venue data** grew figure fields: `full_width_mm` and `figure_font_pt` on every venue.
- **References discipline**: the README now carries a real bibliography; every skill's
  distilled craft cites its sources (see the repo `CONTRIBUTING.md`, "References are
  load-bearing").

## [0.1.0] - 2026-07-02

### Added

- **The Phase 1–2 spine, compile-verified in all three modes** (draft / publish / blind) on a
  real MiKTeX: the `/editio` command, the `editio` orchestrator skill (invariant + audit loop),
  `editio-structure` (orders, contribution-first arc, the abstract formula, exemplar-distilled
  craft references), and `editio-latex` (TeX setup, venue scaffolding, mode builds, previews,
  notation conventions).
- **`editio-scaffold.ts`** — idempotent workspace scaffold: the DoCO/DEO structure gate copied
  project-tunable, venue-driven `main.tex` + `.latexmkrc` (out-of-tree builds, bibtex-safe),
  section stubs per order, and `front/metadata.tex` generated from `paper.json` — identity
  lives there only, ships as placeholders, and blind builds mask it via `\ifeditioblind`.
- **`editio-render.ts`** — the bespoke md→tex renderer for the documented authoring subset
  (claim spans with grades + grounds, citations vs cross-refs by key prefix, self-cites,
  blindhide divs, math/LaTeX passthrough, auto-escaping), behind a golden contract fixture
  (`templates/contract/`) that any swapped-in renderer must pass.
- **`editio.sty`** — the three-mode render layer: Okabe-Ito claim tints, provenance stamps and
  TODOs in draft; identity collapse in publish; self-cite + `\blindhide` + author masking in
  blind.
- **Venue data**: `arxiv` and `tpami` seed folders (venues are data, not code).
- **Tests**: the golden render contract, scaffold idempotency, template schemas, and a
  no-identity sweep that mechanically enforces "nobody's name ships in editio".

- The plugin itself: editio joins the Organon marketplace as the academic-writing toolchain
  beside promptus (its documented prerequisite). The design of record is
  `.promptus/docs/editio-design-memo.md` plus the organon research ledger; the editio-* skills
  land in phases.
- `humanizer` — the style toolkit (Part I de-AI patterns + Part II positive human patterns),
  moved from the promptus plugin. The upstream blader/humanizer MIT notice rides along in
  `NOTICE`. promptus's `grannie` dials it softly when editio is installed.

[Unreleased]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.1.0...HEAD
[0.1.0]: https://github.com/Gavin-Qiao/organon/releases/tag/editio-v0.1.0
