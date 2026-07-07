# Single-source-of-truth numbers — the sources behind the skill

All citations verified against live publisher records 2026-07 (Crossref, SEG Library,
Springer, PLOS).

## The provenance idea

- **Claerbout, J. F., & Karrenbach, M. (1992).** "Electronic documents give
  reproducible research a new meaning." *SEG Technical Program Expanded Abstracts
  1992*, 601–604. https://doi.org/10.1190/1.1822162
  — Coins "reproducible research" for computational science: the paper plus its
  exact code/data should regenerate every result on demand. The root claim behind
  this skill: a reported number is only as good as its traceable source.

## Inline computed values (the direct ancestors of `@num:` / `\editionum`)

- **Leisch, F. (2002).** "Sweave: Dynamic Generation of Statistical Reports Using
  Literate Data Analysis." In *Compstat 2002 — Proceedings in Computational
  Statistics* (Härdle & Rönz, eds.), 575–580. Physica-Verlag.
  https://doi.org/10.1007/978-3-642-57489-4_89
  — Introduces `\Sexpr{}`: a live-computed value inlined into typeset LaTeX prose.
  `\editionum{handle}` is its *static* cousin — the value is bound at `--write`
  time rather than computed at compile time, because editio never runs your
  pipeline (script over server); the lock hash is what connects the binding back
  to the computation.

- **Xie, Y. (2015).** *Dynamic Documents with R and knitr* (2nd ed.). Chapman &
  Hall/CRC, The R Series. https://doi.org/10.1201/9781315382487
  — The modern successor: inline code chunks generalized beyond LaTeX. The
  "compute once, cite everywhere" document is the same discipline this skill
  applies to a markdown-sections paper without adopting a full dynamic-document
  toolchain.

## The audit rules the gate mechanizes

- **Sandve, G. K., Nekrutenko, A., Taylor, J., & Hovig, E. (2013).** "Ten Simple
  Rules for Reproducible Computational Research." *PLOS Computational Biology*,
  9(10), e1003285. https://doi.org/10.1371/journal.pcbi.1003285
  — Rule 4 (*Version Control All Custom Scripts*) and Rule 10 (*Provide Public
  Access to Scripts, Runs, and Results*): a reported figure is trustworthy only if
  the exact producing script/data state is recoverable. `numbers.json`'s
  `source`/`computed_by` fields plus the lock hashes are the paper-side handle on
  that state; the STALE flag is what fires when the connection breaks.

## The field evidence (internal)

The failure this skill answers is recorded in the organon research ledger (the
second dogfood): a headline mean typed into eight sentences across three files,
drift caught by luck, reconciled by a fifteen-pair sed script — and the paper
team's own lesson, "verify fresh==frozen before trusting tables."
