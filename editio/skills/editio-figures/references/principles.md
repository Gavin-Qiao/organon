# Principles — the figure canon, distilled

Pointers in our own words; read the originals. Each entry: the source (full citation), then
the transferable moves editio adopts.

## The ten rules — Rougier, Droettboom & Bourne 2014

Rougier NP, Droettboom M, Bourne PE (2014). *Ten Simple Rules for Better Figures.*
PLoS Computational Biology 10(9): e1003833. <https://doi.org/10.1371/journal.pcbi.1003833>

Their rule titles, verbatim: (1) Know Your Audience · (2) Identify Your Message · (3) Adapt
the Figure to the Support Medium · (4) Captions Are Not Optional · (5) Do Not Trust the
Defaults · (6) Use Color Effectively · (7) Do Not Mislead the Reader · (8) Avoid
"Chartjunk" · (9) Message Trumps Beauty · (10) Get the Right Tool.

How editio operationalizes them: rule 2 is the SKILL's move 1 (the claim sentence comes
before any plotting); rule 3 is sizing to the venue slot at creation; rule 4 is the caption
grammar; rule 5 is why the scaffold generates `editio.mplstyle` instead of shipping
matplotlib defaults; rules 6–8 live in `color-accessibility.md` and the honesty rules;
rule 10 is `tools-by-job.md`.

## The perception ranking — Cleveland & McGill 1984

Cleveland WS, McGill R (1984). *Graphical Perception: Theory, Experimentation, and
Application to the Development of Graphical Methods.* Journal of the American Statistical
Association 79(387): 531–554. <https://doi.org/10.1080/01621459.1984.10478080>

Elementary perceptual tasks, most → least accurately judged by readers: **position on a
common scale** → position on non-aligned scales → length → direction/slope → angle → area →
volume → curvature → shading → color saturation (middle entries cluster as rough ties).

The tie-breaker rule: when two chart forms both fit the data's relationship, pick the one
that encodes the comparison you care about *higher* on this list — a dot plot (position)
over a bar chart (length) over a pie (angle) over a bubble chart (area) over a heatmap cell
(shading). Encode the claim's key comparison as position whenever you can.

## Data-ink — Tufte 1983

Tufte ER (1983). *The Visual Display of Quantitative Information.* Cheshire, CT: Graphics
Press. ISBN 0-9613921-0-X.

The data-ink ratio: the share of a graphic's ink that displays non-redundant data.
Maximize it, within reason — erase ink that carries no data (heavy grids, frames, backgrounds,
3D effects, the top/right spines the mplstyle already drops) and ink that repeats data. This
is a direction, not an absolute: keep the ink that carries *orientation* (ticks, labels, the
axis you compare against).

## The modern survey — Wilke 2019

Wilke CO (2019). *Fundamentals of Data Visualization.* Sebastopol, CA: O'Reilly Media.
Free online (author manuscript, CC BY-NC-ND 4.0): <https://clauswilke.com/dataviz/>

The read-once reference for everything this file compresses: visualizing distributions and
uncertainty, when a log axis is honest, small multiples over overloaded panels, directly
labeling lines instead of legends when the plot allows. When a figure decision feels
ambiguous, this is the book to check.

## The honesty rules (Rougier rule 7, applied)

- Axes start at zero for length encodings (bars); a non-zero baseline needs an explicit
  break mark and is never right for bars.
- Error bars mean nothing unless the caption says what they are — see the statistical
  honesty entry in the SKILL (Krzywinski & Altman 2013, cited in the README).
- No silent smoothing, trimming, or outlier removal — the caption states any transformation.
- Aspect ratio is rhetoric: banking a trend to ~45° is the default; stretching an axis to
  inflate an effect is misleading the reader.
