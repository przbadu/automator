from dataclasses import dataclass

from app.database import get_chroma_collection
from app.services.embedding_service import generate_embeddings


@dataclass
class RetrievalResult:
    chunk_content: str
    document_filename: str
    chunk_index: int
    distance: float


async def retrieve_relevant_chunks(
    query: str,
    user_id: str,
    top_k: int = 5,
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

    results = collection.query(
        query_embeddings=query_embeddings,
        where={"user_id": user_id},
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
        ))

    return retrieval_results
