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
4. **Resume report.** Read `sections/*.md` front-matter and give a one-line status per
   section: class · status · grounds count · a claim-span tally (graded vs ungraded).
5. **Route the next step**, exactly one:
   - skeleton just created → `editio-structure` (contribution list + funnel intro first);
   - sections drafted but ungraded spans remain → the audit loop (`editio` skill, step 2–4);
   - graded and clean → render + build:
     `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-render.ts" --all && latexmk main.tex`
     (run inside `.editio/paper/`);
   - building fine → next phase work (figures/tables/bib) or `humanizer` for voice.
6. **Before any submission talk**: the publish gate — no ungraded, no unsourced, no
   overclaims; build `publish` (and `blind` if the venue is double-blind) per `editio-latex`.
