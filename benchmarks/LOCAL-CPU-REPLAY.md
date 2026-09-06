# Local CPU retrieval replay

This follow-up tests the operator's repeated-retrieval, individual-write workflow
against fresh, private Psi and MoT Promptus snapshots. It does not change the
completed overhaul candidate's production storage or install any plugin.

## Scope and acceptance

- Copy current `.promptus` source into new physical OS-temp directories. Refuse
  links and special files. Require matching source-before, source-after and copied
  content manifests. Exclude disposable caches and locks; never copy external
  experimental artifacts or modify the live source.
- Keep private text, query labels, vectors, logs and derived indexes outside this
  repository. Public reporting contains only aggregate metrics and content hashes.
- CPU is mandatory. Disable GPU visibility and explicitly select CPU for QMD and
  zvec-grep. Use separately staged local models, offline fetch guards and no installs.
- Replay the current lexical route and the existing exact-ranking SQLite shadow.
  Charge source collection/delta preparation separately from SQL updates. Rebuilding
  an independent correctness oracle is measurement work, not candidate update work.
- Test repeated reads, fresh-process reads, three individual governed additions,
  immediate lexical visibility, a gated status transition and restart. Preserve
  result identity, ordering, scores and status; lexical down-ranking of inactive
  evidence must not be mistaken for exclusion.
- Measure QMD through the actual one-shot Promptus adapter, including model/index
  verification and worker startup. Measure zvec-grep with its existing CPU adapter
  and canonical source checks. These stacks have different integration costs and
  models; their timings do not isolate the vector database itself.
- Full-corpus semantic title queries are latency probes, not relevance ground truth.
  Synthetic inserted records test freshness. No general quality winner can be
  selected from those probes.

## Runners

`local-retrieval-snapshot.ts SOURCE LABEL` creates and verifies a private snapshot.
`local-retrieval-replay.ts run SNAPSHOT` tests lexical/SQLite behavior and cost.
`local-semantic-replay.ts run SNAPSHOT DEPENDENCIES qmd|zvec` tests an existing
semantic stack. Dependencies must be in the marked temporary engine-trial directory.
Run timing trials sequentially to avoid competing workloads. All workspaces and
receipts are retained, including failed attempts. The frozen snapshot is verified
again after each successful replay.

The initial QMD Psi build includes one deliberately concurrent, bounded lexical
fallback probe; its approximately two seconds of competing work are not subtracted.
That build reached the adapter's existing 20-minute timeout. The QMD arm was stopped
at that readiness failure rather than repeating the long build on MoT: no MoT QMD
timing or impossibility claim follows. Zvec trials run on both full corpora.

Harness corrections are retained openly. An initial lexical/SQLite assertion
mistook inactive down-ranking for exclusion. An initial QMD call used incorrect
CLI arguments and failed before model execution. Early zvec trials lacked a full
ordinary lexical baseline before their first insertion, so their immediate-lexical
latencies are not full-corpus measurements. The final zvec protocol explicitly
rebuilds and counts the complete lexical index before timing the write/read loops.

The current host mounts `/tmp` as **tmpfs (memory-backed)**. These are therefore
CPU/parser/runtime measurements with memory-backed index I/O, not persistent-disk
commit costs or current live-project latencies on a Windows mount. The SQLite
durability configuration is exercised, but tmpfs cannot establish disk-durability
performance. Original filesystem effects, independent semantic
labels, fault-tolerant production delta integration and broader hardware coverage
remain separate questions. Fast SQL transactions alone do not justify adoption.

## Results from the September 5 capture

The [aggregate receipt](results/local-cpu-replay-2026-09-05.json) contains five
completed attempts, including the failed QMD build. Psi has 6,494 units (87 cold);
MoT has 6,332 units (none cold). Both frozen source manifests remain unchanged.

| Measurement | Psi | MoT |
| --- | ---: | ---: |
| Fresh JSON-index process, median of three queries | 184 ms | 191 ms |
| Fresh exact-ranking SQLite process, same queries | 66 ms | 70 ms |
| Governed ledger write + full-scan delta preparation + SQL update | 279 ms | 290 ms |
| Full current index refresh alone | 1.27 s | 1.25 s |
| zvec-grep full initial build | 19.6 s | 21.2 s |
| zvec-grep single-record refresh, including projection | 3.37 s | 3.29 s |
| zvec-grep repeated read with canonical pre/post scans | 644 ms | 644 ms |

SQLite preserved all 12 initial query cases, exact post-write query ordering and
scores, canonical unit digests, explicit status filtering and restarted reads in
both corpora. Three individual ledger additions per corpus all became visible.
The existing in-memory lexical route remained faster on the repeated-query median
(about 1.5–1.6 ms versus SQLite's 2.2–2.5 ms). SQL is not uniformly faster.

QMD with EmbeddingGemma 300M reached the current adapter's 20-minute CPU build
timeout on Psi; its reported peak process RSS was 2.77 GiB. No completed semantic
receipt was published and the operation lease was released. A concurrent read
returned lexical fallback in 2.15 s while that lease was held. Subsequent QMD
queries and single-record refreshes are **unmeasured**, not inferred to be slow.

Zvec-grep with Potion 32M completed both builds, indexed and retrieved the three
synthetic insertions, refreshed the synthetic refutation's stored content, and
reopened successfully. Its raw SDK does not enforce Promptus lifecycle semantics:
canonical status interpretation remains adapter-owned. The measured full harness
reported approximately 2.15–2.22 GiB RSS, so this is not a low-memory certification.
Models, source code and frozen input copies remained unchanged during the final
zvec runs. The staged versions were QMD 2.8.3 and zvec-grep 0.2.1; no new packages
or models were installed.

### Decision supported by this pass

Keep lexical retrieval as the production default. Reopen zvec-grep as a CPU
semantic candidate; the earlier synthetic QMD ranking advantage does not establish
readiness on a full research corpus. Do not infer an embedding-quality winner from
title queries or from these different-model, different-adapter timings.

SQLite remains the strongest next incremental-index experiment. Its measured
preparation still scans the canonical store; it is not yet a source-plus-index
transaction integrated into the gated writer. Before adoption, test that contract
on persistent disk, including interruption, external edits, deletion, and recovery.
No source-of-truth migration, production backend switch, commit, release or install
is authorized by a successful benchmark.
