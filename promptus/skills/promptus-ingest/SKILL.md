---
name: promptus-ingest
description: Curate collected research into provenance-bearing literature units. Use to backfill recoverable sources or promote a misfiled external note without inventing provenance.
---

# Promptus ingest — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-ingest.md` completely, then execute the requested backfill or
promotion workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved
`<plugin-root>` instead. Preserve the workflow's dry-run and provenance boundaries.
