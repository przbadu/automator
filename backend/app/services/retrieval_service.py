import logging
from dataclasses import dataclass

from langfuse import get_client, observe

from app.config import settings
from app.database import get_chroma_collection
from app.services.embedding_service import generate_embeddings
from app.services.fusion_service import reciprocal_rank_fusion
from app.services.keyword_search_service import keyword_search
from app.services.reranker_service import is_reranker_enabled, rerank

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    chunk_content: str
    document_filename: str
    chunk_index: int
    distance: float
    document_type: str | None = None
    document_id: str = ""
    relevance_score: float = 0.0


@observe(name="vector_search")
def _vector_search(
    query_embeddings: list[list[float]],
    user_id: str,
    top_k: int,
    document_type: str | None = None,
) -> list[dict]:
    """Run vector similarity search against ChromaDB."""
    collection = get_chroma_collection()

    count = collection.count()
    if count == 0:
        get_client().update_current_span(
            metadata={"top_k": top_k, "document_type": document_type, "result_count": 0, "collection_size": 0}
        )
        return []

    where_filter: dict
    if document_type:
        where_filter = {
            "$and": [
                {"user_id": user_id},
                {"document_type": document_type},
            ]
        }
    else:
        where_filter = {"user_id": user_id}

    results = collection.query(
        query_embeddings=query_embeddings,
        where=where_filter,
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )

    if not results["documents"] or not results["documents"][0]:
        get_client().update_current_span(
            metadata={"top_k": top_k, "document_type": document_type, "result_count": 0, "collection_size": count}
        )
        return []

    vector_results = []
    for doc_id, doc, meta, dist in zip(
        results["ids"][0],
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        vector_results.append({
            "chunk_id": doc_id,
            "chunk_content": doc,
            "document_filename": meta.get("filename", "unknown"),
            "chunk_index": meta.get("chunk_index", 0),
            "distance": dist,
            "document_type": meta.get("document_type"),
            "document_id": meta.get("document_id", ""),
        })

    get_client().update_current_span(
        metadata={
            "top_k": top_k,
            "document_type": document_type,
            "result_count": len(vector_results),
            "collection_size": count,
            "top_distance": vector_results[0]["distance"] if vector_results else None,
        }
    )

    return vector_results


def _apply_relevance_threshold(results: list[RetrievalResult]) -> list[RetrievalResult]:
    """Filter out results below the configured relevance threshold."""
    threshold = settings.retrieval_relevance_threshold
    if threshold <= 0:
        return results
    filtered = [r for r in results if r.relevance_score >= threshold]
    if not filtered and results:
        # Always return at least the top result to avoid empty context
        filtered = [results[0]]
    return filtered


@observe(name="retrieve_relevant_chunks")
async def retrieve_relevant_chunks(
    query: str,
    user_id: str,
    top_k: int = 5,
    document_type: str | None = None,
) -> list[RetrievalResult]:
    """Retrieve the most relevant document chunks for a query.

    Pipeline:
    1. Vector search (always)
    2. BM25 keyword search (if hybrid enabled)
    3. RRF fusion (merge + dedupe)
    4. Cross-encoder reranking (if configured)
    5. Return top results
    """
    query_embeddings = await generate_embeddings([query])
    if not query_embeddings:
        return []

    candidate_k = settings.retrieval_candidate_k if settings.hybrid_search_enabled else top_k
    final_k = settings.final_top_k if settings.hybrid_search_enabled else top_k

    # 1. Vector search (always)
    vector_results = _vector_search(query_embeddings, user_id, candidate_k, document_type)

    # 2. If hybrid disabled, return vector results directly
    if not settings.hybrid_search_enabled:
        final_results = [
            RetrievalResult(
                chunk_content=r["chunk_content"],
                document_filename=r["document_filename"],
                chunk_index=r["chunk_index"],
                distance=r["distance"],
                document_type=r.get("document_type"),
                document_id=r.get("document_id", ""),
                relevance_score=round(1.0 - r["distance"], 4),
            )
            for r in vector_results[:top_k]
        ]
        final_results = _apply_relevance_threshold(final_results)
        get_client().update_current_span(
            metadata={
                "query": query,
                "hybrid_search_enabled": False,
                "reranker_enabled": is_reranker_enabled(),
                "embedding_model": settings.embedding_model,
                "embedding_dimensions": settings.embedding_dimensions,
                "candidate_k": candidate_k,
                "final_k": final_k,
                "final_result_count": len(final_results),
            }
        )
        return final_results

    # 3. BM25 keyword search
    bm25_results = keyword_search(query, user_id, top_k=candidate_k, document_type=document_type)

    # 4. RRF fusion
    fused = reciprocal_rank_fusion(vector_results, bm25_results, k=settings.rrf_k)

    # 5. Reranking (optional)
    final_results = None
    if is_reranker_enabled() and fused:
        documents = [f.chunk_content for f in fused]
        rerank_results = await rerank(query, documents, top_n=final_k)

        if rerank_results is not None:
            final_results = []
            for idx, score in rerank_results:
                f = fused[idx]
                final_results.append(RetrievalResult(
                    chunk_content=f.chunk_content,
                    document_filename=f.document_filename,
                    chunk_index=f.chunk_index,
                    distance=1.0 - score,
                    document_type=f.document_type,
                    document_id=f.document_id,
                    relevance_score=round(score, 4),
                ))

    # Fallback: RRF-ordered results (if reranker disabled or failed)
    if final_results is None:
        final_results = [
            RetrievalResult(
                chunk_content=f.chunk_content,
                document_filename=f.document_filename,
                chunk_index=f.chunk_index,
                distance=1.0 - f.rrf_score,
                document_type=f.document_type,
                document_id=f.document_id,
                relevance_score=round(f.rrf_score, 4),
            )
            for f in fused[:final_k]
        ]

    final_results = _apply_relevance_threshold(final_results)

    get_client().update_current_span(
        metadata={
            "query": query,
            "hybrid_search_enabled": True,
            "reranker_enabled": is_reranker_enabled(),
            "embedding_model": settings.embedding_model,
            "embedding_dimensions": settings.embedding_dimensions,
            "candidate_k": candidate_k,
            "final_k": final_k,
            "final_result_count": len(final_results),
        }
    )
    return final_results
