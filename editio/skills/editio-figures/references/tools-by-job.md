# Tools by job — a menu, not a mandate

Skills, not stacks: editio names good tools per job and ships one thin default
(`editio.mplstyle` for matplotlib). The concrete stack is yours; swap anything. Whatever
you pick, the contracts hold — sized to the slot at creation, vector PDF, the palette and
redundant encoding from `color-accessibility.md`, regenerable from `plot.*`.

| job | reach for | notes |
|---|---|---|
| data plots (the default) | **matplotlib** + the scaffolded `editio.mplstyle` | the style carries venue figsize, print-size fonts, the Okabe–Ito cycle; [SciencePlots](https://github.com/garrettj403/SciencePlots) is a maintained alternative style pack |
| statistical graphics | **seaborn** (on matplotlib) | distributions, small multiples; the mplstyle still applies underneath |
| LaTeX-native plots | **PGFPlots/TikZ** | labels typeset by LaTeX itself — exact font/math match; slower, chokes on dense data; the documented "PGF path" (see SKILL step: output format) |
| architecture / flow diagrams | **TikZ** · [Mermaid](https://mermaid.js.org) · [Graphviz](https://graphviz.org) | TikZ for camera-ready control; Mermaid/Graphviz to iterate fast, then redraw the keeper |
| neural-net schematics | [PlotNeuralNet](https://github.com/HarisIqbal88/PlotNeuralNet) (TikZ) | or draw the *one* canonical architecture figure by hand in TikZ — it will be referenced all paper |
| chemistry | `chemfig` (LaTeX) | structures inline with the body font |
| particle physics | `tikz-feynman` | Feynman diagrams as TikZ |
| biology / medicine schematics | [BioRender](https://www.biorender.com) or vector drawing (Inkscape) | mind the license for publication; export PDF/SVG, never PNG screenshots |
| quick data exploration | anything (plotly, a spreadsheet…) | exploration ≠ the figure; the keeper gets rebuilt through `plot.py` in the figure unit |

## The matplotlib path (the shipped default)

```python
import json, matplotlib.pyplot as plt

plt.style.use("../editio.mplstyle")           # venue figsize + fonts + palette
fig, ax = plt.subplots()                       # single column by default
# double column: plt.subplots(figsize=(FULL_W_IN, H))  — widths are in the mplstyle header
...
fig.savefig("ablation.pdf")                    # NOT bbox_inches='tight' (re-crops the page)
```

Then gate it: `editio-figcheck.ts ablation.pdf --slot single`.

Unit trap: matplotlib/PDF "points" are PostScript big points (1/72 in) while LaTeX's bare
`pt` is the TeX point (1/72.27 in) — a ~0.4% gap. Pin figure sizes in **mm or inches**
(as `venue.json` and the mplstyle do), never in bare points copied across the two worlds.

## Multi-panel composition

Compose panels **inside one figure** (`plt.subplots(2, 2)`, `subfigure`, or TikZ overlay) so
fonts stay uniform and the composite is sized to the slot once. Assembling panels in a
drawing tool afterwards re-scales each panel differently — the exact failure the size gate
exists to catch. Label panels (a), (b), … bold, upper-left, body-font size.
