-- Migration 005: Folders table, document_content table, FTS5 virtual table, sync triggers

-- Folders table (adjacency list + materialized path)
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,  -- materialized path e.g. "/reports/2024/q1"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, parent_id, name)  -- no duplicate folder names in same parent
);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, path);

-- Full document content for grep/read tools
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    line_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_document_content_user_id ON document_content(user_id);

-- FTS5 virtual table with content sync
CREATE VIRTUAL TABLE IF NOT EXISTS document_content_fts USING fts5(
    content,
    content='document_content',
    content_rowid='rowid',
    tokenize='unicode61'
);

-- Sync triggers (must exist for content sync to work)
CREATE TRIGGER IF NOT EXISTS dc_fts_insert AFTER INSERT ON document_content BEGIN
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_delete AFTER DELETE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_update AFTER UPDATE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;
