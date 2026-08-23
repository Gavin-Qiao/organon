---
description: Verify source/NOW freshness, artifacts, stable IDs, classification, typed relations, thinker custody, and full or ratcheted graph health.
argument-hint: "[--ratchet | --record-baseline] [--strict-graph] [--json] [--no-index]"
---

# /promptus:promptus-check — authoritative store health

From the project root, choose exactly one profile. For ordinary zero-classification-debt health,
run:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-check.ts" --strict $ARGUMENTS
```

If `$ARGUMENTS` contains `--ratchet` or `--record-baseline`, omit the implicit `--strict` and pass
the arguments directly; combining `--strict` with the ratchet would defeat its inherited-debt
contract.

Report the unit/source counts, source fingerprint, NOW marker, artifact count, and every failing
category. Normal strict mode rejects stale state, duplicate IDs, unresolved relations, invalid
artifacts owned by current units, damaged sealed thinker exchanges, and unclassified units;
artifact drift owned by a unit made `SUPERSEDED` through a resolved lifecycle relation is reported
as an archival warning without blocking current work. Graph debt remains visible. Use `--record-baseline` once to name
inherited classification/graph debt, then `--ratchet` to reject only newly introduced debt.
`--strict-graph` instead requires zero graph debt. Never edit the cache or baseline by hand.
