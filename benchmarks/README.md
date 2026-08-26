# Promptus benchmarks

These experiments are dogfood diagnostics, not shipped Promptus features. Markdown remains
authoritative, live project stores remain read-only, and mutating trials run only in verified
snapshots.

## Maintenance benchmark

`promptus-maintenance.ts` stages a store plus its declared artifact dependencies, verifies that the
source Markdown hash matches, and times status, retrieval, session preflight, collection,
fingerprinting, artifact verification, indexing, full checks, and governed writes. It also contains
exact-equivalence probes for single-pass thinker binding and unique-path artifact hashing.

```bash
bun run benchmark:maintenance -- help

bun run benchmark:maintenance -- stage \
  --source-root /path/to/project \
  --target-root /path/to/disposable-snapshot \
  --artifact-mode copy

bun run benchmark:maintenance -- run \
  --root /path/to/disposable-snapshot \
  --profile project-ext4 \
  --filesystem ext4 \
  --output benchmarks/results/maintenance-project-ext4.json \
  --suite full
```

Never point `run` at a live project: the full suite deliberately exercises governed writes. Use
`stage` first. `--cpu-list 0` provides a one-CPU control when `taskset` is available.

### First maintenance result

On 2026-08-25, the same frozen MoT snapshot—5,338 live units, 2,600 source Markdown files, and
3,700 artifact records—was measured on a Windows-mounted WSL path (`9p/v9fs`), WSL native ext4,
and tmpfs:

| Operation | WSL 9p | ext4 | tmpfs | 9p/ext4 |
| --- | ---: | ---: | ---: | ---: |
| Current-state status | 0.08 s | 0.04 s | 0.04 s | 2.0× |
| Knowledge retrieval | 0.25 s | 0.17 s | 0.17 s | 1.5× |
| Session doctor | 57.66 s | 0.58 s | 0.52 s | 99.4× |
| Index rebuild | 38.90 s | 2.80 s | 3.05 s | 13.9× |
| Full check including re-index | 109.34 s | 3.61 s | 3.68 s | 30.3× |
| Gated write, no relation | 29.44 s | 0.23 s | 0.22 s | 128.0× |
| Gated write with relation | 35.36 s | 0.33 s | 0.34 s | 107.2× |

The filesystem contrast is a diagnostic amplifier, not the proposed remedy. ext4 and tmpfs were
effectively tied, and an ext4 one-CPU control was also tied with the inherited 16-logical-CPU
profile. The actionable defect is metadata-heavy repeated deterministic work. Current thinker
inspection repeatedly walks 1,010 finding files; a single-pass probe preserved the exact 12-binding
digest and was 10.75× faster on 9p, 3.33× on ext4, and 3.17× on tmpfs. Hashing each of 2,237 unique
declared artifact paths once likewise preserved all 3,700 outcomes and was 1.62×, 1.35×, and 1.53×
faster on those profiles.

The hardware-agnostic target is a work-conserving maintenance pipeline: construct one immutable
source snapshot, reuse it for hashing/index/graph/search/thinker/check, refresh only dependency-
affected derived surfaces, hash each canonical artifact file once, batch governed writes under one
lock, and never rewrite identical derived bytes. Storage profiles validate the same implementation;
they do not select different algorithms.

A follow-up bounded-memory probe hashed the same 552.76 MB across 2,247 canonical MoT artifact
paths with a 1 MiB buffer. It preserved the exact 3,712-outcome digest and reduced peak RSS from
331.23 MiB to 54.00 MiB (83.7%), at a 4.99% wall-time cost on WSL 9p. Streaming is therefore an
exact memory-safety patch, while unique-path deduplication remains the wall-time patch. The receipt
is `results/artifact-streaming-mot-windows-9p-2026-08-25.json`.

Build the public-safe aggregate and canonical portable-report payload with:

```bash
bun run benchmark:maintenance:report
```

The exact receipts, methodology, controls, caveats, and hardware-specific engineering sequence are
in `results/maintenance-cross-hardware-v1-2026-08-25.json`. The portable HTML report is generated
from the adjacent `.artifact.json` through the Data Analytics report builder.

### Database-independent candidate result

On 2026-08-26, the exact work-conservation candidate was rerun against the then-current MoT store
(5,357 units, 2,630 source files, and 3,730 artifact records). Markdown, graph, lexical retrieval,
artifact-owner outcomes, thinker bindings, health classifications, and readiness semantics were
preserved. No SQLite database, daemon, embedding model, or trusted stat-only cache was used.

| Operation | WSL 9p before | WSL 9p candidate | ext4 before | ext4 candidate |
| --- | ---: | ---: | ---: | ---: |
| Session doctor | 57.66 s | 15.46 s | 0.58 s | 0.35 s |
| Index rebuild | 38.90 s | 13.48 s | 2.80 s | 1.02 s |
| Full check including re-index | 109.34 s | 35.70 s | 3.61 s | 1.72 s |
| Gated write, no relation | 29.44 s | 0.21 s | 0.23 s | 0.07 s |
| Gated write with relation | 35.36 s | 7.55 s | 0.33 s | 0.16 s |

The production thinker inspector fell from 28.91 to 4.26 seconds on 9p while preserving all 16
current bindings. Index peak RSS fell from 649.0 to 396.4 MiB on 9p and from 675.1 to 414.2 MiB on
ext4; full-check peak RSS fell by roughly half on both profiles. Relation-only dry runs remain bound
by exact whole-store target resolution and did not improve on 9p. That residual does not justify a
batch-writing interface yet: ordinary writes are now sub-second, and the exact full gate meets the
30–40 second stress-mount budget.

The aggregate receipt is `results/maintenance-no-sqlite-candidate-v1-2026-08-26.json`; its three
raw candidate receipts sit beside it. Rebuild the aggregate while the isolated snapshots still
exist with:

```bash
bun run benchmark:maintenance:candidate-report -- \
  --source-root /path/to/read-only/source \
  --windows-root /path/to/windows-mount-snapshot \
  --ext4-root /path/to/ext4-snapshot
```

## SQLite shadow-cache experiment

`promptus-sqlite.ts` tests a disposable SQLite projection without changing shipped Promptus code.
It retains Markdown as the only authority and reproduces the existing lexical postings and ranking
exactly; SQLite FTS is deliberately not substituted. The protocol was frozen before the definitive
run in `promptus-sqlite-preregistered.json`.

```bash
bun run benchmark:sqlite -- run \
  --root /path/to/verified-snapshot \
  --work-root /path/to/bounded-native-scratch \
  --output benchmarks/results/sqlite-shadow-mot-ext4-2026-08-25.json
```

The 2026-08-25 MoT trial used 5,341 units, 2,604 source files, and 832,130 exact
lexical-posting rows on native Linux storage. Every clean-build, query, mutation, stale-cache, and
delete/rebuild invariant passed.

| Operation | Current JSON/Markdown path | SQLite shadow | SQLite effect |
| --- | ---: | ---: | ---: |
| Clean derived build | 3.00 s | 4.71 s | 1.57× slower |
| Fresh process-equivalent one-query read | 71.84 ms | 9.73 ms | 7.39× faster |
| Persistent 12-query suite | 327.08 ms | 438.32 ms | 1.34× slower |
| One-write derived refresh | 2.75 s full index | 72.83 ms / 2 changed units | 37.76× faster |
| Ten-write derived refresh | 3.09 s full index | 67.71 ms / 11 changed units | 45.64× faster |
| One-write changed-ledger replacement | 2.75 s full index | 2.97 s / 2,979 units | no gain |
| Derived storage | 19.68 MB | 59.31 MB | 3.01× larger |

The append boundary matters: adding one ledger entry changes both the new unit and the former final
entry, whose slice previously extended to the append sentinel. A correct writer-known transaction
updates those two rows. Treating the monolithic ledger merely as a changed file forces replacement
of roughly 421,000 posting rows and gives no speedup.

The stale-cache trial also fixes the trust boundary. An O(1) generation receipt took 0.011 ms but,
as expected, could not see a deliberately out-of-band Markdown edit. A 2,604-file stat manifest
detected it in 15.37 ms; exact content verification detected it in 32.37 ms. Therefore a production
SQLite cache may accelerate governed writes and ordinary reads, while doctor/check retain exact
content verification and fail closed. The result supports a narrow derived-cache development
branch, not adoption, release, or any transfer of authority from Markdown.

## Retrieval benchmark

This is a dogfood experiment, not a shipped Promptus retrieval feature. It compares the existing
status-aware lexical ranking with dense retrieval and reciprocal-rank-fused hybrid retrieval over
the same Promptus units. The default remote model is NVIDIA Nemotron 3 Embed 1B; LiquidAI
LFM2.5-Embedding-350M remains available as an optional short-context comparison.

Markdown remains authoritative. Remote vectors and the benchmark cache live only under the
gitignored `.promptus/cache/retrieval-benchmark/` directory.

## OpenRouter key

From the Organon repository root:

```bash
cp .env.example .env.local
```

Then edit `.env.local` locally:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Do not paste the key into chat, commit it, or put it in `.env.example`. Bun loads `.env.local`
automatically when the command runs from this repository root.

## Run

Inspect the corpus, cases, lexical baseline, and planned API calls without using a key or network:

```bash
bun run benchmark:retrieval -- --dry-run
```

OpenRouter's [current ZDR allowlist](https://openrouter.ai/api/v1/endpoints/zdr) contains neither free model. A fail-closed probe with both
`zdr: true` and `data_collection: "deny"` returns `404 No endpoints found matching your data policy`
for Nemotron and Liquid. Run either model only on material you are willing to disclose to its
provider. The included Organon corpus is public; unpublished Psi, MoT, Probatio, and other private
stores are not approved for this path. OpenRouter documents how
[per-request ZDR enforcement](https://openrouter.ai/docs/guides/features/zdr) fails closed.

```bash
bun run benchmark:retrieval -- --allow-public-remote
```

The default model is `nvidia/nemotron-3-embed-1b:free`. Documents use NVIDIA's required `passage:`
prefix and queries use `query:`. Inputs are byte-bounded and API responses are cached after every
successful batch so a rate limit or interruption does not waste completed calls.

Liquid's required prefixes differ. Its profile uses `document:`/`query:` and a conservative
384-byte passage ceiling for the current 512-token OpenRouter route:

```bash
bun run benchmark:retrieval -- --allow-public-remote \
  --model liquid/lfm-2.5-embedding-350m:free
```

`--require-zdr` tells OpenRouter to enforce both zero retention and no training. It deliberately
fails for these two free routes today. Use that mode only with a model whose endpoint appears in
OpenRouter's live ZDR inventory.

The remote seed cases are deliberately small. They answer only whether semantic retrieval looks
promising on public Organon notes. The larger local experiment below uses a frozen query set and
keeps private material off remote providers.

## Local benchmark

The larger suite is frozen in `retrieval-cases-v2.json`. It requires every labelled target to be
lifecycle-active before inference. The local run uses the staged Nemotron 3 Embed 8B BF16 checkpoint,
never opens a network route, and writes vectors only beneath `.promptus/cache/retrieval-benchmark/`:

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

The pre-registered lifecycle-aware candidate policy is intentionally simple: filter superseded,
refuted, retired, and untrusted units; alternate the top five active lexical and top five active
dense candidates into the first ten slots; then append the active reciprocal-rank-fused tail. This
gives each retriever five top-10 opportunities without tuning a weight after seeing the labels.

## First local result

On 2026-08-24, the frozen 45-case suite over 298 Organon units produced:

| Ranking | Recall@5 | Recall@10 | MRR | Inactive/untrusted in top 10 |
| --- | ---: | ---: | ---: | ---: |
| Existing lexical | 0.667 | 0.756 | 0.521 | 0.007 |
| Raw dense | 0.867 | 0.978 | 0.703 | 0.151 |
| Lifecycle-filtered dense | 0.933 | 0.978 | 0.746 | 0.000 |
| Symmetric reciprocal-rank hybrid | 0.844 | 0.933 | 0.683 | 0.036 |
| Pre-registered candidate union | 0.844 | 0.956 | 0.612 | 0.000 |

The RTX 5090 encoded 467 inputs at 4,096 dimensions in 31.1 seconds. A cache-only replay requested
no inference and reproduced every metric. Against lexical retrieval, lifecycle-filtered dense
retrieval improved Recall@5 by 0.267 (paired bootstrap 95% interval 0.133–0.422) and Recall@10 by
0.222 (0.111–0.356). Raw dense retrieval's 68 inactive results among 450 top-10 slots show that
semantic relevance cannot substitute for Promptus lifecycle policy.

This crosses the measured threshold for developing a local semantic fallback or candidate generator.
It does not justify replacing lexical retrieval, adding SQLite, or shipping embeddings yet: the suite
covers one project and does not test exact identifiers, code fragments, or end-to-end agent outcomes.
The frozen protocol is in `retrieval-local-v2-preregistered.json`; exact ranks, hashes, runtime, and
limitations are in `results/retrieval-local-v2-2026-08-24.json`.

## Cross-project challenge result

Psi and MoT were then tested with independently authored, private 30-case suites. Each suite was
frozen before dense inference and deliberately contained 20 targets beyond lexical rank 10 plus 10
top-10 lexical controls. This is a semantic-rescue challenge, not an estimate of ordinary query
prevalence.

| Project | Filtered-dense miss rescue | Filtered-dense controls | Candidate miss rescue | Candidate controls |
| --- | ---: | ---: | ---: | ---: |
| Psi | 15/20 | 10/10 | 13/20 | 10/10 |
| MoT | 15/20 | 8/10 | 12/20 | 9/10 |

Raw dense retrieval placed 107 inactive or untrusted units in 600 top-10 slots across the two
projects. Lifecycle filtering reduced that to zero. Pure filtered dense failed the pre-registered
cross-project rule because it lost two MoT lexical controls. The pre-registered mixed candidate
route passed the same rescue, retention, and lifecycle-hygiene thresholds in both projects.

The result is evidence for an optional local semantic candidate route, not a dense replacement.
It also exposes a practical constraint: 20,064 cold embeddings took 964.5 GPU-seconds and the two
JSON caches totalled 1.65 GiB. A production experiment should keep lexical retrieval, filter lifecycle
state before presentation, test ranking policy on a fresh holdout, and use a compact derived vector
format. It should not make Markdown cease to be authoritative or imply that SQLite is required.
Private case text, labels, source snapshots, per-query ranks, and vectors were kept outside public
Organon. The public-safe aggregate receipt is
`results/retrieval-cross-project-v1-2026-08-24.json`.

## First public result

On 2026-08-23, the 9-case public Organon seed produced:

| Ranking | Recall@5 | Recall@10 | MRR | Inactive/untrusted in top 10 |
| --- | ---: | ---: | ---: | ---: |
| Existing lexical | 0.778 | 0.778 | 0.499 | 0.000 |
| Nemotron dense | 1.000 | 1.000 | 0.833 | 0.078 |
| Reciprocal-rank hybrid | 0.889 | 0.889 | 0.747 | 0.000 |

Dense retrieval recovered every labelled target, including the one absent from the lexical result.
It also surfaced lifecycle-inactive units more often. The simple reciprocal-rank fusion removed that
contamination but demoted the semantic-only rescue from dense rank 2 to hybrid rank 50. This is a
positive signal for a larger pre-labelled local benchmark, not evidence to change shipped Promptus.
The next experiment should preserve Promptus lifecycle semantics while allowing a strong semantic
candidate to enter even when lexical retrieval has no match.
