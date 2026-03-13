from fastapi import APIRouter

from app.config import settings
from app.services.reranker_service import is_reranker_enabled

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/retrieval-config")
async def retrieval_config():
    return {
        "embedding": {
            "model": settings.embedding_model,
            "base_url": settings.embedding_base_url,
            "dimensions": settings.embedding_dimensions,
        },
        "hybrid_search": {
            "enabled": settings.hybrid_search_enabled,
            "rrf_k": settings.rrf_k,
            "candidate_k": settings.retrieval_candidate_k,
            "final_top_k": settings.final_top_k,
        },
        "reranker": {
            "enabled": is_reranker_enabled(),
            "model": settings.reranker_model or None,
            "base_url": settings.reranker_base_url or None,
            "top_n": settings.reranker_top_n,
        },
        "chunking": {
            "chunk_size": settings.chunk_size,
            "chunk_overlap": settings.chunk_overlap,
        },
    }
