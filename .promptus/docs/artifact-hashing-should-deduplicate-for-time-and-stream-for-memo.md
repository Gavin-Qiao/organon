---
id: finding-20260825T142103Z-artifact-hashing-should-deduplicate-for-time-and-stream-for-memo
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-25 10:21:03"
relations: ["derives-from:event-20260825T142045Z-streaming-artifact-hashing-removes-the-whole-file-memory-spike-e", "extends:finding-20260825T132149Z-promptus-maintenance-should-conserve-deterministic-work-across-h"]
links: [promptus-maintenance-should-conserve-deterministic-work-across-h, sqlite-is-justified-only-as-a-writer-aware-disposable-projection]
artifacts: [benchmark-receipt|benchmarks/results/artifact-streaming-mot-windows-9p-2026-08-25.json|50814941ce26e5296826ab1153a2facad352b663a314e3e1f0a3840815f45dbf]
---
# Artifact hashing should deduplicate for time and stream for memory

Artifact verification has two independent exact optimization axes. First, group every ownership record by its canonical in-root path, hash the file once, and fan the result back to each owner; the cross-filesystem maintenance experiment showed that this reduces elapsed time while preserving all owner outcomes. Second, hash each unique file through a fixed-size buffer instead of readFileSync; the follow-up MoT probe preserved the exact ordered outcome digest and reduced peak process RSS from 331.23 MiB to 54.00 MiB, while taking about five percent longer on WSL 9p.\n\nThese changes should be combined, not confused. Unique-path grouping is the time optimization. Streaming is the bounded-memory and large-file safety optimization. Neither weakens SHA-256, path containment, lifecycle classification, or archival-warning semantics. The production implementation should keep one canonical-path result object, stream only when a hash is declared, check every owner against the shared result, and retain exact per-owner outcomes in the health receipt. It should not cache a prior hash across sessions unless an authoritative content-generation contract exists; size and mtime alone are not proof of bytes.\n\nThis patch is independent of SQLite and should precede it because it is small, exact, and directly addresses whole-check peak memory. Full-pipeline RSS must be remeasured afterward because lexical index construction separately retained roughly 615 to 645 MiB in the ext4 trials.

Related: [[promptus-maintenance-should-conserve-deterministic-work-across-h]] · [[sqlite-is-justified-only-as-a-writer-aware-disposable-projection]]
