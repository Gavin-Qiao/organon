# Private-copy result: maintenance improves; retrieval needs its own work

The bounded Psi/MoT trial passed correctness and resource checks. Raw parse reuse
reduced mean write–find–fetch time by **44% on Psi and 48% on MoT**, at about 5 MB
additional cache per project. It did not improve ordinary clean reads. This earns
a targeted read-path/integration decision, not automatic installation.

[Protocol](PRIVATE-PARSE-REUSE.md) · [Trial receipt](results/private-parse-reuse-windows-9p-2026-09-05.json)
· [Aggregate analysis](results/private-parse-analysis-2026-09-05.json)

## What was actually tested

Verified September 5 captures: Psi 6,494 units including 87 cold, MoT 6,332 units
with none cold. These are frozen source-only copies, not a claim about the latest
live state or external scientific artifacts. Private working copies were placed
outside the repository on Windows 9p; runtime copies used OS temp for both arms.
The previous fenced full-parser baseline was compared with the same isolated
cache candidate plus a staged-only pre-write size guard.

Each arm performed three ledger appends and three metadata amendments to an
inserted synthetic finding, alternating arm order. Each write was followed by
fresh-process selection, exact source fetch and ten clean queries. No real
scientific claim was amended. The ten-query mix rotated through the existing
query generator: 45 ordinary/control and 15 phrase-only queries per arm.
It is a controlled scenario, not recovered session telemetry or relevance labels.

## Latency

The following are **means**, pooling the three append and three amendment
workflows equally. Individual samples and per-operation summaries are retained.

| Seconds, full parser → reuse | Psi | MoT |
| --- | ---: | ---: |
| Write + find + exact fetch | 21.13 → 11.94 | 29.50 → 15.39 |
| Same workflow + ten clean reads, observed | 71.85 → 67.15 | 92.30 → 71.08 |
| Same workflow + 100 mixed reads, estimated | 528.28 → 564.07 | 657.45 → 572.24 |
| Same workflow + 100 ordinary reads, estimated | 66.84 → 61.50 | 75.96 → 66.26 |

The 100-read rows multiply measured mean query cost; they are not observed
100-read traces. Ordinary-only weighting and the query stratification were added
after inspecting the cost split, and are descriptive sensitivity analysis, not
a new preregistered adoption bar. Actual agent read/write ratios remain unknown.
The analysis uses midpoint medians for even sample counts; the original runner's
median field selects the upper-middle sample. Means above are unaffected.

| Clean-query median, full → reuse | Psi | MoT |
| --- | ---: | ---: |
| Ordinary/control queries | 449 → 492 ms | 466 → 507 ms |
| Phrase-only queries | 18.61 → 20.00 s | 23.08 → 20.68 s |

Ordinary reads are about 41–43 ms slower on their medians. Phrase differences go
in opposite directions across projects; do not attribute them to a new phrase
algorithm. None was introduced. Timing used fresh processes and warm/uncontrolled
OS caches; three update samples per operation do not establish population effects.

Source inspection explains a separate bottleneck: `lib/search.ts` starts with
every visible document when a query has only quoted phrases, then checks each
unit's normalized text. `lib/units.ts` already caches files/ledger parsing within
one process, but a new CLI process repeats the source reads. Parser reuse in
index construction does not accelerate this query path. Ordinary reads also
verify the additional raw-cache component even though ordinary ranking does not
consume its text. The precise attribution of ordinary-read overhead is unmeasured.

## Storage and resource boundary

| Logical bytes | Psi | MoT |
| --- | ---: | ---: |
| Additional raw gzip cache | 5,137,998 | 4,959,091 |
| Derived files, full → reuse | 21,847,020 → 26,985,093 | 24,422,920 → 29,382,099 |
| Per-arm replacement-overlap upper bound, full → reuse | 54,649,307 → 59,787,371 | 60,478,957 → 65,438,132 |

Derived growth is about 23.5% / 20.3%, not zero duplication. Every incremental
build parsed one physical file and reused 2,678 / 2,940 others. Append still reads
the whole 4.5 / 5.1 MB live ledger. Original traversal, global lifecycle resolution,
index construction and other inspections remain charged; parser counters do not
account for all source I/O. The raw JSON is about 17.6 / 18.2 MB before compression.

The 16 MiB compressed-cache guard, checked before replacement, was not reached.
The maximum sampled subprocess-tree RSS across all 416 logged commands was
761,208 KiB (about 743 MiB), below the 1 GiB stop. Sampling every 100 ms can miss
short peaks and double-count shared pages; this is not whole-host peak RAM.
The 60-second supervisor deadline retained the existing wrapper's stricter
30-second timeout for its nested writer/query invocations. No command failed.

The 256 MiB between-phase scratch stop monitored the Windows working-copy root;
its observed maximum was 91,827,635 bytes. Private runtime/log notes were retained
separately, 2,016,521 bytes at measurement. Logical replacement bounds and steady
allocated-byte values are recorded; instantaneous allocated-block/journal peaks
and power-loss safety are not certified.

## Correctness, privacy and cleanup

- Both corpora/arms match all three canonical index components byte-for-byte,
  without forcing the candidate back to full parsing before comparison.
- Both candidates' cached raw units equal full canonical source collection.
  All eleven query controls match canonical output; inserted writes and metadata
  statuses are visible through fresh processes and exact fetches.
- Frozen input manifests remain unchanged. Unrelated copied files are unchanged;
  the physical ledger and synthetic probe page are the explicitly allowed writer
  mutation paths. This is not a separate byte audit of old ledger history or an
  external-artifact/whole-project health certificate.
- Production script hashes and all pinned trial code remain unchanged. Private
  source, query text, paths and diagnostics were not copied into public receipts.
  A syntax error in the new helper was caught and fixed before measurement.
- All 416 experiment commands succeeded. Repository verification: **465 tests,
  zero failures, 2,984 assertions across 46 files**; both plugin adapters validate.
  New tests cover privacy filtering, pre-write quota refusal, process-group
  timeout, failure-preserving analysis and median calculation.
- Generated working copies were removed: 81,745,553 bytes for Psi and 91,827,635
  for MoT, **173,573,188 bytes total**. The working-copy root is empty. The originals
  and small private logs remain available to reproduce or inspect the experiment.

## Next decision

Keep the current production candidate unchanged until the read path is addressed.
The strongest bounded follow-up is to test phrase verification against the raw
text already cached, preserving existing matching/ranking and exact source fetch,
without creating a second stored text/index copy. Also review whether ordinary
reads need to verify an auxiliary cache they do not consume. Both are proposals,
not implemented results or permission to weaken freshness checks.

Integration still needs explicit handling of quota fallback, reader/writer
contention and outside edits. The inherited one-second experimental reader lease
timeout is not a production policy. Unseen Obsidian/external edits remain outside
the governed-write freshness claim. No database, GPU, daemon, production migration,
commit, push, tag, release or installed-plugin change occurred in this trial.
