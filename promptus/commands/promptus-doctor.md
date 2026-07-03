---
description: Diagnose this repo's Promptus layout and migrate it to the current .promptus/ namespace — version-aware, dry-run first, never edits a unit's content.
argument-hint: "[check|migrate] [--apply]"
---

# /promptus-doctor — check & migrate a Promptus project

Diagnose the current repository's Promptus layout and, if it is on an older one, migrate it to
the current `.promptus/` namespace. The tool is **version-aware** and **dry-run by default** — it
only ever MOVES store files, rewrites the vocab's `store` paths, narrows the `.gitignore`, and
rebuilds the derived index. It never edits a unit's content.

## Steps

1. **Diagnose (read-only).** Run check mode and read the report — the layout
   (`current` / `legacy-root` / `custom`), the vocab version, and the health flags: is the gate
   reachable (can the scripts find `.promptus/schema/kb-vocab.json`?), is the whole `.promptus/`
   wrongly gitignored, which stores are missing?
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" check --root .
   ```
2. **Preview the migration (dry-run).** If a migration is offered, show the operator the exact
   plan — which stores move where, the vocab upgrade, the `.gitignore` change — without touching
   anything:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" migrate --root .
   ```
3. **Apply — only after the operator confirms.** Migration moves files; in a repo with
   uncommitted work, commit or stash first so git records the moves as renames and the diff stays
   reviewable:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" migrate --apply --root .
   ```
4. **Verify.** The doctor rebuilds the index as its last step. Confirm the gate is back
   (`check --root .` now reports `current` + healthy) and spot-check retrieval with `kb-find`.
   The migration relocated units; it never rewrote their bodies.

## What it does NOT do

It does not edit any unit's content, does not touch files outside the declared stores (your
`src/`, `data/`, notes outside `docs/` are never moved), and does not commit — staging and
committing the renames is the operator's call.
