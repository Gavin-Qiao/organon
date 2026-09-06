---
id: finding-20260905T120244Z-private-psi-and-mot-copies-confirm-parse-reuse-maintenance-gains
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-05 08:02:44"
links: [finding-20260905T092949Z-raw-parse-reuse-reduces-synthetic-maintenance-latency-at-a-measu, event-20260905T103618Z-test-bounded-private-copy-parse-reuse-on-psi-and-mot]
artifacts: [private-parse-0|benchmarks/private-parse-support.ts|8182c07a83d9d746ac8605a6a46082f66a49d251896bf62ef6fca65631f92d7a, private-parse-1|benchmarks/private-parse-support.test.ts|1f44fb0075224b526f8368adcad7e2db58931c46805e0b363c0d6df9a83252e0, private-parse-2|benchmarks/private-parse-trial.ts|d40d8863acaf3978ce6a5c6d961e88b9e2e363bf9e25930eb6a95d964e476531, private-parse-3|benchmarks/private-parse-report.ts|7f8e2365b9e5da6d27da6b32506f2f9837ebc54c546bee3d4f602fe79409522f, private-parse-4|benchmarks/private-parse-report.test.ts|4f332f479e0e1f09fddb4d8cb20a71329439970bb4d912402d7b90e33f17c2c3, private-parse-5|benchmarks/PRIVATE-PARSE-REUSE.md|dee8cf77d53ff0ba3593904a0859a7935e7c699e0b29d0c3cea245779eb1f96b, private-parse-6|benchmarks/PRIVATE-PARSE-RESULTS.md|5b1881ad5c764140ec0168cad7b540dae3a194b7daa9f0449739bbfa2dc86dc2, private-parse-7|benchmarks/results/private-parse-reuse-windows-9p-2026-09-05.json|830e42fc33d3d9d9c00c6716a617eb5ed3ba88ca74836b707d4c0624f910dc4a, private-parse-8|benchmarks/results/private-parse-analysis-2026-09-05.json|2aefc06e43f03efb1333d5928d907ce9699156e1cca92593f3eb9e0cda96aa80]
---
# Private Psi and MoT copies confirm parse reuse maintenance gains but expose read path costs

## Bounded empirical result

The isolated raw parse cache passed both frozen Psi/MoT real-copy trials on Windows 9p. It reduced mean write–find–exact-fetch time by about 44% and 48% respectively, with about 5 MB extra raw cache per project. It did not improve ordinary clean reads. This validates the measured maintenance result and canonical equivalence, not production adoption or a general retrieval speedup.

Psi's September 5 capture has 6,494 units, 87 cold; MoT has 6,332 units, none cold. Three appends and three synthetic-page metadata amendments per arm alternated arm order. Mean full/reuse write–find–fetch: Psi 21.13/11.94 s; MoT 29.50/15.39 s. Adding the ten clean reads actually executed per workflow gives 71.85/67.15 s and 92.30/71.08 s. These are controlled workloads, not recorded agent sessions.

Ordinary/control-query medians were 449/492 ms and 466/507 ms. Phrase-only medians were 18.61/20.00 s and 23.08/20.68 s. Their direction differs across projects; no phrase algorithm changed, so do not attribute the variation to such an optimization. The fixed query generator yields 45 ordinary/control and 15 phrase reads per arm. A 100-read reweighting of that mixture estimates Psi 528.28/564.07 s and MoT 657.45/572.24 s. An ordinary-only reweighting instead estimates 66.84/61.50 s and 75.96/66.26 s. Both are sensitivity calculations, not observed 100-read traces or measured user frequencies. Stratification/ordinary-only weighting are post-inspection descriptive analysis. Warm/uncontrolled OS caches and three update samples limit inference.

## Storage and correctness

Raw gzip cache: 5,137,998 bytes Psi and 4,959,091 bytes MoT. Derived files full/reuse: 21,847,020/26,985,093 and 24,422,920/29,382,099 bytes, about 23.5%/20.3% growth. Each update parsed one physical file and reused 2,678/2,940; whole live ledgers of about 4.5/5.1 MB still get parsed on append. Full discovery, projection, serialization and other inspections remain; parsed-byte counters are not total source I/O.

Both projects passed cached raw-unit equivalence, byte-exact catalog/graph/search parity and all eleven canonical query controls before a forced full candidate rebuild could conceal an error. New units/statuses are visible through fresh selection and exact fetch. Frozen captures and unrelated copied files remain unchanged. The physical ledger and synthetic probe are allowed mutation paths; this is not independent old-ledger-history byte certification or external-artifact validation.

All 416 logged commands succeeded. Maximum sampled subprocess-tree RSS was 761,208 KiB, about 743 MiB, below the 1 GiB stop. The 16 MiB compressed-cache pre-write guard was not reached. Observed working-copy scratch peaked at 91,827,635 bytes against a 256 MiB between-phase stop; private notes/runtime added 2,016,521 bytes separately. RSS sampling can miss short peaks/double-count shared pages, and logical bounds do not certify allocation/journal peaks. The 60-second outer deadline retained stricter nested 30-second timeouts. The generated working copies were removed, 173,573,188 bytes total; frozen originals and private logs remain.

Full repository suite: 465 pass, 0 fail, 2,984 assertions across 46 files. Plugin adapters validate. A helper syntax error was fixed before measurement. Production scripts, installed plugins, prior benchmark/evidence artifacts and live Psi/MoT/Probatio/Mensura stores were not changed. Public receipts use aggregates/hashes only.

## Interpretation and next decision

Source inspection shows why phrase-only queries are expensive: searchIndex starts with every visible document when there are no unquoted terms, then asks for normalized text. Unit file/ledger caches are process-local, so fresh CLI calls repeat those reads. This is a verified code-path observation, not a causal isolation of every millisecond. Ordinary reads also hash the added raw cache even when they do not consume its text; its exact share of overhead is unmeasured.

The most useful next implementation candidate is phrase verification from the raw text already cached, with no additional stored copy, while preserving current matching/ranking and same-buffer source fetch. Also inspect unused-cache verification on ordinary reads. These are untested proposals: do not automatically relax freshness checks. Keep production unchanged pending that bounded read-path/integration work, graceful quota fallback and contention review. Unseen outside/Obsidian edits remain outside governed-write freshness; the one-second experimental reader lease is not production policy. No backend selection restart or GPU dependency is needed to pursue this local bottleneck.

The Promptus workflow preserves the result and limits independently of the old synthetic finding: that earlier finding remains valid for its scope and is not superseded merely because real-copy query mixtures expose another bottleneck.

Related: [[finding-20260905T092949Z-raw-parse-reuse-reduces-synthetic-maintenance-latency-at-a-measu]] · [[event-20260905T103618Z-test-bounded-private-copy-parse-reuse-on-psi-and-mot]]
