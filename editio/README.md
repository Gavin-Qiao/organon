# editio

The academic-writing toolchain for [Claude Code](https://claude.com/claude-code), part of the
[Organon](../README.md) marketplace. editio is [promptus](../promptus/README.md)'s paper
read-port: it turns what the store has **validated** into a defensible, submittable paper —
every claim on the page traces to a store unit at a known status, and the draft render makes
that status visible before a reviewer does.

**Status: pre-release** (the design of record is `.promptus/docs/editio-design-memo.md` plus
the organon research ledger). What ships today — the Phase 1–2 spine, compile-verified in all
three modes:

- **`/editio`** — start or resume a paper end to end.
- **`editio`** (orchestrator) — the map, the invariant, and the audit loop that grades every
  claim span against the store.
- **`editio-structure`** — the argument before the prose: orders (imrad / cs-systems /
  theory), contribution-first framing, the abstract formula, and craft distilled from
  exemplary papers (`references/exemplars.md`).
- **`editio-latex`** — TeX setup in minutes (the toolchain stays yours), venue-driven
  scaffolding, three-mode builds, single-section previews, notation conventions.
- **`editio-scaffold.ts` / `editio-render.ts`** — the reference scripts: an idempotent
  workspace scaffold (identity lives in `paper.json` only, placeholders by default) and the
  bespoke md→tex renderer behind a golden contract (`templates/contract/`) any swapped-in
  renderer must pass.
- **`humanizer`** — the style toolkit (Part I de-AI + Part II positive human patterns),
  moved here from promptus. Invoked directly, or dialed by promptus's `grannie`.

Later phases add: `editio-figures` (panel-first, venue-sized, statistically honest),
`editio-tables`, `editio-bib` (`refs.bib` from the lit store), `editio-repro`,
`editio-venue`, `editio-rebuttal`, `editio-lint` (the publish gate).

## Prerequisite: promptus

editio reuses promptus at the skill level — `recall` grounds every claim, and the
`grounded-writing-reviewer` agent audits drafts against the store. Install both plugins:

```
/plugin marketplace add Gavin-Qiao/organon
/plugin install promptus@organon
/plugin install editio@organon
```

## License

GPL-3.0 (see the repo-root `LICENSE`). The `skills/humanizer` fork preserves the upstream
[blader/humanizer](https://github.com/blader/humanizer) MIT notice in [`NOTICE`](NOTICE).
