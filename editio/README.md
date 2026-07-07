<div align="center">

# editio

**Write papers that can defend themselves.**
One markdown source · three renders · every claim graded against your store.

[![CI](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml/badge.svg)](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/Gavin-Qiao/organon?filter=editio-v%2A&label=release)](https://github.com/Gavin-Qiao/organon/releases)
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
bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-render.ts" --all   # md → tex
latexmk main.tex                                             # → build/main.pdf, draft mode
latexmk -usepretex='\def\editiomode{publish}' -outdir=build-publish main.tex
```

The canonical, always-current PDFs live in the build dirs (`build/main.pdf` draft,
`build-publish/main.pdf` publish) — read and hand off from there; the paper source root
stays PDF-free (the doctor flags strays). For a durable snapshot ("the version I sent
co-authors"), copy into an `archive/` dir under a dated, self-describing name
(`mypaper_2026-07-07_publish.pdf`) — never a bare copy in the root, where it goes stale
and shadows the real build. And the markdown sources ARE the paper, so git is its version
history: commit the paper dir (the `build*/` dirs stay ignored) and tag milestones
(`paper-v1-submitted`); the doctor flags sources a repo ignores or never tracked.

No TeX yet? The `editio-latex` skill sets one up in ~5 minutes — detect-first, per-OS,
never vendored. Your title and authors live in **`paper.json`** and nowhere else; it
scaffolds as placeholders (`Author One`), blind builds mask it automatically, and
`editio-identity` delivers it to every document as generated data macros
(`front/identity.tex`: `\PaperTitle`, `\AuthorList`, bios) — one paper.json edit
updates the title, author block, and bios everywhere, and the doctor flags any name
hard-coded outside the macros.

## Three renders, one source

| mode | what the same source becomes |
|---|---|
| `draft` | the author's instrument — claim tints (Okabe-Ito), per-section provenance stamps, grounds handles, TODOs on the page |
| `publish` | camera-ready — every annotation collapses to clean prose |
| `blind` | publish + `\selfcite` → "[anonymized]", `\blindhide{…}` dropped, authors → "Anonymous Authors" |

## The audit loop

1. **Draft** — wrap checkable claims in `{.claim}` spans (ungraded is fine).
2. **Retrieve** — promptus `recall` looks each claim up; every hit carries `substrate:status`.
3. **Grade** — the `grounded-writing-reviewer` agent (read-only) reports findings per
   flagged span; the session maps them to grades.
4. **Apply or override** — grades are written back into the source. An in-span
   `override="reason"` passes the gate **on the record** for an `.unsourced` claim (the
   author accepts it) or a `.validated` claim over weak grounds — never for an ungraded
   span (ungraded means the loop hasn't run; run it).
5. **Render** — grades become `\claimV / \claimC / \claimU / \claimG` in draft.
6. **Gate** — publish requires **no ungraded, no unsourced, no overclaims**.

## What ships

| piece | what it does |
|---|---|
| `/editio` | start or resume a paper; always ends at one next action |
| `editio` skill | the orchestrator — decision table, invariant, the audit loop |
| `editio-structure` | the argument before the prose: orders (imrad / cs-systems / theory), contribution-first framing, the abstract formula — plus craft distilled from exemplary papers ([`references/exemplars.md`](skills/editio-structure/references/exemplars.md)) |
| `editio-latex` | TeX setup, venue scaffolding, mode builds, single-section previews, notation conventions; the authoring subset is a written contract ([`references/authoring-subset.md`](skills/editio-latex/references/authoring-subset.md)) |
| `editio-figures` | figures that argue — claim-first captions, panel-first composition sized to the venue slot, statistical honesty, the figure-as-unit provenance contract; the craft is distilled from cited sources ([`references/`](skills/editio-figures/references/)) |
| `editio-scaffold.ts` | idempotent workspace scaffold — authored files seeded once, generated files (incl. the per-venue `figures/editio.mplstyle`) refresh only with `--force` |
| `editio-render.ts` | the bespoke md→tex renderer, behind a golden contract ([`templates/contract/`](templates/contract/)) any swapped-in renderer must pass; cwd-proof, warns on unrendered spans, `--concat` exports one reviewable markdown file |
| `editio-status.ts` | **the grounding layer, tooled**: per-section claim tallies and drafted-word counts (vs each section's `budget:`), every ungraded/unsourced span at `file:line` (`--claims`), grounds handles resolved against the store — and the publish gate as a command (`--gate`: no ungraded, no unsourced, no overclaims over weak/unknown/absent grounds) |
| `editio-figcheck.ts` | the figure-size gate — a figure PDF must *be* the slot width (±1mm); post-scaling is caught before it silently shrinks fonts |
| `editio-doctor.ts` | workspace health, report-only — the scaffold version stamp vs the installed plugin, declared-order drift (which withholds the `--force` advice), venue drift, stale `editio.sty`, a hand-finished `front/metadata.tex`, stale/unwired sections, hand-cite fences, identity leaking into prose (`--strict` exits 1 for CI) |
| `editio-numbers` | **one source of truth per number**: `numbers.json` names each value once, `@num:handle` binds it in prose/math/captions ([`editio-numbers` skill](skills/editio-numbers/SKILL.md)), `--write` generates `front/numbers.tex` + a source-hash lock, `--gate` fails on stale/unknown bindings |
| `editio.sty` | the three-mode render layer |
| `humanizer` | the style toolkit (de-AI + positive human patterns); promptus's `grannie` dials it |
| venues | `arxiv`, `tpami` — venues are **data folders** (widths, fonts, class, bib style); add one without touching a script |

**Roadmap** (built in phases, driven by real papers — the claim gate arrived early because
the first dogfood demanded it): **next → `editio-tables`** (a data→booktabs unit; the first
dogfood's request) · `editio-bib` (refs.bib from the lit store) · `editio-repro` →
`editio-venue` · `editio-rebuttal` · `editio-lint` (structure/notation lint; the claim gate
already ships as `editio-status --gate`).

## Skills, not stacks

editio ships portable expertise and thin, swappable reference implementations. The concrete
stack is yours: the TeX distribution, the build driver (`latexmk` is the reference, the
generated `.latexmkrc` is three lines), the renderer (pandoc + a Lua filter is the
documented swap — the golden contract keeps any replacement honest), the plotting library.
Venue rules are JSON data. Nothing is vendored, and a `no-identity` test enforces that
nobody's name ships in the templates.

## References

editio's skills are *distilled* from the sources below — pointers and transferable moves in
our own words, never their text; read the originals. Every distillation cites its source at
the point of use (each skill's `references/*.md`) and lands in the lit store, per the repo
rule ([CONTRIBUTING — "References are load-bearing"](../CONTRIBUTING.md#references-are-load-bearing)).

**Structure & writing craft**

- Mensh B, Kording K (2017). Ten simple rules for structuring papers. *PLoS Computational
  Biology* 13(9): e1005619. <https://doi.org/10.1371/journal.pcbi.1005619>
- Gopen GD, Swan JA (1990). The Science of Scientific Writing. *American Scientist* 78(6):
  550–558.
- Whitesides GM (2004). Whitesides' Group: Writing a Paper. *Advanced Materials* 16(15):
  1375–1377. <https://doi.org/10.1002/adma.200400767>
- Nature Portfolio. Formatting guide (incl. the annotated summary-paragraph template).
  <https://www.nature.com/nature/for-authors/formatting-guide>
- Constantin A, Peroni S, Pettifer S, Shotton D, Vitali F (2016). The Document Components
  Ontology (DoCO). *Semantic Web* 7(2): 167–181 — with the companion Discourse Elements
  Ontology (DEO), <http://purl.org/spar/deo>. The structure gate's vocabulary.

**Exemplary papers the craft is distilled from** ([`exemplars.md`](skills/editio-structure/references/exemplars.md))

- Watson JD, Crick FHC (1953). A Structure for Deoxyribose Nucleic Acid. *Nature* 171:
  737–738. <https://doi.org/10.1038/171737a0>
- Shannon CE (1948). A Mathematical Theory of Communication. *Bell System Technical
  Journal* 27: 379–423, 623–656.
- Ongaro D, Ousterhout J (2014). In Search of an Understandable Consensus Algorithm.
  *USENIX ATC '14*.
- Vaswani A, et al. (2017). Attention Is All You Need. *NeurIPS 30*. arXiv:1706.03762.
- Jumper J, et al. (2021). Highly accurate protein structure prediction with AlphaFold.
  *Nature* 596: 583–589. <https://doi.org/10.1038/s41586-021-03819-2>

**Figures** ([`editio-figures/references/`](skills/editio-figures/references/))

- Rougier NP, Droettboom M, Bourne PE (2014). Ten Simple Rules for Better Figures. *PLoS
  Computational Biology* 10(9): e1003833. <https://doi.org/10.1371/journal.pcbi.1003833>
- Cleveland WS, McGill R (1984). Graphical Perception: Theory, Experimentation, and
  Application to the Development of Graphical Methods. *JASA* 79(387): 531–554.
  <https://doi.org/10.1080/01621459.1984.10478080>
- Okabe M, Ito K (2002, rev. 2008). Color Universal Design (CUD).
  <https://jfly.uni-koeln.de/color/> — popularized by Wong B (2011). Points of view: Color
  blindness. *Nature Methods* 8: 441. <https://doi.org/10.1038/nmeth.1618>
- Nuñez JR, Anderton CR, Renslow RS (2018). Optimizing colormaps with consideration for
  color vision deficiency… (cividis). *PLOS ONE* 13(7): e0199239.
  <https://doi.org/10.1371/journal.pone.0199239>
- Krzywinski M, Altman N (2013). Points of Significance: Error bars. *Nature Methods*
  10(10): 921–922. <https://doi.org/10.1038/nmeth.2659>
- Tufte ER (1983). *The Visual Display of Quantitative Information*. Graphics Press.
- Wilke CO (2019). *Fundamentals of Data Visualization*. O'Reilly.
  Free online: <https://clauswilke.com/dataviz/>
- Financial Times Visual Journalism. Visual Vocabulary.
  <https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary>
- Garrett JD. SciencePlots. <https://github.com/garrettj403/SciencePlots>
  <https://doi.org/10.5281/zenodo.4106649>

**Numbers — one source of truth**
([`editio-numbers/references/`](skills/editio-numbers/references/))

- Claerbout JF, Karrenbach M (1992). Electronic documents give reproducible research a
  new meaning. *SEG Technical Program Expanded Abstracts*: 601–604.
  <https://doi.org/10.1190/1.1822162>
- Leisch F (2002). Sweave: Dynamic Generation of Statistical Reports Using Literate Data
  Analysis. *Compstat 2002*: 575–580. <https://doi.org/10.1007/978-3-642-57489-4_89>
- Xie Y (2015). *Dynamic Documents with R and knitr* (2nd ed.). Chapman & Hall/CRC.
  <https://doi.org/10.1201/9781315382487>
- Sandve GK, Nekrutenko A, Taylor J, Hovig E (2013). Ten Simple Rules for Reproducible
  Computational Research. *PLOS Computational Biology* 9(10): e1003285.
  <https://doi.org/10.1371/journal.pcbi.1003285>

**Upstream code**

- [blader/humanizer](https://github.com/blader/humanizer) (© 2025 Siqi Chen, MIT) — the
  base of the `humanizer` skill; notice preserved in [`NOTICE`](NOTICE).

## License

GPL-3.0 (© 2026 Mohan Qiao) — see the repo-root [`LICENSE`](../LICENSE). The
`skills/humanizer` fork preserves the upstream
[blader/humanizer](https://github.com/blader/humanizer) MIT notice in [`NOTICE`](NOTICE).
