from dataclasses import dataclass, field

from langfuse import get_client, observe


@dataclass
class FusedResult:
    chunk_id: str
    chunk_content: str
    document_filename: str
    chunk_index: int
    rrf_score: float
    document_type: str | None = None
    document_id: str = ""
    vector_rank: int | None = None
    keyword_rank: int | None = None


@observe(name="reciprocal_rank_fusion")
def reciprocal_rank_fusion(
    vector_results: list[dict],
    keyword_results: list,
    k: int = 60,
) -> list[FusedResult]:
    """Merge vector and keyword results using Reciprocal Rank Fusion.

    RRF score = sum(1 / (k + rank)) across all lists where the chunk appears.
    """
    # Track per-chunk data and RRF scores
    chunks: dict[str, dict] = {}  # chunk_id -> chunk data
    rrf_scores: dict[str, float] = {}
    vector_ranks: dict[str, int] = {}
    keyword_ranks: dict[str, int] = {}

    # Score vector results
    for rank, result in enumerate(vector_results, start=1):
        cid = result["chunk_id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (k + rank)
        vector_ranks[cid] = rank
        if cid not in chunks:
            chunks[cid] = result

    # Score keyword results
    for rank, result in enumerate(keyword_results, start=1):
        cid = result.chunk_id
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (k + rank)
        keyword_ranks[cid] = rank
        if cid not in chunks:
            chunks[cid] = {
                "chunk_id": cid,
                "chunk_content": result.chunk_content,
                "document_filename": result.document_filename,
                "chunk_index": result.chunk_index,
                "document_type": result.document_type,
                "document_id": result.document_id,
            }

    # Build fused results sorted by descending RRF score
    fused = []
    for cid, data in chunks.items():
        fused.append(FusedResult(
            chunk_id=cid,
            chunk_content=data["chunk_content"],
            document_filename=data["document_filename"],
            chunk_index=data["chunk_index"],
            rrf_score=rrf_scores[cid],
            document_type=data.get("document_type"),
            document_id=data.get("document_id", ""),
            vector_rank=vector_ranks.get(cid),
            keyword_rank=keyword_ranks.get(cid),
        ))

    fused.sort(key=lambda x: x.rrf_score, reverse=True)

    get_client().update_current_span(
        metadata={
            "vector_input_count": len(vector_results),
            "keyword_input_count": len(keyword_results),
            "fused_output_count": len(fused),
            "rrf_k": k,
            "top_rrf_score": fused[0].rrf_score if fused else None,
            "overlap_count": sum(1 for f in fused if f.vector_rank and f.keyword_rank),
        }
    )

    return fused
