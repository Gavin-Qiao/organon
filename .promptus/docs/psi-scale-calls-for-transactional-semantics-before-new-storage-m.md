---
id: finding-20260823T131136Z-psi-scale-calls-for-transactional-semantics-before-new-storage-m
substrate: finding
kind: METHOD
status: VALIDATED
created: "2026-08-23 09:11:36"
links: [markdown-is-the-graph, header-beats-vector, the-scriptable-graph-layer]
---
# Psi scale calls for transactional semantics before new storage machinery

Psi exposes a transactional and lifecycle boundary, not a need to replace Markdown. At 5,484
units, bounded lexical retrieval remains usable; the observed failures are that a CLI-only link
was not serialized, doctor and indexer disagreed about ledger headings in code fences, typed
relations did not count as connectivity, concurrent read-modify-write could lose events or mint
the same ID, and mutable artifacts owned by superseded units blocked the active frontier.

The immediate correctness contract is therefore: every successful gated write round-trips through
the authoritative index; all ledger consumers use the shared fence-aware parser; resolved typed
relations prevent orphan classification without changing wikilink PageRank; source mutations are
serialized and atomically replaced with unique event IDs; and artifact health keeps active failures
red while reporting superseded-unit drift as archival warnings.

The next problem-led capabilities remain separate work: three health lights (resume safety, active
evidence, archive cleanliness), durable run cards, impact tracing, frontier-aware retrieval, and a
distillation queue that suggests but never settles claims. None is part of the correctness patch.

Markdown remains authoritative, consistent with [[markdown-is-the-graph]],
[[header-beats-vector]], and [[the-scriptable-graph-layer]]. SQLite may become a disposable,
fully rebuildable derived index only after measured indexing/query latency, JSON memory pressure,
or join-heavy impact analysis demonstrates the need. It is not a source-of-truth migration.

Field evidence: Psi ledger event
`event-20260823T122945Z-repair-v08-ledger-link-loss-with-typed-provenance-relations` near
`/mnt/c/users/mohan/desktop/psi/.promptus/ledger/RESEARCH-LEDGER.md:16249`, and finding
`/mnt/c/users/mohan/desktop/psi/.promptus/docs/six-historical-mutable-path-hashes-are-quarantined-from-current.md`.

Related: [[markdown-is-the-graph]] · [[header-beats-vector]] · [[the-scriptable-graph-layer]]
