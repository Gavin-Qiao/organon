---
name: promptus-checkpoint
description: Flush perishable session state before compaction — store unrecorded decisions, results, sources, and digested findings; refresh NOW and memory; check Telos drift; then re-index. Use before compaction or a long-session handoff.
---

# Promptus checkpoint — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/checkpoint.md` completely, then execute that workflow. Whenever that file
uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>` instead. This is a check-and-add
flush: use `kb-add`/`kb-now`, never hand-edit the ledger, and never invent a store entry.
