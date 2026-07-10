---
name: promptus
description: Orchestrator and map for the Promptus research knowledge system — a substrate for the LLM agent. Use at the start of research book-keeping to choose the right verb/script/skill — STORE (kb-add/kb-amend), BOOK-KEEP (promptus-check + kb-index + graph + checkpoint), RETRIEVE (kb-find → kb-get + recall). grannie is the one human read-port. Knows the four stores, substrate:status tagging, the [[link]] graph, and the invariant.
---

# Promptus — orchestrator

**Portable path rule:** in commands below, replace `<plugin-root>` with the absolute plugin root
two directories above this `SKILL.md`. Resolve it from the loaded skill path; do not assume a
host-specific environment variable exists in the project shell.

Promptus stores / keeps / retrieves what a research project knows as gated markdown — a
substrate for the agent; grannie is the one human read-port. Read `.promptus/TELOS.md` for the
canonical statement and the invariant.
This skill is the map: pick the verb, run the piece.

## Decision table — intent → do this

| You are about to… | Verb | Do |
|---|---|---|
| record a decision / run / observation / dead-end / finding | STORE | `bun "<plugin-root>/scripts/kb-add.ts" --substrate ledger …` (or the `research-ledger` skill for the habit) |
| distill a settled finding into a concept page | STORE | `kb-add --substrate finding …` (one concept per file, `[[linked]]`) |
| capture external prior art you read | STORE | `kb-add --substrate lit --source "<src#anchor>" …` |
| remember a durable, cross-session fact | STORE | `kb-add --substrate memory …` |
| change the status or metadata of an existing curated unit | STORE | `bun "<plugin-root>/scripts/kb-amend.ts" --path <path> --substrate <finding|lit|memory> --kind <kind> --status <status>` |
| make the index current after writes | BOOK-KEEP | `bun "<plugin-root>/scripts/kb-index.ts"` |
| verify the whole store is classified, uniquely identified, related, and current | BOOK-KEEP | the `promptus-check` skill (`bun "<plugin-root>/scripts/promptus-check.ts" --strict`) |
| check the knowledge web's health (dangling `[[links]]`, orphans) | BOOK-KEEP | `bun "<plugin-root>/scripts/kb-graph.ts" lint` |
| flush a session before compaction | BOOK-KEEP | the `promptus-checkpoint` skill (`/promptus:checkpoint` in Claude Code) |
| answer "what did we decide / find / read about X" | RETRIEVE | the `recall` skill (drives `kb-find` → `kb-get`) |
| read one unit's body without opening the whole ledger | RETRIEVE | `bun "<plugin-root>/scripts/kb-get.ts" "<path>"` (the `path` column `kb-find` prints) |
| find the load-bearing units (what to read first) | RETRIEVE | `bun "<plugin-root>/scripts/kb-graph.ts" rank` |
| find related-but-unlinked notes to connect | RETRIEVE | `bun "<plugin-root>/scripts/kb-graph.ts" suggest` |
| write something the project already knows | RETRIEVE | `recall` to ground it; editio's `humanizer` for style, when installed |
| explain a stored concept to a human | read-port | `grannie` (`/grannie explain <concept>`) — grounds from the store |
| audit a draft for AI-tells + unsourced claims | audit | the `grounded-writing-reviewer` skill |
| initialize Promptus in a repo | — | the `promptus-init` skill (runs `telos`; `/promptus:promptus-init` in Claude Code) |
| change the project's direction (edit the Telos) | — | **operator-triggered**: record a ledger DECISION + propose (the `telos` skill's boundary); rewrite in place on the operator's word — the frontier goes to `kb-now`, never into `TELOS.md` |

## The four stores

Telos (`.promptus/TELOS.md`, direction) · Ledger (`.promptus/ledger/RESEARCH-LEDGER.md`, events) ·
Knowledge (`.promptus/docs/` findings + `.promptus/docs/lit/` literature) · Memory
(`.promptus/memory/`, durable facts). Every unit
is tagged `substrate:status` — `ledger:DEADEND`, `finding:VALIDATED`, `lit:CITE`,
`memory:validated`.

## The knowledge graph

The `[[wikilinks]]` between units *are* the graph (no DB, no embeddings — see the invariant);
`kb-index` derives `.promptus/cache/graph.json` from them, and `kb-graph` queries it:
- `kb-graph rank` — PageRank over the page-link graph: the load-bearing units, what to read first.
- `kb-graph lint` — health: dangling `[[handles]]` (with a "did you mean?") and orphans. `--strict` to gate.
- `kb-graph suggest` — latent links: unit pairs that are unlinked but probably related (shared
  vocabulary + shared source), so you can draw the missing `[[link]]`. Suggest-only; you judge.

Retrieval is two-tier: `kb-find` reads the card-catalog of headers (cheap, header-first), then
`kb-get` fetches only the bodies the headers earned — so a ledger term never costs the whole file.

## The invariant (do not break)

markdown is the only source of truth · the index is derived & disposable · writes go through
a gated script, never freehand · prefer a script over a server · add machinery only past a
threshold you've **measured**.

## When NOT to use Promptus

Throwaway scratch work, a one-off answer, or anything you would not want to resume after a
compaction. Storing noise is as bad as losing signal — record what you'd hate to lose.
