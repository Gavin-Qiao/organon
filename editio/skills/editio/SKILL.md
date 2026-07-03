---
name: editio
description: Academic-writing orchestrator — turn a promptus store's validated knowledge into a defensible, submittable paper. Use when starting, resuming, structuring, rendering, or auditing a paper (/editio), or deciding which editio piece does a job. Knows the paper workspace (.editio/paper/), the markdown-is-truth rule, the three renders (draft/publish/blind), the DoCO/DEO structure gate, and the audit loop that grades every claim against the store.
---

# editio — the paper read-port

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
| start or resume a paper | `/editio` (checks the store, scaffolds or reports state) |
| lay down / rebuild the workspace for a venue | `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-scaffold.ts" --venue arxiv` |
| frame the argument, seed and write sections | the `editio-structure` skill |
| render markdown sections to LaTeX | `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-render.ts" --all` |
| build the PDF, preview one section, set up TeX, notation | the `editio-latex` skill |
| ground a claim before it hits the page | promptus's `recall` (kb-find → kb-get) |
| audit a draft's claims + AI tells | the `grounded-writing-reviewer` agent, then apply its grades (below) |
| fix the voice / de-AI a passage | the `humanizer` skill |
| figures, tables, bibliography, venue packaging, rebuttal | `editio-figures` / `editio-tables` / `editio-bib` / `editio-venue` / `editio-rebuttal` (later phases; not yet shipped) |

## The invariant (inherited from promptus, applied to manuscripts)

Markdown is the only source of truth — the `.tex` siblings are derived and disposable
(regenerate any time; the header comment says so). Evidence truth stays in the store. The
renderer **never blocks**: ungraded and unsourced claims render (tinted in draft); enforcement
— zero `.unsourced`, no overclaims — is a lint gate at publish time, not a render failure.
Identity lives in `paper.json` only, scaffolded as placeholders.

## The audit loop (the hinge)

1. **Draft** — write prose in `sections/<slug>.md`; wrap checkable claims in spans:
   `[the gate refuses off-vocab writes]{.claim}` (ungraded is fine — grading comes next).
2. **Retrieve** — `recall` looks each claim up (`kb-find` → `kb-get`), returns `substrate:status`.
3. **Grade** — the `grounded-writing-reviewer` agent (read-only) reports a grade per span:
   `finding:VALIDATED`/`lit:CITE` → `.validated` · `CONJECTURED`/provisional → `.conjectured`
   · nothing found → `.unsourced` · `DEADEND`/`REFUTED` backing the claim → an **overclaim** flag.
4. **Apply + override** — *you* (the session) write the grades back into the spans, adding
   `grounds=<handle>`; the author accepts, overrides in-span with a reason
   (`override="holds for our corpus"`), or fixes the prose / stores the evidence.
5. **Render** — grades become `\claimV` (clean) / `\claimC` (amber) / `\claimU` (vermilion) /
   `\claimG` (grey, ungraded) on the draft page.
6. **Gate** — publish target: zero unsourced, zero overclaims, nothing left ungraded.
   `publish`/`blind` strip every tint either way.

## Three renders, one source

`main.tex` defaults `\editiomode` to `draft`; `publish` collapses annotations; `blind`
additionally masks `\selfcite`, drops `\blindhide{…}` blocks, and swaps the author block for
the anonymous label from `paper.json`. Venue is orthogonal (a class + data swap).

## When NOT to use editio

- No store behind the claims → it's typesetting, not grounded writing; build the store first
  (or accept every claim staying `.unsourced`).
- A one-off memo or README → plain writing + `humanizer`; the paper machinery earns nothing.
