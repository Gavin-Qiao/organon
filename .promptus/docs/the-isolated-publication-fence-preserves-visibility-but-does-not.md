---
id: finding-20260905T085059Z-the-isolated-publication-fence-preserves-visibility-but-does-not
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-09-05 04:50:59"
relations: ["extends:finding-20260905T070106Z-a-changed-file-publication-fence-merits-a-bounded-trial-before-b"]
links: [event-20260905T083953Z-retain-the-initial-publication-trial-and-remove-duplicated-amend]
artifacts: [refined-publication-trial|benchmarks/results/publication-fence-reuse-windows-9p-2026-09-05.json|a46d025a6feaaec0e6eaba333c0ed5761c925b8425d52877b79ea618ee17deb3, publication-regressions|benchmarks/publication-fence.test.ts|fe6131859aaceab2ba85fdf35bfe3005d507fb930f93755578d62ede662052be]
---
# The isolated publication fence preserves visibility but does not yet earn adoption

## Result and decision

The benchmark-only existing-backend publication slice preserves governed fresh-process visibility and source-derived output in the tested cases, but is not a retrieval speedup and has not earned production adoption. Keep the implementation isolated. No SQLite, embedding engine, watcher, daemon or source-schema migration is justified by this result.

This is a bounded empirical finding, not validation of the entire thinker's proposed architecture. Persistent changed-file parsing remains unimplemented and its ordered raw-cache equivalence remains unresolved. The original design finding stays CONJECTURED.

## What was built and independently checked

An isolated runtime copy instruments the existing writer lease and atomic replacement boundaries; production scripts remain byte-identical. Writers persist a bounded dirty barrier before source mutation. Participating readers hold the same existing lease, reconcile pending state with the existing full collector/index builder, hash completed components and publish CLEAN last. An amendment completion hook reuses the successful full rebuild already performed by kb-amend inside its lease. No second parser, scorer or lock was built. The fixture-only fetch shim reuses the canonical ledger splitter and hashes/parses one selected source buffer; it is not a replacement for all production kb-get options.

Twenty-three focused regressions passed on tmpfs. They cover fresh-process append -> find -> exact fetch, the changed previous ledger slice, unchanged-target supersession, metadata/body preservation, exact-query parity, six concurrent writers and six concurrent readers, injected ENOSPC at source/publication cuts, a genuinely killed source writer, exact dead-owner lease clearance, corrupt/missing cache, bounded dirty-path overflow, multi-file partial memory writes and unobserved outside edits. Failed operations do not acknowledge; recovery reconciles actual Markdown rather than rolling it back. A retry of the partial memory creation refuses the existing file rather than duplicating it. This does not establish general idempotent retries.

The negative control reproduced the existing gap: after a governed superseding addition, direct ordinary lookup can still report the unchanged target as VALIDATED until indexing; the participating fenced reader reconciles and returns the derived SUPERSEDED status. Outside edits remain explicitly unknown/unbounded. CLEAN means a coherent governed navigation generation, not whole-store health, scientific validity, exhaustive recall or an atomic source/artifact snapshot.

## Actual-mount comparison

The trial used Windows-mounted WSL 9p, not tmpfs, for normal workflow timing and canonical parity. Each fresh synthetic store began with 512 pages and 4,096 ledger units; repeated synthetic ballast is intentionally not real-project relevance or high-entropy postings evidence. Five samples per operation/arm use fresh CLI processes with warm/uncontrolled OS page cache. Baseline includes existing maintenance where needed: explicit full indexing after append, but not a redundant rebuild after kb-amend.

| Operation, complete measured workflow | Baseline median | Refined fence median |
| --- | ---: | ---: |
| Append -> reconciliation -> find -> get | 3.553 s | 3.778 s |
| Amend -> find -> get | 3.313 s | 3.430 s |
| Clean fresh-process navigation | 172.3 ms | 274.6 ms |

Catalog, graph and full search JSON exactly matched an ordinary canonical rebuild in both arms, without changing source. The final derived footprints were 4,018,741 and 4,019,302 bytes: 561 additional bytes for the observed clean control state, not a universal constant or a second persistent database. Final source-plus-cache footprints were 10,735,389 and 10,735,950 bytes. The synthetic ledger alone was 5,941,037 bytes: appending a tiny unit still replaces that physical file.

Logical peak upper bounds during measured traces were 16,676,138 versus 16,676,699 bytes, counting per-file old/new maxima and a replacement temporary plus a small lease allowance. A separate instrumented fenced append observed 16,675,994 bytes while the source temporary overlapped its old file. These are logical file bytes, not allocated blocks, RAM, power-loss flush costs or OS journal internals. Recursive peak scans ran only in the separate profile, not latency samples.

The initial retained trial showed 2.995 s baseline versus 5.761 s fenced amendment workflows: the prototype redundantly rebuilt after kb-amend's completed rebuild. The refinement removed that duplicate work and added a no-rebuild regression. These sequential development trials are not a statistical causal study; the initial observation and original gate source are retained rather than overwritten.

## Evidence and limits

- Final numeric receipt: benchmarks/results/publication-fence-reuse-windows-9p-2026-09-05.json, SHA256 a46d025a6feaaec0e6eaba333c0ed5761c925b8425d52877b79ea618ee17deb3. It retains all samples, phase metrics, component-byte work, footprint data and code hashes.
- Initial numeric receipt: benchmarks/results/publication-fence-windows-9p-2026-09-05.json, SHA256 48a7aaca830c83dd810d995bfe289a5e7cd44407b9efd8a0cad3a16d3dbce132. Initial gate source is retained as results/publication-fence-initial-gate-2026-09-05.txt.
- Protocol: benchmarks/PUBLICATION-FENCE.md. Post-initial refinement: benchmarks/PUBLICATION-FENCE-REFINEMENT.md. The sealed thinker prompt/plan/response were not edited.
- Full repository suite: 443 pass, 0 fail, 2,746 assertions across 43 files. Both plugin adapters validate. The focused 23-test suite passed separately before the final timing run.
- Runtime fault tests ran on tmpfs; normal workflows and parity ran on 9p. No physical disk-full, power-loss, native Windows/macOS, or native ext4 certification is claimed. ENOSPC is injected at protocol boundaries.
- All participating experiment ports must use the gate. Direct unwrapped writers/indexers bypass it. The one-second experimental reader timeout is not an approved production policy. Availability and tail contention need deployment-specific review.
- Reconciliation still performs full discovery/parsing/resolution and may serialize large derived files. Existing kb-amend rebuild time is included in writeMs, not separately measured by the reader-rebuild counters. Source I/O inside reused scripts is not completely instrumented; zero reader-rebuild metrics do not mean an amendment did no indexing.
- After measurements, only the reporter's cleanup-accounting order was adjusted so removed=true is recorded after deletion actually succeeds. Measured protocol code and timing rows were not changed.

## Next boundary

The smallest remaining performance investigation is reuse of unchanged physical-source parses and already completed publication, while preserving canonical order, configuration, cold/live scope, raw/effective status separation and outside-edit honesty. Full logical resolution and whole-ledger work must still be charged. Do not substitute a database experiment for that missing work, and do not promote this prototype merely because its control file is small. Choose meaningful latency and steady/peak storage allowances before adoption.

The authorized consistency slice is complete. No live Psi/MoT/Probatio/Mensura store was read or modified; no installed plugin, production implementation, dependency installation, commit, push, tag or release changed. Only benchmark code/docs and Organon's gated research records changed. Both successful trial scratch directories were removed (about 22.1 MB each, sequentially); original private snapshots and historical evidence were untouched.

Related: [[event-20260905T083953Z-retain-the-initial-publication-trial-and-remove-duplicated-amend]]
