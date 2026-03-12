import os

from app.config import settings

# langsmith reads tracing config directly from os.environ,
# so we must export the values that pydantic-settings loaded from .env
if settings.langsmith_tracing and settings.langsmith_api_key:
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)

from langsmith.wrappers import wrap_openai  # noqa: E402 — must import after env vars are set
from openai import AsyncOpenAI  # noqa: E402

openai_client = wrap_openai(AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
))
