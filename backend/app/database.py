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
