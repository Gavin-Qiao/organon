---
id: finding-20260710T012734Z-adoption-migrating-a-project-to-promptus
substrate: finding
kind: METHOD
status: VALIDATED
created: "2026-07-09 21:27:34"
updated: "2026-07-09 21:27:34"
---
# Adoption — migrating a project to Promptus

The operator adopts projects one by one, by hand. This is the checklist; nothing here is run
automatically against another repo.

## Per-project checklist

1. **Initialize.** `/promptus-init` (or run the `telos` skill) to scaffold the four stores,
   Telos first. Fill `.promptus/TELOS.md` with the project's north star and its own rules-that-never-bend.
2. **Install the Promptus plugin** so the skills, commands, and templates resolve its bundled
   `scripts/` via `${CLAUDE_PLUGIN_ROOT}` — nothing to vendor or copy in.
3. **Backfill the ledger — selectively.** Don't re-type the whole history; capture what you'd
   hate to lose. `kb-add --substrate ledger` the key past `DECISION`s, `RESULT`s, and the
   instructive `DEADEND`s. The NOW-header gets written by hand from the current state.
4. **Move external notes into `.promptus/docs/lit/`** as `lit` units, each with a `--source` and a
   `--reuse` class (CITE / DO-NOT-REBUILD / REUSE / NOVEL). Distil our own findings into `.promptus/docs/`.
5. **Index + lint.** `bun scripts/kb-index.ts`; resolve the orphans / unresolved links it
   reports (wire them up, or confirm an intentional `[[concept-handle]]`).
6. **Adopt the cadence.** Copy `templates/AGENTS.md` into the project's `AGENTS.md` so
   store-as-you-go and `/checkpoint`-before-compaction stay in context.

## Mapping an existing ledger — run the doctor

Projects already on the `research-ledger` skill (e.g. Probatio, Psi) — or on any 0.1.x layout
with the stores at the repo root — are migrated by **`/promptus-doctor`**, not by hand. It is
version-aware and dry-run-first: `check` names the layout (`legacy-root` / `custom`) and the
health hazards (an unreachable gate, a `.gitignore` that would leave the migrated stores
uncommitted); `migrate --apply` moves each store under `.promptus/` — the ledger and a
`docs/`-intermingled `telos.md` are routed to `.promptus/ledger/` and `.promptus/TELOS.md` —
rewrites and upgrades the vocab, narrows the `.gitignore` to `/.promptus/cache/`, and rebuilds the
index, **without ever editing a unit's content**. The `### [ts] KIND/STATUS — title` log format is
kept unchanged (Promptus emits exactly that); new appends route through `kb-add --substrate
ledger`. The rest of this section is what the doctor automates, kept as the explanation and the
by-hand fallback: add `.promptus/TELOS.md` if missing; move the stores under `.promptus/` (ledger →
`.promptus/ledger/`, notes → `.promptus/docs/`); add the `<!-- kb:append-point -->` sentinel to the
ledger; route new appends through `kb-add --substrate ledger` instead of the old `ledger-append.mjs`.

## Canonicalization (operator's real machine — not done in this repo)

The proven global assets — `~/.claude/skills/research-ledger`, `~/.claude/commands/checkpoint.md`,
the memory store — get **demoted to thin pointers with a degraded-mode fallback** (the
`probatio` pattern), with Promptus as the single source of truth. A thin pointer is a short
skill whose first instruction is "read the canonical version in the Promptus repo and follow
it," with the non-negotiable core inline as a fallback. This is a manual step on the operator's
machine; it is **not** performed by this repo (those globals aren't present here).
