# Domain conventions — what "a proper figure" means per field

Field norms are venue norms: check the target venue's author kit first (`venue.json` notes
carry the load-bearing ones). These are the defaults reviewers assume.

## CS / ML (the arxiv + tpami venues shipped)

- **One canonical architecture figure**, early, referenced throughout — never partially
  redrawn in words (see the Vaswani entry in `editio-structure/references/exemplars.md`).
- Ablations: a table usually beats a bar chart (one variable per row, a claim per row);
  plot only when the *trend* is the claim.
- Training curves: log-scale x when spans decades; show variance across seeds (bands, not
  a single lucky run); state the number of seeds in the caption.
- Benchmarks: include the baseline *at the same budget*; a pareto plot (quality vs cost)
  is honest where a single bar is not.
- IEEE two-column: figures must survive black-and-white print — redundant encoding
  (linestyle + marker + color) is not optional (`color-accessibility.md`).

## Natural sciences (when a venue like Nature/Science is the target)

- Multi-panel figures that argue: panel (a) the claim, panels (b–e) evidence and failure
  modes; a reader of figures + captions alone gets the paper (the AlphaFold exemplar).
- Uncertainty drawn on the page: confidence bands, per-point error, distributions over
  means when n is small.
- Micrographs / photos: scale bar mandatory, raster ≥600 dpi, state any contrast
  adjustment in the caption (image-integrity policies treat silent adjustment as
  misconduct).
- Sequential data (heatmaps): perceptually uniform maps only — viridis/cividis, never
  jet/rainbow (`color-accessibility.md`).

## Theory / math

- Fewer figures, each load-bearing: the one diagram that carries the paper's ontology
  (the Shannon exemplar — one schematic, referenced throughout).
- Diagrams in TikZ so notation matches the body's math font exactly (the PGF path).

## Everywhere

- Panel labels (a), (b) bold upper-left; sans/serif per venue kit; body-font size.
- No chartjunk: 3D bars, gradients, drop shadows, and dual y-axes need a defense in
  writing; the default answer is no (`principles.md`).
