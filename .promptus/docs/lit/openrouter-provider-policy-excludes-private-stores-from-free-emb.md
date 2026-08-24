---
id: lit-20260823T145243Z-openrouter-provider-policy-excludes-private-stores-from-free-emb
substrate: lit
kind: NOTE
status: CITE
created: "2026-08-23 10:52:43"
source: "https://openrouter.ai/providers/ ; https://openrouter.ai/docs/guides/features/zdr"
relations: ["supersedes:lit-20260823T145215Z-openrouter-free-embedding-routes-retain-and-train-on-prompts", "fixes:event-20260823T145238Z-catch-the-source-note-body-pairing-error-before-reindexing"]
---
# OpenRouter provider policy excludes private stores from free embeddings

OpenRouter's provider table reports both NVIDIA and Liquid as training on prompts and retaining prompts. OpenRouter's own layer does not retain prompt text unless logging is enabled, but upstream provider policy still applies. Per-request `provider.zdr=true` restricts routing to endpoints that OpenRouter certifies for zero data retention. On 2026-08-23, the live ZDR inventory contained neither `nvidia/nemotron-3-embed-1b:free` nor `liquid/lfm-2.5-embedding-350m:free`; synthetic requests adding both `zdr=true` and `data_collection=deny` failed closed with HTTP 404. Therefore those free routes are unsuitable for unpublished project stores.
