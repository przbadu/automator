import logging
import re
from dataclasses import dataclass

from langfuse import get_client, observe
from rank_bm25 import BM25Okapi

from app.database import get_chroma_collection

logger = logging.getLogger(__name__)

# Per-user BM25 index cache: user_id -> (bm25_index, chunk_docs)
_cache: dict[str, tuple[BM25Okapi, list[dict]]] = {}


@dataclass
class BM25Result:
    chunk_id: str
    chunk_content: str
    document_filename: str
    chunk_index: int
    bm25_score: float
    document_type: str | None = None
    document_id: str = ""


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def _build_index(user_id: str) -> tuple[BM25Okapi, list[dict]]:
    collection = get_chroma_collection()
    results = collection.get(
        where={"user_id": user_id},
        include=["documents", "metadatas"],
    )

    if not results["documents"]:
        # Empty corpus — BM25Okapi needs at least one doc
        return BM25Okapi([[""]]), []

    chunk_docs = []
    tokenized_corpus = []

    for doc_id, doc, meta in zip(results["ids"], results["documents"], results["metadatas"]):
        tokens = _tokenize(doc)
        tokenized_corpus.append(tokens)
        chunk_docs.append({
            "chunk_id": doc_id,
            "chunk_content": doc,
            "document_filename": meta.get("filename", "unknown"),
            "chunk_index": meta.get("chunk_index", 0),
            "document_type": meta.get("document_type"),
            "document_id": meta.get("document_id", ""),
        })

    index = BM25Okapi(tokenized_corpus)
    return index, chunk_docs


@observe(name="keyword_search_bm25")
def keyword_search(
    query: str,
    user_id: str,
    top_k: int = 20,
    document_type: str | None = None,
) -> list[BM25Result]:
    cache_hit = user_id in _cache
    if user_id not in _cache:
        logger.info("Building BM25 index for user %s", user_id)
        _cache[user_id] = _build_index(user_id)

    index, chunk_docs = _cache[user_id]
    if not chunk_docs:
        return []

    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    scores = index.get_scores(query_tokens)

    # Pair scores with docs, filter zero-score
    scored = [
        (score, doc) for score, doc in zip(scores, chunk_docs) if score > 0
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, doc in scored[:top_k]:
        if document_type and doc["document_type"] != document_type:
            continue
        results.append(BM25Result(
            chunk_id=doc["chunk_id"],
            chunk_content=doc["chunk_content"],
            document_filename=doc["document_filename"],
            chunk_index=doc["chunk_index"],
            bm25_score=score,
            document_type=doc["document_type"],
            document_id=doc.get("document_id", ""),
        ))

    get_client().update_current_span(
        metadata={
            "cache_hit": cache_hit,
            "corpus_size": len(chunk_docs),
            "result_count": len(results),
            "top_bm25_score": results[0].bm25_score if results else None,
            "document_type_filter": document_type,
        }
    )

    return results


def invalidate_cache(user_id: str) -> None:
    _cache.pop(user_id, None)
    logger.info("BM25 cache invalidated for user %s", user_id)
