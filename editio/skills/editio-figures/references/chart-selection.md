# Chart selection — form follows the data's relationship

Start from what the data *is about*, not from a chart you like. The taxonomy below is the
Financial Times **Visual Vocabulary** (Visual Journalism team / Alan Smith et al.),
<https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary> — nine
relationships, each with battle-tested forms. Ties break by the Cleveland–McGill perception
ranking (`principles.md`): prefer the form that encodes your key comparison as *position*.

| the data is about… | relationship | strong defaults for papers |
|---|---|---|
| difference from a baseline / zero | **Deviation** | diverging bars around zero; slope-anchored dot plot |
| how two variables move together | **Correlation** | scatter (+ fitted line with its band); bubble only if the 3rd variable truly matters |
| order among items | **Ranking** | ordered dot plot or horizontal bars; slope chart for rank *change* |
| the shape of a variable | **Distribution** | histogram; ECDF (honest at any n); violin/box only with n stated; raw points when n is small |
| evolution | **Change over Time** | line chart; small multiples over >4 series on one panel; connected scatter sparingly |
| shares of a whole | **Part-to-whole** | stacked bars (few categories); treemap for many; a pie only with 2–3 slices, if at all (angle ranks low) |
| sheer size comparisons | **Magnitude** | bars from zero; dot plot when the zero baseline compresses everything |
| where | **Spatial** | map with a perceptually uniform fill (`color-accessibility.md`); cartogram when area lies |
| movement between states | **Flow** | Sankey/alluvial; chord for few nodes; a well-labeled digraph often beats both |

## The paper-specific overrides

- **Ablations** usually want a table, not a chart (one variable per row, a claim per row) —
  plot only when the *trend across the ablation axis* is the claim.
- **Method-vs-baseline over a budget axis** is Change-over-Time-shaped even when the x-axis
  is compute: line chart, seeds as a band, budget log-scaled if it spans decades.
- **Before/after a single intervention**: a slope chart (two positions) beats two bars —
  the reader judges the *change* as position, the highest-ranked encoding.
- One message per figure (Rougier rule 2): if the panel needs an "and", it's two panels.
