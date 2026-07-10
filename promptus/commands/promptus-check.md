---
description: Rebuild and verify the whole Promptus store — freshness, stable IDs, classification, typed relations, and optional strict graph health.
argument-hint: "[--strict-graph] [--json] [--no-index]"
---

# /promptus:promptus-check — authoritative store health

From the project root, run:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-check.ts" --strict $ARGUMENTS
```

Report the unit/source counts, source fingerprint, and every failing category. Normal strict
mode rejects stale indexes, duplicate IDs, unresolved typed relations, and unclassified units;
dangling wikilinks and orphans remain visible warnings. When `--strict-graph` is supplied, graph
debt is blocking too. Do not edit `.promptus/cache/` by hand; rebuild it.
