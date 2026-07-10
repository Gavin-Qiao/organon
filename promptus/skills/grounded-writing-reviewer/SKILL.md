---
name: grounded-writing-reviewer
description: Audit a draft for both AI-writing tells and unsupported or over-confident claims. Use before prose ships or when grading editio claim spans against the Promptus store.
---

# Grounded writing reviewer — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/agents/grounded-writing-reviewer.md` completely and follow its two-pass, read-only
review workflow. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved `<plugin-root>`
instead. Report precise findings and fixes; do not rewrite the draft.
