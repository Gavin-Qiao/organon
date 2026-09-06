ROUND_ID: markdown-io-delta-design

## 1. Verdict and assumptions

**Retain the working source candidate. Extend its source-to-index publication boundary before replacing its retrieval engine.**

The smallest useful delta is a **bounded, persistent changed-file fence**: governed writers record that particular source paths require reconciliation; independent readers cannot silently reuse an earlier index generation. Reconciliation reparses changed physical files, runs the existing canonical lifecycle resolver, and publishes one coherent derived view.

This is not a new authoritative ledger, a collaborative editor, or a general transaction system. It is a small recovery and visibility mechanism around existing modules.

Keep the current lexical backend as the default until one storage experiment earns replacement. The existing exact-ranking SQLite shadow is the only accelerated candidate worth carrying into that experiment: it already provides a tested comparison and does not require choosing another ranker. Its broad schema and measured footprint are **not** the proposed deployment.

The supplied observations support two specific opportunities:

* Fresh-process lexical queries incur costs that a persistent posting store may reduce. The SQL shadow’s 66–70 ms medians versus JSON’s 184–191 ms warrant investigation, but warm-memory results do not support replacing the scorer or adding a daemon.
* Delta preparation still performs a full canonical scan. Avoiding unchanged-file discovery, reading and parsing is an opportunity independent of which posting store wins.

They do **not** establish an unacceptable current latency, an affordable deployment footprint, persistent-disk performance, or a semantic-retrieval advantage requiring adoption. The QMD timeout and vector pilot provide no reason to expand this delta into a semantic-backend project.

**The unchanged-system option remains defensible.** With no latency target or disk allocation, retaining current maintenance and freshness gates is preferable to adding infrastructure merely to improve a benchmark.

### Explicit operating assumptions

The protocol’s governed-write guarantees assume that all participating writers and cache readers use the same existing store lease, source replacement has the assumed per-file atomicity on the target storage, and canonical resolution is deterministic for a fixed source set. Hash comparisons assume the existing digest is suitable for identifying source revisions.

These are process-coordination assumptions, **not power-loss durability guarantees**.

Two stronger guarantees require additional conditions:

**Lossless read–modify–write against arbitrary external editors** requires external quiescence during the operation, their participation in a common protocol, or a storage mechanism providing an appropriate conditional update. A pre-rename hash check alone is insufficient.

**A globally current, point-in-time source/artifact certificate** requires a stable snapshot covering its entire scope or external quiescence during complete verification. A local counter, watcher, returned-file check, or ordinary sequential scan cannot independently supply that guarantee.

Implementation details necessary to establish these assumptions on each target filesystem are **NEEDS_VERIFICATION**.

## 2. Reuse-first delta table

| Component                                                | Decision and smallest change                                                                                                 | Reused primitive                                                           | Compatibility, code consequence and rollback                                                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative Markdown, identities and history           | **KEEP.** No source schema migration.                                                                                        | Existing canonical reader and governed commands.                           | Preserve configured roots, including hidden stores. No semantic code is removed. Rollback leaves ordinary Markdown unchanged.                                                                                         |
| Writer lease and per-file replacement                    | **EXTEND.** Record an invalidation intent before source mutation and an acknowledgement boundary afterward.                  | `withStoreLock`, `atomicStoreWrite`, existing hashing.                     | Verify all mutation paths are fenced and temporary replacement stays within supported filesystem boundaries. Do not build another lock implementation. Rollback requires one full rebuild before trusting old caches. |
| Canonical parsing and lifecycle                          | **EXTEND.** Reuse parsed summaries for unchanged files; rerun the existing lifecycle resolver over the complete logical set. | Existing parser/resolver, factored only where necessary.                   | Separation of parsing from resolution is **NEEDS_VERIFICATION**. This removes repeated unchanged-file work, not canonical semantics. Fall back to `collectEffectiveUnits` if equivalence cannot be established.       |
| Lexical ranking and controls                             | **KEEP.** Preserve scoring, tie-breaking, phrases, required terms, filters and lexical inactive-evidence demotion.           | Existing `searchIndex` behavior and exact-ranking shadow.                  | No new BM25 implementation. A scoring-library replacement is deferred rather than disguised as a storage change.                                                                                                      |
| Persistent lexical storage                               | **DEFER REPLACEMENT.** Test a reduced version of the existing SQL shadow against the baseline.                               | Existing shadow and embedded transaction machinery.                        | Preserve required phrase/filter state; verify Bun integration and target-storage behavior. If promoted, remove the superseded lexical representation rather than maintain both permanently.                           |
| Catalog, graph and cache publication                     | **EXTEND.** One publisher owns reconciliation and the final clean receipt.                                                   | Existing builders and atomic replacement; SQL transactions where selected. | Existing consumers must not accept partially published artifacts. This consolidates publication responsibility; it does not create a new evidence model. An interrupted publication triggers rebuilding.              |
| Exact fetching and freshness gates                       | **KEEP + EXTEND receipts.** Bind results to unit identity, revision, extent, lifecycle generation and verification scope.    | Existing `kb-get`, health checks and artifact verification.                | No weaker check retains a stronger label. Existing exact-unit and artifact checks are not replaced by index metadata.                                                                                                 |
| Semantic adapters, watchers, daemon and section indexing | **DEFER expansion.** Keep QMD optional with existing stale-state fallback; do not install zvec as another backend.           | Existing adapter and fallback.                                             | No new model download, watcher service or app-only API dependency. Adding section documents would be a separately evaluated ranking change.                                                                           |

The protocol adds a small amount of necessary coordination code. It does **not** justify writing a custom database, filesystem watcher, Markdown parser or transaction log. If SQL earns adoption, reuse its storage machinery; the source/index boundary still needs an explicit fence because source files are outside its transaction.

## 3. Concrete protocol

### Authority and identity

Markdown remains authoritative. The catalog, graph, postings, parsed summaries, semantic projections and operational control record are derived or operational state. None may resolve a disagreement by overwriting scientific source.

Use the canonical reader’s identities:

**Unit identity.** A modern canonical ID, or the existing legacy identity incorporating the necessary source locator and full title. A timestamp alone is insufficient. Do not invent identity continuity across a legacy rename or move.

**Chunk identity.** A chunk is subordinate to a unit. An explicit stable section identifier may be used when one actually exists. Otherwise, identify a section within a particular revision, for example by parent unit, source digest and extent. Such an identifier is not claimed stable after editing.

**Source extent.** Store the physical path and an unambiguous extent within an identified file revision. Offsets without the revision are hints, not safe fetch addresses.

**Effective lifecycle.** Associate lifecycle with the canonical parent unit and the generation in which relations were resolved. A useful paragraph does not become current evidence because it was retrieved separately from its rejected parent.

Initially, retain unit-level lexical documents. Section references can support bounded fetching without silently changing document frequencies, ranking or duplicate handling.

### Minimal operational and cache state

Add one atomically replaced **control record**, protected by the existing lease. It needs:

* Store identity and derived-format/configuration version.
* A cache epoch, monotonically increasing governed mutation ticket, and last published boundary.
* State: clean, dirty, source operation in progress, publishing, or full rebuild required.
* Changed paths, including creations and deletions, or an `ALL` invalidation marker.
* Enough information about the single in-progress operation to reconcile an interrupted write, including planned unit identity where applicable.
* The published generation and references identifying its derived artifacts.

This is a **coalescing invalidation record**, not an indefinitely growing operation history. Multiple changes to one path collapse into one pending path. When the configured control-record allowance is exceeded, replace the path set with `ALL`; do not discard scientific events.

Reuse existing cache fields wherever available. The incremental engine additionally needs, in some single derived representation:

| State                                               | Required purpose                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Per-file digest and parser/configuration version    | Determine which cached parsing results may be reused.                                                                          |
| Per-file unit membership and canonical locators     | Remove vanished units and replace ledger slices correctly.                                                                     |
| Raw semantic summaries                              | Preserve declared status, aliases, links and relations needed by canonical resolution. Effective status alone is insufficient. |
| Effective unit metadata                             | Supply filters, demotion, provenance and resolved lifecycle at the published generation.                                       |
| Lexical projections, postings and global statistics | Preserve the actual scorer and exact query behavior.                                                                           |
| Publication and verification receipts               | Distinguish local visibility from source and artifact verification.                                                            |

A second full source-text copy is not automatically required. However, dropping phrase-related state is acceptable only after demonstrating equivalent phrase behavior. Token positions, normalized text and raw substring matching are not interchangeable by declaration.

### Incremental reconciliation: sparse parsing, complete semantic resolution

The first implementation should **not** introduce a new dependency-invalidation algorithm.

For every dirty physical file, read and hash the same buffer that is parsed. Replace all cached raw units belonging to that file. Then run the existing lifecycle/identity/relation resolver over the **complete cached raw logical set**.

Diff the resulting effective units against the published view. Update lexical projections that changed, global lexical statistics, and lifecycle/filter metadata for all affected units—including units whose source bytes did not change.

This deliberately pays for full logical resolution while avoiding full physical-source collection. It handles newly resolvable links, aliases, refutations and supersession without guessing a dependency closure.

Whether the current collector can expose this boundary without duplicating its logic is **NEEDS_VERIFICATION**. If not, retain full canonical collection behind the fence until a small, equivalence-tested refactor is available. Do not claim incremental parsing merely because SQL updates are incremental.

### Governed append or amendment

The acknowledgement contract is:

> A successful governed acknowledgement means the source operation completed and its visibility barrier was recorded. Every subsequent governed query must reconcile through that barrier before answering, or explicitly fail. It does not promise that the new record ranks in the returned top results.

Use this order:

```text
acquire existing store lease
recover any interrupted operation
reread and validate authoritative source
record source intent + dirty paths BEFORE any source replacement
perform existing governed source replacements
check the resulting source revisions
record completed mutation ticket; retain dirty paths
return acknowledgement containing ticket, identities and revision information
release lease
```

The acknowledgement must distinguish this source-committed, query-barrier state from “index already published.” Passing the ticket back on a query is useful for diagnostics, but correctness must not depend on the caller remembering it: readers inspect the persistent barrier themselves.

For an append, retain existing ID minting, validation and rereading under lease. For a metadata or body amendment, invalidate the containing physical file, not merely the named unit. A body change may alter sections, links or parsing boundaries.

Check for an observed outside modification before replacement and verify expected content afterward. On an observed conflict, do not issue a normal success receipt. **These checks do not eliminate the race with uncooperative editors.**

If source replacement succeeds but recording completion fails, report an ambiguous outcome: the operation is not acknowledged, but the source may contain it. Preserve the intent for recovery. Retrying an append must first resolve the planned ID; do not blindly mint another record.

Existing batching remains useful. Dirty paths coalesce across additions and maintenance can publish once at the end. A query between individually acknowledged additions must reconcile the available changes, so interleaved queries can legitimately reduce batching’s benefit. A batch is not an atomic multi-file source transaction.

### Publishing the derived view

Under the same lease:

1. Recover source intents and determine dirty paths. Missing or corrupt control state means the cache is untrusted and requires complete reconstruction.
2. Read dirty files and compute the canonical result using the procedure above.
3. Record `publishing` **before** modifying any published derived artifact.
4. Update the catalog, graph and lexical state. Use a database transaction for the selected database contents, but do not pretend it includes Markdown or separately written files.
5. Publish the clean control receipt **last**, after all derived components identify the same completed generation.

Existing eager catalog changes must be brought within this publication boundary or treated as unpublished while dirty. A catalog that has advanced is not proof that its matching lexical and lifecycle state has advanced.

For the initial implementation, an interrupted `publishing` state forces a full rebuild. This avoids trying to infer which mixture of old and new cache components survived.

No reader may turn a dirty, missing or inconsistent publication into an ordinary “no results.”

### Read and exact fetch

For the initial, conservative protocol, a governed read acquires the existing lease, performs recovery/reconciliation as needed, evaluates the query against the clean generation, constructs its result and releases the lease. This serializes governed reads as well as writes; its contention cost must be measured rather than assumed negligible.

**`kb-find` remains navigation.** It can return index-bound hits without hashing every source file, provided its receipt says so:

```text
store / cache epoch / generation
governed writes covered through ticket
effective lifecycle as resolved in that generation
source verification scope and last complete verification receipt
artifact verification scope
outside-edit coverage: not established by this lookup
```

Apply exact predicates and eligibility rules before the final result limit. Preserve lexical demotion of inactive evidence. Do not apply the semantic route’s default inactive exclusion to ordinary lexical search.

**`kb-get` remains source fetching.** Reacquire the gate, locate the exact unit, and read from authoritative source. Validate revision and identity before using a saved extent. Hash and parse the same source buffer.

When a selected file differs from the indexed revision, invalidate and reconcile it. A standalone fetch may return the newly resolved revision with an explicit “changed since selection” indication; it must not retain an old score as though nothing changed. A combined search-and-fetch operation can rerun the query once after reconciliation. Continued detected change should yield an unstable-source result, not silent omission or a definitive miss.

A returned-byte check does not upgrade lifecycle resolution for unseen changes elsewhere.

### Outside edits and verification scopes

Without an observer or complete reconciliation, outside-edit staleness is **unknown and potentially unbounded**.

Selected-file checking can discover a changed selected file. A metadata walk can discover some changes and new paths, but it cannot certify unchanged bytes. Complete source verification reads all relevant source bytes and uses the existing identity, relation and handoff checks. Artifact certification additionally performs the existing artifact verification; its streaming and deduplication already exist.

Where complete, point-in-time certification is required, run those checks against a stable snapshot or during a declared quiescent interval. Without that condition, report the scan’s actual coverage and observations—not globally current certification.

A watcher, if introduced later, supplies dirty-path hints. Lost-event or overflow handling must trigger reconciliation; a notification stream is not the authority.

Any governed or discovered change that can invalidate semantic identity/lifecycle binding invalidates the corresponding semantic receipt. The existing adapter either refreshes successfully or takes its existing fresh lexical fallback. A target’s unchanged source hash is not enough to preserve semantic eligibility after a refutation elsewhere.

### Interrupted update and restart

| Observed state                                                 | Required response                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Intent exists; source replacement may or may not have occurred | Read actual source and reconcile. Do not assume rollback.                                                                            |
| Acknowledged changes are pending                               | Reconcile before answering through that boundary.                                                                                    |
| Publication was interrupted                                    | Treat derived state as mixed; rebuild.                                                                                               |
| Control record or required cache component is missing/corrupt  | Invalidate the cache, establish a new epoch and reconstruct from source. Do not reset a counter and claim an old receipt is covered. |
| A multi-file operation stopped after a prefix of replacements  | Report/reconcile the actual partial source state. Never describe it as all-or-nothing.                                               |
| Cache repair cannot complete                                   | Return an explicit unavailable/unverified result, or use the existing full canonical in-memory path with honest verification scope.  |

The protocol is recoverable from authoritative files. It is not permission to revert those files to match a cache.

## 4. Correctness argument and limits

**Claim 1 — PROVED_UNDER_ASSUMPTIONS: governed read-after-write.**
Assume participating tools share the lease, no external mutation supersedes the operation, and successful atomic control/source replacements survive the relevant process failure. An acknowledgement is issued only after source completion and persistence of its dirty barrier. A later reader cannot enter until the writer releases the lease; it must consume that barrier before serving. Consequently its view includes the acknowledged change and any later governed changes, or it explicitly fails. Ranked inclusion is not implied.

**Claim 2 — PROVED_UNDER_ASSUMPTIONS: lifecycle propagation to unchanged units.**
Assume the initial cached raw set matches the source set, every subsequent governed changed path is recorded, and reused parsing/resolution is equivalent to full canonical collection. Replacing the raw units of changed files reconstructs the same raw logical set as a full collection. Running the canonical resolver over that entire set therefore yields the same effective lifecycle, including changes to untouched targets. A file-local status update alone would not establish this claim.

**Claim 3 — PROVED_UNDER_ASSUMPTIONS: interrupted publication cannot silently appear clean.**
The dirty barrier precedes source mutation; the publishing marker precedes derived mutation; the clean receipt follows completed publication. Under the stated persistence assumptions, a stopped process leaves either a coherent published generation or a state requiring reconciliation. This proves safe refusal/recovery, not atomicity of source plus index.

**Claim 4 — COUNTEREXAMPLE: selected-file verification cannot establish global freshness.**
Let indexed file A contain an active finding. An external editor creates file B containing a refutation of A. A query reads the old index and verifies A’s unchanged bytes, but never discovers B. Its observations are identical to a world without the refutation. Thus it cannot certify A’s current lifecycle or globally fresh recall. A local generation counter does not distinguish the worlds.

**Claim 5 — COUNTEREXAMPLE: hash checks plus rename do not prevent every outside lost update.**
A governed writer reads version V and completes its final pre-replacement check. An outside editor writes W. The governed writer then renames its V-derived replacement over W. Every earlier check passed. Avoiding this requires a stronger coordination or conditional-update assumption; the fence does not solve it.

**Claim 6 — COUNTEREXAMPLE: a complete sequential scan need not be a point-in-time snapshot.**
A scan reads A₀. An outside editor changes A₀ to A₁ and then B₀ to B₁. The scan reads B₁. The collected pair `(A₀, B₁)` never existed simultaneously. Completing all reads—or merely repeating them—does not establish snapshot semantics against arbitrary concurrent editing.

**Claim 7 — PROVED_UNDER_ASSUMPTIONS: exact ranking is preserved only with complete equivalent query state.**
If projections, statistics, predicates, scorer and tie-breaking are equivalent, and filtering occurs before final limiting, a storage replacement yields the same ranked result. The supplied shadow replay supports tested cases; equivalence after schema reduction remains **NEEDS_VERIFICATION**. In particular, dropping phrase state or limiting before lifecycle filtering can violate the premise.

**Claim 8 — CONJECTURED: the reduced shadow plus sparse parsing offers a worthwhile deployment improvement.**
The supplied measurements motivate this possibility. They do not establish it on persistent storage, with the proposed gate and fetching costs, or within an operator-approved disk allowance.

None of these claims makes retrieval scientific validation or an absence proof.

## 5. Cost and storage model

Let:

* \(F,U,E\): physical files, logical units and semantic relations/alias-resolution inputs.
* \(S\): source bytes, including retained history.
* \(\Delta F,\Delta B,\Delta U\): changed physical files, their total bytes, and units reparsed from them.
* \(D\): units whose effective metadata changes after resolution.
* \(P,\Delta P\): total lexical state and changed posting/projection state.
* \(B_R\): distinct physical-source bytes read for requested exact fetches.
* \(A\): distinct artifact bytes required by complete artifact verification.

A single appended logical unit can require parsing a large ledger file. Therefore \(\Delta B\) is **not** the appended payload size, and \(\Delta U\) need not be one.

### Operation costs

A clean navigation query costs approximately

$$
T_{\rm CLI}
+T_{\rm lease}
+T_{\rm control}
+T_{\rm index\ open/load}
+T_{\rm query}
+T_{\rm requested\ graph\ work}.
$$

Exact fetching adds reading, hashing and canonical location/parsing work over \(B_R\). Do not compare a source-checked end-to-end route with a query-kernel measurement.

Pending reconciliation adds

$$
T_{\rm read/hash}(\Delta B)
+T_{\rm parse}(\Delta B,\Delta U)
+T_{\rm resolve}(U,E)
+T_{\rm diff}(\Delta U,D)
+T_{\rm index\ mutation}(\Delta P,D)
+T_{\rm publication}.
$$

This design intentionally retains full logical resolution. JSON publication may still rewrite substantial derived files; reducing source parsing alone does not remove that cost.

A complete rebuild includes discovery over configured roots, reading/hashing and parsing \(S\), canonical resolution, lexical construction and publication. Full source/artifact certification additionally accounts for all existing integrity checks and artifact work over \(A\).

No model startup is mandatory. Optional semantic routes must count worker startup, model loading, projection, indexing, filtering and source verification—not just vector lookup.

### Space accounting

Steady-state space is

$$
S+\text{scientific artifacts}
+\text{one installed derived representation}
+\text{bounded control state}
+\text{optional adapter/runtime/model state}.
$$

“One representation” does not prohibit small duplicated keys needed for joins or receipts. It prohibits retaining broad JSON and SQL copies indefinitely without an identified consumer or rollback purpose.

Peak space additionally includes source replacement temporaries, cache rebuild temporaries, database journals, any old generation retained during publication, and optional projection/model preparation files. Across projects, sum project-specific footprints. Count models or runtime caches once only when they genuinely share the same on-disk copy.

**Bounded growth means bounded redundancy and operational history, not constant space for unlimited scientific history.** The dirty map has a cap and degrades to `ALL`; old cache generations do not accumulate per write. Retained source history is not deleted to satisfy a cache cap.

Where insufficient space exists for old and rebuilt caches simultaneously, an explicit maintenance operation can invalidate and remove the disposable old cache before reconstruction. That trades availability for peak space; it does not delete evidence.

Clean abandoned cache temporaries only under the relevant lease and only after establishing that they are not referenced by a live publication.

### Disk-full and durability behavior

Failure to record the pre-write intent aborts before source mutation. Failure after source mutation leaves an unresolved intent and an ambiguous, unacknowledged outcome. Failure rebuilding a cache leaves it untrusted; it does not justify presenting old results as fresh.

Free-space checks are advisory because available space can change. All actual write failures must preserve the fence semantics.

A power-loss-durable acknowledgement would additionally require verified ordering and persistence of intent, source replacement, completion record and publication, including relevant filesystem and database flush behavior. Those costs and guarantees are **NEEDS_VERIFICATION** on each deployment storage type.

## 6. Smallest adoption test and stopping rule

Use disposable copies and reuse the supplied regressions. Do not restart the semantic comparison.

The experiment has only two storage candidates: **the current baseline and a reduced version of the existing exact SQL shadow**. Both must obey the same publication protocol. The shadow should retain only state needed for lexical queries and their contracts, reusing existing catalog/graph representations where feasible. Removing any field is contingent on its consumers and exact-query role being understood.

Run the existing regression suite against the changed boundary. Add focused checks for genuinely new failure modes:

| Missing check                  | Evidence required                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent-process visibility | An acknowledged append or amendment is visible to a fresh CLI without relying on session memory or broad automatic indexing.                                 |
| Cached-parse equivalence       | Incremental output equals full canonical collection after changes to ledger membership, aliases, relations, legacy locators and unchanged lifecycle targets. |
| Interrupted publication        | Faults at intent, source replacement, acknowledgement and derived-publication boundaries never produce a false clean receipt.                                |
| Resource failure               | Disk-full handling preserves source custody, reports ambiguous outcomes correctly and permits reconstruction.                                                |
| Outside-edit scope             | Same-metadata body edits, new refuting files and edits during fetch do not acquire an unjustified global-freshness label.                                    |
| Storage reduction              | Exact phrases, filters, scores, order and tie-breaking remain equivalent after removing shadow fields; eligibility is applied before the final limit.        |
| Control-state bounds           | Coalescing and transition to `ALL` preserve correctness after many distinct changes.                                                                         |

Reuse existing fixtures for already-covered identity and lifecycle cases rather than inventing parallel semantic tests.

For performance, instrument a bounded append/amendment → fresh-process find → exact-get trace on an actual target filesystem. Include a change in a many-unit ledger and a relation that affects an unchanged unit. Record phase times, source bytes read, files parsed, derived bytes written, startup, lease wait, journal growth, and steady/peak disk. Keep navigation-only and source-checked results separate.

Native Linux and Windows-mounted claims require measurements on those actual storage paths. Memory-backed replays do not substitute for either. Broader filesystem certification is not part of this adoption test.

**Stopping rule:** retain the baseline if the reduced shadow does not meet explicitly chosen latency and steady/peak disk allowances, if compatibility requires maintaining substantially duplicated persistent state, or if the new boundary introduces unresolved correctness failures. Without an operator-approved allowance and a meaningful improvement criterion, do not promote a replacement merely because its median is lower.

The fence may still earn adoption for reliable cross-process visibility even if SQL does not. Conversely, if cached parsing cannot be separated safely or the added coordination cost is not justified, retain existing full maintenance without claiming that the incremental gap has been solved.

## 7. Explicit non-work

Do not rebuild IDs, locks, writers, canonical lifecycle resolution, artifact hashing, bounded fetching or batching. Do not migrate source into a database, require Obsidian, move hidden stores into a visible vault, introduce a daemon, or redesign the ontology or ledger.

Do not add a combined lexical/vector route without separate evidence. Do not repeat the QMD CPU build or vector quality pilot to decide a publication-protocol question. Do not use LLM judgment to determine identities, lifecycle, conflicts, freshness, claim validity or definitive absence.

Do not cache scientific history twice by default, delete it for performance, or retain a second permanent backend “just in case.” Changes to manuscript rendering, agent instruction packs, installation, commits and release policy are outside this decision.

**Next engineering action:** build one disposable-copy, fault-injected append → fresh-process find → exact-get vertical slice around the existing writer and canonical resolver, comparing baseline persistence with the reduced existing SQL shadow on a real target mount. Its expected evidence is a recoverable publication trace, canonical/result equivalence, phase-level costs and measured peak space—enough to accept this bounded delta or retain the baseline.
