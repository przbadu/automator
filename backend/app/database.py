import os
from pathlib import Path

import aiosqlite

from app.config import settings

# Extract file path from sqlite:///./path URL
_db_path = settings.database_url.replace("sqlite:///", "")


def _resolve_db_path() -> str:
    """Resolve the database path relative to the backend directory."""
    if _db_path.startswith("./"):
        return str(Path(__file__).parent.parent / _db_path[2:])
    return _db_path


DB_PATH = _resolve_db_path()


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
