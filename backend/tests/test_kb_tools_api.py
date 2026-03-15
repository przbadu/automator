"""Integration tests for KB tools REST endpoints.

Tests the full request/response cycle: HTTP POST -> router -> service -> DB -> response.
Uses httpx AsyncClient with FastAPI's ASGI transport for in-process testing.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.middleware.auth import get_current_user


USER_A = {"id": "user-a", "email": "a@test.com"}
USER_B = {"id": "user-b", "email": "b@test.com"}


def _make_db_override(db):
    """Create a get_db override that yields the test DB."""
    async def override():
        yield db
    return override


@pytest_asyncio.fixture
async def client_a(test_db):
    """HTTP client authenticated as user A."""
    app.dependency_overrides[get_db] = _make_db_override(test_db)
    app.dependency_overrides[get_current_user] = lambda: USER_A
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client_b(test_db):
    """HTTP client authenticated as user B."""
    app.dependency_overrides[get_db] = _make_db_override(test_db)
    app.dependency_overrides[get_current_user] = lambda: USER_B
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client_noauth(test_db):
    """HTTP client with NO auth override (should get 403)."""
    app.dependency_overrides[get_db] = _make_db_override(test_db)
    # Do NOT override get_current_user -- auth will fail
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


# --- ls endpoint ---


@pytest.mark.anyio
async def test_ls_endpoint(client_a):
    resp = await client_a.post("/kb/tools/ls", json={"path": "/"})
    assert resp.status_code == 200
    data = resp.json()
    assert "folders" in data
    assert "files" in data
    # User A has 1 root folder (reports) and 1 root file (readme.md)
    assert len(data["folders"]) == 1
    assert data["folders"][0]["name"] == "reports"
    assert len(data["files"]) == 1
    assert data["files"][0]["name"] == "readme.md"


@pytest.mark.anyio
async def test_ls_subfolder(client_a):
    resp = await client_a.post("/kb/tools/ls", json={"path": "/reports"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["folders"]) == 1  # 2024 subfolder
    assert len(data["files"]) == 1  # summary.pdf


# --- tree endpoint ---


@pytest.mark.anyio
async def test_tree_endpoint(client_a):
    resp = await client_a.post("/kb/tools/tree", json={"path": "/"})
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert data["total_folders"] >= 1
    assert data["total_files"] >= 1


# --- grep endpoint ---


@pytest.mark.anyio
async def test_grep_endpoint(client_a):
    resp = await client_a.post("/kb/tools/grep", json={"pattern": "error"})
    assert resp.status_code == 200
    data = resp.json()
    assert "matches" in data
    assert data["total"] >= 1
    # Should find "error" in at least readme.md
    filenames = [m["filename"] for m in data["matches"]]
    assert "readme.md" in filenames


@pytest.mark.anyio
async def test_grep_case_insensitive(client_a):
    resp = await client_a.post(
        "/kb/tools/grep", json={"pattern": "WARNING", "case_insensitive": True}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


# --- glob endpoint ---


@pytest.mark.anyio
async def test_glob_endpoint(client_a):
    resp = await client_a.post("/kb/tools/glob", json={"pattern": "*.pdf"})
    assert resp.status_code == 200
    data = resp.json()
    assert "matches" in data
    assert data["total"] >= 1
    filenames = [m["filename"] for m in data["matches"]]
    assert "summary.pdf" in filenames


# --- read endpoint ---


@pytest.mark.anyio
async def test_read_endpoint(client_a):
    resp = await client_a.post("/kb/tools/read", json={"path": "readme.md"})
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    assert data["line_count"] > 0
    assert "Project README" in data["content"]


@pytest.mark.anyio
async def test_read_range_endpoint(client_a):
    resp = await client_a.post(
        "/kb/tools/read", json={"path": "readme.md", "offset": 0, "limit": 2}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["line_count"] == 2
    assert data["offset"] == 0
    assert data["total_lines"] is not None


# --- auth enforcement ---


@pytest.mark.anyio
async def test_unauthorized(client_noauth):
    resp = await client_noauth.post("/kb/tools/ls", json={"path": "/"})
    # HTTPBearer returns 403 when no credentials provided
    assert resp.status_code in (401, 403)


# --- user isolation ---


@pytest.mark.anyio
async def test_user_isolation_ls(client_b):
    """User B should NOT see user A's folders or files."""
    resp = await client_b.post("/kb/tools/ls", json={"path": "/"})
    assert resp.status_code == 200
    data = resp.json()
    folder_names = [f["name"] for f in data["folders"]]
    assert "reports" not in folder_names
    file_names = [f["name"] for f in data["files"]]
    assert "readme.md" not in file_names


@pytest.mark.anyio
async def test_user_isolation_grep(client_b):
    """User B grep should only find user B documents."""
    resp = await client_b.post("/kb/tools/grep", json={"pattern": "error"})
    assert resp.status_code == 200
    data = resp.json()
    filenames = [m["filename"] for m in data["matches"]]
    assert "readme.md" not in filenames
    # User B should find their own secret.txt
    assert "secret.txt" in filenames
