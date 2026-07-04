---
name: editio-figures
description: Figures that argue — design, size, and audit paper figures the way strong Nature/Science/IEEE papers do. Use when creating or reviewing any figure, choosing a chart form, sizing for a venue column, writing a caption, picking colors, or when a figure PDF must pass the size gate (editio-figcheck). Panel-first composition, venue widths from venue.json, caption grammar, statistical honesty, figure-as-unit provenance.
---

# editio-figures — figures that argue

A figure is a claim with evidence attached, not an illustration. The strongest papers are
readable from figures + captions alone; this skill makes each figure earn that. The craft
lives in `references/` (cited sources, distilled); this file is the workflow and the
contracts.

## The six moves, in order

1. **Claim first.** Before any plotting, write the caption's first sentence — the
   declarative claim this figure must prove ("Retrieval degrades linearly past 10k units",
   not "Results of the retrieval experiment"). No provable sentence → no figure yet.
2. **Pick the form by the data's relationship** — distribution, comparison, change over
   time, part-to-whole, flow… (`references/chart-selection.md`). The perception ranking in
   `references/principles.md` breaks ties: position beats length beats angle beats area.
3. **Size to the slot at creation.** Single column or full width, in mm, from the venue
   (`venue.json`: `column_width_mm` / `full_width_mm`). The scaffolded
   `figures/editio.mplstyle` already carries the venue's single-column figsize and print-size
   fonts. **Never post-scale** (`width=\columnwidth` around a wrong-sized PDF shrinks every
   font out of spec) and **never save with `bbox_inches='tight'`** (it re-crops the page and
   changes the physical width under you).
4. **Build through the menu** (`references/tools-by-job.md`) — vector PDF by default, colors
   and redundant encoding per `references/color-accessibility.md`, field conventions per
   `references/domain-figures.md`.
5. **Caption grammar + statistical honesty.** Caption = the claim sentence, then
   panel-by-panel ("(a) …; (b) …"), then the methods line: what error bars represent
   (SD / SEM / CI), n, and the test. Uncertainty is drawn on the page (bands, points, not
   just means); axes start at zero or show a break; no smoothing without saying so.
6. **Gate it.** `bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-figcheck.ts" figures/<name>/<name>.pdf --slot single`
   — the PDF's physical width must equal the slot (±1mm), because step 3 said so.

## Figure-as-unit (the provenance contract)

Every figure is a directory — the paper's version of a gated store unit:

```text
.editio/paper/figures/<name>/
  data.csv          # the numbers (or a pointer to where they live)
  plot.py           # regenerates <name>.pdf from data.* — one command, no hand edits
  caption.md        # first line = the claim; grounds: handles like any prose claim
  <name>.pdf        # the built artifact (vector; sized to the slot)
```

Regenerable or it isn't real: if `<name>.pdf` can't be rebuilt from `data.*` + `plot.py`,
the figure is a screenshot, not evidence. `plot.py` loads the scaffolded style first:
`plt.style.use("../editio.mplstyle")`.

## Placing it in a section (the canonical block)

Sections are markdown; figures enter through the ```` ```latex ```` escape hatch, and the
draft render carries provenance via the same stamp machinery as sections:

````markdown
```latex+
\begin{figure}[tb]
  \centering
  \includegraphics{figures/ablation/ablation.pdf}% sized to the slot — no width= post-scaling
  \caption{Grounded rendering removes 90\% of unsourced claims before review
           (protocol from [@krzywinski2013]; setup in @sec:methods).
           (a) Claim grades across ten drafts; (b) time-to-audit per section.
           Error bars: 95\% CI over 10 runs; n=40 sections.}
  \label{fig:ablation}
  \editiostamp{2026-07-03}{ablation-run-3}
\end{figure}
```
````

The `latex+` fence keeps `[@key]` and `@sec:x` working inside captions — floats and prose
share one citation syntax. Reference the figure in prose as `@fig:ablation`. Use `[tb]`
placement (double-column `figure*` especially — bare `[t]` strands wide floats past the
references; the tpami venue also ships `dblfloatfix` for exactly this). The stamp prints
grey in draft and vanishes in publish/blind — honesty scaffolding, not reader furniture.

## Output format (the default and its two exceptions)

**Vector PDF** is the default: crisp at any zoom, fonts embedded (the style forces
TrueType, not Type 3), works with every engine. Upgrade to **PGF/PGFPlots** (LaTeX typesets
the labels) only when exact font/math match matters and the plot is light — document the
swap in `plot.tex`. Drop to **raster at ≥600 dpi** only for inherently pixel content
(photos, micrographs, dense heatmaps) — never for lines or text.

## When NOT to make a figure

- The "figure" is decoration — a logo, a stock diagram, a screenshot of a table. Cut it.
- One number would do: a sentence beats a bar chart with two bars.
- The claim has no grounds yet — ground it first (`recall`), or the caption's first
  sentence is an unsourced claim wearing a picture.
