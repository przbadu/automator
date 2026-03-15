"""Shared pytest fixtures for KB tools tests."""

import pytest
import pytest_asyncio
import aiosqlite


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def test_db():
    """Create an in-memory SQLite DB with test data for KB tools."""
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")

    # Create minimal schema
    await db.executescript("""
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE
        );

        CREATE TABLE folders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, parent_id, name)
        );
        CREATE INDEX idx_folders_user_id ON folders(user_id);
        CREATE INDEX idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX idx_folders_path ON folders(user_id, path);

        CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'completed',
            chunk_count INTEGER NOT NULL DEFAULT 0,
            folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_documents_user_id ON documents(user_id);
        CREATE INDEX idx_documents_folder_id ON documents(folder_id);

        CREATE TABLE document_content (
            document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            line_count INTEGER NOT NULL DEFAULT 0,
            char_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_document_content_user_id ON document_content(user_id);
    """)

    # Insert users
    await db.execute("INSERT INTO users VALUES ('user-a', 'a@test.com')")
    await db.execute("INSERT INTO users VALUES ('user-b', 'b@test.com')")

    # Insert folders for user-a
    await db.execute(
        "INSERT INTO folders VALUES ('folder-reports', 'user-a', 'reports', NULL, '/reports', datetime('now'), datetime('now'))"
    )
    await db.execute(
        "INSERT INTO folders VALUES ('folder-2024', 'user-a', '2024', 'folder-reports', '/reports/2024', datetime('now'), datetime('now'))"
    )

    # Insert folder for user-b
    await db.execute(
        "INSERT INTO folders VALUES ('folder-private', 'user-b', 'private', NULL, '/private', datetime('now'), datetime('now'))"
    )

    # Insert documents for user-a
    await db.execute(
        "INSERT INTO documents VALUES ('doc-readme', 'user-a', 'readme.md', 1024, 'text/markdown', 'completed', 5, NULL)"
    )
    await db.execute(
        "INSERT INTO documents VALUES ('doc-summary', 'user-a', 'summary.pdf', 2048, 'application/pdf', 'completed', 10, 'folder-reports')"
    )
    await db.execute(
        "INSERT INTO documents VALUES ('doc-q1', 'user-a', 'q1-results.csv', 512, 'text/csv', 'completed', 3, 'folder-2024')"
    )

    # Insert document for user-b
    await db.execute(
        "INSERT INTO documents VALUES ('doc-secret', 'user-b', 'secret.txt', 256, 'text/plain', 'completed', 2, NULL)"
    )

    # Insert document_content with sample text
    readme_content = """# Project README
This is the main readme file.
It contains important information.
There was an error in the build process.
WARNING: This is a warning line.
The project is in good shape overall.
Some additional notes here.
Another error was found on this line.
Final line of the readme."""

    summary_content = """# Summary Report
This report covers Q1-Q4 results.
Revenue increased by 15%.
There was an error in the calculations.
Corrected values are shown below.
Total profit margin: 22%."""

    q1_content = """Quarter,Revenue,Profit
Q1,100000,22000
Q1 had a warning about data quality.
Error rate was 0.5% for the quarter.
Overall performance was satisfactory."""

    secret_content = """# Secret Document
This is user B's private document.
It contains an error reference too.
But user A should never see this."""

    for doc_id, user_id, content in [
        ("doc-readme", "user-a", readme_content),
        ("doc-summary", "user-a", summary_content),
        ("doc-q1", "user-a", q1_content),
        ("doc-secret", "user-b", secret_content),
    ]:
        lines = content.strip().split("\n")
        await db.execute(
            "INSERT INTO document_content VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (doc_id, user_id, content.strip(), len(lines), len(content.strip())),
        )

    await db.commit()

    yield db

    await db.close()
