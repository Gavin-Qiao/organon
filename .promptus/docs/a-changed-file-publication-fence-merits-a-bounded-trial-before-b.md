---
id: finding-20260905T070106Z-a-changed-file-publication-fence-merits-a-bounded-trial-before-b
substrate: finding
kind: RESULT
status: CONJECTURED
created: "2026-09-05 03:01:06"
relations: ["derives-from:lit-20260905T065432Z-external-thinker-markdown-io-delta-design-response"]
links: [finding-20260905T045735Z-fresh-private-corpora-expose-a-cpu-readiness-limit-in-the-qmd-ca, finding-20260905T054524Z-a-blind-private-retrieval-pilot-does-not-justify-replacing-lexic]
artifacts: [thinker-response|.promptus/thinker/rounds/markdown-io-delta-design/response.md|5ca7e6e603fa69257cb686efc6be52e2ddc07a199d9cee40d79e5c773abf83a7]
---
# A changed-file publication fence merits a bounded trial before backend replacement

## Verdict and method

The returned round identifies a plausible missing source-to-index publication boundary, not a reason to replace the working retrieval engine. Retain Markdown authority and lexical default. A bounded dirty-path fence, coupled to existing writers and all participating readers/publishers, merits a separately authorized correctness slice. Adoption, persistent-disk benefit and reduced-SQL footprint remain unresolved; this synthesis is CONJECTURED.

The original 35,383-byte attachment was captured before interpretation. Response SHA256: 5ca7e6e603fa69257cb686efc6be52e2ddc07a199d9cee40d79e5c773abf83a7. Its quarantine stays lit:UNTRUSTED. Independent work here comprises source inspection, case analysis and reconstruction of the numbered arguments against the frozen validation plan. No new runtime, crash, disk-full, quality or performance experiment was executed. The prospective runtime checks remain pending, not passed by discussion.

## Numbered claim dispositions

1. **VALIDATED, conditional protocol lemma only.** If all participating writers, readers and publishers share an intact lease, source completion and dirty intent survive the assumed process failure, and no outside write supersedes the operation, a post-acknowledgement reader must reconcile that barrier or fail. Acknowledgement cannot precede source completion and persistent dirty state. This establishes governed read-after-write visibility, not top-K inclusion, external freshness, power-loss durability or today's implementation.
2. **UNRESOLVED as a claim about this implementation.** The narrower substitution lemma holds: identical ordered raw inputs, configuration and resolution produce identical effective output. But the response's shorthand of an identical raw *set* needs implementation qualification. Current lifecycle loops mutate target status in traversal order; map construction also has order-sensitive collision behavior. With two legal custom inverse-status relations requesting different target statuses, reversing their processing order reverses the final status. Current built-in inverse transitions converge on SUPERSEDED/retired; this is not evidence that ordinary built-in stores currently exhibit that conflict. Preserve canonical order and cold/live policy, or separately adjudicate any intended semantics change. The semantic strict collector and ordinary index builder also differ in ambiguity validation and lifecycle scope. Cached parsing must match the chosen existing consumer, not silently substitute another one.
3. **VALIDATED, conditional safety lemma only.** Before dirty intent: no source mutation is permitted. After dirty intent and before publication: the view needs reconciliation. After PUBLISHING and before CLEAN: derived state is untrusted. After CLEAN: all referenced components must already belong to the completed generation. These cuts support refusal/recovery under intact coordination and the stated process-failure persistence model. They do not prove current code satisfies the protocol, automatic stale-lock recovery, or a joint file/SQL transaction. Missing/corrupt state requires conservative reconstruction; a successful source write followed by failure remains an ambiguous unacknowledged outcome.
4. **VALIDATED as an impossibility argument, with a project-vocabulary correction.** Two worlds with identical observed A and different unseen B cannot be distinguished by checking A. An unseen best match disproves global recall freshness. For a concrete current lifecycle counterexample, B must carry `supersedes:A`, not merely `refutes:A`: Organon's current vocabulary maps supersedes to an inverse status, while refutes is a relation without that mapping. The literal implication that adding any refutes edge automatically changes effective status is REFUTED for the current vocabulary; the broader freshness argument survives.
5. **VALIDATED, counterexample.** Read V; pass the final check; an outside editor writes W; rename a V-derived replacement over W. The outside update is lost despite the earlier successful checks. The fence does not prevent this. Coordination/quiescence or a genuinely enforced conditional replacement is an additional premise.
6. **VALIDATED, counterexample.** Observe A0; outside changes A to A1, then B to B1; observe B1. States were (A0,B0), (A1,B0), (A1,B1), never (A0,B1). A completed sequential scan alone is not an atomic snapshot. This does not invalidate its actual byte observations or justify weakening existing checks.
7. **VALIDATED as a conditional equivalence statement; reduced-schema implementation UNRESOLVED.** Equal projections, global statistics, predicates, scorer, ordinal/tie behavior and phrase-source semantics yield equal ranked output. The existing SQL searcher calls the existing scorer, but loads all document metadata at startup and fetches authoritative text for phrase checks. Reducing tables therefore requires a consumer audit and regression evidence, not an inference from SQL's presence. Eligibility must precede final limiting, preserving the distinct ordinary-lexical and optional-semantic inactive policies.
8. **UNRESOLVED.** Neither the fence nor a reduced shadow has a measured end-to-end benefit on the actual persistent target mounts. No operator-approved latency/steady/peak disk allowance exists. Earlier tmpfs medians and model-labelled relevance pilots motivate investigations, not deployment. SQL is a reusable comparison candidate, not a proved uniquely optimal library.

## Fit to the working code and frozen checks

The fence is a real proposed delta: `kb-add.ts` currently prepares/replaces source and appends catalog under `withStoreLock`; ordinary `kb-find.ts` accepts a matching catalog hash without a persistent dirty fence; `kb-index.ts` publishes catalog, graph and search separately. Existing per-file replacement, bounded fetch, parser, scoring, artifact hashing and batching should be reused. The raw page/ledger parsers are private helpers inside the whole-store collector; a persistent changed-file parsing interface is not already available. No size estimate for that refactor is established.

Preserve raw declared statuses separately from effective statuses: otherwise removing a superseding relation can leave an old derived status stuck in a supposedly raw cache. Reparse the entire containing physical ledger after append, including the previous unit's changed extent. Preserve discovery ownership, cold movement, removals, aliases, and vocabulary/configuration invalidation. The proposed whole-logical-set resolution still costs full logical work; JSON publication can still rewrite large derived files. A query-wide lease can serialize frequent readers behind a rebuild, so include contention and tail latency rather than only median query kernels.

Frozen checks 1-10 and 12 were addressed through source inspection and the conditional/counterexample analysis above; their runtime acceptance portions remain unexecuted. Check 11's new-library API/license/adoption work is deferred: no new library is being adopted and no claim of current package suitability is established here. Preserve the earlier CPU and quality findings and their limits, rather than reopening the semantic bakeoff.

### POST_RESPONSE refinements

- Cache deletion must preserve an active lease. It currently resides at `.promptus/cache/.locks/store.lock`. Removing the whole cache while that lease is held could allow another process to create a replacement lock and enter concurrently. A future low-space rebuild must remove only verified disposable components under intact coordination, or require quiescence. This is a static failure schedule, not a newly executed concurrency test.
- Retain an untouched baseline arm before comparing two backends behind the new fence. Otherwise a comparison of fenced JSON and fenced SQL cannot attribute the coordination overhead relative to today's implementation. Stage the same bounded vertical slice: existing baseline versus fenced existing backend first; reduced SQL only as a separable subsequent comparison if startup/storage remains the measured bottleneck. This changes the proposed experiment's attribution, not the sealed plan.

## Next decision and non-work

Ask for authorization for one disposable-copy append/amend -> fresh-process find -> exact-get slice, with source/result parity and failure cuts before timing. Use existing fixtures and frozen copies only within that scope; measure the actual target filesystem and all steady/peak bytes, including temporaries and journals. Choose meaningful latency and storage allowances before adoption. If correctness, complexity or disk costs do not justify the delta, keep existing maintenance. No database, GPU, watcher, daemon, ontology migration or new search ranker is a prerequisite.

This response does not authorize building that slice now. No production implementation, live Psi/MoT/Probatio/Mensura store, installed plugin, benchmark evidence, commit, push, tag or release changed during adjudication. Only Organon's governed custody, synthesis and continuity records are updated.

## Inspection anchors

Source inspection was against the current uncommitted candidate, not a shipped release. Reproducible file digests at inspection:

- `promptus/scripts/lib/read-store.ts`: c2623f9ec14a5a3472fe2ea3cb9302a4214f7d04a43b5848015bea28f3d937c9
- `promptus/scripts/lib/relation-lifecycle.ts`: edcc820848690fe6342abcf033868ef8396128369dc78e1297e0e45d9ec4a9a8
- `promptus/scripts/lib/store-lock.ts`: 98eb4538c53b5c4ae34cedbcf0077cd56cf951ed25d91cac07e199537e00b389
- `promptus/scripts/kb-index.ts`: 2906cd6de017d1a1abf24d070025ddabbf27357b9a3ee996559113683d04482a
- `promptus/scripts/kb-find.ts`: d33318cd11be452002dac9d6da1ecb24f178b5efbfc6fbf2aa6edbb43df4b1a2
- `promptus/scripts/kb-add.ts`: 065f6632ad459be2938deb4e295877153c84ea39f2c3a7efbebec888940b217f
- `benchmarks/promptus-sqlite.ts`: d0288ab6ae6e7a11381067d3d6b2674966282f0d76738792859a0827be9bd9eb

Related: [[finding-20260905T045735Z-fresh-private-corpora-expose-a-cpu-readiness-limit-in-the-qmd-ca]] · [[finding-20260905T054524Z-a-blind-private-retrieval-pilot-does-not-justify-replacing-lexic]]
