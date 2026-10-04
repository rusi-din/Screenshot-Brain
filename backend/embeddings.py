"""
Vector embedding helpers.
Uses the Ollama embedding API (nomic-embed-text or the active LLM model).
Falls back gracefully when Ollama is unavailable.
"""

from __future__ import annotations

import math
import os
from typing import TYPE_CHECKING

try:
    import ollama as _ollama
except ImportError:
    _ollama = None  # type: ignore

_embed_model: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")


def configure(model: str) -> None:
    """Change the embedding model at runtime."""
    global _embed_model
    if model.strip():
        _embed_model = model.strip()


def generate_embedding(text: str) -> list[float]:
    """
    Generate a vector embedding for `text`.
    Returns an empty list if Ollama is unavailable or the model isn't pulled.
    """
    if not _ollama or not text.strip():
        return []
    try:
        response = _ollama.embeddings(model=_embed_model, prompt=text[:4096])
        return response.get("embedding", [])
    except Exception:
        # Ollama not running, model not pulled, or network error — fail silently
        return []


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Return cosine similarity in [0, 1]. Returns 0 on empty/mismatched vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot    = sum(x * y for x, y in zip(a, b))
    mag_a  = math.sqrt(sum(x * x for x in a))
    mag_b  = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def semantic_search(
    query: str,
    candidates: list[dict],
    top_k: int = 20,
    threshold: float = 0.35,
) -> list[dict]:
    """
    Rank `candidates` by semantic similarity to `query`.

    Each candidate must have an `embedding` key (list[float]).
    Returns up to `top_k` results above `threshold`, sorted by score desc.
    Falls back to returning all candidates unchanged if embeddings are unavailable.
    """
    query_vec = generate_embedding(query)
    if not query_vec:
        return candidates[:top_k]

    scored: list[tuple[float, dict]] = []
    for item in candidates:
        vec = item.get("embedding") or []
        if not vec:
            continue
        score = cosine_similarity(query_vec, vec)
        if score >= threshold:
            scored.append((score, item))

    scored.sort(key=lambda t: t[0], reverse=True)
    results = [item for _, item in scored[:top_k]]

    # If nothing passed threshold, return keyword fallback
    return results if results else candidates[:top_k]


def build_embed_text(record: dict) -> str:
    """Combine record fields into a single string for embedding."""
    parts = [
        record.get("title", ""),
        record.get("summary", ""),
        record.get("extracted_text", ""),
        " ".join(record.get("keywords", [])),
        record.get("category", ""),
    ]
    return " ".join(p for p in parts if p).strip()
