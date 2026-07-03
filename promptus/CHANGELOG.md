# Changelog

All notable changes to Promptus are recorded here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

> **Convention.** Group changes under a version heading `## [X.Y.Z] - YYYY-MM-DD`, newest
> first. Within a version, use only these categories, in this order, omitting any that are
> empty: **Added** (new features), **Changed** (changes to existing behavior), **Deprecated**
> (soon-to-be-removed), **Removed** (now-removed), **Fixed** (bug fixes), **Security**
> (vulnerabilities). Keep entries terse, user-facing, and in the imperative past ("Add…",
> "Fix…"). Accumulate day-to-day work under `## [Unreleased]`; cutting a release renames that
> heading to the new version + date and opens a fresh `[Unreleased]` (see `RELEASING.md`). The
> reference links at the bottom map each version to its compare/tag URL. The release workflow
> reads the section for the tag being pushed and refuses to publish if it is missing or empty.

## [Unreleased]

## [0.6.1] - 2026-07-03

### Added

- **Telos hygiene**: `promptus-doctor check` now flags event-shaped content in `TELOS.md` —
  dates, ledger event ids, session stamps (`cont.N`), NOW-shaped headings — with line numbers
  and the routing (events → `kb-add`, the frontier → `kb-now`, settled facts → memory).
  Report-only: the doctor names the lines, judgment moves them. Found in the wild: sister
  projects' Teloi had accreted "where the frontier is now" sections, dated amendments, and raw
  event ids — the one freehand store is the one that rots.

### Changed

- The `telos` skill grew its second half — **maintaining** the Telos, not just scaffolding it:
  the boundary table (what belongs in the Telos vs the ledger / NOW-header / memory), the
  rewrite-in-place rule (a direction change is recorded as a ledger DECISION, never a dated
  Telos amendment), and a trigger that fires when editing `TELOS.md`, not only at init.
- The `TELOS.md` template states the boundary inline ("What lives here — and what doesn't"),
  and the orchestrator's decision table routes "change the project's direction" through it.
- **Telos edits are operator-triggered**: the agent registers evidence in the research ledger
  and *proposes* — the rewrite happens on the operator's word. `/checkpoint`'s memory step is
  now a freshness duty (the session's settled facts land in memory, stale ones retire) and
  reads the Telos without ever writing it.

## [0.6.0] - 2026-07-02

### Changed

- **Monorepo restructure — breaking for installs.** The repo is now the **Organon marketplace**:
  `marketplace.json` (renamed `promptus` → `organon`) lives at the repo root and the promptus
  plugin moved into `promptus/`. Migrate with `/plugin marketplace remove promptus`, then
  `/plugin marketplace add Gavin-Qiao/organon` and `/plugin install promptus@organon`.
- Releases are now per-plugin tags (`promptus-vX.Y.Z`); the pre-monorepo `v0.1.0`–`v0.5.2` tags
  remain valid history.
- `validate-plugin.ts` is marketplace-aware (validates the root manifest, then every referenced
  plugin) and gained `--root` for fixture testing; `changelog.ts` accepts a per-plugin changelog
  path — both serving the per-plugin release flow.

### Removed

- **`humanizer` moved to the editio plugin** (same marketplace, `/plugin install editio@organon`):
  it is a writing tool, and editio is the writing toolchain. `grannie` now dials it *softly* —
  full pattern set when editio is installed, plain grounded answers otherwise. Its upstream MIT
  notice moved with it to `editio/NOTICE`.

## [0.5.2] - 2026-06-30

### Added

- **The Telos is injected at every session start — not optional.** The `SessionStart` hook now
  prepends the project's `.promptus/TELOS.md` (its direction and the rules that never bend) ahead
  of the ledger NOW-header, as content rather than a "go read it" pointer — so the main session
  always opens already holding the north star. Bounded by a line cap as a runaway guard, and a
  strict no-op outside a Promptus repo.
- **`/checkpoint` runs a drift check against the Telos.** Before the final report, checkpoint weighs
  the session's recent ledger entries and the NOW-header against the Telos's commitments and
  invariant; when the work has quietly bent away from them — scope creep, machinery added without a
  measured threshold, a "never bends" rule contradicted — it surfaces a terse, specific flag at the
  top of the report for the human steward. Silent when on course.

## [0.5.1] - 2026-06-29

### Changed

- **`kb-graph suggest` no longer floods on a broad note.** Latent-link pairs are now pruned to
  reciprocal best matches (mutual-KNN): a lexical pair surfaces only when each unit is among the
  other's top-`knn` most-similar — so a broad note that faintly touches many topics (which used to
  pad the list) collapses out, while genuine cluster links survive. A shared source still bypasses
  the gate, and a new `--knn <k>` flag dials precision/recall (default 6). On the operator's Psi
  corpus this cut the candidate list from 2272 to 138 (−94 %) with the top apt pairs intact, and the
  good cross-doc links on Promptus's own corpus (e.g. `graphrag ⟷ hipporag`) are preserved — the very
  links the reverted `idf²` experiment had dropped. A `--soft` mode adds Mutual Proximity
  (Schnitzer 2012) as a non-destructive alternative — it rescales by rank-fraction so a hub *sinks*
  instead of being pruned, floating reciprocal-best pairs to the top without deleting any edge.
  Resolves the v0.5.0 known limitation.
- **`kb-index` surfaces the `[[link]]`-edge count.** The summary line now reads
  `N units · E links · M relations`. The dense navigation graph that `kb-graph rank` / `lint` /
  `suggest` actually run on was previously hidden behind the sparse typed-relation count — so a corpus
  rich in `[[links]]` but light on typed relations (e.g. `↳ supersedes`) misleadingly read as `0 relations`.

## [0.5.0] - 2026-06-29

### Added

- **`kb-get` — the body-fetch retrieval tier** (`scripts/kb-get.ts`). Completes RETRIEVE: `kb-find`
  says *which* unit (header-first); `kb-get` returns that unit's text by its catalog path — one ledger
  entry's slice, not the whole shared file. `--title` disambiguates a same-second anchor, and a path
  that escapes the project root is refused (it reads only within the project). Unit extraction is
  shared with `kb-find` through `scripts/lib/units.ts`, so the retriever and the fetcher
  agree on a unit's bounds; the `recall` skill now drives both tiers (read headers, then fetch only the
  bodies they earn).
- **`kb-graph` — query the `[[link]]` graph** (`scripts/kb-graph.ts`, command `/promptus-graph`). No
  embeddings — the links *are* the graph. Three reads over the derived `graph.json`:
  - **`rank`** — personalized-PageRank over the page-link graph: the load-bearing units (with degree).
  - **`lint`** — graph health: dangling `[[handles]]` (with a "did you mean?" by slug similarity) and
    orphans; `--strict` exits non-zero to gate a checkpoint.
  - **`suggest`** — a latent-link linter: IDF-weighted shared vocabulary + a shared-source signal
    surface unlinked-but-related unit pairs to connect. Suggest-only — the human draws the link.
- **Retrieve + graph test suites** (`scripts/test/{get,graph,adversarial}.test.ts`), including an
  adversarial pass that locked the fixes below.

### Changed

- **`kb-find` retrieval is de-noised.** A body term now matches the **entry's own slice**, not every
  entry sharing the ledger file — so a rare ledger term no longer flags nearly every entry. Adds
  `--limit` (caps results and reports "N of M" — no silent truncation) and `--snippet` (attaches the
  matched line, to judge relevance header-first without opening the file). On rare-term queries this
  cuts retrieval output by ~90 %+.
- **Architecture clarified to match the code.** Promptus is documented as a **substrate for the LLM
  agent** — STORE / BOOK-KEEP / RETRIEVE plus the graph are agent-operated; **grannie** is the one
  human read-port; the humanizer is a bundled **style toolkit**, not a "render" verb. The docs were
  re-truthed throughout (README + two new Mermaid diagrams, `TELOS.md`, the design report, the
  orchestrator skill, `/promptus:help`), and the prior-art lineage that justifies the graph
  (HippoRAG → `rank`, Roam/Obsidian unlinked-references → `suggest`) is now captured in the store.

### Fixed

- **`kb-get` never returns a different unit than the one asked for.** A `--title` that matches no entry
  at a shared anchor now errors and names the candidates, instead of silently returning the first.
- **A fenced `### [ts]` or `↳` example inside a ledger entry no longer corrupts the log.** Head and
  relation parsing are now fence-aware — one shared `ledgerHeads` (in `scripts/lib/units.ts`) used by
  both `kb-index` and `kb-get` — so syntax quoted in an entry body is never mistaken for a real unit
  or edge.

### Notes

- `kb-graph suggest` is a v1 lexical heuristic: on a corpus with one very broad note it can surface
  generic-word pairs near the top. It is suggest-only and shows the shared terms, so you judge — a
  per-node cap / length normalization is a later refinement.

## [0.4.1] - 2026-06-29

### Fixed

- **`kb-index` now indexes notes in `docs/` subdirectories.** The store walk was non-recursive, so a
  note in a subdirectory (e.g. an external audit under `docs/positioning/`) was silently left out of
  the catalog and unretrievable — a blind spot the Probatio dogfood exposed. `kb-index` now recurses,
  assigning each file to its **longest-matching store** so the recursive finding walk never
  double-indexes the nested `lit` store. An `archive/` subdir is treated as cold storage and hidden
  dirs are skipped, so re-indexing doesn't re-introduce the bloat that archiving removed; `README.md`
  is skipped as navigation, like `INDEX.md`.

## [0.4.0] - 2026-06-29

### Added

- **`kb-ingest` — the CURATE verb** (`scripts/kb-ingest.ts`, command `/promptus-ingest`). Gives
  already-collected deep-research notes the `source` the `lit` substrate requires, deriving it **only
  from what is already recorded** and **flagging — never inventing** — when nothing is. Two modes,
  dry-run by default:
  - **`backfill`** — for notes already in `.promptus/docs/lit/`: prepend `lit` frontmatter, deriving
    `source` from a deep-research run-id in the ledger or the note's own `## Citation` / `## References`
    section. The body is never touched.
  - **`promote`** — reclassify a genuinely-external note out of the finding store into `docs/lit/`,
    replacing any stale frontmatter (it won't stack a second block) and fixing the relative links the
    move breaks. The classification (`lit` vs `finding`) stays the operator's call.
- **Ingest test suite** (`scripts/test/ingest.test.ts`, 13 tests) including the adversarial
  regressions an audit surfaced — double-frontmatter on promote, a `## Source of …` content heading
  mistaken for a citation, a case-mismatched link rewrite, an off-vocab `--kind`, and the run-id
  false-positive guard — each locked with a test.

### Notes

- Dogfooded across all three repos (on sandbox copies; originals untouched): **Promptus** — a clean
  no-op (its lit already carries sources); **Psi** — 32 of 37 lit notes sourced (6 via ledger run-id,
  26 via own citation), 5 honestly flagged as needing a manual source; **Probatio** — 12 lit units
  after an operator-signed-off `lit`-vs-`finding` pass that also surfaced 6 external positioning notes
  previously unindexed in a `docs/` subdir.

## [0.3.0] - 2026-06-28

### Added

- **`promptus-doctor` — a version-aware check / migrate tool** (`scripts/promptus-doctor.ts`,
  command `/promptus-doctor`). `check` diagnoses a repo read-only: it names the layout
  (`current` / `legacy-root` / `custom`), reads the vocab version, and flags two health hazards —
  an **unreachable gate** (the plugin's scripts look for `.promptus/schema/kb-vocab.json` and a
  0.1.x repo keeps the vocab at the root, so `kb-add` silently stops working) and a **`.gitignore`
  that broadly ignores `.promptus/`** (the 0.1.x derived-cache rule, which would leave the migrated
  stores uncommitted). `migrate` brings a 0.1.x or custom layout up to the canonical `.promptus/`
  namespace — **dry-run by default**, `--apply` to perform. It only MOVES store files (it **never
  edits a unit's content**), rewrites the vocab's `store` paths and upgrades its shape to the
  current version while preserving any custom blessed kinds/statuses, routes a `docs/`-intermingled
  ledger and `telos.md` to `.promptus/ledger/` and `.promptus/TELOS.md`, narrows the `.gitignore`
  to `/.promptus/cache/`, drops the stale 0.1.x cache, and rebuilds the index. Idempotent — a repo
  already on the current layout is a no-op.
- **Doctor test suite** (`scripts/test/doctor.test.ts`, 16 tests): detection (layout, version,
  gate-down + gitignore hazards), safety (dry-run touches nothing; a unit's bytes are identical
  before/after; a non-project errors clearly), correctness (every store lands at its canonical
  home; the ledger + telos are routed out of a `docs/`-intermingled layout; the vocab is re-homed +
  upgraded; the gitignore is narrowed), and the end-to-end guarantees (the gate works again; every
  doc — including a frontmatter-less project note — is parseable and retrievable).

### Changed

- `docs/adoption.md` now points at `/promptus-doctor` for migrating an existing project; the
  by-hand checklist is kept as the explanation of what the tool automates and the fallback.
- The `kb-index` console label reads `.promptus/cache/CATALOG.md` — the actual derived path since
  0.2.0 — instead of the old `.promptus/CATALOG.md`.

### Notes

- Dogfooded against the operator's two real research repos in a sandbox (originals untouched): a
  legacy-root layout (191 units) and a custom layout with the ledger and telos living inside
  `docs/` (248 units). Both migrated cleanly and stayed fully retrievable — numbers, named methods,
  and defined terms surfaced by `kb-find` afterward, including from frontmatter-less notes.

## [0.2.0] - 2026-06-28

### Added

- **`kb-now` — the gated NOW-header writer.** The ledger's NOW-header now enters through a script,
  like every log entry: `kb-now` owns the `Updated:` stamp (from the clock, never hand-typed — the
  original drift), checks the required sections, and writes a bounded replacement between the
  `<!-- now:start -->` / `<!-- now:end -->` markers (the log and framing stay out of reach).
  `/checkpoint` calls it, and the protect-gate hook blocks a hand-set `**Updated:**` stamp — so
  nothing in the ledger is freehand.
- **Robustness test suite** (`scripts/test/robustness.test.ts`, 21 tests): substrate fidelity (no
  phantom or silently-dropped units; status preserved verbatim as the calibration source), cross-OS
  encoding (CRLF, forward-slash paths, non-ASCII titles), path resolution (relative `--root`, a
  subdirectory, spaces, cwd fallback), and corruption resilience (bad vocab, a missing sentinel,
  broken frontmatter, a corrupt cache).
- **CI runs on Windows and macOS** in addition to Linux, so the cross-OS code paths are exercised on
  real runners.

### Changed

- **BREAKING — the knowledge system now lives under one `.promptus/` namespace.** A project's
  stores moved off the repo root into `.promptus/`: `.promptus/TELOS.md`,
  `.promptus/ledger/RESEARCH-LEDGER.md`, `.promptus/docs/` (+ `docs/lit/`), `.promptus/memory/`,
  and `.promptus/schema/kb-vocab.json`. The derived index dropped to `.promptus/cache/`. One folder
  is collision-proof in a host repo (it no longer clobbers the host's own `docs/`, `memory/`, or
  schema) and cleanly separates "the Promptus product" from "Promptus using itself." `AGENTS.md`
  stays at the repo root, where agents look for it.
- `findProjectRoot` now marks the root by `.promptus/schema/kb-vocab.json` (or `.promptus/TELOS.md`);
  `kb-add` / `kb-index` / `kb-find` / `kb-export` read and write the catalog at `.promptus/cache/`;
  the PreToolUse hook guards `.promptus/cache/` (not the whole namespace) plus the relocated ledger.
- `.gitignore` now ignores only `/.promptus/cache/` — the stores under `.promptus/` are committed.
- The shipped default vocab moved to `templates/schema/kb-vocab.json` (what `/promptus-init` copies in).

### Fixed

- **A CRLF ledger no longer drops its entries.** `kb-index` normalizes line endings before parsing,
  so a ledger checked out with `core.autocrlf=true` (Windows) is parsed correctly instead of
  silently yielding an empty catalog. Surfaced by the new cross-OS tests.
- **`loadVocab` reports a clear error** for a missing or malformed `.promptus/schema/kb-vocab.json`
  instead of a raw parser stack trace.

### Migration (from 0.1.x)

Move a 0.1.x repo's stores under `.promptus/` and its vocab to `.promptus/schema/kb-vocab.json`
(prefix the vocab's `store` paths with `.promptus/`), then swap `/.promptus/` for `/.promptus/cache/`
in `.gitignore`. `git mv` keeps history; re-run `kb-index` to rebuild the cache. Full checklist in
`.promptus/docs/adoption.md`.

## [0.1.1] - 2026-06-28

### Added

- **KAG coverage audit.** `docs/promptus-vs-kag-coverage.md` and `lit` notes (KAG, GraphRAG,
  HippoRAG, RAPTOR, Karpathy's llm-wiki) — the audit finds Promptus implements KAG's epistemic
  spine (store, typed graph, status-calibrated grounding) and defers the scale machinery behind the
  invariant.

### Changed

- **Relicensed from Apache-2.0 to GPL-3.0.** Promptus is now copyleft: distributing it or any
  derivative requires sharing the source under GPL-3.0. `LICENSE` is the GNU GPL v3.0 text.
- **Rewrote the README** — design-philosophy first, then quick start; modern layout; corrected the
  `humanizer` description (it is pure style; grounding lives in `recall` + the reviewer); added a
  prior-art credit to Karpathy's llm-wiki pattern.

### Removed

- **`LICENSE-humanizer` (MIT).** The upstream humanizer Part I is MIT-licensed; that copyright and
  permission notice is now preserved in `NOTICE` (as MIT requires) rather than as a separate
  license file. The fork is acknowledged in the README.
- **The humanizer skill's own version system.** The skill no longer carries `version:` / `license:`
  frontmatter or in-text version stamps — Promptus has one version and one license.

## [0.1.0] - 2026-06-28

First public release — the store/keep/retrieve/render spine, packaged as a Claude Code plugin.

### Added

- **Store spine.** `kb-add` (the gated writer-jig — the one way knowledge enters a project),
  `kb-index` (rebuild the derived `.promptus/CATALOG.md` card-catalog + `graph.json`; lint
  orphans and unresolved links), and `kb-find` (header-first retrieval: catalog scan + grep +
  `[[link]]`-graph walk + status filter). TypeScript on bun, stdlib-first; `bun test` covers
  the `lib/` units and store-spine integration.
- **Four-store architecture.** Telos (`TELOS.md`), append-only Ledger
  (`ledger/RESEARCH-LEDGER.md`), Knowledge (`docs/` findings + `docs/lit/` literature), and
  Memory (`memory/`, one file per fact). Every unit carries a `substrate:status` tag.
- **Controlled vocabulary + the hybrid gate.** `schema/kb-vocab.json` separates three facets —
  KIND (the act), STATUS (the claim's epistemic state), and RELATION (a typed link) — each a
  closed core plus blessed extensions. The curated library (finding/lit/memory) is **strict**
  (off-vocab input is refused with the allowed set); the lab-notebook ledger is **permissive**
  (an off-vocab kind/status is warned about but still written). Grounded in PROV-O/BFO (act vs.
  claim), CiTO, and the null-results/hedging literature — `DEADEND` is a KIND, not a STATUS, and
  supersession is a relation, not a status.
- **Typed relations + interop.** Relations (`supersedes`/`refutes`/`challenges`/`supports`/
  `extends`/`fixes`) are first-class edges; `kb-export` emits them as CiTO/PROV-O JSON-LD.
- **Skills.** `promptus` (orchestrator and map), `humanizer` (the writing renderer — paper voice,
  pure style), `recall` (retrieval reasoning, where grounding lives:
  decompose → retrieve → confidence-gate → verify → synthesize), `grannie` (plain-language
  ELI90 renderer), `telos` (scaffold a project's four stores), and `research-ledger` (the
  store-as-you-go recording habit).
- **Commands.** `/checkpoint` (a minimal pre-compaction flush) and `/promptus-init` (stand up
  the four stores + the `AGENTS.md` cadence in a repo, idempotent).
- **Agent.** `grounded-writing-reviewer` — audits a draft for AI-writing tells *and* for
  unsourced or over-confident claims, checking each factual claim against the store.
- **Humanizer Part II.** 14 positive "human factor" patterns plus `human-factors-analysis.md`,
  layered on the upstream's 29 removal patterns.
- **Templates.** Per-project four-store scaffolds that `/promptus-init` drops in.
- **Plugin packaging.** `.claude-plugin/plugin.json` + `marketplace.json`; skills, commands,
  and templates resolve the bundled `scripts/` via `${CLAUDE_PLUGIN_ROOT}`, so installing the
  plugin brings the machinery with nothing to vendor.
- **Project automation.** Continuous integration (lint + `bun test` + an offline plugin
  validator), a tag-driven release workflow with a changelog sanity gate, and a
  `.pre-commit-config.yaml` that the operator's shared git hooks pick up automatically.
- **Hooks.** Four guarded Claude Code hooks, each a no-op outside a Promptus repo:
  SessionStart injects the ledger's NOW-header to orient a resuming agent; a PreToolUse guard
  keeps freehand writes off the ledger log and `.promptus/`; PostToolUse re-indexes after a
  `kb-add`; SessionEnd nudges to `/checkpoint`.
- **Documentation.** `README.md`, `TELOS.md` (north star + the invariant), `AGENTS.md` /
  `WARP.md` (working cadence), `docs/report.md` (the design report), `docs/adoption.md` (the
  manual migration checklist), `CONTRIBUTING.md`, and `RELEASING.md`.

### Fixed

Hardening found by dogfooding before release:

- Parse free-form compound statuses — a permissive-ledger entry whose status contains spaces
  (e.g. `CORRECTION + RESULT`) is written to the catalog *and* retrievable by `kb-find` (the
  catalog is split on its delimiter, not matched by a single-token regex). Surfaced by migrating
  the Psi project.
- Adopt projects with a non-default layout — `findProjectRoot` accepts `schema/kb-vocab.json`
  (not only a root `TELOS.md`), and `kb-index` no longer double-indexes a ledger that lives inside
  the finding store dir. Surfaced by migrating Probatio (ledger at `docs/research-ledger.md`).
- Make the ledger's catalog anchor space-free so ledger entries are retrievable by `kb-find`.
- Key `kb-find` results by full card identity rather than path, so two entries written in the
  same second no longer collapse into one.

### Notes

- **License.** Promptus is licensed under Apache-2.0 (© 2026 Mohan Qiao). The forked
  `skills/humanizer` Part I remains under its upstream MIT license (© 2025 Siqi Chen), retained
  in `LICENSE-humanizer`; see `NOTICE` for provenance.

[Unreleased]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.6.1...HEAD
[0.6.1]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.6.0...promptus-v0.6.1
[0.6.0]: https://github.com/Gavin-Qiao/organon/compare/v0.5.2...promptus-v0.6.0
[0.5.2]: https://github.com/Gavin-Qiao/organon/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/Gavin-Qiao/organon/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Gavin-Qiao/organon/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Gavin-Qiao/organon/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Gavin-Qiao/organon/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Gavin-Qiao/organon/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Gavin-Qiao/organon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Gavin-Qiao/organon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Gavin-Qiao/organon/releases/tag/v0.1.0
