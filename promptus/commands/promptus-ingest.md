---
description: Curate already-collected deep-research into provenance-bearing lit units — backfill a source onto existing lit notes, or promote an external note out of the finding store. Never invents a source.
argument-hint: "[backfill | promote <file> --source <s>] [--apply]"
---

# /promptus-ingest — give deep-research notes their provenance

Convert external-knowledge notes into well-formed `lit` units carrying the `source` the substrate
requires. This is the **curate** verb — distinct from `kb-add` (which authors a *new* unit) and the
doctor (which only *moves* a layout). It derives `source` **only from what is already recorded** —
a ledger run-id, the note's own citation, or a value you pass — and **flags, never invents**, when
nothing is recoverable. Dry-run by default.

## Steps

1. **Backfill existing lit notes.** For notes already in `.promptus/docs/lit/` that lack a `source`,
   preview then apply:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-ingest.ts" backfill --root .
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-ingest.ts" backfill --apply --root .
   ```
   It reports, per note, how the source was derived (ledger run-id / own citation) or that it was
   **FLAGGED** — a flagged note needs a `source` you add by hand; the script will not guess one.

2. **Promote a misfiled external note.** When a genuinely-external note (a literature/prior-art/
   positioning survey) is sitting in the finding store, reclassify it — but decide `lit` vs `finding`
   deliberately: a note that *reports what others found* is `lit`; a note that *tests or builds on*
   that prior art is a `finding`. Then:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-ingest.ts" promote .promptus/docs/<file>.md \
       --source "<provenance>" --kind NOTE --apply --root .
   ```
   The move replaces any stale frontmatter (it won't stack a second block) and fixes the relative
   links the move breaks. The prose is never edited.

3. **Re-index + verify.** `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts"`, then confirm the units
   read `lit:<status>` with their `source`, and spot-check retrieval (`kb-find` by topic *and* by
   the run-id/source).

## What it does NOT do

It does not invent a source, edit a unit's prose, or decide `lit`-vs-`finding` for you — that
classification is yours. Default `status` is `BACKGROUND` (reference knowledge); promote a unit to
`CITE` by hand when you actually lean on it.
