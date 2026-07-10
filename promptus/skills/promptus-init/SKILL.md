---
name: promptus-init
description: Initialize Promptus in the current repository — scaffold the four stores and portable AGENTS.md cadence, seed the mandate through the gate, and smoke-test retrieval. Use when a project needs a new .promptus store.
---

# Promptus init — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/promptus-init.md` completely, then execute that workflow using the current
request as its arguments. Whenever that file uses the Claude adapter's plugin-root variable, use the resolved
`<plugin-root>` instead. The workflow is idempotent; never clobber an existing store.
