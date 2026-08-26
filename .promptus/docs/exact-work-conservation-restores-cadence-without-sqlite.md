---
id: finding-20260826T082356Z-exact-work-conservation-restores-cadence-without-sqlite
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-26 04:23:56"
relations: ["derives-from:event-20260826T074137Z-approve-the-no-sqlite-performance-tranche", "extends:finding-20260825T132149Z-promptus-maintenance-should-conserve-deterministic-work-across-h"]
links: [promptus-maintenance-should-conserve-deterministic-work-across-h, sqlite-is-justified-only-as-a-writer-aware-disposable-projection, artifact-hashing-should-deduplicate-for-time-and-stream-for-memo]
artifacts: [benchmark-receipt|benchmarks/results/maintenance-no-sqlite-candidate-v1-2026-08-26.json|4d3966e62aa528619f621351e3b5e59f558077e9ef43821bf184fbcb001dc8ea]
---
# Exact work conservation restores cadence without SQLite

Exact database-independent work conservation restored Promptus maintenance cadence on real MoT data without changing Markdown authority, retrieval semantics, health classifications, artifact-owner outcomes, or thinker bindings. The candidate reuses already-read source bytes across projection and verification, scans findings once for thinker custody, skips thinker refresh after unrelated writes, resolves and streams each canonical artifact once for every owner, suppresses byte-identical derived writes, and appends lexical postings without repeatedly copying arrays.

Against the prior measured baseline on the WSL Windows mount, session preflight fell from 57.66 to 15.46 seconds, indexing from 38.90 to 13.48 seconds, the authoritative full gate from 109.34 to 35.70 seconds, an ordinary governed write from 29.44 to 0.21 seconds, and a relation-bearing write from 35.36 to 7.55 seconds. The ext4 control also improved: preflight from 0.58 to 0.35 seconds, indexing from 2.80 to 1.02 seconds, the full gate from 3.61 to 1.72 seconds, and ordinary writes from 0.23 to 0.07 seconds. Index peak RSS fell from 649.0 to 396.4 MiB on WSL and from 675.1 to 414.2 MiB on ext4. The production thinker scan fell from 28.91 to 4.26 seconds while preserving all 16 bindings.

The comparison is deliberately conservative rather than byte-identical across dates: the candidate corpus was 19 units, 30 source files, and 30 artifact records larger than the prior-day baseline. Candidate outputs were checked directly against the same current source: catalog, graph, and search bytes matched on the source filesystem; canonical graph, lexical, and health semantics matched after the ext4 copy; all artifact-owner outcomes and readiness classifications matched. The complete repository suite passed 364 tests with 1,990 assertions, and plugin validation passed.

Engineering decision: take this exact no-SQLite tranche forward for review. Do not add a batch writer or partial health class yet: ordinary writes are sub-second and the exact full gate now meets the 30–40 second stress-mount budget. Relation resolution remains the measured residual and should be revisited only if repeated relation-bearing checkpoint writes still interrupt work. Retain the SQLite shadow result as optional future evidence for incremental projection; it is no longer required to restore cadence.

Related: [[promptus-maintenance-should-conserve-deterministic-work-across-h]] · [[sqlite-is-justified-only-as-a-writer-aware-disposable-projection]] · [[artifact-hashing-should-deduplicate-for-time-and-stream-for-memo]]

Related: [[promptus-maintenance-should-conserve-deterministic-work-across-h]] · [[sqlite-is-justified-only-as-a-writer-aware-disposable-projection]] · [[artifact-hashing-should-deduplicate-for-time-and-stream-for-memo]]
