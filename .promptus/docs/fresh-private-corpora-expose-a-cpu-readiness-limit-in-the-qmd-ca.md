---
id: finding-20260905T045735Z-fresh-private-corpora-expose-a-cpu-readiness-limit-in-the-qmd-ca
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-09-05 00:57:35"
relations: ["extends:finding-20260905T005525Z-fresh-workload-trials-favor-qmd-as-an-optional-semantic-route"]
links: [sqlite-is-justified-only-as-a-writer-aware-disposable-projection, fresh-workload-trials-favor-qmd-as-an-optional-semantic-route, exact-work-conservation-restores-cadence-without-sqlite]
artifacts: [cpu-replay-summary|benchmarks/results/local-cpu-replay-2026-09-05.json|b31c8b9908c481dbf2fa848c834d2708e649c6d923635ae73b91b4d532e95fff]
---
# Fresh private corpora expose a CPU readiness limit in the QMD candidate

Fresh, content-verified source-only snapshots of the latest local Psi and MoT checkouts contain 6494 units (87 cold) and 6332 units (no cold), respectively. Both original snapshot manifests remain unchanged after all trials; the live stores were only read during capture. Private text, query labels, rankings, vectors and detailed logs remain outside this repository. The public aggregate receipt records four passing replays and one failed QMD build, not five passes.

On this host's memory-backed tmpfs, fresh-process exact-ranking SQLite queries had medians of 66 ms (Psi) and 70 ms (MoT), versus 184 and 191 ms for the JSON index. All 12 initial equivalence cases and post-write ordering/scores, canonical digests and lifecycle/restart checks passed. Three individual ledger writes per corpus each updated two affected records, including the preceding ledger slice. Write plus full source-scan delta preparation plus SQL update took median 279 and 290 ms; full index refresh alone took 1.27 and 1.25 s. These are not atomic production source-plus-index transactions and not persistent-disk durability timings. The current in-memory lexical route remained faster than SQLite on repeated-query medians.

The actual QMD adapter with local EmbeddingGemma 300M failed its initial Psi CPU build at the existing 20-minute timeout, with peak reported RSS 2.77 GiB. It released its operation lease and published no successful semantic receipt. A deliberate concurrent bounded query returned lexical fallback in 2.15 s during the build. The QMD arm stopped at this readiness failure: no MoT QMD build, post-build queries, or incremental QMD refresh timings are claimed. This is evidence about the pinned adapter/model/configuration on this corpus and host, not a proof that QMD cannot run on CPU.

The existing zvec-grep CPU adapter with Potion 32M completed full builds in 19.6 and 21.2 s. Per-record refresh including projection took median 3.37 and 3.29 s; repeated queries with canonical pre/post scans took about 644 ms. All inserted synthetic records were indexed and found, refuted record content was updated, and a new process reopened successfully. The full harness reported about 2.15-2.22 GiB RSS. Raw zvec results still need Promptus-owned lifecycle policy. Different models, chunkers and verification paths prevent an engine-only inference; title queries and synthetic insertion checks do not establish independent real-project semantic relevance.

Decision: keep lexical default, investigate writer-aware SQLite on persistent disk before any integration, and reopen zvec-grep as a CPU semantic candidate. The earlier synthetic QMD ranking advantage does not establish current full-corpus CPU readiness. Nothing was installed, committed or released, and production code from the completed overhaul was not changed. The protocol retains harness corrections and original failed/partial-scope receipts instead of rewriting them.

Related: [[sqlite-is-justified-only-as-a-writer-aware-disposable-projection]] · [[fresh-workload-trials-favor-qmd-as-an-optional-semantic-route]] · [[exact-work-conservation-restores-cadence-without-sqlite]]

Related: [[sqlite-is-justified-only-as-a-writer-aware-disposable-projection]] · [[fresh-workload-trials-favor-qmd-as-an-optional-semantic-route]] · [[exact-work-conservation-restores-cadence-without-sqlite]]
