from pathlib import Path

from pydantic_settings import BaseSettings

# .env lives in project root (one level above backend/)
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    # LLM (OpenAI-compatible)
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4.1"

    # Langfuse
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "http://localhost:3000"

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Embeddings (OpenAI-compatible)
    embedding_base_url: str = "http://localhost:11434/v1"
    embedding_api_key: str = ""
    embedding_model: str = "nomic-embed-text"
    embedding_dimensions: int | None = None

    # Document ingestion
    chunk_size: int = 512
    chunk_overlap: int = 50
    upload_dir: str = "./uploads"
    chroma_dir: str = "./chroma_data"
    max_upload_size_mb: int = 10

    # Encryption
    encryption_key: str = ""

    # App
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = "http://0.0.0.0:5173"
    database_url: str = "sqlite:///./automator.db"

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
