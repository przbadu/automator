"""Intent classification to route queries to sub-agent or normal RAG pipeline."""

import json
import logging
import re

from pydantic import BaseModel
from langfuse import get_client, observe

from app.config import settings
from app.services.langfuse_service import openai_client

logger = logging.getLogger(__name__)

def _build_intent_system_prompt() -> str:
    """Build the intent classification prompt with conditionally enabled tool categories."""
    tool_categories = []

    if settings.text_to_sql_enabled:
        tool_categories.append(
            "- Query their data: \"how many documents\", \"show my threads\", \"largest file\" (no document target needed)"
        )

    if settings.web_search_enabled and settings.web_search_url:
        tool_categories.append(
            "- Search the web for current/external information (no document target needed)"
        )

    tool_section = ""
    if tool_categories:
        tool_section = "\n" + "\n".join(tool_categories) + "\n"

    tool_json_hint = ""
    if tool_categories:
        tool_json_hint = """
If tools are needed but no specific document:
{{"needs_sub_agent": true, "target_document_id": null, "target_document_filename": null, "reasoning": "..."}}
"""

    return f"""\
You are an intent classifier for a RAG (Retrieval-Augmented Generation) system.

The user has the following documents available:
{{document_list}}

Your task: determine if the user's message requires tool-based assistance or can be answered with standard chunk-based retrieval.

Tool-based assistance is needed when the user wants to:
- Summarize an entire document (target a specific document)
- Extract all key points, findings, or sections from a document (target a specific document)
- Compare or analyze the overall structure of a document
- Get a comprehensive overview of a document's content{tool_section}
Standard retrieval is sufficient when the user:
- Asks a specific factual question answerable from document chunks
- Asks about content within their documents
- Asks a general knowledge question unrelated to their documents

You MUST respond with valid JSON only, no other text. Use the exact document IDs shown above:
{{"needs_sub_agent": true, "target_document_id": "exact-id-from-list", "target_document_filename": "exact-filename", "reasoning": "brief explanation"}}
{tool_json_hint}
Or if standard retrieval is sufficient:
{{"needs_sub_agent": false, "target_document_id": null, "target_document_filename": null, "reasoning": "brief explanation"}}
"""


class IntentClassification(BaseModel):
    needs_sub_agent: bool
    target_document_id: str | None = None
    target_document_filename: str | None = None
    reasoning: str = ""


def _parse_intent_response(text: str, user_documents: list[dict]) -> IntentClassification:
    """Parse LLM response into IntentClassification, with fallback matching."""
    # Try JSON parsing first
    try:
        # Extract JSON from response (might be wrapped in markdown code blocks)
        json_match = re.search(r"\{.*?\}", text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            result = IntentClassification(**data)

            # If needs_sub_agent but no document_id, only auto-match if the LLM
            # didn't explicitly set null (i.e. it omitted the field entirely).
            # When the LLM says null, it means "no document needed" (tool-based query).
            explicitly_null = "target_document_id" in data and data["target_document_id"] is None
            if result.needs_sub_agent and not result.target_document_id and not explicitly_null:
                result = _auto_match_document(result, text, user_documents)

            # Validate the document_id actually exists in the user's documents
            if result.needs_sub_agent and result.target_document_id:
                valid_ids = {d["id"] for d in user_documents}
                if result.target_document_id not in valid_ids:
                    # Try matching by filename
                    matched = _match_by_filename(result.target_document_filename, user_documents)
                    if matched:
                        result.target_document_id = matched["id"]
                        result.target_document_filename = matched["filename"]
                    else:
                        logger.warning(
                            "LLM returned invalid document_id %r, not in %r",
                            result.target_document_id,
                            valid_ids,
                        )
                        # If only one document, use it
                        if len(user_documents) == 1:
                            result.target_document_id = user_documents[0]["id"]
                            result.target_document_filename = user_documents[0]["filename"]
                        else:
                            result.target_document_id = None

            return result
    except Exception as e:
        logger.warning("JSON parse failed for intent response: %s (text: %r)", e, text[:200])

    # Fallback: look for boolean indicators
    text_lower = text.lower()
    needs = "true" in text_lower and ("needs_sub_agent" in text_lower or "sub_agent" in text_lower)

    result = IntentClassification(
        needs_sub_agent=needs,
        reasoning="Parsed from non-JSON response",
    )

    if needs:
        result = _auto_match_document(result, text, user_documents)

    return result


def _auto_match_document(
    result: IntentClassification,
    text: str,
    user_documents: list[dict],
) -> IntentClassification:
    """Try to match a document from the user's list based on context."""
    # If only one document, use it
    if len(user_documents) == 1:
        result.target_document_id = user_documents[0]["id"]
        result.target_document_filename = user_documents[0]["filename"]
        return result

    # Try to find a filename mentioned in the LLM response
    text_lower = text.lower()
    for doc in user_documents:
        if doc["filename"].lower() in text_lower:
            result.target_document_id = doc["id"]
            result.target_document_filename = doc["filename"]
            return result

    return result


def _match_by_filename(
    filename: str | None,
    user_documents: list[dict],
) -> dict | None:
    """Match a document by filename (case-insensitive)."""
    if not filename:
        return None
    filename_lower = filename.lower()
    for doc in user_documents:
        if doc["filename"].lower() == filename_lower:
            return doc
    # Partial match
    for doc in user_documents:
        if filename_lower in doc["filename"].lower() or doc["filename"].lower() in filename_lower:
            return doc
    return None


@observe(name="classify_intent")
async def classify_intent(
    user_message: str,
    user_documents: list[dict],
    chat_history: list[dict],
    client=None,
    model: str | None = None,
    provider: str | None = None,
) -> IntentClassification:
    """Classify whether a user message needs sub-agent or normal RAG."""
    has_tool_capabilities = settings.text_to_sql_enabled or (
        settings.web_search_enabled and settings.web_search_url
    )

    # No documents and no tool capabilities → no sub-agent needed
    if not user_documents and not has_tool_capabilities:
        result = IntentClassification(
            needs_sub_agent=False,
            reasoning="No documents available and no tools enabled",
        )
        get_client().update_current_span(
            metadata={
                "needs_sub_agent": False,
                "document_count": 0,
                "skipped": "no_documents_no_tools",
            }
        )
        return result

    try:
        effective_model = model or settings.llm_model
        effective_client = client or openai_client

        # Build document list for the prompt
        if user_documents:
            doc_list = "\n".join(
                f"- ID: {d['id']}, Filename: {d['filename']}, Chunks: {d['chunk_count']}"
                for d in user_documents
            )
        else:
            doc_list = "(no documents uploaded yet)"
        prompt_template = _build_intent_system_prompt()
        system_prompt = prompt_template.replace("{document_list}", doc_list)

        if provider == "anthropic":
            response = await effective_client.messages.create(
                model=effective_model,
                messages=[{"role": "user", "content": user_message}],
                system=system_prompt,
                max_tokens=200,
            )
            response_text = response.content[0].text.strip()
        else:
            llm_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]
            response = await effective_client.chat.completions.create(
                model=effective_model,
                messages=llm_messages,
                max_tokens=200,
            )
            response_text = response.choices[0].message.content.strip()

        logger.info("Intent classification raw response: %s", response_text)

        result = _parse_intent_response(response_text, user_documents)

        logger.info(
            "Intent classification result: needs_sub_agent=%s, doc_id=%s, doc_name=%s, reasoning=%s",
            result.needs_sub_agent,
            result.target_document_id,
            result.target_document_filename,
            result.reasoning,
        )

        get_client().update_current_span(
            metadata={
                "needs_sub_agent": result.needs_sub_agent,
                "target_document": result.target_document_filename,
                "target_document_id": result.target_document_id,
                "document_count": len(user_documents),
                "reasoning": result.reasoning,
                "raw_response": response_text[:200],
            }
        )

        return result

    except Exception:
        logger.warning("Intent classification failed, defaulting to normal RAG", exc_info=True)
        return IntentClassification(
            needs_sub_agent=False,
            reasoning="Classification failed, using default",
        )
