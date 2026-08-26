---
id: finding-20260824T171401Z-cross-project-evidence-favors-mixed-retrieval-and-rules-out-dens
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-24 13:14:01"
source: benchmarks/results/retrieval-cross-project-v1-2026-08-24.json
relations: ["derives-from:event-20260824T171315Z-cross-project-challenge-supports-a-mixed-semantic-candidate-rout", "supersedes:finding-20260824T162536Z-local-lifecycle-filtered-embeddings-materially-improve-paraphras"]
links: [local-lifecycle-filtered-embeddings-materially-improve-paraphras, header-beats-vector, nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader]
artifacts: [organon-result|benchmarks/results/retrieval-local-v2-2026-08-24.json|8379f8283f3872ae02f38a587dcceb200be947b6f63846ad5dd347bddbb64c65, organon-preregistration|benchmarks/retrieval-local-v2-preregistered.json|59db899d25f7eefe4cab1d0e8e3ade9fcc6cc35712222f2dc1f2b6b299d849db, cross-project-result|benchmarks/results/retrieval-cross-project-v1-2026-08-24.json|94ccff2410998974cdc14d4ff8cb2e6251a74608925edc41cf83c6d975156627]
---
# Cross-project evidence favors mixed retrieval and rules out dense replacement

The Organon result generalizes to two long-running projects, but the generalization is specifically to semantic candidate generation, not dense replacement. On Organon's 45-case paraphrase suite, lifecycle-filtered Nemotron 3 Embed 8B raised Recall@10 from 0.756 to 0.978. On independently authored lexical-challenge suites, it rescued 15/20 known lexical misses in both Psi and MoT. Thus semantic vectors recover meaning that the header/body lexical index misses at corpus sizes above five thousand units.

Lifecycle semantics are mandatory. Raw dense retrieval placed 107 inactive or untrusted units in 600 top-ten slots across Psi and MoT; filtering reduced this to zero. Pure filtered dense nevertheless retained only 8/10 MoT lexical controls, failing the preregistered cross-project rule even though Psi passed 10/10. The Organon-preregistered mixed candidate route passed the same numerical trade-off in both projects: it rescued 13/20 Psi and 12/20 MoT misses, retained 10/10 and 9/10 controls, and exposed no inactive unit. Therefore shipped lexical retrieval should remain a participant and semantic retrieval should enter as an optional, lifecycle-filtered candidate route. Choosing the final fusion rule requires a fresh untouched holdout rather than tuning on these cases.

The cold path is also too heavy for unattended session startup. Encoding 20,064 inputs took 964.5 seconds on an RTX 5090, and full-dimensional JSON caches consumed 1.65 GiB. If prototyping continues, vectors need a compact disposable binary representation and incremental refresh; this is a derived-index engineering need, not evidence that SQLite or any database should become authoritative. A smaller local query/index model can be compared only after the retrieval policy is fixed.

The challenge suites deliberately oversample lexical misses, so their aggregate recall does not estimate ordinary query prevalence. Psi's evidence is retrieval-only because its live NOW and health receipt were stale at capture; MoT was session-doctor READY. Private source text, labels, ranks, and vectors stayed local. No Promptus release or shipped embedding dependency follows automatically from this finding.

Related: [[local-lifecycle-filtered-embeddings-materially-improve-paraphras]] · [[header-beats-vector]] · [[nemotron-3-embed-8b-is-the-july-2026-open-retrieval-leader]]
