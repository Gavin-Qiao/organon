---
id: finding-20260825T122106Z-five-thousand-unit-stores-require-a-two-speed-maintenance-cadenc
substrate: finding
kind: METHOD
status: VALIDATED
created: "2026-08-25 08:21:06"
relations: ["derives-from:event-20260825T122042Z-move-global-maintenance-off-the-active-research-loop-at-five-tho"]
links: [psi-scale-calls-for-transactional-semantics-before-new-storage-m, markdown-is-the-graph, header-beats-vector]
---
# Five-thousand-unit stores require a two-speed maintenance cadence

A long-running Promptus store has crossed a measured operational threshold at 5,338 live units across 2,614 files. Operator timings separate two regimes sharply: current-state status takes 0.05 seconds and knowledge retrieval 0.23 seconds, while a typical gated write takes about 40 seconds, re-indexing about 38 seconds, and a whole-store ratchet check about 102 seconds. Several governed writes plus maintenance make a checkpoint roughly five minutes. The store remains useful and retrieval is not the bottleneck; synchronous global maintenance is the part that now disrupts research cadence.

The appropriate operating model is therefore two-speed. During active research, use status and retrieval, preserve only load-bearing results, decisions, and failed routes, and batch related records at bounded stage ends. At durable boundaries—handoff, compaction, branch closure, and release—run authoritative indexing and the full integrity ratchet. This preserves [[markdown-is-the-graph]] and the gated-write invariant while removing global verification from the inner reasoning loop.

The evidence earns performance work but does not yet select its implementation. Incremental indexing, transactional batch writes, cached artifact hashes, touched-files-only checkpoint receipts, and timing telemetry should be profiled as candidates. A fast touched-files receipt must not masquerade as a whole-store health receipt, and cached verification must invalidate on every relevant content or metadata change. The absence of any cold units among all 5,338 live units also needs lifecycle investigation; coldness must follow explicit scientific status rather than automatic age-based eviction.

This extends [[psi-scale-calls-for-transactional-semantics-before-new-storage-m]]. Psi-scale evidence first established the need for transactional correctness without abandoning Markdown; the new measurements separately establish maintenance latency as a real scaling problem. The exact timings were supplied by the operator and have not yet been independently reproduced from a retained timing artifact, so they validate the operational threshold and cadence decision, not any claimed speedup from the proposed patch candidates. Fast lexical retrieval remains consistent with [[header-beats-vector]].

Related: [[psi-scale-calls-for-transactional-semantics-before-new-storage-m]] · [[markdown-is-the-graph]] · [[header-beats-vector]]
