---
id: lit-20260823T145215Z-openrouter-free-embedding-routes-retain-and-train-on-prompts
substrate: lit
kind: NOTE
status: CITE
created: "2026-08-23 10:52:15"
source: "https://openrouter.ai/providers/ ; https://openrouter.ai/docs/guides/features/zdr"
---
# OpenRouter free embedding routes retain and train on prompts

NVIDIA released `nvidia/Nemotron-3-Embed-8B-BF16` on 2026-07-16 under the permissive OpenMDW-1.1 model license and marks it ready for commercial use. The official model card reports state-of-the-art multilingual RTEB performance as of release: average NDCG@10 78.46 on RTEB-16, 75.45 on MMTEB Retrieval, and 60.60 on ViDoRe-V3 text, all above the corresponding 1B checkpoint scores. It is an approximately 8B-parameter BF16 encoder with a 32,768-token maximum sequence length, 4,096-dimensional normalized embeddings, Matryoshka slicing support, and required `query: ` / `passage: ` retrieval prefixes. The immutable Hub revision selected for local evaluation is `c44c20ab3f6b430336706847a6372de4b2eb3dbd`; the official snapshot is about 15.9 GB.
