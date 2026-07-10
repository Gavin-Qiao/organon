---
name: promptus-check
description: Run the authoritative Promptus whole-store health gate. Use to verify source/index freshness, stable-ID uniqueness, classification, typed relations, and optionally strict graph health.
---

# Promptus check — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-check.md` completely, then run its workflow using any requested
flags. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>` instead.
Report every failing category; never repair the derived cache by hand.
