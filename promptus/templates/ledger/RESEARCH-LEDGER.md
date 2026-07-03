# Research Ledger — <PROJECT NAME>

**Updated:** <YYYY-MM-DD HH:MM TZ>  ·  **Operator:** <name>  ·  **Agent:** <model>
**Timezone:** <e.g. America/Montreal (UTC-4)> — all timestamps below use it.

> Append-only. Never hand-edit a `### [ts] …` entry. Units enter through
> `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate ledger …` — the script owns the timestamp, id,
> and placement (the drift fix). Supersede a prior claim with `--supersedes <id>` (it marks the target SUPERSEDED).
> Refresh the **NOW-header** (between `<!-- now:start -->` / `<!-- now:end -->`) through `kb-now` at
> `/checkpoint` — it owns the `Updated:` stamp; keep it to ~a screenful.

## Mandate
<The operator's directive, quoted verbatim, with date. The invariant the work serves.>

## Thesis / approach
<One paragraph: the method or claim being built.>

## Guardrails
- <Standing rules: what not to optimize for; what never bends.>

<!-- now:start -->
## NOW
<3–6 lines: what is true today.>

## Open frontier
- [ ] <OPEN question / next lever>

## Next actions
1. <the single most important next step>

## <<< RESUME HERE AFTER COMPACTION >>>
<One paragraph: exactly where to pick up — which files matter, what was in flight.>

<!-- now:end -->

## Glossary
- `<term>` — <one-line definition>

## Log

<!-- kb:append-point -->
