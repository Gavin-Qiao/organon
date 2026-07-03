# editio

The academic-writing toolchain for [Claude Code](https://claude.com/claude-code), part of the
[Organon](../README.md) marketplace. editio is [promptus](../promptus/README.md)'s paper
read-port: it turns what the store has **validated** into a defensible, submittable paper —
every claim on the page traces to a store unit at a known status, and the draft render makes
that status visible before a reviewer does.

**Status: pre-release.** The design is complete and stored in the organon research ledger
(`.promptus/` at the repo root; the memo is `.promptus/docs/editio-design-memo.md`); the build
lands in phases. What ships today:

- **`humanizer`** — the style toolkit (Part I de-AI patterns + Part II positive human
  patterns), moved here from promptus. Invoked directly, or dialed by promptus's `grannie`.

What the phases add: `editio-structure` (DoCO/DEO-gated sections), `editio-latex` + the
renderer (one markdown source, three renders — draft / publish / blind), `editio-figures`
(panel-first, venue-sized, statistically honest), `editio-tables`, `editio-bib` (`refs.bib`
from the lit store), `editio-repro`, `editio-venue`, `editio-rebuttal`, `editio-lint`.

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
