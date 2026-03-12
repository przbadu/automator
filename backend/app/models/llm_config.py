from pydantic import BaseModel

PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "grok": "https://api.x.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}


def mask_api_key(key: str) -> str:
    if len(key) < 8:
        return "****"
    return f"...{key[-4:]}"


class FetchModelsRequest(BaseModel):
    provider: str
    api_key: str
    api_url: str | None = None


class FetchModelsResponse(BaseModel):
    models: list[str]


class LLMConfigCreate(BaseModel):
    name: str
    provider: str
    api_key: str
    api_url: str | None = None
    model_name: str
    is_default: bool = False


class LLMConfigUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    api_key: str | None = None
    api_url: str | None = None
    model_name: str | None = None
    is_default: bool | None = None


class LLMConfigResponse(BaseModel):
    id: str
    user_id: str
    name: str
    provider: str
    api_key_masked: str
    api_url: str | None
    model_name: str
    is_default: bool
    created_at: str
    updated_at: str
