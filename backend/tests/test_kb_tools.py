"""Unit tests for KB exploration tools service functions."""

import pytest

from app.services.kb_tools_service import kb_ls, kb_tree, kb_grep, kb_glob, kb_read


# --- ls tests ---


async def test_ls_root(test_db):
    """ls('/') for user-a returns top-level folders and unfiled documents."""
    result = await kb_ls(test_db, "user-a", "/")
    assert result.error is None
    assert len(result.folders) == 1
    assert result.folders[0].name == "reports"
    assert len(result.files) == 1
    assert result.files[0].name == "readme.md"


async def test_ls_subfolder(test_db):
    """ls('/reports') returns subfolders and files within that folder."""
    result = await kb_ls(test_db, "user-a", "/reports")
    assert result.error is None
    assert len(result.folders) == 1
    assert result.folders[0].name == "2024"
    assert len(result.files) == 1
    assert result.files[0].name == "summary.pdf"


async def test_ls_not_found(test_db):
    """ls('/nonexistent') returns error."""
    result = await kb_ls(test_db, "user-a", "/nonexistent")
    assert result.error == "Folder not found"
    assert result.folders == []
    assert result.files == []


# --- tree tests ---


async def test_tree_root(test_db):
    """tree('/') for user-a returns nested structure with reports > 2024."""
    result = await kb_tree(test_db, "user-a", "/")
    assert result.error is None
    assert result.total_folders >= 2  # reports, 2024
    assert result.total_files >= 3  # readme.md, summary.pdf, q1-results.csv
    # Find the reports folder node
    reports_node = next((n for n in result.nodes if n.name == "reports"), None)
    assert reports_node is not None
    assert reports_node.type == "folder"
    # Reports should have children including 2024
    assert reports_node.children is not None
    child_names = [c.name for c in reports_node.children]
    assert "2024" in child_names


async def test_tree_depth_limit(test_db):
    """tree('/', depth=1) only shows first level, not 2024 subfolder contents."""
    result = await kb_tree(test_db, "user-a", "/", depth=1)
    assert result.error is None
    # Should have reports folder at top level
    reports_node = next((n for n in result.nodes if n.name == "reports"), None)
    assert reports_node is not None
    # At depth=1, reports should not have subfolder children expanded
    if reports_node.children:
        subfolder_children = [c for c in reports_node.children if c.type == "folder"]
        for child in subfolder_children:
            # Subfolders at depth 1 should not have their own children expanded
            assert child.children is None or len(child.children) == 0


async def test_tree_truncation(test_db):
    """tree with limit=2 truncates and sets truncated=True."""
    result = await kb_tree(test_db, "user-a", "/", limit=2)
    assert result.truncated is True


# --- grep tests ---


async def test_grep_basic(test_db):
    """grep('error') matches documents containing 'error' with line numbers."""
    result = await kb_grep(test_db, "user-a", "error")
    assert result.error is None
    assert result.total > 0
    # Should match readme.md, summary.pdf, q1-results.csv (all have 'error')
    filenames = [m.filename for m in result.matches]
    assert "readme.md" in filenames
    # Each match should have line numbers
    for match in result.matches:
        assert len(match.line_matches) > 0
        for lm in match.line_matches:
            assert lm.line_number > 0
            assert len(lm.text) > 0


async def test_grep_case_insensitive(test_db):
    """grep('ERROR', case_insensitive=True) matches lowercase 'error'."""
    result = await kb_grep(test_db, "user-a", "ERROR", case_insensitive=True)
    assert result.error is None
    assert result.total > 0


async def test_grep_invalid_regex(test_db):
    """grep('[invalid') returns error message."""
    result = await kb_grep(test_db, "user-a", "[invalid")
    assert result.error is not None
    assert "Invalid regex" in result.error


async def test_grep_path_scoped(test_db):
    """grep('error', path='/reports') only searches within that folder subtree."""
    result = await kb_grep(test_db, "user-a", "error", path="/reports")
    assert result.error is None
    filenames = [m.filename for m in result.matches]
    # Should NOT include readme.md (unfiled, not in /reports)
    assert "readme.md" not in filenames
    # Should include summary.pdf and/or q1-results.csv
    assert len(filenames) > 0


# --- glob tests ---


async def test_glob_star_pdf(test_db):
    """glob('*.pdf') matches 'summary.pdf'."""
    result = await kb_glob(test_db, "user-a", "*.pdf")
    assert result.error is None
    filenames = [m.filename for m in result.matches]
    assert "summary.pdf" in filenames


async def test_glob_recursive(test_db):
    """glob('reports/**/*') matches files within reports subtree."""
    result = await kb_glob(test_db, "user-a", "reports/**/*")
    assert result.error is None
    filenames = [m.filename for m in result.matches]
    assert "summary.pdf" in filenames or "q1-results.csv" in filenames


async def test_glob_no_match(test_db):
    """glob('*.xyz') returns empty matches."""
    result = await kb_glob(test_db, "user-a", "*.xyz")
    assert result.error is None
    assert result.matches == []
    assert result.total == 0


# --- read tests ---


async def test_read_full(test_db):
    """read('readme.md') returns full content with line/char counts."""
    result = await kb_read(test_db, "user-a", "readme.md")
    assert result.error is None
    assert "Project README" in result.content
    assert result.line_count > 0
    assert result.char_count > 0


async def test_read_in_folder(test_db):
    """read('/reports/summary.pdf') returns content for filed document."""
    result = await kb_read(test_db, "user-a", "/reports/summary.pdf")
    assert result.error is None
    assert "Summary Report" in result.content


async def test_read_range(test_db):
    """read('readme.md', offset=2, limit=3) returns lines 3-5 with line numbers."""
    result = await kb_read(test_db, "user-a", "readme.md", offset=2, limit=3)
    assert result.error is None
    assert result.total_lines is not None
    # Should contain line numbers in the output
    assert "3" in result.content
    # Should not contain line 1 content
    assert "# Project README" not in result.content


async def test_read_not_found(test_db):
    """read('/nonexistent.pdf') returns error."""
    result = await kb_read(test_db, "user-a", "/nonexistent.pdf")
    assert result.error is not None


# --- User scoping tests ---


async def test_user_scoping_ls(test_db):
    """ls('/') for user-b does NOT show user-a folders."""
    result = await kb_ls(test_db, "user-b", "/")
    folder_names = [f.name for f in result.folders]
    assert "reports" not in folder_names
    # user-b should see their own folder
    assert "private" in folder_names


async def test_user_scoping_grep(test_db):
    """grep('error') for user-b does NOT match user-a documents."""
    result = await kb_grep(test_db, "user-b", "error")
    doc_ids = [m.document_id for m in result.matches]
    assert "doc-readme" not in doc_ids
    assert "doc-summary" not in doc_ids
    assert "doc-q1" not in doc_ids


async def test_user_scoping_read(test_db):
    """read of user-a doc by user-b returns not found."""
    result = await kb_read(test_db, "user-b", "readme.md")
    assert result.error is not None
