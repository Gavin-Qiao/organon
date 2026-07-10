---
name: promptus-doctor
description: Diagnose or migrate a Promptus store layout. Use for version-aware layout checks, dry-run migration planning, current-namespace repair, or store reachability problems.
---

# Promptus doctor — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-doctor.md` completely, then execute the requested check or migration
workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>` instead.
Migration remains dry-run until the operator explicitly confirms `--apply`.
