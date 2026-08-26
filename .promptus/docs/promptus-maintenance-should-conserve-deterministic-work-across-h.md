---
id: finding-20260825T132149Z-promptus-maintenance-should-conserve-deterministic-work-across-h
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-25 09:21:49"
relations: ["derives-from:event-20260825T132108Z-cross-filesystem-profiling-identifies-hardware-agnostic-work-con", "extends:finding-20260825T122106Z-five-thousand-unit-stores-require-a-two-speed-maintenance-cadenc"]
artifacts: [benchmark-receipt|benchmarks/results/maintenance-cross-hardware-v1-2026-08-25.json|3aecfc71e47e0a1873cffa8d4485f8c24f590ec25abae0828d7618f02924fe6f]
---
# Promptus maintenance should conserve deterministic work across hardware

Validated observation: Promptus maintenance at MoT scale is dominated by repeated deterministic traversal, not knowledge retrieval, GPU work, or available CPU parallelism. Current thinker inspection has O(adjudicated rounds x finding files) behavior; full check repeats work already performed by index and separately fingerprints the same source truth; artifact verification hashes repeated declared paths. Two software-only exact-equivalence probes reduced work on all measured storage profiles, so the improvement is hardware-agnostic even though WSL 9p magnifies its wall-time value.\n\nEngineering implication, not yet shipped: make maintenance work-conserving. Build one thinker binding map per exchange, then one immutable store snapshot that each source file feeds once into source hashing, catalog, graph, search, thinker custody, and health. Refresh only declared dependants, avoid identical derived writes, hash each canonical artifact file once while checking every owner, and batch governed mutations under one lock and resolver snapshot. A touched-files receipt may accelerate the active loop only if it is explicitly PARTIAL; the authoritative full gate remains exact. Persistent incremental indexing or a derived database should wait until these simpler changes are re-benchmarked.
