CREATE TABLE IF NOT EXISTS llm_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai_compatible','openai','gemini','anthropic','grok','openrouter')),
    api_key_encrypted TEXT NOT NULL,
    api_url TEXT,
    model_name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_llm_configs_user_id ON llm_configs(user_id);
