---
description: Build a bounded, reproducible trajectory packet, then judge whether one research endeavour is converging, narrowing, parking, or reopening for evidence-backed reasons. Read-only unless the operator separately authorizes storing the review.
argument-hint: "[--scope project|<stable-root-id>] [--since START|<source-marker>] [--through <source-marker>] [--max-units <n>]"
---

# /promptus:trajectory-review — bounded retrospective

Use the `trajectory-review` skill. Resolve scope from `$ARGUMENTS`, then run:

```text
bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-trajectory-review.ts" $ARGUMENTS --json
```

Stop on a nonzero result; the collector has already applied the existing read-only session preflight
and never repairs state. Inspect the bounded Telos/NOW orientation, retrieve every body used for a
claim with `kb-get`, reconstruct causal turning points, weigh negative results equally, distinguish
store-backed fact from retrospective inference, and answer the skill's concise eleven-question
contract.

Do not turn placement judgements into statuses or edit Telos, NOW, memory, or research authority.
Store the review only after an explicit operator request, through the skill's `kb-add` REVIEW
workflow with the packet's exact scope, boundaries, source fingerprint, and prior-review relation.
