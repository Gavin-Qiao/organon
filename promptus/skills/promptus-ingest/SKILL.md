---
name: promptus-ingest
description: Curate collected research into provenance-bearing literature units. Use to backfill sources, promote a misfiled note, or quarantine untrusted thinker output without inventing provenance or validating claims.
---

# Promptus ingest — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-ingest.md` completely, then execute the requested backfill or
promotion or quarantine workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved
`<plugin-root>` instead. Preserve the workflow's dry-run and provenance boundaries.
