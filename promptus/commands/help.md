---
description: Promptus help — what it is, the four stores, the three verbs, and the command/skill map. Run with no argument for the overview, or a topic (store, retrieve, thinker, init, checkpoint) to zoom in.
argument-hint: "[topic]"
---

# /promptus:help — what's in the box

Promptus **stores / keeps / retrieves** what a research project knows as gated markdown — a
substrate for the agent; `grannie` is the one human read-port. If `$ARGUMENTS` names a topic, focus the answer there;
otherwise give the map below and end at the single next step.

## The model

- **Four stores**, every unit tagged `substrate:status`:
  - **Telos** (`.promptus/TELOS.md`) — the direction and the invariant that never bends.
  - **Ledger** (`.promptus/ledger/RESEARCH-LEDGER.md`) — append-only events: decisions, runs, dead-ends.
  - **Knowledge** (`.promptus/docs/` findings + `.promptus/docs/lit/` literature) — distilled, each with a source.
  - **Memory** (`.promptus/memory/`) — durable facts, one per file.
- **Three verbs** — scripts do the mechanics, skills do the reasoning:
  - **STORE** → `kb-add` (the gated writer-jig) for new units; `kb-amend` for controlled
    metadata transitions on existing curated units.
  - **BOOK-KEEP** → `kb-index` (rebuild the catalog + lexical index + graph), `promptus-check --strict`
    (whole-store integrity), `kb-graph lint` (graph health), and `/checkpoint`.
  - **RETRIEVE** → `kb-find` (ranked, 20-result default) → `kb-get` (bounded unit fetch) and `recall`;
    `kb-graph rank`/`suggest` to navigate the `[[link]]` graph.
- A human reads in through **`grannie`** (`/grannie explain <concept>` or `/grannie status`) — plain-language, grounded
  answers; the one human port. The `grounded-writing-reviewer` is an agent-side audit; the
  `humanizer` style toolkit ships with the editio plugin (grannie dials it when installed).

## Commands & skills

| you want to… | use |
|---|---|
| stand up the stores in a repo | `/promptus:promptus-init` |
| safely resume a long-running project before trusting NOW or cache | `/promptus:promptus-session-doctor` (strictly read-only) |
| record a decision / run / finding | the `research-ledger` skill → `kb-add` |
| get a fresh, context-free attack on one theoretical bottleneck | `/promptus:thinker-round` (operator carries the sealed prompt and return) |
| review whether one endeavour is moving or merely accumulating local work | `/promptus:trajectory-review` (bounded read-only packet, then agent judgement) |
| classify or update an existing curated unit | `kb-amend` |
| run the authoritative store-integrity gate | `/promptus:promptus-check` |
| flush state before compaction | `/promptus:checkpoint` |
| find what we already know | the `recall` skill → `kb-find` |
| see where the project is, what blocks it, and what is next | `grannie status` → deterministic `promptus-status` |
| write something grounded and human | `recall` (grounds it) → editio's `humanizer` (styles it, when installed) |
| explain a concept plainly | the `grannie` skill (`explain <concept>`) |
| audit a draft | the `grounded-writing-reviewer` agent |
| inspect or heal the knowledge graph | `/promptus:promptus-graph` (`rank` · `lint` · `suggest`) |
| see the whole map | the `promptus` orchestrator skill |

## The invariant

markdown is the only source of truth · the index is derived and disposable · writes go through
a gated script · prefer a script over a server · add machinery only past a **measured** threshold.

## Start here

New repo? Run `/promptus:promptus-init`. Existing long-running project? Run the read-only
`/promptus:promptus-session-doctor` before trusting its handoff or cache, then follow
`.promptus/docs/adoption.md` if migration is needed. Store as you go (`kb-add`), retrieve before
you assert (`kb-find` / `recall`), and `/promptus:checkpoint` before you compact.
