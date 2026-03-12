from langsmith.wrappers import wrap_openai
from openai import OpenAI

from app.config import settings

openai_client = wrap_openai(OpenAI(
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
))
