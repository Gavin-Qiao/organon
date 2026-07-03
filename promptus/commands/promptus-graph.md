---
description: Inspect the knowledge graph — rank load-bearing units (PageRank), lint health (dangling handles + orphans), and suggest latent links (related-but-unlinked pairs). Read-only, no embeddings.
argument-hint: "[rank|lint|suggest] [--top <n>] [--knn <k>] [--strict]"
---

# /promptus-graph — inspect the knowledge graph

Query the `[[link]]` graph that `kb-index` derives into `.promptus/cache/graph.json`. Read-only,
no embeddings — the links *are* the graph, centrality is plain graph math, a dangling handle is a
string match. If the index is stale, run `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts"` first.

## Steps

1. **Health — `lint`.** Find what's broken or floating: dangling `[[handles]]` (the link's target
   isn't a unit — with a "did you mean?" suggestion by slug similarity) and orphans (nothing links
   in or out). `--strict` exits non-zero on any flaw, so it can gate a checkpoint.
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-graph.ts" lint --root .
   ```
2. **Importance — `rank`.** Rank the load-bearing units by PageRank over the page-link graph (with
   in/out degree alongside) — what to read first, and what a change ripples out to. `--top n` caps it.
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-graph.ts" rank --root . --top 20
   ```
3. **Discovery — `suggest`.** Surface unit pairs that are unlinked but probably related (shared
   vocabulary, IDF-weighted, + a shared source), each with the "why". Pairs are pruned to reciprocal
   best matches (mutual-KNN), so a broad note can't flood the list; `--knn <k>` dials how many
   neighbours each unit keeps (default 6 — lower is stricter). Suggest-only — read the reason and
   draw the `[[link]]` yourself if it's apt; the script proposes, you judge.
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-graph.ts" suggest --root . --top 15
   ```
4. **Act on it.** Fix a dangling handle (correct the `[[link]]` to the suggested slug), wire an
   orphan in or retire it, and draw any latent link worth keeping — then re-run `kb-index` so the
   derived graph reflects the repair.

## What it does NOT do

It reads the derived graph only; it never edits a unit, never writes a `[[link]]` for you
(`suggest` proposes — you decide), and adds no embeddings or database. Drawing the edges stays a
human judgement, the same discipline as the gate.
