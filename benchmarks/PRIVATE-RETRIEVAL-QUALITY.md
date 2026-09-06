# Private retrieval-quality pilot

This source-only follow-up assesses whether zvec-grep helps retrieve evidence from
the frozen Psi/MoT copies used by [the CPU replay](LOCAL-CPU-REPLAY.md).
It does not install a backend or modify live project stores.

## Frozen design

Two independent Luna-max authors receive source records, not retrieval outputs:
one handles Psi and the other MoT, for 24 questions total in separate suites.
Each writes twelve questions: four conceptual paraphrases, two exact identifiers,
two historical/lifecycle questions, two questions requiring multiple sources, and
two unsupported-premise probes. A deterministic gate checks category balance,
source identities, status eligibility, and supporting quotations. Questions and
corpus hashes are frozen before retrieval. This is source-conditioned question
generation, not a random sample of actual user queries or independent human gold.

The comparison uses current Promptus lexical ranking and the top-100-entity,
post-filtered zvec-grep route, with two independently built zvec-grep 0.2.1
indexes using cached Potion retrieval 32M embeddings on CPU. Both
receive the same canonical unit bodies and titles. Lexical also uses its native
path and lifecycle features; zvec sees opaque filenames. This is a comparison of
the existing routes, not an isolated embedding-model comparison. No tuning or
selection of the better vector build is allowed. The first is primary; the second
measures rebuild variability.

Both routes apply the same final eligibility rule: normal questions exclude cold,
UNTRUSTED, REFUTED, SUPERSEDED and RETIRED units; historical questions admit them.
Lexical's production default down-ranks inactive units rather than excluding them;
the explicit exclusion here is an evaluation policy, not a shipped behavior claim.
Historical lexical queries set both history and includeInactive. The zvec adapter
requests at most 100 context entities, deduplicates to files, then applies scope;
filtering may therefore leave fewer than 100 eligible units. Lexical ranks its
full matching set before that same final scope filter. Candidate counts are kept.

Known-target Hit@5/10 and reciprocal rank at 10 measure whether at least one
author-labelled source was found. All-evidence@5/10 requires every labelled group,
especially for multi-source questions. These are labelled-target coverage, not
exhaustive recall: other useful sources may exist. Each question has equal weight;
unsupported-premise probes are excluded from positive-question averages.

Fresh Luna-max judges receive the shuffled union of each route's top five sources,
without route labels, ranks, author answers or identification of the author's
target sources. Canonical source IDs and lifecycle metadata remain visible so
judges can follow references and interpret historical evidence. They rate each source:
0 irrelevant, 1 useful context/partial evidence, 2 directly supports answering the
question. Positive ratings require a verifiable source quotation. Judges can read
complete bodies. Direct and useful precision@5 are per-route metrics from pooled
judgments, using a fixed denominator of five,
so unfilled positions receive zero credit. No answer generation or hallucination
rate is measured. Unsupported premises are assessed separately and cannot prove
universal absence from a finite judged pool.

## Interpretation boundaries

This is a small exploratory model-labelled pilot. Authors and judges share a model
family; one judge per project provides no inter-rater agreement estimate. Corpora
contain historical duplicates and evolving claims. Confidence requires inspecting
status and context, not trusting title overlap or embedding similarity. No statistical
significance, scientific truth, security audit, persistent-disk latency or universal
backend winner is established. Full source verification costs were measured separately
in the CPU replay; this quality runner measures ranking, not end-to-end service latency.

The requested agent alias and reasoning effort are recorded, but the service does
not expose the resolved model build. Package manifests and embedding-model bytes
are checked; the full transitive native/dist dependency closure is not certified.

All research text, questions, labels, rankings, projections, vectors and logs remain
in a marked private OS-temp workspace. Public outputs contain numeric aggregates,
opaque case IDs, and receipt hashes only. Immutable captures are verified; indexes
are built in separate directories. Existing failed/successful benchmark evidence is
not rewritten. The commands are `quality-sources.ts prepare`, then
`private-retrieval-quality.ts freeze`, `run`, and `summarize` per project.
Private receipts are retained in temporary storage, not a durable archival system;
their public hashes do not make missing private inputs recoverable.

## Observed result

The [dated numeric receipt](results/private-retrieval-quality-2026-09-05.json)
contains the completed result. Five Luna-max agents authored, audited and blindly
judged the pilot: 24 questions, 12,826 frozen units and 181 question–passage ratings.
On the 20 positive questions, lexical versus primary zvec had known-target Hit@5
90% versus 85%, direct-evidence precision@5 61% versus 59%, and useful-evidence
precision@5 (including background) 90% versus 94%. Both had Hit@10 of 90%.

There are local benefits, not a uniform winner. Historical questions recovered all
labelled groups within five results in 2/4 lexical versus 4/4 zvec cases. Multi-source
questions recovered all labelled groups within ten results in 3/4 lexical versus
1/4 zvec cases. Those very small groups are descriptive, not statistically decisive.
The two independent vector builds had identical ordered top-five results on all 24
questions, although deeper candidate pools differed slightly.

Ten initial quotation-transcription errors were caught by the gate. Original drafts
were retained, judges repaired quotations while still blind, and deterministic
comparison verified no relevance-grade or rationale changes. All 181 final ratings
and positive quotations passed. Full repository tests: 420 pass, 0 fail.

Keep lexical as the default. The modest context benefit warrants, at most, further
testing of a combined or optional route on real failed searches and end-to-end agent
tasks; that combined route was not tested here. This result concerns zvec-grep with
Potion 32M on these copies, not zvec's engine or all embedding models in general.
