---
id: finding-20260707T025458Z-numbers-as-one-source-of-truth-bind-once-lock-value-plus-source
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-07-06 22:54:58"
links: [leisch-2002-sweave-the-sexpr-inline-computed-value, claerbout-karrenbach-1992-reproducible-research-coined, xie-2015-knitr-book-dynamic-documents-2nd-edition, sandve-et-al-2013-ten-rules-rules-4-and-10-ground-the-numbers-ga]
---
# Numbers as one source of truth: bind once, lock value plus source hashes, refuse laundering — and re-grade the claim around a changed number

Digest of the numbers single-source-of-truth research (Psi's machinery studied 2026-07-06, design shipped same day). THE PROBLEM SHAPE: a paper's headline number is typed into many sentences (8 copies across 3 files in the field case); source drift is caught by luck; reconciliation is bespoke sed (15 assertion-guarded pairs). Half the corrections flip VERDICT WORDS (within-noise -> significant), so a value fix can invalidate the claim span around it — number-binding must COMPOSE with claim-grading, never replace it. THE DESIGN: values exist once (numbers.json: handle -> verbatim-LaTeX value + source files + computed_by + pinned); @num:handle / editionum{handle} everywhere else; --write generates the csname bindings AND locks per-handle value+source-hashes; the gate diffs generated content and trips on stale/unverified/laundered. REJECTED: Sweave-style compile-time evaluation ([[leisch-2002-sweave-the-sexpr-inline-computed-value]] is the direct ancestor) because editio never runs the author's pipeline — script over server; the lock is a tripwire against accidents, not a security boundary. Grounding: [[claerbout-karrenbach-1992-reproducible-research-coined]], [[xie-2015-knitr-book-dynamic-documents-2nd-edition]], [[sandve-et-al-2013-ten-rules-rules-4-and-10-ground-the-numbers-ga]]. Shipped artifact: editio-numbers + the editio-numbers skill.

Related: [[leisch-2002-sweave-the-sexpr-inline-computed-value]] · [[claerbout-karrenbach-1992-reproducible-research-coined]] · [[xie-2015-knitr-book-dynamic-documents-2nd-edition]] · [[sandve-et-al-2013-ten-rules-rules-4-and-10-ground-the-numbers-ga]]
