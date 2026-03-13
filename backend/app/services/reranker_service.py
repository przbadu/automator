import logging

import httpx
from langfuse import get_client, observe

from app.config import settings

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def is_reranker_enabled() -> bool:
    return bool(settings.reranker_base_url and settings.reranker_model)


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


@observe(name="cross_encoder_rerank")
async def rerank(
    query: str,
    documents: list[str],
    top_n: int | None = None,
) -> list[tuple[int, float]] | None:
    """Rerank documents using a cross-encoder API.

    Returns list of (original_index, relevance_score) sorted by descending score,
    or None on failure (graceful fallback).
    """
    if not is_reranker_enabled():
        return None

    if not documents:
        return []

    if top_n is None:
        top_n = settings.reranker_top_n

    url = f"{settings.reranker_base_url.rstrip('/')}/rerank"
    payload = {
        "model": settings.reranker_model,
        "query": query,
        "documents": documents,
        "top_n": top_n,
    }

    try:
        client = _get_client()
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

        results = [
            (item["index"], item["relevance_score"])
            for item in data["results"]
        ]
        results.sort(key=lambda x: x[1], reverse=True)

        get_client().update_current_span(
            metadata={
                "reranker_model": settings.reranker_model,
                "reranker_base_url": settings.reranker_base_url,
                "input_document_count": len(documents),
                "top_n": top_n,
                "output_count": len(results),
                "top_relevance_score": results[0][1] if results else None,
                "lowest_relevance_score": results[-1][1] if results else None,
            }
        )

        return results

    except Exception as e:
        logger.warning("Reranker request failed, falling back to RRF ordering: %s", e)
        return None
