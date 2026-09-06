<div align="center">

# Promptus benchmark notebook

### Measure the threshold before adding the machinery.

Continuity, maintenance, retrieval, and derived-cache experiments for [Promptus](../promptus/README.md).

[Current decisions](#current-decisions) · [Safety contract](#safety-contract) · [Run index](#run-index) · [Receipts](#evidence-receipts)

</div>

These are dogfood diagnostics, not product features. Each experiment keeps Markdown authoritative,
names its mutation boundary, and records what the result does **not** establish.

## Current decisions

| Experiment | Current evidence | Decision |
| --- | --- | --- |
| [Continuity and traceability](#continuity-and-traceability) | 8/8 deterministic checks; two fresh GPT-6 packet readers answered 7/7 correctly | Packet interpretation has an initial pilot. Autonomous continuation and real-project effectiveness remain unmeasured. |
| [Maintenance](#maintenance) | Exact work conservation restored large-store cadence while preserving gate semantics | The optimization shipped. Relation resolution remains the measured maintenance residual. |
| [SQLite shadow](#sqlite-shadow) | Fast governed deltas, slower clean builds, larger derived storage, no safe replacement for exact health checks | Defer SQLite while file-derived maintenance remains adequate. |
| [Publication fence](#publication-fence) | Isolated writer/read consistency prototype; interruption and cross-process checks with the existing backend | Benchmark only. No live-store migration, backend adoption or installed change. |
| [Retrieval](#retrieval) | Lifecycle-filtered dense retrieval improves semantic recall, but dense replacement loses lexical controls | Keep lexical retrieval. Prototype only a lifecycle-aware mixed candidate route on a fresh holdout. |
| [Local engine comparison](#local-engine-comparison) | Fresh cases and 500/5,000-unit workloads favor QMD for optional semantic ranking; lexical stays fast | Candidate adapter passes isolated SDK checks; no release or project installation. |

## Safety contract

> [!CAUTION]
> Never point a mutating benchmark at a live project. Stage a verified snapshot first. The
> continuity runner is stricter: it accepts no project root and builds its own marked temporary
> fixture.

- Live project Markdown remains read-only when an experiment needs real scale; benchmark vectors
  may be written only beneath the declared disposable cache path.
- Maintenance and SQLite mutation trials run only inside verified disposable snapshots.
- The continuity suite is wholly synthetic and cannot be presented as evidence about Psi, MoT,
  Probatio, Mensura, or another live project.
- Public remote retrieval is opt-in. Private project text, labels, ranks, and vectors stay off
  remote providers and outside this repository.
- A cached projection may accelerate ordinary work, but doctor and health gates retain exact
  content verification.

## Run index

| Runner | Default network | Mutation surface | Start here |
| --- | --- | --- | --- |
| `promptus-continuity.ts` | None | Generated OS-temp fixture only | `bun benchmarks/promptus-continuity.ts` |
| `promptus-maintenance.ts` | None | Explicit staged snapshot | `bun run benchmark:maintenance -- help` |
| `promptus-sqlite.ts` | None | SQLite projection under a verified snapshot/scratch root | `bun run benchmark:sqlite -- help` |
| `promptus-retrieval.ts` | None | Gitignored benchmark cache; remote calls require an explicit flag | `bun run benchmark:retrieval -- --dry-run` |
| `promptus-engines.ts` | Offline execution; stage dependencies and models separately | Public Organon input; generated OS-temp unit projection | `bun benchmarks/promptus-engines.ts --help` |
| `engine-workload.ts` | Offline execution; stage pinned models first | Fresh synthetic cases; generated OS-temp unit projections | Command below; no live-project root accepted |

## Local engine comparison

The overhaul compares existing Promptus retrieval, SQLite FTS5, QMD, and zvec-grep on one
lifecycle-filtered unit projection. The runner accepts no live-project root. Dependencies must
be in a marked OS-temp trial directory; it creates and removes its own fixture. Reports refuse
overwrite and are confined to `benchmarks/results` or OS temp. Model downloads are staged
separately; fetches are disabled during the measured run.

The [completed CPU receipt](results/engines-development-semantic-retry-2026-09-04.json) used
QMD 2.8.3, zvec-grep 0.2.1, and 276 active units from a 332-unit Organon snapshot. Three of the
45 historical cases now target superseded findings and were excluded explicitly. The remaining
42 cases were repeated three times without rank changes.

| Route | Expected result in top 10 | Median query | Build |
| --- | ---: | ---: | ---: |
| Promptus lexical | 31/42 | 0.23 ms | 32 ms |
| SQLite FTS5 | 31/42 | 0.5 ms | 7 ms |
| QMD vector, EmbeddingGemma 300M | 27/42 | 22 ms | 34 s |
| zvec-grep hybrid, Potion 32M | 32/42 | 162 ms | 1.6 s |
| Promptus + QMD, fixed five candidates per route | 35/42 | Combined-route latency not measured | Uses both indexes |
| Promptus + zvec-grep, same fixed policy | 34/42 | Combined-route latency not measured | Uses both indexes |

This is development evidence, not a holdout, large-store result, or fresh-agent effectiveness
claim. Engines use different models; the comparison does not isolate backend quality. QMD's
raw lexical API ANDs full questions and returned no hits; that is a query-adapter mismatch, not
evidence that its complete search product fails. Query expansion and reranking are untested.
QMD vectors used a persistent portable Node worker because the native binding probe timed out
under the tested Bun build. The [failed worker receipt](results/engines-development-semantic-2026-09-04.json)
records a sandbox IPC failure, not retrieval quality. Model downloads are excluded from timings.

The [fresh synthetic suite](engine-workload-cases.json) was written by an independent GPT-6
test agent without seeing those outcomes: 30 fictional notes, 20 answerable questions, and four
absence questions. It is padded with repetitive inventory notes for scale, not represented as
a diverse paper corpus. [500-unit](results/engines-synthetic-500-ipc-retry-2026-09-04.json) and
[5,000-unit](results/engines-synthetic-5000-2026-09-04.json) receipts include repeated queries,
three fresh-process queries with warm OS caches, index storage, and edit/add/delete refresh.
QMD ranked all 20 answers first at both scales. Lexical found all answers in its top five,
so this suite does not demonstrate additional mixed-route recall. Zvec's ranking varied across
fresh builds and placed four answers below its top five at 5,000 units.

The [harness audit](results/engine-workload-audit-2026-09-04.json) identified that same-ID
retrieval did not prove old indexed content was removed. The
[strengthened 500-unit run](results/engines-synthetic-content-verified-500-2026-09-04.json)
checks actual stored content/entities or lexical postings, verifies removed units have no
current indexed content, matches fresh-process rankings to warm rankings, and binds inputs
before execution with after-run drift checks. All four engines pass. It does not prove every
old vector was physically erased. The earlier [sandbox failure](results/engines-synthetic-500-2026-09-04.json)
remains intact; QMD's Node worker needed working local IPC for the retry.

```sh
bun benchmarks/engine-workload.ts \
  --dependencies /tmp/organon-overhaul-engine-trial \
  --units 500 --repeats 3 \
  --output /tmp/new-engine-workload-receipt.json
```

The dependency path must contain the marked, separately staged trial described by the runner,
including its pinned packages and CPU models; the command never installs them. Receipts refuse
overwrite. `--engines promptus-lexical,sqlite-fts5` narrows execution, but the recorded protocol
still requires the staged model artifacts for provenance.

[The architecture decision](../RETRIEVAL.md) keeps lexical as the default and selects QMD as
an optional semantic route. Its better tested ranking and repeated-query latency justify that
candidate; its model-loading cost rules out using it indiscriminately. The optional adapter now
passes [ordinary-sandbox SDK checks](results/semantic-adapter-hardened-sandbox-2026-09-04.json).
Separate SDK-double tests cover exact controls, archive/lifecycle handling, stale/racing state,
cache corruption and physical path safety. Fresh-agent use and packaging still need verification.
Nothing was installed as a production backend. The [expanded 14-step trial](results/semantic-adapter-mutations-empty-collection-fix-2026-09-04.json)
also verifies actual indexed body replacement, embedding-row presence, refutation, archive
movement, deletion and restart. The original measurement-sidecar and empty-collection failures
remain recorded. A [fresh GPT-6 recall pilot](results/gpt6-semantic-continuation-2026-09-04.json)
preserves source bytes and distinguishes current evidence, closed routes and fictional provenance.

`semantic-adapter-trial.ts --dependencies <marked-temporary-dependency-root> --output <new-receipt>`
creates a new synthetic continuity store, then runs actual local configuration, update, queries,
unchanged refresh, gated addition, stale fallback and post-refresh CLI restart. It hashes adapter
code before/after and checks source preservation in the read-only phase. No project-root argument
is accepted. Request-file workers and explicit tokenizer model selection work inside the ordinary
sandbox; the earlier Bun-to-Node stdin benchmark failure remains a historical receipt.

## Continuity and traceability

The [fresh interrupted-work pilot](results/gpt6-interrupted-continuation-2026-09-04.json)
asks GPT-6 to complete a readiness note and checkpoint with a missing raw artifact and no
replication output. Independent verification preserves all eight old unit bodies (accounting
for relocation of the terminal append delimiter), confirms one new OPEN handoff, and leaves
the artifact gate red. A status checkpoint is not treated as proof of a live process or result.

The [batch-maintenance comparison](results/batch-maintenance-2026-09-04.json) alternates three
runs per mode: 20 writes into 508-unit synthetic stores, NOW update, strict health and artifact
preflight. Median total latency was 2.408 s with per-write indexing and 1.055 s with explicit
batch maintenance. All 120 new events survived, source bodies remained intact, and all six
end states passed. Fixture construction and host-hook dispatch overhead are excluded; these
are local Linux measurements, not live-project speedups.

The continuity harness checks the mechanics a resumed agent depends on:

- recover the current frontier;
- retrieve a settled finding;
- retain a superseded result without presenting it as current;
- recover a recorded dead end;
- combine constraints from distant sessions;
- abstain when the store has no answer;
- prepare an action from remembered state;
- trace a claim to sources and a verified artifact.

The runner accepts and needs no live project root. It rejects `--root`, refuses suite/response paths
inside `.promptus`, refuses report/packet output inside `.promptus`, creates a marker-protected
workspace beneath the OS temp directory, binds every Promptus subprocess to that workspace, and
removes it by default. Isolation tests pass decoy store paths and verify their sentinel bytes remain
unchanged.

```bash
bun benchmarks/promptus-continuity.ts \
  --packets /tmp/promptus-continuity-packets.json \
  --output /tmp/promptus-continuity-report.json
```

The bundled synthetic Northbridge history passes all eight deterministic cases, its strict fixture
gate, and session preflight. That result validates the harness and Promptus mechanics. It does not
measure what a fresh agent will do with the packets.

A response file lets the runner score answer choice, required evidence, forbidden evidence, and
abstention:

```bash
bun benchmarks/promptus-continuity.ts \
  --responses /tmp/promptus-continuity-responses.json
```

The scorer cannot prove how the responses were produced or whether the session was fresh.
The [first GPT-6 replay receipt](results/gpt6-continuity-replay-2026-09-04.json) retains the actual
instruction texts, packets, responses, scores, and separate fresh-context task identities. Both
agents answered all seven answerable packets correctly; the strict evidence-list scores were
6/7 for baseline recall instructions and 7/7 for the candidate. The baseline also cited an old
unit while correctly recognizing supersession. This is one trial per arm, not causal evidence
of improvement. It measures packet interpretation, not autonomous retrieval or continuation.
Any future project-derived suite must first become a sanitized, self-contained case bundle or
an operator-approved immutable snapshot.

A [separate fresh GPT-6 manuscript trial](results/gpt6-manuscript-continuation-2026-09-04.json)
exercised real retrieval, writing, numeric binding, rendering, and gating inside a synthetic
fixture. The evidence-store hash stayed unchanged. The number gate passed; the claim gate
correctly remained red under its existing rule, which cannot distinguish reporting a rejected
route from endorsing it. The agent also encountered unsupported stable-ID grounds. Independent
inspection found Editio ignores relation-derived supersession. These are open grounding-contract
defects, not a successful end-to-end manuscript result.

The [grounding retest](results/gpt6-manuscript-grounding-retest-2026-09-04.json) used another fresh
GPT-6 agent with the same task and synthetic suite. It passed both gates without overrides:
five current claims, two historical claims, and three numeric bindings, all using stable IDs.
The source hash remained unchanged. The candidate shares the canonical parser and makes
historical reporting explicit; seven new regression tests cover identity, lifecycle, source
freshness, negative support, invalid roles, custom layouts and independent plugin packaging.
This establishes the bounded fixture outcome, not whole-paper or real-project effectiveness.

## Publication fence

The [fixed protocol](PUBLICATION-FENCE.md) tests a small persistent dirty marker
around the existing writer lease and full-index publisher. It uses synthetic,
marked fixtures and an instrumented runtime copy; production scripts are unchanged.
Readers reconcile pending governed writes before serving a cached generation.
This is not a global outside-edit freshness or power-loss guarantee.

```bash
bun test benchmarks/publication-fence.test.ts
bun benchmarks/publication-trial.ts /path/to/existing/scratch-parent /path/to/new-result.json
```

The trial refuses existing output files and removes only the synthetic scratch it
created after a successful run. It accepts no live-project or private-corpus input.
Source trees and instrumentation are hashed; canonical catalog, graph and search
parity are checked. Tests cover interruption, injected ENOSPC, a killed writer,
concurrent readers/writers, multi-file partial writes, cache loss and outside edits.

The [initial Windows-mount receipt](results/publication-fence-windows-9p-2026-09-05.json)
retains a costly first implementation: amendment workflows rebuilt twice.
The [refinement](PUBLICATION-FENCE-REFINEMENT.md) reuses the successful full rebuild
already performed inside `kb-amend`'s lease. Neither version implements sparse
parsing or introduces SQLite. The [refined 9p receipt](results/publication-fence-reuse-windows-9p-2026-09-05.json)
records 4,608 synthetic units and five samples per operation/arm:

| End-to-end operation | Baseline median | Fenced median |
| --- | ---: | ---: |
| Append, reconcile, find, get | 3.55 s | 3.78 s |
| Amend, find, get | 3.31 s | 3.43 s |
| Clean fresh-process navigation | 172 ms | 275 ms |

Full canonical parity passed. The final cache was 4,018,741 versus 4,019,302 bytes
(561 additional bytes); this prototype stores a control record, not a second database.
The fence closes a governed-visibility gap but has not earned deployment as a speed
optimization. Keep it benchmark-only; persistent changed-file parsing remains a
separate implementation question. The 23 focused fault/concurrency regressions ran
on tmpfs; normal end-to-end flows and parity were measured on 9p, not power-loss
recovery on 9p.

Recursive peak-space instrumentation runs separately
from latency samples. Logical bytes are not filesystem allocation or power-loss
durability measurements; repeated synthetic text is not real-project relevance.

## Maintenance

`promptus-maintenance.ts` stages a store plus declared artifact dependencies, verifies the source
Markdown hash, then times status, retrieval, preflight, trajectory collection, fingerprinting,
artifact verification, indexing, health, and governed writes.

```bash
bun run benchmark:maintenance -- stage \
  --source-root /path/to/read-only/project \
  --target-root /path/to/disposable-snapshot \
  --artifact-mode copy

bun run benchmark:maintenance -- run \
  --root /path/to/disposable-snapshot \
  --profile project-ext4 \
  --filesystem ext4 \
  --output benchmarks/results/maintenance-project-ext4.json \
  --suite full
```

`--cpu-list 0` adds a one-CPU control when `taskset` is available.

### Baseline: repeated deterministic work

The first frozen MoT snapshot contained 5,338 live units, 2,600 source Markdown files, and 3,700
artifact records. The same bytes were measured on a Windows-mounted WSL path, native WSL ext4, and
tmpfs.

| Operation | WSL 9p | ext4 | tmpfs | 9p/ext4 |
| --- | ---: | ---: | ---: | ---: |
| Current-state status | 0.08 s | 0.04 s | 0.04 s | 2.0× |
| Knowledge retrieval | 0.25 s | 0.17 s | 0.17 s | 1.5× |
| Session doctor | 57.66 s | 0.58 s | 0.52 s | 99.4× |
| Index rebuild | 38.90 s | 2.80 s | 3.05 s | 13.9× |
| Full check including re-index | 109.34 s | 3.61 s | 3.68 s | 30.3× |
| Gated write, no relation | 29.44 s | 0.23 s | 0.22 s | 128.0× |
| Gated write with relation | 35.36 s | 0.33 s | 0.34 s | 107.2× |

The filesystem contrast amplified the defect; it did not select the remedy. ext4 and tmpfs were
effectively tied, as was an ext4 one-CPU control. The actionable problem was repeated exact work:
rescanning findings for thinker custody, rehashing the same canonical artifacts for many owners,
and rewriting byte-identical projections.

A bounded-memory follow-up streamed the same 552.76 MB across 2,247 canonical artifact paths with a
1 MiB buffer. It reproduced the 3,712-outcome digest and reduced peak RSS from 331.23 MiB to 54.00
MiB (83.7%) at a 4.99% wall-time cost on WSL 9p. Unique-path deduplication remained the wall-time
fix; streaming was the exact memory-safety fix.

### Shipped result: exact work conservation

The production implementation was rerun on a later MoT snapshot with 5,357 units, 2,630 source
files, and 3,730 artifact records. Markdown, graph, lexical retrieval, artifact-owner outcomes,
thinker bindings, health classifications, and readiness semantics remained exact.

| Operation | WSL 9p before | WSL 9p after | ext4 before | ext4 after |
| --- | ---: | ---: | ---: | ---: |
| Session doctor | 57.66 s | 15.46 s | 0.58 s | 0.35 s |
| Index rebuild | 38.90 s | 13.48 s | 2.80 s | 1.02 s |
| Full check including re-index | 109.34 s | 35.70 s | 3.61 s | 1.72 s |
| Gated write, no relation | 29.44 s | 0.21 s | 0.23 s | 0.07 s |
| Gated write with relation | 35.36 s | 7.55 s | 0.33 s | 0.16 s |

The thinker inspector fell from 28.91 to 4.26 seconds on 9p while preserving all 16 current
bindings. Index peak RSS fell from 649.0 to 396.4 MiB on 9p and from 675.1 to 414.2 MiB on ext4;
full-check peak RSS fell by roughly half on both profiles.

The implementation reuses already-read Markdown bytes, scans findings once for thinker custody,
streams each canonical artifact once for all owners, skips unaffected thinker projections, and
leaves identical derived bytes untouched. It subsequently shipped in Promptus. Relation-bearing
writes on metadata-heavy mounts remain the measured residual.

Rebuild the aggregate receipt while isolated snapshots exist:

```bash
bun run benchmark:maintenance:candidate-report -- \
  --source-root /path/to/read-only/source \
  --windows-root /path/to/windows-mount-snapshot \
  --ext4-root /path/to/ext4-snapshot
```

## SQLite shadow

`promptus-sqlite.ts` tests a disposable SQLite projection while keeping Markdown authoritative.
The protocol was frozen in [`promptus-sqlite-preregistered.json`](promptus-sqlite-preregistered.json)
before the definitive run.

```bash
bun run benchmark:sqlite -- run \
  --root /path/to/verified-snapshot \
  --work-root /path/to/bounded-native-scratch \
  --output benchmarks/results/sqlite-shadow-project.json
```

The MoT trial used 5,341 units, 2,604 source files, and 832,130 exact lexical-posting rows on native
Linux storage. Clean build, query, mutation, stale-cache, and delete/rebuild invariants all passed.

| Operation | JSON/Markdown path | SQLite shadow | Effect |
| --- | ---: | ---: | ---: |
| Clean derived build | 3.00 s | 4.71 s | 1.57× slower |
| Fresh process-equivalent query | 71.84 ms | 9.73 ms | 7.39× faster |
| Persistent 12-query suite | 327.08 ms | 438.32 ms | 1.34× slower |
| One-write derived refresh | 2.75 s full index | 72.83 ms / 2 units | 37.76× faster |
| Ten-write derived refresh | 3.09 s full index | 67.71 ms / 11 units | 45.64× faster |
| Changed-ledger replacement | 2.75 s full index | 2.97 s / 2,979 units | no gain |
| Derived storage | 19.68 MB | 59.31 MB | 3.01× larger |

The append boundary is load-bearing: appending one ledger entry changes the new unit and the former
final slice. A writer-aware transaction can update two rows; file-level replacement rewrites roughly
421,000 postings and loses the benefit.

An O(1) generation receipt took 0.011 ms but could not detect an out-of-band Markdown edit. A
2,604-file stat manifest found it in 15.37 ms; exact content verification took 32.37 ms. SQLite
therefore cannot replace doctor/check trust semantics. Since exact file-derived work conservation
restored adequate cadence, adoption remains deferred.

## Retrieval

The retrieval experiments compare Promptus's status-aware lexical ranker with dense and mixed
candidate routes over the same units. Embeddings are not a shipped Promptus feature.

### Public dry run and remote opt-in

Inspect the corpus, cases, lexical baseline, and planned API calls without a key or network:

```bash
bun run benchmark:retrieval -- --dry-run
```

Remote access requires an explicit public-data flag:

```bash
bun run benchmark:retrieval -- --allow-public-remote
```

The stored 2026-08-23 policy probe found no zero-data-retention endpoint for the two free embedding
routes then tested. Provider policy is dynamic. `--require-zdr` asks OpenRouter to enforce both zero
retention and no training and fails closed when no eligible endpoint exists. Never send unpublished
project material merely because a route is free.

<details>
<summary><strong>Local key and model profiles</strong></summary>

Create `.env.local` at the Organon root:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Do not paste the key into chat or commit it. The default public remote profile is
`nvidia/nemotron-3-embed-1b:free` with `passage:` and `query:` prefixes. The optional
`liquid/lfm-2.5-embedding-350m:free` profile uses `document:` and `query:` prefixes with a
conservative 384-byte passage ceiling for its recorded route.

</details>

### Local frozen suite

The larger suite in [`retrieval-cases-v2.json`](retrieval-cases-v2.json) runs against a staged local
Nemotron checkpoint, opens no network route, and writes vectors only beneath the gitignored
`.promptus/cache/retrieval-benchmark/` path.

```bash
uv venv --python 3.12 /tmp/organon-retrieval-venv
uv pip install --python /tmp/organon-retrieval-venv/bin/python \
  -r benchmarks/requirements-local.txt

bun run benchmark:retrieval -- \
  --root . \
  --cases benchmarks/retrieval-cases-v2.json \
  --model nvidia/Nemotron-3-Embed-8B-BF16 \
  --local-model /path/to/Nemotron-3-Embed-8B-BF16/snapshot \
  --python /tmp/organon-retrieval-venv/bin/python \
  --batch-size 8
```

The preregistered candidate alternates five active lexical and five active dense candidates into
the first ten positions, then appends a lifecycle-filtered reciprocal-rank-fused tail.

| Ranking | Recall@5 | Recall@10 | MRR | Inactive/untrusted in top 10 |
| --- | ---: | ---: | ---: | ---: |
| Existing lexical | 0.667 | 0.756 | 0.521 | 0.007 |
| Raw dense | 0.867 | 0.978 | 0.703 | 0.151 |
| Lifecycle-filtered dense | 0.933 | 0.978 | 0.746 | 0.000 |
| Symmetric reciprocal-rank hybrid | 0.844 | 0.933 | 0.683 | 0.036 |
| Preregistered candidate union | 0.844 | 0.956 | 0.612 | 0.000 |

The RTX 5090 encoded 467 inputs at 4,096 dimensions in 31.1 seconds. Raw dense returned 68 inactive
units among 450 top-10 slots; lifecycle filtering reduced that to zero. This crossed a threshold
for further local candidate-route development, not for replacing lexical retrieval.

### Cross-project challenge

Psi and MoT were tested with independently authored private 30-case suites: 20 semantic-rescue
targets beyond lexical rank 10 and 10 lexical controls each.

| Project | Filtered-dense rescue | Filtered-dense controls | Mixed-candidate rescue | Mixed-candidate controls |
| --- | ---: | ---: | ---: | ---: |
| Psi | 15/20 | 10/10 | 13/20 | 10/10 |
| MoT | 15/20 | 8/10 | 12/20 | 9/10 |

Pure filtered dense failed the preregistered cross-project rule because it lost two MoT controls.
The mixed route passed rescue, retention, and lifecycle-hygiene thresholds in both projects. It is
evidence for an optional local candidate generator, not a dense replacement. Private cases, source
snapshots, per-query ranks, and vectors remain outside public Organon.

<details>
<summary><strong>First public seed result</strong></summary>

The original nine-case Organon seed produced:

| Ranking | Recall@5 | Recall@10 | MRR | Inactive/untrusted in top 10 |
| --- | ---: | ---: | ---: | ---: |
| Existing lexical | 0.778 | 0.778 | 0.499 | 0.000 |
| Nemotron dense | 1.000 | 1.000 | 0.833 | 0.078 |
| Reciprocal-rank hybrid | 0.889 | 0.889 | 0.747 | 0.000 |

Dense recovered every labeled target but admitted lifecycle-inactive units. Simple reciprocal-rank
fusion removed that contamination and demoted the semantic-only rescue to rank 50. That failure led
to the later lifecycle-aware candidate policy.

</details>

## Evidence receipts

| Receipt | Contents |
| --- | --- |
| [`maintenance-cross-hardware-v1-2026-08-25.json`](results/maintenance-cross-hardware-v1-2026-08-25.json) | Baseline profiles, controls, methodology, caveats |
| [`maintenance-no-sqlite-candidate-v1-2026-08-26.json`](results/maintenance-no-sqlite-candidate-v1-2026-08-26.json) | Exact work-conservation aggregate later promoted to production |
| [`artifact-streaming-mot-windows-9p-2026-08-25.json`](results/artifact-streaming-mot-windows-9p-2026-08-25.json) | Bounded-memory artifact hashing |
| [`sqlite-shadow-mot-ext4-2026-08-25.json`](results/sqlite-shadow-mot-ext4-2026-08-25.json) | Preregistered SQLite shadow result |
| [`retrieval-local-v2-2026-08-24.json`](results/retrieval-local-v2-2026-08-24.json) | Frozen Organon local ranks, hashes, runtime, limitations |
| [`retrieval-cross-project-v1-2026-08-24.json`](results/retrieval-cross-project-v1-2026-08-24.json) | Public-safe Psi/MoT aggregate without private cases |

The portable maintenance report is also available as
[`maintenance-cross-hardware-v1-2026-08-25.html`](results/maintenance-cross-hardware-v1-2026-08-25.html).
