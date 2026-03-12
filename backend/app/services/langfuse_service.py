import os

from app.config import settings

# Langfuse reads config from env vars
if settings.langfuse_public_key and settings.langfuse_secret_key:
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
    os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)

from langfuse.openai import AsyncOpenAI  # noqa: E402 — must import after env vars are set

# Default client from env vars (fallback)
openai_client = AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
)


def create_openai_client(api_key: str, base_url: str) -> AsyncOpenAI:
    """Create a Langfuse-wrapped OpenAI client with custom credentials."""
    return AsyncOpenAI(api_key=api_key, base_url=base_url)
