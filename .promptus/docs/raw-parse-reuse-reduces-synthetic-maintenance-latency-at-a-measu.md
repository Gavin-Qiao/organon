---
id: finding-20260905T092949Z-raw-parse-reuse-reduces-synthetic-maintenance-latency-at-a-measu
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-05 05:29:49"
links: [finding-20260905T085059Z-the-isolated-publication-fence-preserves-visibility-but-does-not, event-20260905T090753Z-evaluate-raw-parse-reuse-behind-the-isolated-publication-fence]
artifacts: [parse-evidence-0|benchmarks/parse-reuse.ts|73adbba3ae4c6d526f07d4e0b90bbc1d9b26579407619cd7302ab97774ed2b5b, parse-evidence-1|benchmarks/parse-reuse-stage.ts|1dbb6d94c219adbe42aa17f6fa266ba6146714a7ce1393cfd99f5539c911fd67, parse-evidence-2|benchmarks/parse-reuse-trial.ts|866ef6f74a5b9eae37ac035fedadb61911bbcb8a5c57386ae0e173fadd10163f, parse-evidence-3|benchmarks/parse-reuse.test.ts|cf51069fca5fe0561462f8c1f8a152777e99fa8e68e96ab94342589566f1eb43, parse-evidence-4|benchmarks/PARSE-REUSE.md|e40ba356966f27348a5e40b137f68c86914687ba0f3cbf8fbd5e8a846d994ab4, parse-evidence-5|benchmarks/PARSE-REUSE-RESULTS.md|796b803580a8d355d516d07981ef487c3cd235da54d986cac4ed37006883a081, parse-evidence-6|benchmarks/results/parse-reuse-windows-9p-2026-09-05.json|272dbfa02b721f17127f8e4c76908edcd77a1008e8c2e6f3bd717280a372d7f8]
---
# Raw parse reuse reduces synthetic maintenance latency at a measured storage cost

## Bounded result

The benchmark-only raw parse cache reduces synthetic end-to-end maintenance against the prior fenced full-parser baseline, while adding disk/CPU work and no demonstrated clean-navigation benefit. This is a VALIDATED empirical observation on two synthetic Windows 9p corpora, not validation of production adoption or of the broader design.

Each corpus began with 512 pages plus 4,096 ledger units. Five samples per arm/operation alternated arm order. Write–find–exact-fetch medians full/reuse: repeated-text append 3.674/1.683 s, amendment 3.404/1.453 s; heterogeneous append 4.160/2.267 s, amendment 3.895/2.046 s. Clean fresh navigation 273/306 ms and 413/418 ms respectively. Initial indexing was slower with caching, measured once per arm. Starts were source-hash identical; final generated timestamps/IDs differ, and canonical parity was checked per arm's actual source.

Additional gzip raw cache: 174,689 bytes repeated, 2,531,365 bytes heterogeneous. Total derived files full/reuse: 4,018,274/4,193,064 and 11,645,732/14,177,185 bytes. Source-plus-derived logical peak upper bounds: 16,676,615/16,851,405 and 28,775,415/31,306,868 bytes. Bounds include sequential replacement overlap, not RAM/journal/allocated-block high water. The heterogeneous control uses a deterministic 4,096-token dictionary, not representative project prose or worst-case entropy. Full raw JSON is about 7.8–8.0 MB; peak RAM remains unmeasured.

## Why the result is interpretable

Every incremental build parsed one physical file and reused 512. Append still reads/parses the entire 5.8–5.9 MB ledger and exact fetch reads it again; page amendment parses about 1.5 KB. Canonical directory traversal remains (eight reads, 1,028 entries); global lifecycle projection, lexical tokenization, serialization and writer validation remain charged. Parser counters are not claims about all process source I/O. Raw objects are cached before projection and cloned on retrieval, preserving effective-status recomputation when relations disappear.

The compressed cache is bound into the fenced publication receipt. Missing/corrupt/incompatible/interrupted state and full reconciliation force complete parsing. Certification bypasses reuse and hashes the same source buffers. Outside body edits can remain unseen under governed navigation, which continues to disclaim snapshot certification; exact fetch verifies only its selected buffer.

Sixteen focused regressions pass with raw-unit and byte-exact catalog/graph/search parity, lifecycle restoration, nested/cold ownership, ordering-sensitive custom relations, aliases, legacy/CRLF/fenced input, interruptions, dirty overflow and source certification. Canonical output parity also passes for all four measured corpus/arm pairs. Full suite observed: 459 pass, 0 fail, 2,965 assertions across 44 files; plugin adapters validate and git diff --check passes.

## Decision and remaining boundary

Keep this isolated: no production, installed-plugin or live Psi/MoT/Probatio/Mensura change, and no backend adoption. The next useful test is a bounded disposable-real-copy workload with an explicit disk/RAM allowance and representative read-to-write ratio. Frequent clean reads can erode the measured maintenance gain. Lock contention, dirty coverage, unknown outside edits, physical-ledger costs and power-loss behavior remain separate integration questions. No need to restart semantic comparisons or add a database.

Full protocol, implementation, regression and machine receipt are artifact dependencies. The result document explains intermediate versus final staged-code hashes. Synthetic trial scratch was removed (61,868,472 logical bytes); prior receipts and private captures were preserved. The Promptus recording workflow preserves both the successful experiment and the initial harness setup/syntax failures, without promoting a timing result into scientific or global-freshness authority.

Related: [[finding-20260905T085059Z-the-isolated-publication-fence-preserves-visibility-but-does-not]] · [[event-20260905T090753Z-evaluate-raw-parse-reuse-behind-the-isolated-publication-fence]]
