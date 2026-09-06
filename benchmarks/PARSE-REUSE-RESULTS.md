# Raw parse reuse: measured maintenance benefit, not a deployment decision

The isolated candidate reduced synthetic write–find–fetch workflow medians by
45–57% against the **previous fenced full-parser baseline** on Windows 9p. This
is not a comparison against an installed product, a relevance gain, or a clean
query speedup. Production scripts, installed caches and live project stores were
not changed by this experiment.

[Protocol](PARSE-REUSE.md) · [Machine receipt](results/parse-reuse-windows-9p-2026-09-05.json)
· [Regression tests](parse-reuse.test.ts)

## Results

Each corpus starts with 512 pages and 4,096 ledger units. Both arms start from
identical source hashes and use the same guarded publication workflow. Five
samples per operation alternate arm order; each workflow runs a fresh writer,
find and exact source fetch. Generated timestamps/IDs differ between arms after
writes, so final parity is checked independently against the canonical rebuild
of each arm's actual source, not by equating the two final source hashes.

| Median | Repeated text: full → reuse | Less-compressible text: full → reuse |
| --- | ---: | ---: |
| Append + find + fetch | 3.674 → 1.683 s | 4.160 → 2.267 s |
| Amend + find + fetch | 3.404 → 1.453 s | 3.895 → 2.046 s |
| Clean fresh-process find | 273 → 306 ms | 413 → 418 ms |

Clean reads show no benefit. Initial full indexing also costs more with the
candidate: 2.680 → 2.810 s and 3.120 → 3.560 s respectively (one sample each,
not a repeated build benchmark).

| Logical bytes after measured traces | Repeated: full → reuse | Less-compressible: full → reuse |
| --- | ---: | ---: |
| Derived files | 4,018,274 → 4,193,064 | 11,645,732 → 14,177,185 |
| Raw parser cache alone | 0 → 174,689 | 0 → 2,531,365 |
| Source + derived files | 10,734,736 → 10,909,526 | 18,196,306 → 20,727,759 |
| Conservative logical peak bound | 16,676,615 → 16,851,405 | 28,775,415 → 31,306,868 |

Derived growth is about 4.35% / 21.74%. The peak bound includes replacement
overlap: per-file before/after maxima plus the largest single replacement and
1,024 bytes for the lease. It is not a measured RAM, journal or allocated-block
peak. The receipt separately records steady filesystem-reported allocated bytes.
The less-compressible control uses a deterministic 4,096-token dictionary; it is
neither representative project prose nor worst-case entropy.

## What was reused, and what was not

Every incremental build parsed one physical file and reused 512 others. Page
amendment parsed roughly 1.5 KB and reused the ledger. Append still read and
parsed the entire 5.8–5.9 MB ledger, including its preceding entry's changed
extent. Exact ledger fetching also reads the physical ledger; that cost remains
in the workflow timings.

The original traversal still performs eight directory reads yielding 1,028
entries at this scale. Original ownership, ordering, parsing and full global
lifecycle resolution are retained, as are full tokenization and serialization.
Writer validation remains source-only. Parser byte counters do not count every
read/stat elsewhere in the workflow.

The gzip file duplicates raw unit text. About 7.8–8.0 MB of JSON is decoded and
re-encoded per update; RAM high water was not measured. The loaded entries are
cloned before effective status projection, so removing a superseding relation
can restore the unchanged target's declared status. Compression, cache loading,
replacement and receipt hashing are included in end-to-end latency.

The cache joins the publication receipt's hashed components. Missing, corrupt,
incompatible or interrupted state falls back to full parsing. Explicit full
reconciliation and source-hash certification bypass reuse. Ordinary navigation
still cannot certify unseen outside edits; same-buffer exact fetching can detect
a selected file's revision change without certifying the whole store.

## Verification and reproducibility

- Sixteen new regressions pass: raw/canonical parity, lifecycle restoration,
  aliases and query controls, cold/live and nested ownership, custom lifecycle
  ordering, legacy identities, CRLF/fenced headers, cache interruption and loss,
  bounded dirty-map overflow, outside-edit limits and source certification.
- All three derived components match full canonical rebuilding byte-for-byte in
  both corpus/arm pairs, without first forcing the candidate back to full parsing.
- Full repository suite: 459 pass, zero failures, 2,965 assertions across 44 files.
  Marketplace/plugin validation and whitespace checks pass.
- The initial certification test invoked the staged indexer without configuring
  its fence and failed at the guard. It was corrected to run through the guarded
  read port. A missing brace in the trial runner was caught before measurement.
  Neither is hidden as a successful test or included in the timing samples.
- The receipt pins the runner, helper, protocol and test bytes at invocation,
  plus the complete staged script tree. Its `candidateInstrumentation.changed`
  values are intermediate transform hashes; `candidateTree` is the authoritative
  final staged tree (wrappers are appended after some transforms).
- The trial verified production script hashes unchanged and removed its exact
  generated synthetic scratch directory, 61,868,472 logical bytes. Prior receipts,
  frozen private captures and all four live project stores remain outside scope.

```sh
bun test benchmarks/parse-reuse.test.ts
bun benchmarks/parse-reuse-trial.ts .promptus/cache benchmarks/results/NEW-parse-trial.json
```

The scratch parent must already exist; the receipt path must not. The runner
generates marked fixtures and removes only its own unique scratch directory.
It needs no GPU, model, database, daemon, watcher or network. Fresh processes use
warm/uncontrolled OS caches; five samples do not establish a population estimate.

## Next decision

Retain production as-is. The candidate has earned a disposable real-copy test,
with a chosen disk/RAM allowance and representative read-to-write ratios. Frequent
clean reads can erode maintenance savings. Integration also needs its own review
of lock contention, fallback cost and dirty-source coverage; the inherited
one-second experimental reader timeout is not a production policy. Do not restart
backend selection or promote this experiment merely because parser reads fell.
