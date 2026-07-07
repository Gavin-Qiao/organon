---
description: Start or resume a paper end to end — check the promptus store, scaffold .editio/paper/ for a venue, report section status, and route the next step (structure → render → build → audit). Run with no argument to resume, or a venue id (arxiv, tpami) to start.
argument-hint: "[venue]"
---

# /editio — start or resume the paper

Work through this checklist, then stop at the single next action.

1. **The store first.** A paper needs evidence behind it: confirm `.promptus/` exists (the
   promptus plugin's store). Missing → offer `/promptus:promptus-init`; a paper without a
   store keeps every claim `.unsourced`, say so honestly.
2. **TeX present?** `latexmk -v` — if absent, run the 5-minute setup in the `editio-latex`
   skill (interactive; the user picks the distribution).
3. **Workspace.** No `.editio/paper/` → scaffold it (venue from `$ARGUMENTS`, default arxiv):
   `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-scaffold.ts" --venue <id>` — then tell the user
   `paper.json` is where title/authors go (placeholders ship; nobody's identity is assumed).
4. **Resume report.** Run `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-status.ts"` — one line
   per section (class · status · grounds count · claim tally) plus grounds health against
   the store; `--claims` locates each ungraded/unsourced span when the audit loop is next.
   The per-section **words** column is the resume signal: ~0 words everywhere = a fresh
   skeleton (route to structure), words without claims = drafted but unaudited. On an
   existing workspace, also `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-doctor.ts"` — it
   names any drift between the workspace and the installed plugin (stale scaffold,
   declared-order drift, missing venue discipline, hand-finished metadata, unrendered or
   unwired sections, identity in prose); surface its flags, the fixes are the author's call.
5. **Route the next step**, exactly one:
   - skeleton just created → `editio-structure` (contribution list + funnel intro first);
   - sections drafted but ungraded spans remain → the audit loop (`editio` skill, step 2–4);
   - graded and clean → render + build:
     `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-render.ts" --all && latexmk main.tex`
     (run inside `.editio/paper/`);
   - building fine → figures through the `editio-figures` skill (claim-first, sized to the
     venue slot, gated by `editio-figcheck.ts`), or `humanizer` for voice.
6. **Before any submission talk**: the publish gates —
   `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-status.ts" --gate` (no ungraded, no
   unsourced, no overclaims) and
   `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-numbers.ts" --gate` (every bound number
   fresh against its sources, or pinned on the record) must both pass; then build
   `publish` (and `blind` if the venue is double-blind) per `editio-latex`.
