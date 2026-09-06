---
description: Start or resume an Editio manuscript and continue the requested writing, rendering, or audit work.
argument-hint: "[venue]"
---

# /editio — start or resume the paper

Use the checks relevant to the requested outcome. A status request ends with the
report; a writing or implementation request continues through the applicable work
and verification. Choosing the next operation is not a stopping condition.
Resolve `<plugin-root>` from the loaded Editio skill or command location; do not
assume host-specific environment variables exist in the project shell.

1. **The store first.** A paper needs evidence behind it: confirm `.promptus/` exists (the
   promptus plugin's store). Missing → offer `/promptus:promptus-init`; a paper without a
   store keeps every claim `.unsourced`, say so honestly.
2. **TeX when building.** Check `latexmk -v` when the request needs a PDF build.
   Use `editio-latex` for a missing toolchain. Writing, status inspection, and
   Markdown-to-LaTeX rendering do not require installing TeX first.
3. **Workspace.** For status/audit-only requests, report a missing workspace without creating it.
   When starting a paper is requested and `.editio/paper/` is absent, scaffold it (venue from `$ARGUMENTS`, default arxiv;
   `nmi` selects the Article contract; `neurips` selects the official-kit adapter):
   `bun "<plugin-root>/scripts/editio-scaffold.ts" --venue <id>` — then tell the user
   `paper.json` is where title/authors go (placeholders ship; nobody's identity is assumed).
4. **Resume report.** Run `bun "<plugin-root>/scripts/editio-status.ts"` — one line
   per section (class · status · grounds count · claim tally) plus grounds health against
   the store; `--claims` locates each ungraded/unsourced span when the audit loop is next.
   The per-section **words** column is the resume signal: ~0 words everywhere = a fresh
   skeleton (route to structure), words without claims = drafted but unaudited. On an
   existing workspace with suspected drift or a requested full audit, use
   `bun "<plugin-root>/scripts/editio-doctor.ts"` — it
   names any drift between the workspace and the installed plugin (stale scaffold,
   declared-order drift, missing or drifted official venue assets, hand-finished metadata,
   unrendered or unwired sections, identity in prose, and venue budgets); surface its flags,
   carry out routine fixes covered by the request while preserving authored content.
5. **Continue the applicable work:**
   - skeleton just created → `editio-structure` (contribution list + funnel intro first);
   - sections drafted but ungraded spans remain → the audit loop (`editio` skill, step 2–4);
   - requested LaTeX output → `bun "<plugin-root>/scripts/editio-render.ts" --all`;
     add `latexmk main.tex` inside `.editio/paper/` only when the request includes a PDF;
   - requested figure or voice work → `editio-figures` (claim-first, sized to the
     venue slot, gated by `editio-figcheck.ts`) or `humanizer`.
6. **Before declaring a manuscript ready for submission**: the publish gates —
   `bun "<plugin-root>/scripts/editio-status.ts" --gate` (no ungraded, no
   unsourced, no overclaims) and
   `bun "<plugin-root>/scripts/editio-numbers.ts" --gate` (every bound number
   fresh against its sources, or pinned on the record) must both pass; then build
   `publish` (and `blind` if the venue is double-blind) per `editio-latex`.
