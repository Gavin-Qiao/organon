---
id: finding-20260824T162536Z-local-lifecycle-filtered-embeddings-materially-improve-paraphras
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-24 12:25:36"
source: benchmarks/results/retrieval-local-v2-2026-08-24.json
relations: ["derives-from:event-20260824T162449Z-local-nemotron-8b-benchmark-crosses-the-semantic-retrieval-thres", "supersedes:finding-20260823T145421Z-semantic-retrieval-improves-recall-but-needs-local-lifecycle-awa"]
links: [semantic-retrieval-improves-recall-but-needs-local-lifecycle-awa, nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader, header-beats-vector]
artifacts: [result|benchmarks/results/retrieval-local-v2-2026-08-24.json|8379f8283f3872ae02f38a587dcceb200be947b6f63846ad5dd347bddbb64c65, preregistration|benchmarks/retrieval-local-v2-preregistered.json|59db899d25f7eefe4cab1d0e8e3ade9fcc6cc35712222f2dc1f2b6b299d849db, labelled-cases|benchmarks/retrieval-cases-v2.json|ad1d795e2da2d6999c45c35e4fe1c25ab33a8852825860f2cba2de0da78af2c3]
---
# Local lifecycle-filtered embeddings materially improve paraphrase recall

A preregistered 45-case local benchmark confirms the earlier 9-case signal: semantic retrieval materially improves paraphrase recall at Organon's current scale, but only Promptus lifecycle policy makes the result safe to present. Existing lexical retrieval scored Recall@5/10 0.667/0.756 and MRR 0.521. Lifecycle-filtered Nemotron 3 Embed 8B dense retrieval scored 0.933/0.978 and MRR 0.746, improving top-five recall by 0.267 (paired bootstrap 95% interval 0.133–0.422) and top-ten recall by 0.222 (0.111–0.356). It won 13 cases and lost one at top five; it won ten and lost none at top ten.

Raw dense ranking is not an admissible Promptus read surface: it placed 68 inactive or untrusted units in 450 top-ten slots. Symmetric reciprocal-rank fusion still exposed 16 such units and suppressed some semantic rescues. The preregistered candidate union—five active lexical and five active dense opportunities followed by an active fused tail—kept contamination at zero while raising Recall@10 from 0.756 to 0.956. It preserved lexical participation but its MRR 0.612 trailed filtered dense because alternation deliberately gives lexical candidates priority.

This crosses the Telos's measured threshold for further work on an optional, local, lifecycle-filtered semantic fallback or candidate generator. It does not yet justify replacing lexical retrieval, adding SQLite, or shipping an embedding dependency. The suite covers one project and paraphrase questions; exact identifiers, code fragments, error strings, incremental update cost, smaller models, and end-to-end agent outcomes remain unmeasured. The next honest test is a held-out set of real retrieval misses from quiescent Psi, MoT, and Probatio stores. Markdown remains authoritative and the 40 MB vector cache remains disposable derived state.

Related: [[semantic-retrieval-improves-recall-but-needs-local-lifecycle-awa]] · [[nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader]] · [[header-beats-vector]]
