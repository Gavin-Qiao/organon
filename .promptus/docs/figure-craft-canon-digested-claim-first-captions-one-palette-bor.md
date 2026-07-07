---
id: finding-20260707T025530Z-figure-craft-canon-digested-claim-first-captions-one-palette-bor
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-07-06 22:55:30"
links: [cleveland-mcgill-1984-graphical-perception-ranking, okabe-ito-palette-wong-2011, rougier-droettboom-bourne-2014-ten-simple-rules-for-better-figur, tufte-1983-the-data-ink-ratio, wilke-2019-fundamentals-of-data-visualization]
---
# Figure-craft canon digested: claim-first captions, one palette, born-at-slot-size, gate the physical width

Digest of the figure-craft deep-research (Phase 3, 2026-07-03; multi-agent sweep over the visualization canon). WHERE THE FULL CANON LIVES: editio/skills/editio-figures/references/{principles,color-accessibility,chart-selection,tools-by-job,domain-figures}.md — shipped, fully cited; this unit is the store-side digest. ADOPTED: figures argue (claim-first captions: the caption's first sentence IS the claim, then panels, then the methods line); perception ranking breaks encoding ties (position > length > angle > area, [[cleveland-mcgill-1984-graphical-perception-ranking]]); one categorical palette fixed project-wide (Okabe-Ito, [[okabe-ito-palette-wong-2011]], with redundant encoding because IEEE still prints B&W); figures are BORN at slot size from venue data (the mplstyle generator) and gated by physical MediaBox width (editio-figcheck) because post-scaling silently shrinks fonts; vector PDF default; the figure-as-unit provenance contract figures/<name>/{data,plot,caption.md,pdf}. REJECTED, with reasons: bbox_inches=tight (re-crops the page, changes physical width under the gate); per-figure palette invention (accessibility re-derived badly each time); rainbow/jet (not CVD-safe, not print-safe); decorating before sizing (the size IS the design constraint). TRAP recorded: TeX pt (1/72.27in) vs PostScript bp (1/72in) — MediaBox is bp; confusing them is a silent 0.4% size error. Giants honored per [[rougier-droettboom-bourne-2014-ten-simple-rules-for-better-figur]], [[tufte-1983-the-data-ink-ratio]], [[wilke-2019-fundamentals-of-data-visualization]].

Related: [[cleveland-mcgill-1984-graphical-perception-ranking]] · [[okabe-ito-palette-wong-2011]] · [[rougier-droettboom-bourne-2014-ten-simple-rules-for-better-figur]] · [[tufte-1983-the-data-ink-ratio]] · [[wilke-2019-fundamentals-of-data-visualization]]
