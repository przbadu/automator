from dataclasses import dataclass, field

from app.database import get_chroma_collection
from app.services.embedding_service import generate_embeddings


@dataclass
class RetrievalResult:
    chunk_content: str
    document_filename: str
    chunk_index: int
    distance: float
    document_type: str | None = None


async def retrieve_relevant_chunks(
    query: str,
    user_id: str,
    top_k: int = 5,
    document_type: str | None = None,
) -> list[RetrievalResult]:
    """Retrieve the most relevant document chunks for a query."""
    query_embeddings = await generate_embeddings([query])
    if not query_embeddings:
        return []

    collection = get_chroma_collection()

    # Check if collection has any documents for this user
    count = collection.count()
    if count == 0:
        return []

    # Build where filter with optional metadata filters
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
        return []

    retrieval_results: list[RetrievalResult] = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        retrieval_results.append(RetrievalResult(
            chunk_content=doc,
            document_filename=meta.get("filename", "unknown"),
            chunk_index=meta.get("chunk_index", 0),
            distance=dist,
            document_type=meta.get("document_type"),
        ))

    return retrieval_results
