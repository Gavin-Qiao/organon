#!/usr/bin/env python3
"""Run one bounded local embedding job and return keyed normalized vectors."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path


REQUEST_SCHEMA = "promptus.local-embedding-request.v1"
RESPONSE_SCHEMA = "promptus.local-embedding-response.v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--dimensions", type=int, default=4096)
    return parser.parse_args()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, separators=(",", ":")) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main() -> int:
    args = parse_args()
    if args.batch_size < 1 or args.dimensions < 1 or args.dimensions > 4096:
        raise ValueError("batch size and dimensions must be within the model contract")

    request = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if request.get("schema") != REQUEST_SCHEMA or not isinstance(request.get("items"), list):
        raise ValueError("invalid local embedding request")
    items = request["items"]
    keys = [item.get("key") for item in items]
    texts = [item.get("text") for item in items]
    if not items or any(not isinstance(key, str) or not key for key in keys):
        raise ValueError("request items require non-empty string keys")
    if len(set(keys)) != len(keys) or any(not isinstance(text, str) or not text for text in texts):
        raise ValueError("request keys must be unique and texts must be non-empty strings")

    import torch
    import transformers
    import sentence_transformers
    from sentence_transformers import SentenceTransformer

    transformers.utils.logging.disable_progress_bar()

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing an accidental CPU run")

    started = time.perf_counter()
    model = SentenceTransformer(
        args.model,
        device="cuda",
        local_files_only=True,
        model_kwargs={
            "dtype": torch.bfloat16,
            "attn_implementation": "sdpa",
        },
        processor_kwargs={"padding_side": "left"},
    )
    model.max_seq_length = 32768
    vectors = model.encode(
        texts,
        batch_size=args.batch_size,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    if vectors.ndim != 2 or vectors.shape[0] != len(items) or vectors.shape[1] < args.dimensions:
        raise RuntimeError(f"unexpected embedding shape: {vectors.shape}")
    vectors = vectors[:, : args.dimensions]
    norms = (vectors * vectors).sum(axis=1) ** 0.5
    vectors = vectors / norms[:, None]
    rows = []
    for key, vector in zip(keys, vectors, strict=True):
        values = [float(value) for value in vector]
        if any(not math.isfinite(value) for value in values):
            raise RuntimeError(f"non-finite embedding: {key}")
        rows.append({"key": key, "vector": values})

    elapsed = time.perf_counter() - started
    payload = {
        "schema": RESPONSE_SCHEMA,
        "model": request.get("model"),
        "dimensions": args.dimensions,
        "runtime": {
            "device": "cuda",
            "gpu": torch.cuda.get_device_name(0),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "sentenceTransformers": sentence_transformers.__version__,
            "elapsedSeconds": elapsed,
        },
        "items": rows,
    }
    atomic_json(Path(args.output), payload)
    print(
        f"local-embed: {len(rows)} inputs x {args.dimensions} dimensions in {elapsed:.1f}s"
        f" on {payload['runtime']['gpu']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
