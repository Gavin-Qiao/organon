---
id: finding-20260710T012734Z-promptus-design-report
substrate: finding
kind: CONCEPT
status: VALIDATED
created: "2026-07-09 21:27:34"
updated: "2026-07-09 21:27:34"
---
# Promptus — design report

Promptus's own knowledge, dogfooded. This is the human-readable synthesis; the durable record
lives as `ledger:` decisions and `finding:` pages, retrievable with `kb-find`. Once the repo
is initialized as its own Promptus project, regenerate the cited claims here *through* the
store — the toolbox holding its own design history is the proof it works.

## 1. Problem

A mature but **unpackaged** research methodology (a per-project ledger + a checkpoint
discipline + a global memory) drifts in practice: the timestamp-stamping append script gets
skipped because hand-typing is lower-friction, and a past ledger lost ~a day to drift. And the
methodology lived as loose global skills, not a thing a project could install.

## 2. The bet

Markdown is the only source of truth; the index is **derived & disposable**; every write goes
through a **gated script** so format can't be forgotten; and — at this scale — a hand-written
header is a better retrieval key than a vector. The corpus is small, dense, hand-linked, and
status-tagged, so structure (grep + the `[[link]]` graph + status filters) beats embeddings,
which stay off until a measured threshold.

## 3. Architecture

Four stores (Telos / Ledger / Knowledge / Memory) and three agent-operated verbs (STORE /
BOOK-KEEP / RETRIEVE), over a `[[link]]` graph the agent navigates with `kb-graph`. Promptus is a
substrate for the **LLM agent**; a human reads in through one port — **grannie** — which explains a
stored concept in plain language. Every unit is tagged `substrate:status`; that status is the
**calibration source** — state `VALIDATED` plainly, hedge `CONJECTURED`, admit a `DEADEND`. The
humanizer is a style toolkit grannie dials (and the agent applies to its own prose), not a verb.

## 4. Mechanics

- **The gated writer-jig** (`kb-add`) owns the envelope (substrate-aware: a `### [ts]
  KIND/STATUS — title` log line for the ledger in local time; a `# claim` page for
  findings/lit; one file + an index pointer for memory), the timestamp, the id, the placement,
  and a validation gate that refuses off-vocab input with the allowed set.
- **Two-tier retrieval**: `kb-find` reads the derived card-catalog (`.promptus/cache/CATALOG.md`,
  one line per unit) header-first — the cheap, certain tier — matching a body term against the
  entry's own slice, not the shared file; `kb-get` then fetches just the unit bodies the headers
  earned, so a ledger term never costs the whole file. The `recall` skill drives both.
- **The graph** (`kb-graph`, no embeddings — the `[[links]]` are the graph): `rank` (personalized
  PageRank for the load-bearing units), `lint` (dangling handles with a "did you mean?" + orphans),
  `suggest` (a lexical latent-link linter — unlinked-but-related pairs to connect). It queries `graph.json`.
- **Book-keeping** (`kb-index` + `/checkpoint`): rebuild the catalog/graph, resolve supersedes,
  lint orphans + unresolved links; format-linting is unnecessary because nothing is hand-typed.

## 5. The papers-scale crossing

The scriptable graph layer already ships at notes-scale (`kb-graph rank` = personalized-PageRank,
`suggest` = a lexical latent-link linter — no embeddings). What defers to the **papers-scale**
crossing is the embedding-scale version: when the corpus becomes hundreds–thousands of *papers*
(not one project's notes), the header catalog stops fitting one read and that machinery turns on,
each past a measured threshold, into the existing seams: `kb-ingest` (schema-constrained extraction)
→ embeddings as a pre-filter scoped to `.promptus/docs/lit` → embedding latent-links and
GraphRAG-style community summaries over the literature → RAPTOR-style summary tiers → mutual-index
hardening for sentence-level citation. The invariant still governs: markdown stays truth, indexes
stay derived, scripts beat servers, machinery turns on by measurement.

## See also — the durable record

The decisions and prior art this report synthesizes, each retrievable with `kb-find`:
[[header-beats-vector]] · [[markdown-is-the-graph]] · [[the-gate]] · [[the-scriptable-graph-layer]] ·
[[vocab-grounding-no-single-standard-recommend-a-hybrid-gate]] · [[promptus-vs-kag-coverage]] · [[adoption]].
