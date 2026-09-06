# Retrieval architecture for the overhaul

Decision: retain Promptus lexical retrieval as the default, with an optional,
local QMD vector route for conceptual recall. The adapter is implemented and under
evaluation in this checkout; it is not released or installed in a project.

## Why this combination

The public Organon development comparison found the expected result in the top
ten for 31/42 questions using lexical retrieval, 35/42 using a fixed lexical/QMD
candidate union, and 34/42 using lexical/zvec-grep. That is a concrete semantic
coverage gap, but the historical questions are not independent validation.

A fresh GPT-6 test agent authored 30 fictional notes and 24 questions without
seeing those results. Twenty questions have one accepted answer; four deliberately
have none. At both 500 and 5,000 projected units, QMD ranked all 20 answers first.
Lexical already found all 20 in its top five. This supports better semantic ranking,
not a fresh demonstration of greater mixed-route recall. The filler is repetitive
synthetic inventory text, not a corpus of thousands of diverse papers.

| Route at 5,000 units | Answer first / top five | Warm median | Fresh-process query | Initial build |
| --- | ---: | ---: | ---: | ---: |
| Promptus lexical | 11 / 20 | 4.95 ms | 92–98 ms | 153 ms |
| SQLite FTS5 | 11 / 20 | 2.43 ms | 51–58 ms | 20 ms |
| QMD vectors, EmbeddingGemma 300M | 20 / 20 | 30.0 ms | 1.43–1.47 s | 163 s |
| zvec-grep hybrid, Potion 32M | 13 / 16 | 177 ms | 635–643 ms | 6.79 s |

Fresh-process timings include process startup and retain warm filesystem/model
caches. QMD uses a Node worker; the other routes run in Bun. They compare the
tested configurations, not isolated engine internals or every available model.

QMD best fits an optional semantic route here: stronger first-result ranking and
lower repeated-query latency than the tested zvec-grep configuration. Its longer
initial build and model-loading cost argue against using it for every lookup.
The additional milliseconds saved by FTS5 do not justify changing default lexical
ranking and exact-query semantics at this measured scale. SQLite remains a valid
future option if source collection plus real retrieval becomes a bottleneck;
these measurements exclude canonical source collection and whole-store health.

Zvec-grep is not rejected as a product. It built much faster and started faster
than QMD. Its tested hybrid ranking varied between fresh builds (13–14 first-place
answers at 500 units), and at 5,000 units four answers fell below its top five.
We do not need two optional vector engines for this candidate.

## Integration contract

- Markdown, canonical unit identity, effective lifecycle, and exact artifact checks
  retain authority. A semantic hit is a candidate, not a validated claim.
- Existing lexical calls remain dependency-free. Preserve quoted phrases, required
  terms, status/substrate filters, history, graph expansion, and bounded results.
  Do not silently reinterpret exact controls as semantic similarity.
- Semantic use is explicit and local. No automatic model downloads, remote text
  transmission, global installation, mandatory GPU, or resident server.
- Adopt the existing QMD SDK and embedding route; do not implement our own vector
  database, embedding runtime, chunker, query expander, or reranker.
- The thin adapter projects units into disposable files with opaque names and a
  source-bound identity manifest. Returned IDs resolve back to canonical source
  paths and statuses, not provider-authored evidence.
- Refresh must account for additions, changed content, deleted units and lifecycle
  changes. Publish a usable semantic receipt only for a complete source version;
  interrupted refresh, missing dependencies/models, incompatible schema, or stale
  content must leave lexical retrieval available with an explicit diagnostic.
- Keep installation/configuration separate from ordinary retrieval. Test package
  discovery, offline execution, removal, rebuild and compatibility in disposable
  fixtures before describing the optional route as implemented.

The fixed five-per-route union is evidence about candidate coverage, not a proven
optimal ranking policy: when lexical fills five positions, it cannot improve the
first five. The explicit semantic route should expose its own ranked candidates;
any combined presentation must retain route provenance and exact-query behavior.

## Evidence and limits

- [Public development comparison](benchmarks/results/engines-development-semantic-retry-2026-09-04.json)
- [Frozen fresh synthetic cases](benchmarks/engine-workload-cases.json)
- [500-unit comparison](benchmarks/results/engines-synthetic-500-ipc-retry-2026-09-04.json)
- [5,000-unit comparison](benchmarks/results/engines-synthetic-5000-2026-09-04.json)
- [Independent harness audit](benchmarks/results/engine-workload-audit-2026-09-04.json)
- [Strengthened stored-content checks](benchmarks/results/engines-synthetic-content-verified-500-2026-09-04.json)

All four engines passed the strengthened 500-unit checks: indexed content reflects
the replacement token without retaining the old token, removed units have no
current indexed content, and deleted IDs are absent from the tested candidate
lists. These checks inspect actual stored bodies/entities or lexical body postings,
not only source files. They do not require physical erasure of unreachable old
content or independently recompute every embedding. The 5,000-unit receipt uses
the earlier, weaker edit check; do not extend the stronger assertion to that run.

The stronger receipt hashes suite, harness and models before the run and confirms
they remain unchanged afterward. Earlier runs hash at completion; no edits were
made to their evaluated inputs while they ran. The failed sandbox IPC receipt is
preserved separately. No live Psi, MoT, Probatio or Mensura store was accessed.

## Implemented candidate

`kb-semantic configure` binds separately staged QMD 2.8.3, Node >=22 and a local
GGUF. `update` projects canonical units into `.promptus/cache/semantic`, filters
collections by effective status/substrate/archive scope, and publishes a receipt
bound to source, configuration, model bytes and closed database bytes. No source
schema migration or installed-cache change is required. The [usage guide](promptus/README.md#lexical-by-default-semantic-when-useful)
explains configuration, explicit refresh and disabling the route.

`kb-find --semantic` returns QMD-ranked candidates with route provenance. Exact
controls bypass the model; missing/stale/failed semantic state returns fresh
lexical results with a diagnostic. Default lexical lookup does not launch Node
or load a model. The one-shot worker uses request files instead of Bun-to-Node
stdin, pins both QMD's store model and its separate chunk-tokenizer model, and
disables network fetches and native downloads. The real SDK works in the ordinary
sandbox; the earlier benchmark pipe failure does not imply an integration exception.

Real SDK receipts preserve source hashes during configuration, build and queries,
then test an explicit gated fixture addition, stale fallback, refresh and a new
CLI process. Thirteen SDK-double regressions separately cover more failure and
scope boundaries, including races, deletion/archive movement, model changes,
unsafe cache links, exact response identities and interrupted SQLite state.
These are contract tests, not embedding-quality measurements.

- [Initial ordinary-sandbox SDK trial](benchmarks/results/semantic-adapter-sandbox-2026-09-04.json)
- [Hardened ordinary-sandbox SDK trial](benchmarks/results/semantic-adapter-hardened-sandbox-2026-09-04.json)
- [Final ordinary-sandbox SDK trial](benchmarks/results/semantic-adapter-final-sandbox-2026-09-04.json)

The [expanded real-SDK trial](benchmarks/results/semantic-adapter-mutations-empty-collection-fix-2026-09-04.json)
passes 14 checks, adding same-ID body edits, active embedding-row/content verification,
refutation, archives, deletion and restarted queries. It exposed QMD's metadata-only
collection removal: the adapter now scans empty collections before removing their
configuration so deleted documents cease being active. Earlier failed receipts remain.

A [fresh GPT-6 task](benchmarks/results/gpt6-semantic-continuation-2026-09-04.json)
used the optional route, retained evidence status and diagnosed stale regular cache
state without source changes. Concurrent semantic operations can produce explicit
lexical fallback while the lease is held. This one synthetic pilot does not establish
a general behavior improvement. [Migration guidance](MIGRATION.md) and isolated package
checks cover compatibility, standalone Editio and legacy source preservation.

The remaining continuation, batch-maintenance, specialized-instruction and final-scope checks
are now recorded in [the completion audit](OVERHAUL-VERIFICATION.md).
Neither search ranking nor a successful SDK run proves scientific entailment,
absence, live-project effectiveness or full-overhaul completion.
