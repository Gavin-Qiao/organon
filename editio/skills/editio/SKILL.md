---
name: editio
description: Academic-writing orchestrator — turn a promptus store's validated knowledge into a defensible, submittable paper. Use when starting, resuming, structuring, rendering, or auditing a paper, or deciding which editio piece does a job. Knows the paper workspace, markdown-is-truth, three renders, the DoCO/DEO structure gate, and the evidence-calibrated audit loop.
---

# editio — the paper read-port

**Portable path rule:** in commands below, replace `<plugin-root>` with the absolute plugin root
two directories above this `SKILL.md`. Resolve it from the loaded skill path; do not assume a
host-specific environment variable exists in the project shell.

editio turns what the store has **validated** into a paper that can defend itself: content is
authored as per-section markdown under `.editio/paper/`, rendered to LaTeX, and built in three
modes from one source. Every checkable claim on the page traces to a store unit at a known
status, and the draft render makes that status *visible* before a reviewer sees it.

**Prerequisite:** the promptus plugin (a `.promptus/` store in the host repo). editio reuses it
at the skill level — `recall` grounds claims, the `grounded-writing-reviewer` audits drafts.
A TeX distribution is the user's own (see `editio-latex` for the 5-minute setup).

## Decision table — intent → do this

| You want to… | Use |
|---|---|
| start or resume a paper | read and execute `<plugin-root>/commands/editio.md` (the `/editio` adapter in Claude Code) |
| lay down / rebuild the workspace for a venue | `bun "<plugin-root>/scripts/editio-scaffold.ts" --venue arxiv` |
| frame the argument, seed and write sections | the `editio-structure` skill |
| render markdown sections to LaTeX | `bun "<plugin-root>/scripts/editio-render.ts" --all` |
| build the PDF, preview one section, set up TeX, notation | the `editio-latex` skill |
| ground a claim before it hits the page | promptus's `recall` (kb-find → kb-get) |
| see where the paper stands (per-section claim tallies, drafted words vs `budget:`, grounds health) | `bun "<plugin-root>/scripts/editio-status.ts"` (`--claims` lists each ungraded/unsourced span at file:line) |
| audit a draft's claims + AI tells | the `grounded-writing-reviewer` skill, then apply its grades (below) |
| run the publish gate (no ungraded / unsourced / overclaims) | `bun "<plugin-root>/scripts/editio-status.ts" --gate` (exit 1 on violations) |
| check the workspace against the installed plugin (stale scaffold, declared-order drift, venue drift, hand-finished metadata, unrendered/unwired sections, identity in prose, stray PDFs in the source root, gitignored/untracked sources, builds over the venue page limit, naked file paths in prose) | `bun "<plugin-root>/scripts/editio-doctor.ts"` (report-only; `--strict` exits 1 for CI) |
| change the title / authors / corresponding author everywhere at once | edit `paper.json`, then `bun "<plugin-root>/scripts/editio-identity.ts"` (or `editio-render --all`) — regenerates `front/identity.tex`, the data macros every document assembles from |
| bind a result value once, reference it everywhere (`@num:handle`) | the `editio-numbers` skill + `numbers.json`; `bun "<plugin-root>/scripts/editio-numbers.ts" --write` |
| verify the paper's numbers still match their sources | `bun "<plugin-root>/scripts/editio-numbers.ts"` (`--gate` exits 1 on unknown/stale/unwritten bindings) |
| fix the voice / de-AI a passage | the `humanizer` skill |
| design, size, caption, or color a figure | the `editio-figures` skill (claim-first; venue widths from `venue.json`) |
| verify a figure PDF is the slot size | `bun "<plugin-root>/scripts/editio-figcheck.ts" <fig.pdf> --slot single` |
| tables, bibliography, venue packaging, rebuttal | `editio-tables` / `editio-bib` / `editio-venue` / `editio-rebuttal` (later phases; not yet shipped) |

## The invariant (inherited from promptus, applied to manuscripts)

Markdown is the only source of truth — the `.tex` siblings are derived and disposable
(regenerate any time; the header comment says so). Evidence truth stays in the store. The
renderer **never blocks**: ungraded and unsourced claims render (tinted in draft); enforcement
— zero `.unsourced`, no overclaims — is a lint gate at publish time, not a render failure.
Identity lives in `paper.json` only, scaffolded as placeholders — and it reaches the
documents as generated data macros (`front/identity.tex`, via `editio-identity`), never
hand-written: one paper.json edit updates the title, author block, and bios everywhere.

## The audit loop (the hinge)

1. **Draft** — write prose in `sections/<slug>.md`; wrap checkable claims in spans:
   `[the gate refuses off-vocab writes]{.claim}` (ungraded is fine — grading comes next).
2. **Retrieve** — `recall` looks each claim up (`kb-find` → `kb-get`), returns `substrate:status`.
3. **Grade** — the `grounded-writing-reviewer` skill (read-only) reports findings per
   *flagged* span (unsupported / over-confident / style tells); *you* map them to grades:
   `finding:VALIDATED`/`lit:CITE` → `.validated` · `CONJECTURED`/provisional → `.conjectured`
   · nothing found → `.unsourced` · `DEADEND`/`REFUTED` backing the claim → an **overclaim** flag.
4. **Apply + override** — *you* (the session) write the grades back into the spans, adding
   `grounds=<handle>`; the author accepts, overrides in-span with a reason
   (`override="holds for our corpus"`), or fixes the prose / stores the evidence.
5. **Render** — grades become `\claimV` (clean) / `\claimC` (amber) / `\claimU` (vermilion) /
   `\claimG` (grey, ungraded) on the draft page.
6. **Gate** — `editio-status --gate`: zero overclaims (a `.validated` claim over weak,
   unknown, or **absent** grounds), nothing left ungraded, and every `.unsourced` claim
   either fixed or explicitly accepted. `override="reason"` passes the gate **on the
   record** exactly twice over: on an `.unsourced` claim (the author's acceptance, printed
   in the gate output) and on a `.validated` claim's weak/unknown grounds — never on an
   ungraded span (ungraded means the loop hasn't run; the fix is running it, not excusing
   it). `publish`/`blind` strip every tint either way.

## Three renders, one source

`main.tex` defaults `\editiomode` to `draft`; `publish` collapses annotations; `blind`
additionally masks `\selfcite`, drops `\blindhide{…}` blocks, and swaps the author block for
the anonymous label from `paper.json`. Venue is orthogonal (a class + data swap).

## When NOT to use editio

- No store behind the claims → it's typesetting, not grounded writing; build the store first
  (or accept every claim staying `.unsourced`).
- A one-off memo or README → plain writing + `humanizer`; the paper machinery earns nothing.
