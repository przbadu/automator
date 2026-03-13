import os
from pathlib import Path

import aiosqlite
import chromadb

from app.config import settings

# Extract file path from sqlite:///./path URL
_db_path = settings.database_url.replace("sqlite:///", "")


def _resolve_db_path() -> str:
    """Resolve the database path relative to the backend directory."""
    if _db_path.startswith("./"):
        return str(Path(__file__).parent.parent / _db_path[2:])
    return _db_path


DB_PATH = _resolve_db_path()


def _resolve_chroma_path() -> str:
    """Resolve the ChromaDB path relative to the backend directory."""
    chroma_dir = settings.chroma_dir
    if chroma_dir.startswith("./"):
        return str(Path(__file__).parent.parent / chroma_dir[2:])
    return chroma_dir


_chroma_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    """Get or create the persistent ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        path = _resolve_chroma_path()
        os.makedirs(path, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=path)
    return _chroma_client


def get_chroma_collection() -> chromadb.Collection:
    """Get or create the document_chunks collection."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name="document_chunks",
        metadata={"hnsw:space": "cosine"},
    )


async def init_db() -> None:
    """Run migration SQL files on startup."""
    migrations_dir = Path(__file__).parent.parent / "migrations"
    if not migrations_dir.exists():
        return

    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        return

    db = await aiosqlite.connect(DB_PATH)
    try:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("PRAGMA journal_mode = WAL")

        for sql_file in sql_files:
            sql = sql_file.read_text()
            await db.executescript(sql)

        await db.commit()

        # Add content_hash column (idempotent migration)
        try:
            await db.execute("ALTER TABLE documents ADD COLUMN content_hash TEXT")
        except Exception:
            pass  # Column already exists
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_user_content_hash ON documents(user_id, content_hash)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_user_filename ON documents(user_id, filename)"
        )

        # Add metadata column for LLM-extracted metadata (idempotent)
        try:
            await db.execute("ALTER TABLE documents ADD COLUMN metadata TEXT DEFAULT '{}'")
        except Exception:
            pass  # Column already exists

        # Update CHECK constraint to include 'extracting_metadata' status (idempotent)
        # SQLite doesn't support ALTER CHECK, so we recreate the table
        row = await db.execute_fetchall(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'"
        )
        if row and "extracting_metadata" not in row[0][0]:
            await db.executescript("""
                ALTER TABLE documents RENAME TO documents_old;
                CREATE TABLE documents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    mime_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'chunking', 'extracting_metadata', 'embedding', 'completed', 'failed')),
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    content_hash TEXT,
                    metadata TEXT DEFAULT '{}'
                );
                INSERT INTO documents SELECT * FROM documents_old;
                DROP TABLE documents_old;
                CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
                CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
                CREATE INDEX IF NOT EXISTS idx_documents_user_content_hash ON documents(user_id, content_hash);
                CREATE INDEX IF NOT EXISTS idx_documents_user_filename ON documents(user_id, filename);
            """)

        await db.commit()
    finally:
        await db.close()


async def get_db():
    """FastAPI dependency that yields an aiosqlite connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        await db.execute("PRAGMA foreign_keys = ON")
        yield db
    finally:
        await db.close()
