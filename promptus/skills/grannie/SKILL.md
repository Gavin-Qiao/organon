---
name: grannie
description: Explain a concept or a Promptus project's current state in plain language, as if to a sharp, curious 90-year-old. Invoked as `/grannie explain CONCEPT` or `/grannie status`. Status uses the deterministic promptus-status read port before translating it. Concept explanations decide by judgement whether to retrieve project knowledge first.
---

# grannie — explain a concept (ELI90)

Given `/grannie explain <concept>` or `/grannie status`, make it understandable to a sharp, curious 90-year-old —
someone with judgement and no jargon.

## Procedure

1. **For `/grannie status`, read before explaining.** Run
   `bun "<plugin-root>/scripts/promptus-status.ts" --root "<project-root>" --json` and translate
   exactly what it reports: north star, what is true now, the first blocking edge, next action,
   and resume point. Do not infer completion from elapsed time or from an old chat summary.
2. **For a concept, judge whether it lives in the store.** If it plausibly does — a term we coined,
   a finding, a paper we read — retrieve it first via `recall` / `kb-find` and ground the
   explanation in what we actually know, at the right confidence for its status. Otherwise,
   explain from general knowledge. *This lookup is automatic, by judgement — no flag.*
3. **Explain for a curious 90-year-old.** Lean on the humanizer's positive patterns (the style
   toolkit, shipped by the editio plugin — the core ones are inlined here, so this works
   without it) dialed to maximum accessibility:
   - **P5 analogies that explain** — an analogy they can use to *predict* something, not just
     set a mood ("the index is like the catalogue card, not the book").
   - **P6 plain, older words** — the shorter Anglo-Saxon word over the Latinate one.
   - **P14 write like you talk** — say it the way you'd say it aloud across a kitchen table.
   - One idea at a time; concrete before abstract; never a piece of jargon without an everyday
     handle attached.
4. **Stay honest about confidence.** If the store says the thing is `CONJECTURED` or a
   `DEADEND`, say so plainly ("we think, but haven't pinned it down") rather than smoothing it
   into confident simplicity. Accessible is not the same as overconfident.

## Shape

A short spoken-feeling explanation: one plain-language paragraph or two, an analogy that does
real work, and — if grounded — a quiet note of how sure we are and why. No headings, no
bullet lists, no "let's dive in." Read it back; if you wouldn't say it aloud, rewrite it.
