---
name: promptus-graph
description: Inspect the Promptus knowledge graph. Use to rank load-bearing units, lint dangling links and orphans, or suggest related-but-unlinked notes without embeddings.
---

# Promptus graph — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-graph.md` completely, then execute the requested rank, lint, or
suggest workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>`
instead. The workflow is read-only; suggestions never authorize automatic link edits.
