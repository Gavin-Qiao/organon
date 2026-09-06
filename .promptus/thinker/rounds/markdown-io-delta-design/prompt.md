# What minimal reuse-based change improves a large Markdown research wiki without rebuilding its working core?

**Round:** `markdown-io-delta-design`

## Role and context boundary

Act as a senior local-first storage and information-retrieval architect. Design a small,
defensible evolution of the working system below, not a greenfield replacement. You have
no workspace, tools, network, private corpus, or prior conversation. This prompt is self-contained.
Do not invent repository details, APIs, performance measurements or compatibility guarantees.

The operator wants the best practical way to retrieve from and write to many Markdown or
Obsidian-compatible wiki files, using established engineering instead of rebuilding the wheel.
Preserve what is already built. Disk is scarce and a GPU is not reliably available. SQLite,
vectors, a daemon, a new schema and a migration are not predetermined destinations.

## Complete problem

### Purpose, data and workload

Promptus is external memory and traceability for long-running research agents. Agents resume
after interruptions, retrieve decisions/evidence, and record findings. Rejected or superseded
work must not silently become current truth. This is not primarily a human search UI or chatbot.

Authoritative source is ordinary Markdown: findings, literature, memory, project direction,
and an append-oriented ledger with a bounded current-state handoff. Frontmatter, headings,
wiki links, aliases and historical records matter. Files must remain usable without the index
or our software. Obsidian-compatible files are desirable; running Obsidian cannot be required.
Some present stores are in hidden directories, which an app-only visible-vault API may not expose.

Reads are frequent, writes sparse and usually one logical record at a time, with occasional
batches. Actual read/write ratios, future growth, acceptable latency and a disk budget are
unmeasured: do not manufacture requirements. Current corpora contain roughly 6,000–6,500 logical
units each, across thousands of physical files. Larger collections are a future consideration.

A unit is a retrievable research record; many ledger units share a physical file. Modern units
have stable IDs; legacy identity may require source locator plus full title, since two old
ledger entries can share a timestamp. A result must identify the exact unit, not merely its
file. Long notes can have multiple useful sections. Distinguish chunk identity, parent unit,
source extent and effective lifecycle.

Cooperating agents use governed commands. Human editors, Obsidian, Git or sync software may
change files without taking our lease, including during a query. Notifications, if introduced,
may be delayed, coalesced or lost. Execution currently uses short-lived CLI processes, not a
required resident service. TypeScript on Bun is the primary implementation; the optional
semantic adapter uses a Node worker. Linux CPU is tested; native and Windows-mounted storage
exist in the workflow. Other filesystems are not certified by those tests.

### Already implemented: the baseline, not a to-do list

These capabilities exist in a tested source candidate. It is uncommitted, unreleased and not
installed into the live projects. Unreleased does not mean nonexistent. Names below identify
interfaces; no hidden files need to be inspected.

| Component | Already working | Boundary or remaining gap |
| --- | --- | --- |
| Canonical reader (`collectEffectiveUnits`) | Parses units, legacy syntax, IDs, aliases, links, typed relations and cold history; resolves effective lifecycle. | A new relation can supersede/refute a different unit whose own source bytes are unchanged. |
| Governed writers (`kb-add`, `kb-amend`, `kb-now`) | Validate metadata/vocabulary, mint timestamps/IDs, add units, amend supported metadata, update a bounded handoff. Preserve historical evidence. | Not a general collaborative editor or a complete transactional file-plus-index system. |
| Source lease and replacement (`withStoreLock`, `atomicStoreWrite`) | Serialize cooperating writers; additions reread source under lease; use exclusive temporary files and rename-based per-file replacement. Metadata amendments share the lease and reject unsafe targets. | External writers ignore the lease. Sequential file replacements are not one atomic transaction. Power-loss durability and every cross-filesystem case are not proved. |
| Lexical retrieval (`kb-find`, `searchIndex`) | Custom BM25-style body/title/path ranking; exact phrases, required/all terms, status/substrate filters, bounded results, explicit history, graph expansion. | Replacing it with another library can change ranking/query behavior. |
| Bounded fetch (`kb-get`) | Reads the exact selected unit, including one ledger slice; disambiguates legacy entries. | Search navigates to evidence; it does not validate scientific claims or prove absence. |
| Derived index (`kb-index`) | Builds catalog, lexical JSON and graph from canonical source; skips unchanged derived writes and can reuse read buffers for source hashing. | Full construction still collects the store; no complete persistent incremental engine exists. |
| Freshness/health gates | Read-only session preflight and strict source/index/handoff, identity, relation and artifact checks. Artifact hashing already streams bytes and deduplicates work per verification run. | Ordinary lexical lookup checks its catalog hash, not all source bytes on every query. Body-only external edits can escape this until source verification. Catalog agreement is not global freshness. |
| Batch maintenance | Additions update the catalog; full maintenance can run once after a batch. Broad per-tool auto-indexing was removed. | The next query can rebuild an in-memory lexical index after catalog drift. Cheap incremental visibility between independent CLI processes is not solved by batching alone. |
| Optional QMD adapter | Explicit local/offline configuration, canonical-unit projection to opaque files, source/model/index receipts, identity/lifecycle binding, refresh and fresh lexical fallback. Exact controls bypass similarity. | This adapter already exists. It is one-shot and optional; full real-corpus CPU readiness has a negative result below. Zvec remains a benchmark adapter, not another installed backend. |
| Tests and consumers | Identity, canonical lifecycle, concurrent additions/aliases, terminated writers, stale semantic state, body edits, refutation, archive/delete/restart and packaging have regressions. A manuscript plugin already consumes canonical evidence. | Latest suite: 420 passing tests. Bounded tests do not prove arbitrary outside-edit safety, durability, all OS behavior or general agent efficacy. |

Retain source authority, exact/legacy identity, provenance, explicit epistemic status, history,
exact query controls, bounded fetching, recovery and project isolation. Define read-after-write
for acknowledged governed operations. Never represent a stale/incomplete view as fully verified.

The current lexical ranking is a baseline, not sacred: a library replacement may earn adoption
with explicit behavior changes and measured quality. Challenge an existing component only by
naming its gap, smallest delta, integration cost and rollback. “Add IDs/locks/indexes/batching”
is not new work without a missing mechanism. Manuscript rendering, research ontology, agent
instruction packs and release policy are outside this question.

One existing distinction must remain explicit: ordinary lexical search demotes inactive evidence
rather than automatically excluding it. The normal semantic route excludes inactive candidates
unless explicit history/status/include-inactive controls admit them. Historical retrieval is valid;
presenting a rejected result as current validated support is not.

## Settled facts and failed routes

### Measurements, not forecasts

| Frozen-copy observation | Psi | MoT |
| --- | ---: | ---: |
| Logical units, including cold history | 6,494 (87 cold) | 6,332 (0 cold) |
| Copied non-cache source | 15.7 MiB | 18.1 MiB |
| Fresh-process JSON lexical query median | 184 ms | 191 ms |
| Exact-ranking SQLite shadow query median | 66 ms | 70 ms |
| Write + full canonical delta preparation + SQL update | 279 ms | 290 ms |
| Full ordinary index refresh alone | 1.27 s | 1.25 s |
| Existing catalog + graph + search files, post-trial | 20.8 MiB | 23.3 MiB |
| Broad shadow SQLite database, post-trial | 62.6 MiB | 69.8 MiB |

The SQL shadow preserved tested result keys/order/scores across individual updates. It stores
units, metadata, exact lexical postings and graph/provenance tables; it is not a minimal FTS5
index. Its delta preparation still performs a full canonical scan, and it is not an atomic
governed source/index transaction. Warm in-memory lexical queries remained faster: roughly
1.5–1.6 ms versus SQL 2.2–2.5 ms. The threefold cache size is not an inherent SQLite lower bound.

These replays used memory-backed temporary storage. They do not certify persistent-disk flush
costs, cold OS caches, original Windows-mounted performance, or power-loss recovery. Account
for source-independent caches, projections, models, journals and old/temporary generations,
not just the final database. Cache budgets are not permission to delete scientific history.

The existing QMD 2.8.3 adapter with EmbeddingGemma 300M hit its 20-minute initial full-Psi CPU build
timeout. Its lease was released, no successful receipt published, and explicit lexical fallback
remained usable. No MoT/post-build results followed. Earlier synthetic ranking successes and
a separate 14-step real-SDK mutation/restart trial remain valid in their scopes. They do not
erase this timeout. Neither rebuilding this adapter nor condemning every QMD configuration follows.

Zvec-grep 0.2.1 with Potion retrieval 32M completed full builds in about 20–21 seconds; per-record
refresh including projection took about 3.3 seconds and source-checked reads about 644 ms.
These are stack costs, not raw vector lookup latency. A subsequent quality pilot used 24
source-conditioned questions, 20 positive plus four unsupported-premise probes, and two authors
plus two fresh blind judges, yielding 181 question–passage ratings:

| Positive-question metric | Lexical | Zvec-grep + Potion 32M |
| --- | ---: | ---: |
| At least one labelled source in top five | 18/20 | 17/20 |
| At least one labelled source in top ten | 18/20 | 18/20 |
| Direct-answer-evidence precision in top five | 61% | 59% |
| Useful evidence including background in top five | 90% | 94% |

Some historical chains favored zvec; complete labelled multi-source coverage at ten favored
lexical. Two vector builds gave identical ordered top-five results on all 24 questions. This
small same-model-family pilot is not human gold, exhaustive recall, an absence proof or an
end-to-end agent test. No combined route was tested on these independent private questions.
Zvec caps context entities before deduplicating/filtering units: these are route comparisons,
not isolated embedding comparisons. More context is not automatically more correct evidence.
The pilot applied a common final eligibility filter to both routes for nonhistorical questions;
that explicit experimental policy is not the ordinary lexical default described above.

Six synthetic write-to-resume flows retained all events and passed health/artifact checks,
with medians 2.408 s for per-write indexing versus 1.055 s for batch maintenance. This supports
already implemented batching, not a production throughput forecast.

### Established references, not preselected dependencies

The project recently checked these documented capabilities. They are enough to reason about
approaches, not establish current API/license compatibility or measured suitability:

- Obsidian uses Markdown plus a metadata cache; its Vault API distinguishes cached reads from
  guarded read–modify–write operations. This is app-level coordination, not a filesystem-wide
  transaction with arbitrary editors, and visible-vault access may omit hidden directories.
- Omnisearch uses the existing MiniSearch JavaScript full-text library for ranked vault search.
  An in-memory library still has RAM, startup/serialization and indexing costs. Its ranking is
  not our existing ranking by definition.
- Basic Memory is a close agent-memory reference: Markdown, wiki relations, targeted editing,
  derived indexing and automatic synchronization. Its full compatibility with Promptus lifecycle
  and evidence contracts is unproved. Wholesale migration is not pre-approved.
- QMD offers lexical, vector and hybrid routes; zvec-grep composes local retrieval components.
  Their tested limitations are above, not universal product verdicts.
- SQLite FTS5 is established embedded indexing machinery. Contentless variants may avoid a
  second full-text copy, with query/update limitations and synchronization responsibilities.
  Naming that feature does not prove snippets, exact controls or recovery still work for us.

## Bounded question

What is the smallest reuse-based architectural delta, if any, that supports efficient frequent
retrieval and sparse incremental writes while preserving this system's evidence contracts and
bounding storage growth? Construct a protocol with an explicit consistency/cost argument, or
identify an incompatible guarantee and the smallest assumption or cost needed to obtain it.

The unresolved mechanism is the boundary between authoritative files, acknowledged writes,
cross-process disposable indexes and outside edits—not simply whether to use embeddings.
Do not silently promise immediate detection of every uncooperative edit, no observer, no full
scan, no extra I/O and globally current results simultaneously. State exactly what is guaranteed
and what is advisory, bounded-stale or unknown at each read/write boundary.

Keep the unchanged-system option alive. Existing modules are presumptively reused. Where no
unique library choice follows, select the protocol and the smallest discriminating measurement,
instead of fabricating a winner or proposing an open-ended bakeoff.

## Required response

Your first line must be the following literal text, with no quotation marks, bullet, or code fence:

ROUND_ID: markdown-io-delta-design

Then give a focused decision memo, detailed enough that an implementation agent need not invent
the consistency model. Avoid a general survey or a full codebase.

1. **Verdict and assumptions:** retain, extend or selectively replace. State the bottleneck
   supported by the observations, missing measurements and any incompatible demands.
2. **Reuse-first delta table:** mark affected components KEEP, EXTEND, REPLACE or DEFER. Name
   the smallest change, reusable external primitive, compatibility checks, custom code removed
   and rollback. Do not keep multiple permanent backends merely because they are available.
3. **Concrete protocol:** define authority, records, unit/section identity, minimal cache fields
   and freshness receipts. Walk a read, append, metadata/body amendment, outside edit and
   interrupted update/restart. Specify ordering, visibility, conflicts, dependency invalidation,
   leases, filtering and exact source fetching. Small pseudocode/state diagrams are welcome.
4. **Correctness argument:** number the load-bearing claims. Explain governed read-after-write,
   lifecycle and stale-state behavior under explicit assumptions. Supply the smallest
   counterexample to stronger guarantees. Returned-candidate freshness is not globally fresh
   recall; a local generation counter cannot certify against outside edits by itself.
5. **Cost/storage model:** define variables for physical files, logical units, bytes, changes
   and dependants. Include discovery, parsing, hashing, process/model startup, index mutation
   and verification, not just query-kernel time. Account for steady/peak disk, multiple projects,
   optional models, journals, generations, cleanup and disk-full behavior. Separate mandatory
   overhead from optional acceleration; do not invent a numeric user budget.
6. **Smallest adoption test and stopping rule:** use disposable copies and existing tests;
   identify genuinely missing correctness checks and measurements. State when to retain the
   baseline. A disk-space or latency forecast must be measured before adoption.
7. **Explicit non-work:** what must not be rebuilt, needlessly retested, migrated, cached twice
   or delegated to LLM judgment? End with one next engineering action and its expected evidence.

## Claim and scope rules

- Label numbered logical claims PROVED_UNDER_ASSUMPTIONS, COUNTEREXAMPLE or CONJECTURED;
  unknown implementation facts NEEDS_VERIFICATION. Forecasts and supplied observations are not
  universal laws. Do not fabricate versions, APIs, licenses, citations or experiments.
- Preserve source/artifact custody and explicit lifecycle. Do not delete old evidence for cache
  efficiency. A search hit cannot validate a research claim or prove a definitive absence.
- Do not weaken integrity checks while retaining their former label. Distinguish a cheap local
  freshness receipt from complete source/artifact certification.
- Do not redesign the ontology, ledger, canonical parser or whole memory system without a
  concrete contract gap and bounded compatibility argument. Generic mechanics can be replaced;
  research semantics do not disappear automatically when a library is adopted.
- This is advisory design, not authorization to implement, install, migrate, access private
  stores, delete evidence, commit or release. Returned claims will be independently validated.
