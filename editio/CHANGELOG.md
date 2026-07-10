# Changelog — editio

All notable changes to the editio plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org).
Releases are git tags `editio-vX.Y.Z`.

## [Unreleased]

## [0.6.0] - 2026-07-09

### Added

- **Add native Codex packaging and host-neutral skill paths.** The `.codex-plugin` manifest
  exposes the same writing skills, while those skills resolve scripts from their own
  installed location instead of depending on a Claude-only shell variable. The shared
  adapter suite is exercised on Ubuntu, Windows, and macOS.

### Fixed

- **Isolate the doctor's Git discovery from hook-scoped environment variables.** Repository-local
  `GIT_DIR`, worktree, index, object, and prefix variables are cleared before inspecting a paper,
  so pre-push hooks and nested worktrees cannot make unrelated temporary papers look tracked.

- **Make claim grounding fail closed.** Only `finding:VALIDATED`, `lit:CITE`,
  `memory:validated`, and validated/resolved ledger evidence can ground a `.validated`
  claim; provisional, conjectured, refuted, and retired evidence can no longer pass by
  omission from a denylist.

## [0.5.2] - 2026-07-07

### Added

- **Doctor `paths` check — anti-path inspection for generated prose** (the recurring
  dirt: a drafting model cites its own build internals — "see figures/x/plot.py",
  ".promptus/docs/…" — and an absolute path even leaks a username into the PDF). The
  rule the check encodes: **a path in inline code or a fence is deliberate typesetting;
  a naked path in prose is dirt.** Four kinds, flagged at `file:line`:
  workspace-internal paths, absolute OS paths, relative file paths, and bare artifact
  filenames — URLs exempt (they're `\url` content), frontmatter and fence bodies
  skipped. Report-only like every check; the remediation is the paper's own
  vocabulary — figures, tables, citations, `@num` handles — or deliberate inline code
  when the path *is* the content.

## [0.5.1] - 2026-07-07

### Added

- **`\PaperKeywords`, per-author `"bio"` prose and `"photo"` paths, `\AuthorRunning`** —
  the identity story closes: keywords (an IEEE *first-submission* requirement) come from
  paper.json's existing field; bio prose and photos get a safe home there too (the
  generated `bios.tex` picks `IEEEbiography` with the photo or the no-photo environment
  per author — hand-tuning a generated file no longer tempts).
- **Doctor `budget` check**: a built PDF's page count (read from the pages tree) against
  the venue's `limits.pages_regular` — "14 pages, tpami bills past 12" surfaces before
  submission, not on the invoice.

### Fixed

- **A TPAMI paper built by editio now looks like a TPAMI paper** (the third dogfood
  eyeballed accepted-preprint PDFs against ours): for `ieee-journal` venues the abstract
  renders inside `\IEEEtitleabstractindextext` — compsoc's full-width, sans-serif
  abstract + Index Terms block above the columns — instead of sitting in the two-column
  flow in serif; running heads (`\markboth`) are generated from the identity macros
  (blind-guarded, so the header never leaks a name); and the renderer applies the
  `\IEEEPARstart` drop cap to the first body paragraph on venues that set `par_start`
  (warning and skipping when the paragraph opens with markup). The markdown source and
  the golden render contract stay venue-neutral — all of it is venue data + generation.

## [0.5.0] - 2026-07-07

### Added

- **`editio-identity` — paper.json is the single source of truth for identity, delivered
  as generated data macros** (the third dogfood measured the gap: one authorship decision
  — swap the first and corresponding authors — took FIVE hand-edited files, with the
  title triplicated across them). The generator reads `paper.json` and writes
  `front/identity.tex`, pure class-agnostic `\newcommand` data: `\PaperTitle` (verbatim —
  titles are LaTeX, math survives, fixing the old escape-the-title bug), `\PaperTitlePlain`
  (`\texorpdfstring` collapsed), `\AuthorList` / `\AuthorListAnd`, `\AffilShared`,
  `\CorrAuthorShort` / `\CorrEmail` (from the new `"corresponding": true` author field,
  defaulting to the first author), `\IdentityThanks`, per-author `\Author…Name`, and
  `\BioBody`. Venues with a `bio_env` (tpami: `IEEEbiographynophoto`) also get
  `front/bios.tex` — per-author stubs assembled from the macros, blind-masked. The
  scaffolded `front/metadata.tex` now *assembles* the venue's author block from the
  macros instead of hand-writing names; `main.tex` inputs `front/bios` when present.
  `editio-render --all` regenerates the identity layer, so one paper.json edit + one
  command updates the title, author block, and bios everywhere. Class-specific
  formatting stays in the consumers; the macros are data — blind mode is untouched.
- **The doctor guards the discipline**: `front/identity.tex` drifting from `paper.json`
  is flagged (content-diffed, like numbers), and an author name or the full title
  **hard-coded in any document `.tex`** is flagged toward the macros — the five-file
  incident can't quietly rebuild itself.

## [0.4.2] - 2026-07-07

### Added

- **`editio-doctor` gains a `vcs` check** (the same incident, one layer down: the
  workspace whose stray PDFs 0.4.1 learned to flag also kept `.editio/` out of git —
  a submittable paper existed in **zero committed versions**, and nothing could say so).
  The markdown sources ARE the paper, so git is its version history — editio does not
  rebuild version control one layer up. The doctor now flags paper sources that sit in
  a git repo but are gitignored or never tracked (report-only, `--strict` honored); a
  workspace outside any repo gets a note, not a flag — that is the project's call. The
  skills/README state the convention the flag points at: commit the paper dir, keep the
  `build*/` dirs ignored, and tag milestones (`paper-v1-submitted`) — diffs, history,
  and "the version I sent co-authors" all come from git.

## [0.4.1] - 2026-07-07

### Added

- **`editio-doctor` gains a `strays` check** (the third dogfood: asked "which PDF is the
  current paper?", a real workspace offered four look-alikes — a 3-day-stale `main.pdf`
  byte-identical to a v0 snapshot, plus two *different* PDFs sharing one v1 name — while
  the actual current build sat under `build/` the whole time). editio builds out-of-tree,
  so any PDF in the paper source root is a hand-saved copy: likely stale, not gitignored
  the way the build dirs are, and able to shadow the real output by name. The doctor now
  flags each one (report-only, like every check); a stray that byte-duplicates a `build*/`
  output is called out as safe to delete. The skills/README state the convention the flag
  points at: canonical PDFs live in the build dirs, the source root stays PDF-free, and a
  durable snapshot goes in `archive/` under a dated, self-describing name.

## [0.4.0] - 2026-07-07

### Added

- **`editio-numbers` — one source of truth for every load-bearing number** (learned from
  the second dogfood: a headline mean typed into eight sentences across three files, drift
  caught by luck, reconciled by a fifteen-pair sed script). `numbers.json` names each value
  once (handle → value + `source` files + `computed_by`); `--write` binds them into
  `front/numbers.tex` (`\editionum{handle}` via `\csname`) and locks a sha256 of every
  source; the report names stale / unknown / unused handles; `--gate` exits 1 on drift —
  a deliberate freeze is `"pinned": "reason"`, passing on the record. Authoring subset
  v1.2: bare `@num:handle` binds in prose, inside `$…$`, and in ```` ```latex+ ```` fences
  (plain ```` ```latex ```` stays byte-raw and the report flags `@num:` there); `[@num:x]`
  is refused. An unbound handle typesets loudly (boxed `??handle??` + package warning) —
  the render never blocks; the gate enforces. New skill `editio-numbers` distills the
  discipline (bind values, re-grade the claim around a changed number, ledger the
  correction) with verified references (Claerbout & Karrenbach; Sweave's `\Sexpr`; knitr;
  Sandve et al. Rules 4 + 10).

- **`editio-doctor.ts` — workspace health, report-only** (the second dogfood: a live paper
  sat on a pre-0.3.0 `main.tex` with none of the venue float discipline, and nothing could
  tell). Named checks: the scaffold **version stamp** (`main.tex` now carries
  `GENERATED by editio-scaffold vX.Y.Z`; the doctor compares it to the installed plugin),
  venue drift (packages/preamble the venue data ships that neither `main.tex` nor the
  authored `front/macros.tex` carries), a `--venue` run that outpaced `paper.json`, a stale
  or locally edited `editio.sty`, sections rendered stale or never rendered, sections
  `main.tex` never inputs, hand-written `\cite`/`\ref` in plain ` ```latex ` fences (the
  ` ```latex+ ` nudge), and author names from `paper.json` leaking into section prose.
  Every fix stays the author's move (usually `editio-scaffold --force`, which never touches
  authored files); `--strict` exits 1 for CI and pre-submission gating.
- **The doctor knows when its own advice is unsafe** (a sandbox `--force` dry-run on the
  dogfood paper would have rewired four core sections out of the build, seeded three stub
  sections, and clobbered a hand-finished author block): an **order** check compares
  `main.tex`'s wired sections against the *declared* order (`paper.json` × the project's
  own `doco-deo.json`) — a paper legitimately outgrows its declared order, and until it's
  reconciled the `--force` advice is withheld; a **metadata** check spots a hand-finished
  `front/metadata.tex` (no GENERATED header) that regeneration would clobber.

### Fixed

- **Adversarial-audit hardening** (five auditors attacked the skills against the code; every
  behavioral finding fixed with a test that replays the attack):
  - `editio-numbers` could be made to lie four ways, worst first: `--write` silently
    **re-blessed a stale value** when the source drifted but the value didn't (now refused,
    atomically, naming the loop); claimed-but-never-hashed sources passed the gate (now
    gate); a hand-edited `front/numbers.tex` was invisible (the gate now diffs content
    against `numbers.json` — mtime heuristics dropped); the documented `\editionum{…}`
    escape hatch and `front/macros.tex` were unscanned (now scanned as real uses). Values
    are validated at the door (unbalanced braces / unescaped `%` fatally break LaTeX
    downstream); `@num:` in YAML frontmatter no longer false-fails the gate; malformed
    `numbers.json` errors cleanly (exit 2, handle named) including duplicate keys.
  - **`override="reason"` now does what every doc said it did**: an `.unsourced` claim with
    an override passes `editio-status --gate` on the record (reason printed); ungraded
    stays a hard fail, and the remediation message states the boundary instead of
    recommending a no-op.
  - `editio-status` reports **drafted words per section** (against the section's `budget:`
    frontmatter) — a fresh skeleton and a finished clean paper used to be indistinguishable.
  - The renderer warns where it was silent: near-miss `@num:` handles (wrong charset),
    unknown claim classes (`.validatd` no longer downgrades silently), a second top-level
    heading, `####`+ pseudo-headings, indented (unsupported) list items, and prose captured
    as math by currency dollars; a bare `%` in inline math is auto-escaped (it commented
    out its own closing `$`); inline `grounds=` attributes are escaped like the frontmatter
    path; the leftover-span lint runs pre-restore, so corrupted spans without the literal
    `{.claim` spelling are caught and `{.claim}` quoted in inline code no longer
    false-fires; symbol fence tags (`c++`) stay fenced; quote/dash-glued crossrefs resolve;
    multi-key `.self` spans are refused; the abstract no longer carries a provenance stamp
    inside its environment; "not a workspace" exits 2 like every sibling CLI.
  - `editio-figcheck` warns on unrecognized flags (`--tol` silently applying the default
    tolerance was a gate quietly checking the wrong thing).
  - The golden contract fixture now exercises the previously untested constructs
    (sub-headings, enumerate, `$$…$$`, `[@tab:]`, override attributes, symbol fence tags,
    the full escape set) — plus a doc sweep: the override boundary, the reviewer's actual
    output contract, doctor checks, `--claims` wording, orphan DoCO/DEO classes and the
    custom-order path, the golden-ratio figure default, and stale version stamps.

## [0.3.0] - 2026-07-04

### Added

- **`editio-status.ts` — the grounding layer, tooled** (the first dogfood's top finding: the
  feature editio is named for lived only in skill prose). Per-section class / status /
  grounds / claim tallies, every ungraded or unsourced span at `file:line` (`--claims`),
  grounds handles resolved against the promptus store (file units by slug, ledger entries by
  title), weak/unknown-grounds reporting — and the **publish gate as a command** (`--gate`:
  exit 1 on ungraded, unsourced, or overclaims; in-span `override="reason"` passes on the
  record).
- **```` ```latex+ ```` fences** (authoring subset v1.1): raw LaTeX plus the citation and
  crossref transforms, so `[@key]` and `@fig:x` work inside float captions — one citation
  syntax for prose and floats.
- **`editio-render --concat [out.md]`** — concatenate the sections (build order from
  `main.tex`) into one markdown file for reviews and end-to-end reads; plus a real `--help`.
- **`front/macros.tex`** — the authored extension point, now actually wired:
  seeded once, `\InputIfFileExists`'d by `main.tex`, survives `--force`.
- **tpami float discipline by construction**: `dblfloatfix` + double-float fraction tuning
  ship in the venue data (`figure*` stranded past the references in the dogfood), and the
  venue `preamble` field is now general venue data.

### Fixed

- **tpami venue data corrected against live IEEE policy (verified 2026-07)**: the regular-paper
  limit is **12** formatted double-column pages, not 14 (submit up to 18; USD 220/page past 12),
  and review is **single-anonymous by default** (double-anonymous on justified request — the
  `blind` render is opt-in for this venue). The template itself was re-verified current:
  `[10pt,journal,compsoc]{IEEEtran}` + `IEEEtran.bst` is still what the IEEE Template
  Selector serves for TPAMI.
- **Claim spans parse balanced brackets** — `[… ([@sec:x]) …]{.claim}` no longer leaks a
  literal `]{.claim}` into the PDF (the dogfood's bug; now a golden-contract case), and the
  renderer **warns on stderr** when any unrendered span survives (it still never blocks).
- **Every CLI is cwd-proof**: run from inside `.editio/paper/` and the scripts walk up to
  the project root instead of nesting a second workspace, with an honest error when there
  is genuinely no workspace.

## [0.2.0] - 2026-07-03

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

[Unreleased]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.6.0...HEAD
[0.6.0]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.5.2...editio-v0.6.0
[0.5.2]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.5.1...editio-v0.5.2
[0.5.1]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.5.0...editio-v0.5.1
[0.5.0]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.4.2...editio-v0.5.0
[0.4.2]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.4.1...editio-v0.4.2
[0.4.1]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.4.0...editio-v0.4.1
[0.4.0]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.3.0...editio-v0.4.0
[0.3.0]: https://github.com/Gavin-Qiao/organon/compare/editio-v0.2.0...editio-v0.3.0
[0.2.0]: https://github.com/Gavin-Qiao/organon/releases/tag/editio-v0.2.0
[0.1.0]: https://github.com/Gavin-Qiao/organon/releases/tag/editio-v0.1.0
