# Color & accessibility — the palette and the rules

About 8% of men and 0.5% of women have a color-vision deficiency; IEEE venues still print
in black and white. Color is therefore never the *only* encoding, and the categorical
palette is fixed by default rather than re-invented per figure.

## The categorical palette — Okabe–Ito (Color Universal Design)

Okabe M, Ito K (2002, rev. 2008). *Color Universal Design (CUD): How to make figures and
presentations that are friendly to colorblind people.* <https://jfly.uni-koeln.de/color/>
Popularized for scientific figures by: Wong B (2011). *Points of view: Color blindness.*
Nature Methods 8: 441. <https://doi.org/10.1038/nmeth.1618>

| name | hex | in the mplstyle cycle |
|---|---|---|
| blue | `#0072B2` | 1st |
| vermilion | `#D55E00` | 2nd |
| bluish green | `#009E73` | 3rd |
| orange | `#E69F00` | 4th |
| sky blue | `#56B4E9` | 5th |
| reddish purple | `#CC79A7` | 6th |
| yellow | `#F0E442` | 7th (weak on white — last on purpose) |
| black | `#000000` | 8th (kept free for annotations) |

The eight stay distinguishable under the common color-vision deficiencies. The scaffolded
`editio.mplstyle` carries this cycle; editio's draft-mode claim tints use the same palette
(`editio.sty`), so the whole toolchain speaks one color language. Two series that must be
told apart at a glance: use the 1st + 2nd (blue/vermilion — the strongest pair).

## Sequential and diverging data

- **viridis** (matplotlib's default since 2.0; Stéfan van der Walt & Nathaniel Smith,
  <https://bids.github.io/colormap/>) for sequential data; **cividis** when optimizing
  explicitly for color-vision deficiency: Nuñez JR, Anderton CR, Renslow RS (2018).
  *Optimizing colormaps with consideration for color vision deficiency…* PLOS ONE 13(7):
  e0199239. <https://doi.org/10.1371/journal.pone.0199239>
- **Never jet/rainbow**: not perceptually uniform — it fabricates visual boundaries in
  smooth data and hides real ones (the cividis paper measures exactly this failure).
- Diverging data (deviation around a meaningful zero): a two-hue map through white/grey
  (e.g. matplotlib `RdBu_r`), with the midpoint pinned to the actual zero.

## Redundant encoding (the greyscale test)

Color never carries a distinction alone:

- Lines: vary **linestyle** (solid/dashed/dotted) *and* **marker** with color.
- Regions/bars: vary hatch or order them so position disambiguates.
- Direct-label lines where the plot allows it — a legend is a lookup table the reader
  shouldn't need.

The test: print the figure in greyscale (or `plt.imsave` desaturated). Every series still
identifiable → pass. This is the TPAMI venue note ("figures must survive B&W print") made
mechanical.

## Small print

- Text contrast: annotation text is black or `#333`-dark, never a palette hue.
- Don't encode magnitude in the yellow (`#F0E442`) — it reads as highlight, not as data,
  on white backgrounds.
- Semantic collisions: red/green for good/bad is both a CVD trap and a cultural guess —
  use blue/vermilion and say it in the caption.
