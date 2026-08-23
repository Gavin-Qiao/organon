---
name: thinker-round
description: Prepare, hand off, receive, and independently adjudicate a self-contained round for a stateless external theoretical reasoner. Use when a Promptus-managed project reaches a precise unresolved theoretical bottleneck and the operator will manually carry a workspace-free prompt to an outside thinker and return its response.
---

# Thinker round — portable workflow adapter

Resolve `<plugin-root>` as the absolute directory two levels above this `SKILL.md`. Read
`<plugin-root>/commands/thinker-round.md` completely, then run the appropriate stage of that
workflow.

Treat the external thinker as a sharp but untrusted conjecture generator: it receives only the
sealed prompt, has no workspace or session context, and grants no authority by sounding
confident. The operator transports both directions. Preserve the returned response before
interpreting it, then independently test its claims and store only the surviving project result.

Keep the round useful and small. Ask one load-bearing theoretical question; do not turn the
workflow into a general review queue, an approval system, or paperwork around ordinary agent
reasoning.
