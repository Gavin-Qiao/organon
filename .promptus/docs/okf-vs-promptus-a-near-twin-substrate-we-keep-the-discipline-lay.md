---
id: finding-20260630T063520Z-okf-vs-promptus-a-near-twin-substrate-we-keep-the-discipline-lay
substrate: finding
kind: CONCEPT
status: VALIDATED
created: "2026-06-30 02:35:20"
links: [open-knowledge-format-okf-v01-google-cloud]
---
# OKF vs Promptus - a near-twin substrate; we keep the discipline layer

Google's OKF ([[open-knowledge-format-okf-v01-google-cloud]]) is a near-twin of Promptus's substrate — markdown + frontmatter in a directory, a markdown-link graph, files over servers, index/log conventions — arrived at independently by a giant, which validates the core bet rather than threatening it.

OKF is a MINIMAL substrate spec (only `type` required, consumers permissive). Promptus is a SUPERSET that keeps the discipline OKF deliberately declines: the substrate:status epistemic vocab, the gated write, typed relations (CiTO/PROV), retrieve and recall, the checkpoint drift-check, and grannie. OKF is the bytes on disk; Promptus governs what is allowed on disk, at what epistemic status, and how it is retrieved.

Interop (banked; build on a measured consumer): an okf export is cheap, deterministic, and LOSSLESS — OKF preserves unknown frontmatter keys, so our status/substrate/source ride along as extension fields. Our stores map straight to a bundle: ledger to log.md, finding/lit/memory to concept docs, slug links to bundle-relative paths via graph.json. Import is harder (gated-versus-permissive needs a classify-and-assign-status judgement) — defer until a real OKF bundle must be consumed.

Lessons (operator: "we are good in our own way" — adopt none now, bank): (1) our slug links are inert outside Promptus tooling, while OKF path-links render for any reader, so decide deliberately whether the raw store is browsable or grannie is the only door; (2) per-directory progressive-disclosure index files are the cheap, pure-markdown answer to the scale problem the TELOS punts to a future version; (3) a separable, implementation-independent format spec is OKF's real edge, while ours is welded to the scripts — bank until a consumer needs it.

Decision: not reinventing, not adopting OKF now; kept as an interop target plus three banked lessons.

Related: [[open-knowledge-format-okf-v01-google-cloud]]
