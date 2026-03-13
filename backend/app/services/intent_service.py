"""Intent classification to route queries to sub-agent or normal RAG pipeline."""

import json
import logging
import re

from pydantic import BaseModel
from langfuse import get_client, observe

from app.config import settings
from app.services.langfuse_service import openai_client

logger = logging.getLogger(__name__)

INTENT_SYSTEM_PROMPT = """\
You are an intent classifier for a RAG (Retrieval-Augmented Generation) system.

The user has the following documents available:
{document_list}

Your task: determine if the user's message requires full-document analysis (reading/analyzing an entire document) or can be answered with standard chunk-based retrieval.

Full-document analysis is needed when the user wants to:
- Summarize an entire document
- Extract all key points, findings, or sections from a document
- Compare or analyze the overall structure of a document
- Get a comprehensive overview of a document's content

Standard retrieval is sufficient when the user:
- Asks a specific factual question
- Wants to find a particular piece of information
- Asks a general knowledge question unrelated to their documents

Respond with JSON only:
{{"needs_sub_agent": true/false, "target_document_id": "doc-id-or-null", "target_document_filename": "filename-or-null", "reasoning": "brief explanation"}}
"""


class IntentClassification(BaseModel):
    needs_sub_agent: bool
    target_document_id: str | None = None
    target_document_filename: str | None = None
    reasoning: str = ""


def _parse_intent_response(text: str) -> IntentClassification:
    """Parse LLM response into IntentClassification, with fallback regex parsing."""
    # Try JSON parsing first
    try:
        # Extract JSON from response (might be wrapped in markdown code blocks)
        json_match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return IntentClassification(**data)
    except Exception:
        pass

    # Fallback: look for boolean indicators
    text_lower = text.lower()
    needs = "true" in text_lower and "needs_sub_agent" in text_lower
    return IntentClassification(
        needs_sub_agent=needs,
        reasoning="Parsed from non-JSON response",
    )


@observe(name="classify_intent")
async def classify_intent(
    user_message: str,
    user_documents: list[dict],
    chat_history: list[dict],
    client=None,
    model: str | None = None,
    provider: str | None = None,
) -> IntentClassification:
    """Classify whether a user message needs sub-agent (full-doc analysis) or normal RAG."""
    # No documents → no sub-agent needed
    if not user_documents:
        result = IntentClassification(
            needs_sub_agent=False,
            reasoning="No documents available",
        )
        get_client().update_current_span(
            metadata={
                "needs_sub_agent": False,
                "document_count": 0,
                "skipped": "no_documents",
            }
        )
        return result

    try:
        effective_model = model or settings.llm_model
        effective_client = client or openai_client

        # Build document list for the prompt
        doc_list = "\n".join(
            f"- ID: {d['id']}, Filename: {d['filename']}, Chunks: {d['chunk_count']}"
            for d in user_documents
        )
        system_prompt = INTENT_SYSTEM_PROMPT.format(document_list=doc_list)

        if provider == "anthropic":
            # Anthropic path
            response = await effective_client.messages.create(
                model=effective_model,
                messages=[{"role": "user", "content": user_message}],
                system=system_prompt,
                max_tokens=200,
            )
            response_text = response.content[0].text.strip()
        else:
            # OpenAI-compatible path
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

        result = _parse_intent_response(response_text)

        get_client().update_current_span(
            metadata={
                "needs_sub_agent": result.needs_sub_agent,
                "target_document": result.target_document_filename,
                "document_count": len(user_documents),
                "reasoning": result.reasoning,
            }
        )

        return result

    except Exception:
        logger.warning("Intent classification failed, defaulting to normal RAG", exc_info=True)
        return IntentClassification(
            needs_sub_agent=False,
            reasoning="Classification failed, using default",
        )
