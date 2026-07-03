---
name: grannie
description: Explain a concept in plain language, as if to a sharp, curious 90-year-old. Invoked as `/grannie explain <concept>`. Decides by judgement whether to look the concept up in the project store first (via the recall skill / kb-find) and ground the explanation, or just explain from general knowledge. When the editio plugin is installed, dials its humanizer's analogy, plain-word, and write-like-you-talk patterns to maximum accessibility; otherwise leans on the core patterns inlined below.
---

# grannie — explain a concept (ELI90)

Given `/grannie explain <concept>`, make it understandable to a sharp, curious 90-year-old —
someone with judgement and no jargon.

## Procedure

1. **Judge whether the concept lives in the store.** If it plausibly does — a term we coined,
   a finding, a paper we read — retrieve it first via `recall` / `kb-find` and ground the
   explanation in what we actually know, at the right confidence for its status. Otherwise,
   explain from general knowledge. *This lookup is automatic, by judgement — no flag.*
2. **Explain for a curious 90-year-old.** Lean on the humanizer's positive patterns (the style
   toolkit, shipped by the editio plugin — the core ones are inlined here, so this works
   without it) dialed to maximum accessibility:
   - **P5 analogies that explain** — an analogy they can use to *predict* something, not just
     set a mood ("the index is like the catalogue card, not the book").
   - **P6 plain, older words** — the shorter Anglo-Saxon word over the Latinate one.
   - **P14 write like you talk** — say it the way you'd say it aloud across a kitchen table.
   - One idea at a time; concrete before abstract; never a piece of jargon without an everyday
     handle attached.
3. **Stay honest about confidence.** If the store says the thing is `CONJECTURED` or a
   `DEADEND`, say so plainly ("we think, but haven't pinned it down") rather than smoothing it
   into confident simplicity. Accessible is not the same as overconfident.

## Shape

A short spoken-feeling explanation: one plain-language paragraph or two, an analogy that does
real work, and — if grounded — a quiet note of how sure we are and why. No headings, no
bullet lists, no "let's dive in." Read it back; if you wouldn't say it aloud, rewrite it.
