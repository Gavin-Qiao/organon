---
name: recall
description: Answer questions about recorded project knowledge or ground a claim in Promptus evidence, preserving provenance and epistemic status.
---

# Recall

Retrieve evidence for the question at hand. Resolve `<plugin-root>` two directories
above this `SKILL.md`; pass `--root` when the shell is outside the project.

```sh
bun "<plugin-root>/scripts/kb-find.ts" "<query>" --snippet
bun "<plugin-root>/scripts/kb-get.ts" "<path returned by kb-find>"
```

Start with ranked headers and fetch relevant bodies. Split a question when it
needs distinct pieces of evidence; a simple lookup needs no decomposition.
Reuse source material already read in context when it remains current.

`kb-find` caps results at 20. `--substrate` and `--status` narrow the search;
`--all` requires all unquoted terms; `+term` requires one term; quoted phrases
match exactly. `--history` includes archived units. `--hops` expands graph
neighbors. Use `--help` for details. `kb-get --title` disambiguates legacy entries
sharing a timestamp; an unanchored ledger fetch is refused.

For a conceptual question that uses different wording from the notes, an already
configured local QMD index can help: add `--semantic`. Results identify their route;
missing or stale semantic state falls back to fresh lexical search with a diagnostic.
Quoted phrases, required terms and `--all` stay lexical. Semantic defaults exclude
inactive/untrusted units; use explicit status or history when those are the subject.
Setup and refresh are separate actions (`kb-semantic --help`), not prerequisites
for recall. Do not install models or rebuild an index implicitly during a lookup.

## Interpret the evidence

- VALIDATED/RESOLVED findings and validated memory record checked knowledge;
  confirm the evidence supports the present claim and scope.
- CONJECTURED, provisional, CONFOUNDED, or UNTRUSTED material is not established.
- `lit:CITE` is attributable literature, not independent project validation.
- SUPERSEDED, REFUTED, RETIRED, and dead-end material explains history. Do not
  present it as the current accepted answer.
- A unit of kind REVIEW contains retrospective judgment. Retrieve its underlying
  evidence before reusing a consequential claim; it is not itself a new decision.

Read each cited body or the relevant external source. Explain uncertainty or
missing evidence directly. An empty search is a coverage gap, not proof that a
claim is false. Answer in the requested form with citations and confidence where
it matters; a fixed reporting template is unnecessary.
