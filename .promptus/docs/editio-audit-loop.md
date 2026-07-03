---
id: finding-20260702T213742Z-editio-audit-loop
substrate: finding
kind: CONCEPT
status: CONJECTURED
created: "2026-07-02 17:37:42"
links: [three-renders-one-source, grade-evidence-to-recommendation-strength, editio-paper-read-port, write-time-calibration-design]
---
# editio audit loop

The hinge that keeps an editio draft honest — six steps. 1 Draft: section prose in .editio/paper/sections/, factual claims wrapped in spans (ungraded or best-guess). 2 Retrieve: recall looks each claim up in the store (kb-find then kb-get) and returns its substrate:status. 3 Grade: the grounded-writing-reviewer sets each span — finding:VALIDATED or lit:CITE to .validated, CONJECTURED or provisional to .conjectured, nothing found to .unsourced, and a DEADEND or REFUTED hit is an overclaim flag — running the humanizer tells-audit in the same pass. 4 Override: the author accepts, overrides with a recorded reason, or fixes (store the evidence, soften, or cut). 5 Render: graded spans become \claimV/\claimC/\claimU macros, so the draft build shows epistemic status on the page ([[three-renders-one-source]]). 6 Gate: the publish target is zero .unsourced and no overclaims; publish and blind strip every tint. The status-to-confidence rubric is recall's, in the [[grade-evidence-to-recommendation-strength]] lineage; authoring can start as plain prose — grading is what turns prose into a defensible draft of [[editio-paper-read-port]]. This is the invariant-clean soft default of [[write-time-calibration-design]] applied to papers; the deterministic lattice stays shelved pending a measured miss. CONJECTURED until it survives a real paper.

Related: [[three-renders-one-source]] · [[grade-evidence-to-recommendation-strength]] · [[editio-paper-read-port]] · [[write-time-calibration-design]]
