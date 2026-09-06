---
id: finding-20260905T000712Z-small-cpu-semantic-routes-improve-mixed-retrieval-on-the-organon
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-09-04 20:07:12"
links: [zvec-grep-exposes-local-hybrid-retrieval-and-incremental-indexin, qmd-offers-separate-lexical-semantic-and-reranking-routes]
artifacts: [cpu-comparison|benchmarks/results/engines-development-semantic-retry-2026-09-04.json|3a9daca81dd1d829cded0b1525dcbfc0033103681c545ca436800680f9c6ad9b, failed-worker|benchmarks/results/engines-development-semantic-2026-09-04.json|643ea77bc0be6b25834daf1e2543f33f91afa920e76039694a1532c2122a34e2]
---
# Small CPU semantic routes improve mixed retrieval on the Organon development cases

The offline CPU development comparison froze a 332-unit public Organon snapshot and indexed its 276 active units. Three historical questions now targeted superseded findings and were excluded explicitly, leaving 42 cases. Across three repeated passes, ranks were stable. Recall at ten was 31/42 for Promptus lexical and SQLite FTS5, 27/42 for QMD EmbeddingGemma 300M vectors, and 32/42 for zvec-grep with Potion 32M. The existing five-per-route union reached 35/42 with QMD and 34/42 with zvec-grep. Persistent median query times were about 0.23 ms, 0.5 ms, 22 ms, and 162 ms respectively; builds were about 32 ms, 7 ms, 34 s, and 1.6 s. These routes use different models and do not isolate backend quality. QMD raw lexical AND semantics returned no hits for full questions; its complete expanded/reranked product was not evaluated. Its native model probe timed out under Bun, but a portable Node worker worked; one saved run failed because sandbox IPC was blocked, not because relevance failed. The successful retry used staged local models with fetch disabled. No framework is selected. Fresh cases, exact controls, cold starts, edit/delete refresh, larger synthetic scale, and integration cost remain necessary. Markdown identity, effective lifecycle, and provenance must remain authoritative whichever derived engine is adopted.

Related: [[zvec-grep-exposes-local-hybrid-retrieval-and-incremental-indexin]] · [[qmd-offers-separate-lexical-semantic-and-reranking-routes]]
