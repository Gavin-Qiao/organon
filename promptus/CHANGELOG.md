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

### Added

- **Add bounded trajectory reviews for long-running research.** A read-only deterministic collector
  now builds source-fingerprint-bound whole-project or exact-endeavour packets with explicit
  boundaries, per-scope continuation, positive and negative dispositions, causal context, poison
  checks, and no silent truncation; the companion skill retrieves every claimed body and separates
  recorded fact from retrospective inference. Operator-approved reviews persist through `kb-add` as
  immutable `finding:REVIEW` units with checked scope, boundaries, fingerprint, and predecessor.
  Trajectory review helps an agent reflect on recorded evidence; it does not determine research
  quality or choose project direction.

### Fixed

- **Retry Windows lock contention instead of rejecting concurrent writers.** Bun can report an
  existing exclusive lock file as `EPERM` or `EACCES` on Windows rather than `EEXIST`; the store
  lock now treats those Windows-only aliases as contention while preserving hard permission errors
  on POSIX and the existing fail-closed timeout.

## [0.8.2] - 2026-08-24

### Changed

- **Return the authoritative post-write action.** `kb-add` now prints a shell-safe command for the
  installed `kb-index` with the discovered project root, and exposes the same command plus argv in
  `--json` output instead of pointing at a usually nonexistent project-local `scripts/` directory.

### Fixed

- **Make long thinker-round quarantine custody canonical.** Long valid round IDs now use a bounded
  readable slug plus a digest of the complete ID, `kb-ingest quarantine` accepts only a safe target
  basename and returns its exact custody binding, and historical bound paths remain valid without
  renaming when their hashes agree.
- **Round-trip memory relations and retire their targets correctly.** Memory envelopes now serialize
  typed relations, while substrate-aware inverse lifecycle projection marks superseded memory
  `retired`, preserves source bytes, and refuses illegal target statuses before a write or reindex.
- **Reject stale or failed doctor health receipts.** Doctor now uses the same source-store hash as
  `promptus-check`, compares source and live-unit counts, honors hard receipt failures, emits
  `healthReceiptFresh`/`healthIssues`, and makes strict checks fail with a direct recovery action.

## [0.8.1] - 2026-08-23

### Changed

- **Count resolved typed relations as graph connectivity.** Relation-only findings no longer
  appear as orphans; PageRank remains deliberately limited to the wikilink page graph.
- **Separate current evidence health from archival drift.** Artifact failures owned by active
  units remain hard failures, while failures owned by units made `SUPERSEDED` through a resolved
  lifecycle relation are retained as explicit archival warnings and do not block session resume.

### Fixed

- **Make ledger links survive the authoritative rebuild.** `kb-add --links` now serializes a
  `Related:` footer into ledger Markdown and emits the same anchored catalog card that `kb-index`
  reconstructs, so a successful write round-trips without losing its edge.
- **Serialize concurrent store writers.** `kb-add` and `kb-now` now share a project-local lease,
  re-read source only after acquiring it, replace source files atomically, and mint a deterministic
  suffix on same-second ledger ID and anchor collisions, preventing multi-agent lost updates and
  keeping every new event independently retrievable.
- **Use one fence-aware ledger parser in doctor and indexer.** A quoted `### [timestamp]` example
  inside a code fence no longer inflates doctor counts or creates false catalog-lag diagnoses.

## [0.8.0] - 2026-08-23

### Added

- **Add useful external thinker rounds.** The `thinker-round` skill and deterministic companion
  scaffold one self-contained theory question plus a frozen refute-first plan, seal their hashes,
  retain an operator-returned response byte-for-byte, reject wrong-round/prompt-echo/duplicate
  returns, quarantine valid intake as `lit:UNTRUSTED`, and show a round adjudicated only after a
  normal `derives-from` finding records the main agent's independent verdict. The outside thinker
  receives no workspace, tools, network, session history, or implied authority. Doctor, session
  preflight, and whole-store health recognize the governed exchange and reject custody drift.
- **Add a strictly read-only session doctor.** `promptus-session-doctor` preflights a long-running
  project before an agent trusts NOW, catalog/search, graph traversal, or a health receipt; it
  diagnoses stale and ambiguous state without reindexing, repairing, refreshing, or baselining.
- **Add bounded lexical retrieval without embeddings.** `kb-index` derives a disposable
  BM25-style `search.json`; `kb-find` ranks results, caps them at 20 by default, supports
  exact phrases and required/all-term queries, and searches cold history only with `--history`.
- **Add enforceable artifact dependencies.** `kb-add --artifact "role|path|sha256-or--"`
  records project-relative artifacts; `promptus-check` rejects missing files and hash mismatches.
- **Add a no-new-debt ratchet.** `promptus-check --record-baseline` records inherited
  classification/link/orphan debt; `--ratchet` rejects only newly introduced debt.
- **Add a deterministic status read port.** `promptus-status` returns the Telos north star plus
  NOW, the blocking frontier, next action, and resume point for `/grannie status`.
- **Add thinker quarantine.** `kb-ingest quarantine` preserves supplied bytes, provenance, and
  SHA-256 as `lit:UNTRUSTED` and deliberately promotes no claim.

### Changed

- **Make NOW freshness gate-owned.** `kb-now` writes exactly one latest-unit marker and caps the
  live region; `promptus-check` rejects a stale configured marker.
- **Canonicalize graph identity** across stable IDs, slugs, and unique aliases, while keeping
  ambiguous aliases as explicit debt and external URIs out of dangling-link counts.
- **Make graph importance status-aware.** `kb-graph rank` excludes superseded, refuted, and
  retired units unless `--history` is explicit.

### Fixed

- **Preserve every legacy same-second ledger result in lexical retrieval.** Search keys now use a
  stable ID when available and the complete path-plus-title identity otherwise, so valid legacy
  batches that share a second do not collapse in `kb-find`. The disposable search schema advances
  to v2: `kb-find` safely rebuilds an old cache in memory, while the session doctor requires a
  durable re-index before declaring the project ready.
- **Make `kb-get` fail closed.** Unanchored ledger paths no longer dump the log, and output is
  capped at 64 KiB unless a larger or whole-file read is explicit.
- **Make every primary script's `--help` work without an initialized project.**
- **Make `promptus-doctor` book-keep a current-layout store.** A namespaced repo whose vocab
  is behind the template, whose catalog lags, whose `.gitignore` still hides `.promptus/`,
  or which carries leftover derived files / extra ungoverned trees is no longer reported
  fully healthy merely because layout is `current`. `migrate` / `upgrade` dry-run the
  non-content repairs (merge vocab keeping custom extended terms such as LOCK/CHECKPOINT,
  narrow gitignore to cache, rebuild the derived index, optionally `--record-baseline`);
  `--apply` never edits unit body bytes.

## [0.7.0] - 2026-07-09

### Added

- **Add native Codex packaging.** Promptus now ships a `.codex-plugin` manifest, portable
  skills for every command workflow and the grounded reviewer, plus a Codex hook adapter
  for `apply_patch`, `PreCompact`, cross-platform commands, and event-specific JSON output.
- **Add executable OS coverage for Codex hooks.** Every lifecycle hook declares a POSIX
  command for macOS/Linux and a Windows override; the Ubuntu, Windows, and macOS test matrix
  runs the selected launcher against a real hook payload.
- **Add a scoped Conventional PR-title gate.** CI now rejects titles outside
  `type(scope): subject`, including when a title is edited after opening the PR.
- **Add `promptus-check` as the authoritative whole-store health gate.** It rebuilds the
  derived index, records source/index freshness, and rejects duplicate IDs, unresolved
  typed-relation targets, and unclassified units; `--strict-graph` can additionally make
  dangling links and orphans blocking.
- **Add `kb-amend` for gated metadata transitions on existing finding, literature, and
  memory units.** It preserves bodies and existing metadata, mints missing stable IDs,
  validates kind/status through the store vocabulary, and re-indexes after the write.

### Changed

- **Give every newly stored unit a stable machine-readable ID** and carry that identity
  through catalog cards and the retrieval graph while retaining legacy slug compatibility.

### Fixed

- **Fix ledger supersession and multi-hop retrieval.** Relations now resolve stable and
  legacy event IDs, and one ledger hit no longer expands to every entry sharing its file
  or timestamp.
- **Fix derived-index documentation** to consistently name `.promptus/cache/` as the only
  disposable store surface.

## [0.6.2] - 2026-07-07

### Fixed

- **The checkpoint now owns research digestion** (a real project's findings substrate went
  dark for a week while ledger events and lit units kept accumulating — deep-research
  reports were landing as events + citations, never as digested knowledge): `/checkpoint`
  step 1 names in-conversation research reports as perishable and routes each into a
  `finding` unit; the `research-ledger` skill states the rule as a table — a research
  effort has **three homes** (event → ledger, sources → lit, digested reasoning →
  finding), and the closing "not part of the minimal flush" carve-out no longer exempts
  perishable reports. Because prose duties drift, the doctor carries the mechanical
  tripwire: **`check` flags digest lag** — five or more lit units postdating the newest
  finding unit means research is landing as citations without digests (the judgment can't
  be scripted; the lag can be measured).

- **kb-add degrades gracefully when the vocab marker is gone** (a fresh clone whose
  schema was git-ignored, a repo split): instead of the hard root-detection failure
  that pushed a real project into hand-appending at the sentinel, the gate re-seeds
  the template vocab with a loud warning and writes — remediation named, friction gone.
- **promptus-doctor check flags catalog lag**: ledger units the derived catalog doesn't
  carry (hand-appends at the sentinel skip kb-add's incremental index; a real project
  sat ~10 entries stale before anyone noticed) — the fix is always just `kb-index`.
- **promptus-doctor check flags root-level twins** of namespaced stores
  (`schema/kb-vocab.json`, `ledger/RESEARCH-LEDGER.md`, `TELOS.md` beside a current
  `.promptus/`): pre-migration leftovers can only diverge, since the gate writes
  `.promptus/` alone — named before they need a 264-reference dedup again.
- **kb-find has `--help`**: the `--substrate`/`--status`/`--hops`/`--limit`/`--snippet`
  flags existed since day one but nothing advertised them — a real retrieval agent
  eyeballed 30-line result lists for want of a slice. Discoverability, not new machinery.

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

[Unreleased]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.8.2...HEAD
[0.8.2]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.8.1...promptus-v0.8.2
[0.8.1]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.8.0...promptus-v0.8.1
[0.8.0]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.7.0...promptus-v0.8.0
[0.7.0]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.6.2...promptus-v0.7.0
[0.6.2]: https://github.com/Gavin-Qiao/organon/compare/promptus-v0.6.1...promptus-v0.6.2
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
