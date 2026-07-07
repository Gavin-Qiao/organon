---
id: finding-20260707T025530Z-venue-truth-is-measured-not-quoted-probe-compiles-for-widths-liv
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-07-06 22:55:30"
links: [tpami-author-policy-2026-compsoc-template-current-12-page-limit, ieee-author-center-figure-size-type-and-resolution-rules]
---
# Venue truth is measured, not quoted: probe compiles for widths, live policy pages for limits, verified stamps in the data

Digest of the venue-truth research (Phase 3, 2026-07-03, corrected 07-04). METHOD, because the method is the finding: never trust a venue spec quoted from memory or a blog — (1) WIDTHS are measured by probe compiles: a minimal document per venue class with \typeout{\the\textwidth / \the\columnwidth}, run under the real engine (arxiv article-11pt+geometry-1in -> textwidth 469.755pt = 165.1mm; tpami IEEEtran 10pt-journal-compsoc -> columnwidth 252.945pt = 3.5in = 88.9mm, textwidth 517.935pt = 182.0mm); the audit later re-verified these to sub-0.01pt. Our first venue.json carried spec'd-not-measured widths and BOTH were wrong. (2) POLICY is verified against the live publisher surface: the TPAMI page limit in our data was 14, live IEEE CS policy says 12 formatted pages (18 max, USD 220/page past 12), review is single-anonymous by default — see [[tpami-author-policy-2026-compsoc-template-current-12-page-limit]]; templates re-verified via the IEEE Template Selector. (3) Every verified fact carries a verified-YYYY-MM note IN the venue.json so staleness is visible. RULE ADOPTED: venues are data folders; a venue number without a measurement or a live-source note is a bug. Shipped artifacts: templates/venues/*/venue.json, the mplstyle generator, editio-figcheck.

Related: [[tpami-author-policy-2026-compsoc-template-current-12-page-limit]] · [[ieee-author-center-figure-size-type-and-resolution-rules]]
