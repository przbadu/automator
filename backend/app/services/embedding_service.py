from openai import AsyncOpenAI

from app.config import settings

_client = AsyncOpenAI(
    base_url=settings.embedding_base_url,
    api_key=settings.embedding_api_key or "not-needed",
)

BATCH_SIZE = 100


async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using an OpenAI-compatible API."""
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        response = await _client.embeddings.create(
            input=batch,
            model=settings.embedding_model,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings
