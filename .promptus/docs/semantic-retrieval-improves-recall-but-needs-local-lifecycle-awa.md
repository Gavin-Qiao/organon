---
id: finding-20260823T145421Z-semantic-retrieval-improves-recall-but-needs-local-lifecycle-awa
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-23 10:54:21"
relations: ["derives-from:event-20260823T144353Z-validate-public-nemotron-retrieval-and-keep-private-stores-local", "derives-from:lit-20260823T145243Z-openrouter-provider-policy-excludes-private-stores-from-free-emb", "derives-from:lit-20260823T145216Z-nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader"]
links: [openrouter-provider-policy-excludes-private-stores-from-free-emb, nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader, header-beats-vector]
artifacts: [benchmark-report|benchmarks/README.md|f4942229adc9e20d9a2304e69682302409a47e6e4d3ef80a367ba49da7d38740, labelled-cases|benchmarks/retrieval-cases.json|eb9c4986a03acf509cfcfcc9815c7d6d60850e134aace1a087e284d0a101dcc9]
---
# Semantic retrieval improves recall but needs local lifecycle-aware integration

The 9-case public Organon seed establishes a bounded positive signal for semantic retrieval. Existing lexical ranking scored Recall@5/10 0.778/0.778 and MRR 0.499. NVIDIA Nemotron 3 Embed 1B dense ranking scored 1.000/1.000 and MRR 0.833, recovering at rank 2 the target that lexical retrieval did not return. Raw dense ranking also raised inactive-or-untrusted top-10 exposure from 0.000 to 0.078. Symmetric reciprocal-rank fusion restored lifecycle cleanliness to 0.000 but scored Recall@5/10 0.889/0.889 and demoted the semantic-only rescue to rank 50.

Therefore embeddings can add real paraphrase recall, but a vector index alone violates Promptus's calibrated lifecycle surface, while naïve consensus fusion suppresses exactly the candidates embeddings are meant to rescue. The next admissible experiment is a larger frozen, independently labelled query set drawn from real project retrieval failures, using local inference and a lifecycle-aware candidate policy. Markdown remains authoritative; embeddings remain disposable derived data; the 9-case seed does not justify a shipped Promptus change.

Remote free endpoints are excluded for private stores: OpenRouter currently reports both NVIDIA and Liquid as retaining and training on prompts, and neither tested route satisfies enforced ZDR. For the local experiment, the official `nvidia/Nemotron-3-Embed-8B-BF16` checkpoint is selected because its July 2026 model card reports the strongest current RTEB retrieval result among the compared open checkpoints. Revision `c44c20ab3f6b430336706847a6372de4b2eb3dbd` was downloaded to the shared Hugging Face cache and verified 18/18 files. No CUDA context or inference was started.

Related: [[openrouter-provider-policy-excludes-private-stores-from-free-emb]] · [[nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader]] · [[header-beats-vector]]
