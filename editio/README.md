<div align="center">

# editio

**Write papers that can defend themselves.**
One markdown source · three renders · every claim graded against your store.

[![CI](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml/badge.svg)](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](../LICENSE)
[![requires: promptus](https://img.shields.io/badge/requires-promptus-8A2BE2.svg)](../promptus/README.md)

Part of [**Organon**](../README.md), beside [**promptus**](../promptus/README.md) — the store this plugin writes from.

</div>

> Latin *editio* — "a bringing forth, a publishing": the read-port where what a project has
> **validated** becomes a submittable paper.

---

## Why

A paper is a set of claims wearing prose. The failure mode is drift between the two: the
sentence sounds `VALIDATED` while the evidence is `CONJECTURED` — or missing. editio keeps
them honest by making confidence *visible before a reviewer finds it*: content is authored
as per-section markdown with claims wrapped in spans, each span is graded against the
promptus store, and the **draft** render prints every grade on the page. `publish` strips
the scaffolding; `blind` also masks who you are.

```text
[the gate refuses off-vocab writes]{.claim .validated grounds=the-gate}     → clean prose
[this transfers to manuscripts]{.claim .conjectured grounds=paper-read-port} → amber in draft
[40% of retractions fail on provenance]{.claim .unsourced}                   → vermilion + tag
[editors ask for evidence trails]{.claim}                                    → grey (ungraded)
```

Markdown stays the only source of truth — the `.tex` siblings are derived and disposable,
and the renderer **never blocks**: enforcement (zero unsourced, zero overclaims) is a gate
you run before submitting, not a build failure while thinking.

## Quick start

```text
/plugin install promptus@organon      # the store (prerequisite)
/plugin install editio@organon
```

Then, in a repo that has a `.promptus/` store:

```text
/editio arxiv                         # checks the store + TeX, scaffolds .editio/paper/
```

Write `sections/*.md`, then render and build (from `.editio/paper/`):

```bash
bun ".../scripts/editio-render.ts" --all      # md → tex (skills resolve the real path)
latexmk main.tex                              # → build/main.pdf, draft mode
latexmk -usepretex='\def\editiomode{publish}' -outdir=build-publish main.tex
```

No TeX yet? The `editio-latex` skill sets one up in ~5 minutes — detect-first, per-OS,
never vendored. Your title and authors live in **`paper.json`** and nowhere else; it
scaffolds as placeholders (`Author One`), and blind builds mask it automatically.

## Three renders, one source

| mode | what the same source becomes |
|---|---|
| `draft` | the author's instrument — claim tints (Okabe-Ito), per-section provenance stamps, grounds handles, TODOs on the page |
| `publish` | camera-ready — every annotation collapses to clean prose |
| `blind` | publish + `\selfcite` → "[anonymized]", `\blindhide{…}` dropped, authors → "Anonymous Authors" |

## The audit loop

1. **Draft** — wrap checkable claims in `{.claim}` spans (ungraded is fine).
2. **Retrieve** — promptus `recall` looks each claim up; every hit carries `substrate:status`.
3. **Grade** — the `grounded-writing-reviewer` agent (read-only) reports a grade per span.
4. **Apply or override** — grades are written back into the source; disagreement is an
   in-span `override="reason"`, on the record.
5. **Render** — grades become `\claimV / \claimC / \claimU / \claimG` in draft.
6. **Gate** — publish requires **no ungraded, no unsourced, no overclaims**.

## What ships today — the Phase 1–2 spine, compile-verified in all three modes

| piece | what it does |
|---|---|
| `/editio` | start or resume a paper; always ends at one next action |
| `editio` skill | the orchestrator — decision table, invariant, the audit loop |
| `editio-structure` | the argument before the prose: orders (imrad / cs-systems / theory), contribution-first framing, the abstract formula — plus craft distilled from exemplary papers ([`references/exemplars.md`](skills/editio-structure/references/exemplars.md)) |
| `editio-latex` | TeX setup, venue scaffolding, mode builds, single-section previews, notation conventions; the authoring subset is a written contract ([`references/authoring-subset.md`](skills/editio-latex/references/authoring-subset.md)) |
| `editio-scaffold.ts` | idempotent workspace scaffold — authored files seeded once, generated files refresh only with `--force` |
| `editio-render.ts` | the bespoke md→tex renderer, behind a golden contract ([`templates/contract/`](templates/contract/)) any swapped-in renderer must pass |
| `editio.sty` | the three-mode render layer |
| `humanizer` | the style toolkit (de-AI + positive human patterns); promptus's `grannie` dials it |
| venues | `arxiv`, `tpami` — venues are **data folders**, add one without touching a script |

**Roadmap** (built in phases, driven by real papers): `editio-figures` (panel-first,
venue-sized, statistically honest) → `editio-tables` · `editio-bib` (refs.bib from the lit
store) · `editio-repro` → `editio-venue` · `editio-rebuttal` · `editio-lint` (the publish
gate, mechanized).

## Skills, not stacks

editio ships portable expertise and thin, swappable reference implementations. The concrete
stack is yours: the TeX distribution, the build driver (`latexmk` is the reference, the
generated `.latexmkrc` is three lines), the renderer (pandoc + a Lua filter is the
documented swap — the golden contract keeps any replacement honest), the plotting library.
Venue rules are JSON data. Nothing is vendored, and a `no-identity` test enforces that
nobody's name ships in the templates.

## License

GPL-3.0 (© 2026 Mohan Qiao) — see the repo-root [`LICENSE`](../LICENSE). The
`skills/humanizer` fork preserves the upstream
[blader/humanizer](https://github.com/blader/humanizer) MIT notice in [`NOTICE`](NOTICE).
