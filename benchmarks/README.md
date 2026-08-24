# Promptus retrieval benchmark

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

The seed cases are deliberately small. They answer only whether semantic retrieval looks promising
on public Organon notes. A release decision requires a larger, independently labelled query set from
real project retrieval failures, evaluated through a local model when the source material is private.

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
