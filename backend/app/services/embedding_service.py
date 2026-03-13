from langfuse import get_client, observe

from app.config import settings
from app.services.langfuse_service import create_embedding_client

_client = create_embedding_client(
    base_url=settings.embedding_base_url,
    api_key=settings.embedding_api_key or "not-needed",
)

BATCH_SIZE = 100


@observe(name="generate_embeddings")
async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using an OpenAI-compatible API."""
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        kwargs: dict = {
            "input": batch,
            "model": settings.embedding_model,
        }
        if settings.embedding_dimensions:
            kwargs["dimensions"] = settings.embedding_dimensions
        response = await _client.embeddings.create(**kwargs)
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    get_client().update_current_span(
        metadata={
            "embedding_model": settings.embedding_model,
            "embedding_dimensions": settings.embedding_dimensions,
            "input_text_count": len(texts),
            "batch_size": BATCH_SIZE,
        }
    )

    return all_embeddings
