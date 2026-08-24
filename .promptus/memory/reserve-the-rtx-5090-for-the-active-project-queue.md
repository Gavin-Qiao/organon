---
id: memory-20260823T145425Z-reserve-the-rtx-5090-for-the-active-project-queue
name: reserve-the-rtx-5090-for-the-active-project-queue
description: Reserve the RTX 5090 for the active project queue
type: user
status: validated
links: [semantic-retrieval-improves-recall-but-needs-local-lifecycle-awa]
---

The operator reports that the NVIDIA GeForce RTX 5090 is actively queued by several projects. Organon may stage model weights without GPU access, but must not invoke unsandboxed CUDA, load an embedding model, run inference, or begin a benchmark until the operator explicitly says the GPU is free. Probatio's durable GPU findings report 32,607 MiB VRAM and compute capability 12.0; Codex sandboxing masks `/dev/dxg`, so any later GPU work requires explicit unsandboxed permission. WSL GPU projection has also been intermittent. Do not install Linux NVIDIA drivers.
