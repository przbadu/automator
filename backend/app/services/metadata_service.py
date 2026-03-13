import json
import logging

import aiosqlite
import tiktoken

from app.config import settings
from app.models.metadata_schema import DEFAULT_FIELDS
from app.services.encryption_service import decrypt_value

logger = logging.getLogger(__name__)

_encoder = tiktoken.get_encoding("cl100k_base")

# Map schema data_type to Python type annotations for dynamic model building
TYPE_MAP = {
    "string": str,
    "number": float,
    "date": str,
    "boolean": bool,
    "list[string]": list[str],
}

MAX_EXTRACTION_TOKENS = 4000


async def get_user_schema_fields(user_id: str, db: aiosqlite.Connection) -> list[dict]:
    """Load user's metadata schema fields, falling back to defaults."""
    cursor = await db.execute(
        "SELECT fields FROM metadata_schemas WHERE user_id = ?", (user_id,)
    )
    row = await cursor.fetchone()
    if row:
        return json.loads(row["fields"])
    return DEFAULT_FIELDS


def _build_dynamic_model(fields: list[dict]):
    """Build a Pydantic model from user-defined field definitions."""
    from pydantic import Field, create_model

    field_definitions = {}
    for f in fields:
        python_type = TYPE_MAP.get(f["data_type"], str)
        desc = f.get("description", "")
        if f.get("required"):
            field_definitions[f["name"]] = (python_type, Field(description=desc))
        else:
            if f["data_type"] == "list[string]":
                field_definitions[f["name"]] = (
                    python_type,
                    Field(default_factory=list, description=desc),
                )
            else:
                field_definitions[f["name"]] = (
                    python_type | None,
                    Field(default=None, description=desc),
                )
    return create_model("DynamicDocumentMetadata", **field_definitions)


def _truncate_text(text: str, max_tokens: int = MAX_EXTRACTION_TOKENS) -> str:
    """Truncate text to a maximum number of tokens."""
    tokens = _encoder.encode(text)
    if len(tokens) <= max_tokens:
        return text
    return _encoder.decode(tokens[:max_tokens])


def _build_extraction_prompt(fields: list[dict]) -> str:
    """Build the system prompt for metadata extraction."""
    schema_desc = []
    for f in fields:
        req = "required" if f.get("required") else "optional"
        schema_desc.append(
            f'  - "{f["name"]}" ({f["data_type"]}, {req}): {f.get("description", "")}'
        )
    schema_text = "\n".join(schema_desc)

    return (
        "You are a metadata extraction assistant. Extract structured metadata from the document provided.\n"
        "Respond with ONLY valid JSON — no markdown, no explanation, no code fences.\n\n"
        f"Extract the following fields:\n{schema_text}\n\n"
        "Rules:\n"
        "- For list fields, return a JSON array of strings\n"
        "- For date fields, use ISO 8601 format (YYYY-MM-DD)\n"
        "- For optional fields you cannot determine, use null (or [] for lists)\n"
        "- For required fields, always provide a value — make your best inference\n"
    )


async def _resolve_llm_client(user_id: str, db: aiosqlite.Connection):
    """Resolve the user's default LLM client and model, same pattern as chat.py."""
    from app.services.langfuse_service import create_openai_client, openai_client

    config_cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE user_id = ? AND is_default = 1",
        (user_id,),
    )
    llm_config_row = await config_cursor.fetchone()

    if llm_config_row:
        api_key = decrypt_value(llm_config_row["api_key_encrypted"])
        provider = llm_config_row["provider"]
        model = llm_config_row["model_name"]
        if provider == "anthropic":
            from app.services.anthropic_service import create_anthropic_client
            client = create_anthropic_client(api_key)
        else:
            api_url = llm_config_row["api_url"]
            client = create_openai_client(api_key, api_url)
        return client, model, provider

    # Fall back to global env-based client (works for Ollama/local LLMs without API key)
    return openai_client, settings.llm_model, "openai"


async def extract_metadata(
    text: str,
    filename: str,
    user_id: str,
    db: aiosqlite.Connection,
) -> dict | None:
    """Extract structured metadata from document text using the user's LLM.

    Returns a dict of extracted fields, or None on any failure.
    Best-effort — never blocks ingestion.
    """
    try:
        # Load user's schema
        fields = await get_user_schema_fields(user_id, db)
        if not fields:
            return None

        # Build dynamic model for validation
        DynamicModel = _build_dynamic_model(fields)

        # Truncate text
        truncated = _truncate_text(text)

        # Build prompt
        system_prompt = _build_extraction_prompt(fields)
        user_message = f"Filename: {filename}\n\nDocument content:\n{truncated}"

        # Resolve LLM
        client, model, provider = await _resolve_llm_client(user_id, db)
        if client is None:
            logger.info("No LLM configured for user %s, skipping metadata extraction", user_id)
            return None

        # Call LLM
        if provider == "anthropic":
            response = await client.messages.create(
                model=model,
                messages=[{"role": "user", "content": user_message}],
                system=system_prompt,
                max_tokens=1024,
            )
            raw_text = response.content[0].text
        else:
            kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "max_tokens": 1024,
            }
            try:
                response = await client.chat.completions.create(
                    **kwargs, response_format={"type": "json_object"},
                )
            except Exception:
                # Fallback: some models don't support response_format
                response = await client.chat.completions.create(**kwargs)
            raw_text = response.choices[0].message.content

        # Parse JSON from response
        raw_text = raw_text.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            # Remove first and last fence lines
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw_text = "\n".join(lines)

        parsed = json.loads(raw_text)

        # Validate against dynamic model
        validated = DynamicModel(**parsed)
        return validated.model_dump()

    except Exception:
        logger.error("Metadata extraction failed for '%s'", filename, exc_info=True)
        return None
