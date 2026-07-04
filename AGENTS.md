# AGENTS.md — working in the Organon repo

This repo dogfoods its own methodology. When you work here, you are both building
the toolbox and using it. This file is the portable read surface (the `AGENTS.md`
convention); the fuller map is `/promptus:help` and the `promptus` skill.

> **Current state: a marketplace monorepo, both plugins released** (per-plugin tags; versions
> live in each `plugin.json`, never in prose). Two plugins under the `organon` marketplace
> (`.claude-plugin/marketplace.json` at the root): **`promptus/`** — the store: STORE `kb-add`
> (+ the NOW-header writer `kb-now`), KEEP `kb-index` + `kb-graph` (`rank` / `lint` /
> `suggest`), RETRIEVE `kb-find` → `kb-get`; skills `promptus`, `recall`, `grannie`, `telos`,
> `research-ledger`; and **`editio/`** — the writing toolchain: `/editio`, the `editio` +
> `editio-structure` + `editio-latex` + `editio-figures` skills, the scaffold + renderer +
> figcheck scripts, `humanizer`; tables/bib land in later phases (design of record:
> `.promptus/docs/editio-design-memo.md` + the ledger's supersede chain). The agent operates
> the verbs; `grannie` is the one human read-port. Embedding-scale machinery stays deferred
> (the invariant).

## Cadence

1. **Read `.promptus/TELOS.md` first.** It holds the north star and the invariant that never bends.
2. **Store as you go.** Don't hand-edit the ledger or `.promptus/docs/`. Every unit goes in
   through the gated writer-jig:
   ```
   echo "<prose body>" | bun promptus/scripts/kb-add.ts --substrate ledger --kind RESULT --status VALIDATED --title "…"
   ```
   The script owns the timestamp, the id, the placement, and the catalog update.
   This is the drift fix — freehand appends are how the old ledger lost a day.
3. **Re-index after a batch of writes.** `bun promptus/scripts/kb-index.ts` rebuilds the derived
   `.promptus/cache/CATALOG.md` + `graph.json`; `bun promptus/scripts/kb-graph.ts lint` checks graph
   health (dangling `[[handles]]`, orphans).
4. **Retrieve header-first.** `bun promptus/scripts/kb-find.ts "<query>"` (then `kb-get` for a unit's
   body) before you claim anything the repo already knows; every hit carries its `substrate:status`.
5. **Checkpoint before you compact.** `/promptus:checkpoint` flushes anything un-recorded into the
   stores (so a compaction can't lose it), refreshes the NOW-header, reconciles memory.

## Conventions

- Commits: Conventional Commits `type(scope):` + flat `-` bullet body (one line per bullet).
  **Omit** `Co-Authored-By`. No emoji in commits, PR bodies, or release notes.
- Never `--no-verify`. Forward-slash paths everywhere.
- Scripts are **TypeScript on bun** (`#!/usr/bin/env bun`); tests via `bun test`.
  `bun:sqlite` / embeddings only past a measured threshold (see the invariant).
- License: GPL-3.0 (© 2026 Mohan Qiao). The `editio/skills/humanizer` fork includes Part I from
  blader/humanizer (© 2025 Siqi Chen, MIT); that upstream notice is preserved in `editio/NOTICE`.
- Releases are **per-plugin tags** — `promptus-vX.Y.Z` / `editio-vX.Y.Z` (see `RELEASING.md`).
- **Docs ride the change**: a PR that alters what ships updates the affected READMEs /
  `AGENTS.md` in the same PR; versions never in prose — the badges + `plugin.json` carry them
  (see `CONTRIBUTING.md`, "Docs stay truthful").
- Don't commit or push unless asked.

## Layout

- `.claude-plugin/marketplace.json` — the `organon` marketplace; each plugin is a subdirectory.
- `promptus/` — the store plugin: `scripts/` (the mechanics: `kb-add` / `kb-now` STORE,
  `kb-index` / `kb-graph` KEEP, `kb-find` / `kb-get` RETRIEVE, plus `kb-export`, `kb-ingest`,
  `promptus-doctor`, and `lib/`), `skills/` (`promptus` the orchestrator, `recall`, `grannie`,
  `research-ledger`, `telos`), `commands/`, `agents/` (`grounded-writing-reviewer`), `hooks/`,
  `templates/` (per-project four-store scaffolds incl. `schema/kb-vocab.json`).
- `editio/` — the writing plugin: `commands/` (`/editio`), `skills/` (`editio` the orchestrator,
  `editio-structure` + its exemplar craft references, `editio-latex` + the authoring-subset
  contract, `editio-figures` + its cited craft references, `humanizer`), `scripts/`
  (`editio-scaffold`, `editio-render`, `editio-status` the claim report + publish gate,
  `editio-figcheck` the size gate, own thin `lib.ts`),
  `templates/` (the DoCO/DEO gate, `editio.sty` + `main.tex`, `paper.json`, venues, the
  per-venue `editio.mplstyle`, the golden contract). Tables/bib arrive with later phases.
- `.promptus/` — Organon's own knowledge (TELOS, ledger, findings + `lit/`, memory, schema),
  maintained via `kb-add` and shared by both plugins' development.
