"""Text-to-SQL tool: execute read-only SQL queries against user data."""

import asyncio
import logging
import re
import time

import aiosqlite
from langfuse import get_client, observe

from app.config import settings

logger = logging.getLogger(__name__)

# Keywords that indicate a non-SELECT statement
_FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
    "ATTACH", "DETACH", "PRAGMA", "GRANT", "REVOKE",
}

# OpenAI function-calling format
SQL_TOOL_OPENAI = {
    "type": "function",
    "function": {
        "name": "query_database",
        "description": (
            "Execute a read-only SQL query against the user's data. "
            "Tables: documents (id, filename, file_size, mime_type, status, chunk_count, created_at, updated_at, metadata), "
            "threads (id, title, created_at, updated_at), "
            "messages (id, thread_id, role, content, created_at). "
            "All queries MUST include WHERE user_id = '{USER_ID}'. Only SELECT queries allowed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql_query": {
                    "type": "string",
                    "description": "SELECT query with user_id = '{USER_ID}' filter",
                },
            },
            "required": ["sql_query"],
        },
    },
}

# Anthropic format
SQL_TOOL_ANTHROPIC = {
    "name": "query_database",
    "description": (
        "Execute a read-only SQL query against the user's data. "
        "Tables: documents (id, filename, file_size, mime_type, status, chunk_count, created_at, updated_at, metadata), "
        "threads (id, title, created_at, updated_at), "
        "messages (id, thread_id, role, content, created_at). "
        "All queries MUST include WHERE user_id = '{USER_ID}'. Only SELECT queries allowed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "sql_query": {
                "type": "string",
                "description": "SELECT query with user_id = '{USER_ID}' filter",
            },
        },
        "required": ["sql_query"],
    },
}


def validate_sql(query: str) -> tuple[bool, str]:
    """Validate that a SQL query is safe to execute (SELECT-only, user-scoped)."""
    stripped = query.strip()
    if not stripped:
        return False, "Empty query"

    # Remove comments for analysis
    cleaned = re.sub(r"--[^\n]*", "", stripped)
    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
    upper = cleaned.strip().upper()

    # Must start with SELECT
    if not upper.startswith("SELECT"):
        return False, "Only SELECT queries are allowed"

    # Reject multi-statement (allow single trailing semicolon)
    without_trailing = stripped.rstrip(";").strip()
    if ";" in without_trailing:
        return False, "Multi-statement queries are not allowed"

    # Reject forbidden keywords
    for keyword in _FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{keyword}\b", upper):
            return False, f"Forbidden keyword: {keyword}"

    # Must reference user_id
    if "USER_ID" not in query and "user_id" not in query.lower():
        return False, "Query must include user_id filter"

    return True, ""


@observe(name="tool_execute_sql")
async def execute_sql_query(
    sql_query: str,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Execute a validated SQL query and return formatted results."""
    start_time = time.time()

    valid, reason = validate_sql(sql_query)
    if not valid:
        get_client().update_current_span(
            metadata={
                "query": sql_query,
                "validation_passed": False,
                "error": reason,
            }
        )
        return f"Query rejected: {reason}"

    # Strip trailing semicolon before execution
    clean_query = sql_query.rstrip(";").strip()

    # Replace {USER_ID} placeholder with parameterized binding
    parameterized = clean_query.replace("'{USER_ID}'", "?").replace("{USER_ID}", "?")

    # If no {USER_ID} placeholder was found but query references user_id with a literal value,
    # replace the literal with a parameterized binding for security and correctness.
    # This handles LLMs that generate `user_id = '123'` or `user_id = 123` instead of the placeholder.
    if parameterized == clean_query:
        # No replacements were made — try replacing literal user_id values
        parameterized = re.sub(
            r"user_id\s*=\s*(?:'[^']*'|\"[^\"]*\"|\S+)",
            "user_id = ?",
            parameterized,
            flags=re.IGNORECASE,
        )

    # Count how many ? we need to bind
    param_count = parameterized.count("?")
    params = tuple(user_id for _ in range(param_count))

    try:
        cursor = await asyncio.wait_for(
            db.execute(parameterized, params),
            timeout=settings.text_to_sql_timeout_seconds,
        )
        rows = await cursor.fetchmany(settings.text_to_sql_max_rows)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []

        elapsed_ms = round((time.time() - start_time) * 1000)

        if not rows:
            get_client().update_current_span(
                metadata={
                    "query": sql_query,
                    "validation_passed": True,
                    "row_count": 0,
                    "execution_time_ms": elapsed_ms,
                }
            )
            return "Query returned no results."

        # Format as text table
        col_widths = [len(c) for c in columns]
        for row in rows:
            for i, val in enumerate(row):
                col_widths[i] = max(col_widths[i], len(str(val) if val is not None else "NULL"))

        # Cap column widths for readability
        col_widths = [min(w, 60) for w in col_widths]

        header = " | ".join(c.ljust(col_widths[i]) for i, c in enumerate(columns))
        separator = "-+-".join("-" * w for w in col_widths)

        lines = [header, separator]
        for row in rows:
            vals = []
            for i, val in enumerate(row):
                s = str(val) if val is not None else "NULL"
                if len(s) > col_widths[i]:
                    s = s[: col_widths[i] - 3] + "..."
                vals.append(s.ljust(col_widths[i]))
            lines.append(" | ".join(vals))

        result = "\n".join(lines)
        if len(rows) == settings.text_to_sql_max_rows:
            result += f"\n\n(Results limited to {settings.text_to_sql_max_rows} rows)"

        get_client().update_current_span(
            metadata={
                "query": sql_query,
                "validation_passed": True,
                "row_count": len(rows),
                "execution_time_ms": elapsed_ms,
            }
        )

        return result

    except asyncio.TimeoutError:
        elapsed_ms = round((time.time() - start_time) * 1000)
        get_client().update_current_span(
            metadata={
                "query": sql_query,
                "validation_passed": True,
                "error": "timeout",
                "execution_time_ms": elapsed_ms,
            }
        )
        return f"Query timed out after {settings.text_to_sql_timeout_seconds} seconds."
    except Exception as e:
        elapsed_ms = round((time.time() - start_time) * 1000)
        logger.warning("SQL execution error: %s", e)
        get_client().update_current_span(
            metadata={
                "query": sql_query,
                "validation_passed": True,
                "error": str(e),
                "execution_time_ms": elapsed_ms,
            }
        )
        return f"Query error: {e}"
