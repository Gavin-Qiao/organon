---
description: Diagnose this repo's Promptus layout and book-keep it onto the current .promptus/ namespace — version-aware, dry-run first, never edits a unit's content.
argument-hint: "[check|migrate|upgrade] [--apply]"
---

# /promptus-doctor — check, migrate, and book-keep a Promptus project

Diagnose the current repository's Promptus layout and, if it is on an older one, migrate it to
the current `.promptus/` namespace. On a repo that is already namespaced, book-keep the store:
merge a behind-template vocab (keeping custom extended terms), narrow `.gitignore` to the
cache, rebuild the derived index, and optionally record a debt baseline. The tool is
**version-aware** and **dry-run by default** — it only ever MOVES store files, merges the vocab,
narrows the `.gitignore`, rebuilds the derived index, and writes `.promptus/schema/health-baseline.json`.
It never edits a unit's content. A current-layout repo is **not** reported fully healthy while
those upgrades remain.

## Steps

1. **Diagnose (read-only).** Run check mode and read the report — the layout
   (`current` / `legacy-root` / `custom`), the vocab version versus the template, scale
   (units, ledger events), and the health flags: is the gate reachable, is the whole
   `.promptus/` wrongly gitignored, catalog/digest lag, Telos hygiene, governed thinker-exchange
   integrity, extra ungoverned trees (including legacy `.promptus/thinker/` prose without the
   protocol marker), inherited vs new dangling/orphan debt?
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" check --root .
   ```
2. **Preview the plan (dry-run).** If a layout migration or a current-layout upgrade is
   offered, show the operator the exact plan without touching anything:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" migrate --root .
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" upgrade --root .
   ```
   `upgrade` is an alias of `migrate`. On an already-namespaced store it still does real
   work (vocab merge, gitignore, reindex, optional baseline) — it is not a no-op.
3. **Apply — only after the operator confirms.** Migration moves files; in a repo with
   uncommitted work, commit or stash first so git records the moves as renames and the diff stays
   reviewable. `--apply` never rewrites ledger, finding, lit, memory, or Telos unit bodies.
   Pass `--record-baseline` only when you want today's classification/link/orphan debt recorded
   as the ratchet ceiling:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" upgrade --apply --root .
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-doctor.ts" upgrade --apply --record-baseline --root .
   ```
4. **Verify.** The doctor rebuilds the index as its last step. Confirm `check --root .`
   reports `current` and that remaining flags (extra trees, Telos hygiene, digest lag,
   inherited debt) are named rather than silently "healthy". Spot-check retrieval with
   `kb-find`. The upgrade relocated or book-kept files; it never rewrote unit bodies.

## What it does NOT do

It does not edit any unit's content, does not heal historical `[[links]]` or unclassified notes,
does not touch files outside the declared stores (your `src/`, `data/`, notes outside `docs/`
are never moved), does not delete a governed thinker exchange or any extra tree, and does not
commit — staging and committing the book-keeping is the operator's call.
