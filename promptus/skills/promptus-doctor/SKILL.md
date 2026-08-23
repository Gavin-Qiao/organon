---
name: promptus-doctor
description: Diagnose, migrate, or book-keep a Promptus store. Use for version-aware layout checks, dry-run migration/upgrade planning, current-namespace vocab merge (keeping custom terms), governed thinker-exchange integrity, extra-tree reports, or store reachability problems. Never rewrite unit bodies.
---

# Promptus doctor — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-doctor.md` completely, then execute the requested check, migration,
or upgrade workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>` instead.
Migration and upgrade remain dry-run until the operator explicitly confirms `--apply`. `--apply`
never edits unit bodies.
