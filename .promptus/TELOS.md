# Telos — Promptus

## North star

Promptus is the **memory system for long-running LLM agentic projects.** Over weeks of work and
many compactions, the agent should never lose what it learned, re-derive what it found, or
contradict what it decided. It is the file-based substrate the agent **stores** into, **keeps**, and
**retrieves** from — events, literature, findings, durable memory, as gated, well-formed markdown —
so its reasoning and writing stay honest, grounded, and resumable.

The agent is the user. A human reads in through **one port: grannie** (`/grannie
explain …`), which answers from the store in plain language, honest about confidence.
The humanizer is a **style toolkit** grannie dials (and the agent applies to its own
prose) — not a verb of its own; it ships with **editio**, the writing plugin, and grannie
degrades to plain answers when editio is absent. There is no separate "render for an
audience": the agent grounds its writing by retrieving; grannie is the one human-facing read.

## The three commitments

1. **Memory for long-running agentic work — measured by use.** The job is continuity: resume in
   seconds, never relearn the settled, never re-derive the found, never contradict the decided. The
   measure is whether *this* project stays grounded and resumable — not whether Promptus does
   something no other system does. Being first is not a goal, and *"is this a moat?"* is not a
   question worth asking.

2. **Epistemic integrity by division of labor.** Let the LLM do *only* what genuinely needs its
   judgment — write the prose, judge relevance, decide what is worth keeping. Let **deterministic
   scripts** do all the rest: the timestamp, the id, the placement, the index, the link-graph math,
   the validation gate. The deterministic core cannot drift or hallucinate; the LLM surface stays
   small, gated, and status-tagged. **That division is the discipline** — minimize what rides on the
   model, and what's left can't quietly rot.

3. **Stand on the shoulders of giants.** Don't rebuild the wheel: where prior art does a piece well,
   adopt it freely (respecting the invariant — no heavy machinery on spec), and spend our own effort
   only on the thin part that is genuinely ours. Prior art is for consolidation, not a novelty contest.

## The four stores

| store | path | retrieve it to… |
|---|---|---|
| **Telos** | `.promptus/TELOS.md` | know the direction |
| **Ledger** | `.promptus/ledger/RESEARCH-LEDGER.md` | reconstruct what happened & why (incl. dead-ends) |
| **Knowledge** | `.promptus/docs/` (findings) + `.promptus/docs/lit/` (literature) | ground a claim in prior art / our findings |
| **Memory** | `.promptus/memory/MEMORY.md` (per-project) | not relearn what was settled |

Every retrievable unit carries a **substrate + status** (`ledger:DEADEND`,
`lit:CITE`, `finding:VALIDATED`, `memory:validated`). The `[[wikilink]]` graph
spans all four.

## The three verbs

- **STORE** → `scripts/kb-add.ts` (gated writer-jig; the LLM supplies only the prose body).
- **BOOK-KEEP** → `scripts/kb-index.ts` (rebuild the derived catalog + graph) + `/checkpoint` (lossless flush before compaction).
- **RETRIEVE** → `scripts/kb-find.ts` → `scripts/kb-get.ts` (header-first, then body-fetch) + `scripts/kb-graph.ts` (rank · lint · suggest over the `[[link]]` graph) + `skills/recall` (reasoning).

## The human read-port + the skills around it

- **grannie** (`/grannie explain …`) — the one human-facing port: explain a stored concept in plain language, grounded by judgement (auto-looks-up the store) and honest about its status. *Real.*
- **humanizer** (`/humanizer`) — a style toolkit (de-AI, human voice) grannie dials and the agent applies to its own prose. Not a knowledge verb. *Real; ships with the editio plugin.*
- **grounded-writing-reviewer** — an agent-side audit: check a draft's claims against the store. *Real.*
- **overnight-handoff** — terse resumable state for the next agent (agent-to-agent, a checkpoint variant). *Deferred.*

## Rules that never bend (the invariant)

> markdown is the only source of truth · the index is derived & disposable ·
> writes go through a gated script, never freehand · prefer a script over a
> server · add machinery (embeddings, a DB) only past a threshold you've
> **measured**, never on spec.

This is *why* there are no embeddings and no graph DB in v1: a hand-written header
is a better retrieval key than a vector for a small, dense, status-tagged corpus,
and the `[[links]]` in markdown *are* the graph. Both turn on only at the
papers-scale crossing (hundreds–thousands of papers), each past a measured
threshold. (bun makes `bun:sqlite` a one-line upgrade when that day comes — but
not before.)

## Memory

Memory is **per-project**, in your real one-file-per-fact format: `kb-add --substrate
memory` writes one file per fact (`memory/<slug>.md`, with `name` / `description` / `type`
frontmatter) and adds a pointer line to the `.promptus/memory/MEMORY.md` index — not a single append
blob. Kept current and reconciled at `/checkpoint`. Each project owns what it has settled; a
global `~/.claude/.../memory` store, if you keep one, is reconciled up to at checkpoint.
