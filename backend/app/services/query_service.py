import logging

from app.config import settings
from app.services.langfuse_service import openai_client

logger = logging.getLogger(__name__)

CONTEXTUALIZE_SYSTEM_PROMPT = (
    "Given the following conversation history and a follow-up question, reformulate the follow-up "
    "question into a standalone search query that captures the full intent. Return ONLY the "
    "reformulated query, nothing else. If the question is already standalone, return it unchanged."
)


async def contextualize_query(
    user_message: str,
    chat_history: list[dict],
    client=None,
    model: str | None = None,
    provider: str | None = None,
) -> str:
    """Reformulate a follow-up question into a standalone search query using conversation context.

    Returns the original message unchanged if there's insufficient history or on any failure.
    """
    if not chat_history or len(chat_history) < 2:
        return user_message

    try:
        effective_model = model or settings.llm_model
        effective_client = client or openai_client

        if provider == "anthropic":
            # Build conversation for Anthropic
            anthropic_messages = []
            for msg in chat_history:
                if msg["role"] in ("user", "assistant"):
                    anthropic_messages.append({"role": msg["role"], "content": msg["content"]})
            anthropic_messages.append({"role": "user", "content": f"Follow-up question: {user_message}"})

            response = await effective_client.messages.create(
                model=effective_model,
                messages=anthropic_messages,
                system=CONTEXTUALIZE_SYSTEM_PROMPT,
                max_tokens=150,
            )
            result = response.content[0].text.strip()
        else:
            # OpenAI-compatible path
            llm_messages = [{"role": "system", "content": CONTEXTUALIZE_SYSTEM_PROMPT}]
            for msg in chat_history:
                if msg["role"] in ("user", "assistant"):
                    llm_messages.append({"role": msg["role"], "content": msg["content"]})
            llm_messages.append({"role": "user", "content": f"Follow-up question: {user_message}"})

            response = await effective_client.chat.completions.create(
                model=effective_model,
                messages=llm_messages,
                max_tokens=150,
            )
            result = response.choices[0].message.content.strip()

        if result:
            return result
        return user_message

    except Exception:
        logger.warning("Query contextualization failed, using original query", exc_info=True)
        return user_message
