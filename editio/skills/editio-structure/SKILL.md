---
name: editio-structure
description: Frame a paper's argument and write its sections — pick a section order (imrad, cs-systems, theory), build the narrative arc (funnel intro, gap, contributions mapped 1:1 to results), draft the abstract last from the summary-paragraph formula, and keep every section inside the DoCO/DEO structure gate. Use when starting a paper's skeleton, writing or restructuring a section, or fixing a broken arc. Grounds claims through promptus recall as it writes.
---

# editio-structure — the argument before the prose

The highest-leverage editio skill: a paper is an argument with sections as its stages. The
structure gate (`.editio/schema/doco-deo.json`) keeps every section a real DEO/DoCO class;
this skill keeps the classes telling one story.

## Procedure

1. **Pick the order** that matches the argument, not habit: `imrad` (empirical), `cs-systems`
   (artifact + evaluation), `theory` (problem → model → results). Scaffold seeds the stubs:
   `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-scaffold.ts" --order cs-systems`.
   The schema carries more classes than the three presets use (`deo:Materials`,
   `deo:FutureWork`, `deo:Contribution`, `doco:Appendix`) — reach them by adding a custom
   order to the project's own `.editio/schema/doco-deo.json` copy (it's project-tunable;
   that's why the scaffold copies it) and naming it in `paper.json`. A paper that outgrows
   its declared order should update it the same way — `editio-doctor` flags the drift.
2. **Write the contribution list first** — one claim per contribution, each traceable to a
   store unit (`recall` it now, not later), each with a results/evaluation section that will
   cash it. A contribution without a section that proves it is a promise; cut it or plan it.
3. **The introduction is a funnel**: field → problem → gap → this paper. One paragraph each.
   The gap sentence is load-bearing — it must be a *checkable* claim about prior work, so wrap
   it in a span and ground it against the lit store.
4. **Per section**: front-matter `class` stays honest (Methods that argue are Discussion);
   one claim per paragraph, topic sentence first (a reviewer skims topic sentences — read just
   yours and check the argument still stands); wrap checkable claims in `{.claim}` spans as
   you write, ungraded is fine.
5. **The abstract comes last**, from the summary-paragraph formula: context (1–2 sentences) →
   problem → "here we show" → key result with a number → why it matters. Write it as five
   to six sentences before styling it as prose.
6. **Budgets**: set `budget:` in front-matter per section (words); trim before polishing —
   cutting styled prose wastes the styling.

Then render (`editio-render`), audit (the loop in the `editio` skill), and only then polish
voice with `humanizer`.

## The craft references

`references/exemplars.md` — practices distilled from known well-written papers (pointers, not
content), plus the writing-craft canon. Read it when a section fights you; steal the *moves*,
never the sentences.

## Done-when (per section)

Gate-valid class · topic-sentence skim reads as an argument · every checkable claim in a span
· grounded or consciously ungraded · within budget.
