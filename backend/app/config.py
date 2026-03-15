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
    max_upload_size_mb: int = 50

    # Hybrid search
    hybrid_search_enabled: bool = True
    rrf_k: int = 60
    retrieval_candidate_k: int = 20
    final_top_k: int = 5

    # Relevance filtering (0.0 = disabled; only useful for vector-only mode, not hybrid/RRF)
    retrieval_relevance_threshold: float = 0.0

    # Reranker (cross-encoder API — vLLM, Jina, Cohere, TEI compatible)
    reranker_base_url: str = ""
    reranker_model: str = ""
    reranker_top_n: int = 5

    # Sub-agent
    sub_agent_enabled: bool = True
    sub_agent_max_iterations: int = 5
    sub_agent_max_chunks_per_read: int = 20
    explorer_max_iterations: int = 8

    # Text-to-SQL
    text_to_sql_enabled: bool = True
    text_to_sql_max_rows: int = 50
    text_to_sql_timeout_seconds: int = 5

    # Web Search
    web_search_enabled: bool = False
    web_search_provider: str = "searxng"  # searxng | tavily | brave | exa
    web_search_url: str = ""
    web_search_api_key: str = ""
    web_search_max_results: int = 5

    # Encryption
    encryption_key: str = ""

    # App
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = "http://0.0.0.0:5173"
    database_url: str = "sqlite:///./automator.db"

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
