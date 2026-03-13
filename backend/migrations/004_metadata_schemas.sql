-- Migration 004: Metadata schemas for user-configurable metadata extraction
CREATE TABLE IF NOT EXISTS metadata_schemas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    fields TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_metadata_schemas_user_id ON metadata_schemas(user_id);
