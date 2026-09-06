---
id: lit-20260904T235235Z-qmd-offers-separate-lexical-semantic-and-reranking-routes
substrate: lit
kind: NOTE
status: CITE
created: "2026-09-04 19:52:35"
source: "https://github.com/tobi/qmd"
---
# QMD offers separate lexical semantic and reranking routes

QMD exposes a Node/Bun SDK with createStore, collection update, searchLex, searchVector, and higher-level search with expansion and reranking. In inspected package 2.8.3, searchLex turns positive terms into an AND query with prefix matches; full natural-language questions are therefore not a fair substitute for the high-level semantic interface. Its default embedding path uses embeddinggemma-300M, with separate optional work for query expansion and reranking. Local isolated smoke tests exercised lexical retrieval under Bun and semantic retrieval under Node; comparative effectiveness remains a benchmark question.
