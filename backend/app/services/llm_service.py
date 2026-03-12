import asyncio
from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings
from app.services.langfuse_service import openai_client
from app.services.anthropic_service import (
    generate_anthropic_title,
    stream_anthropic_completion,
)


async def get_thread_messages(db: aiosqlite.Connection, thread_id: str) -> list[dict]:
    """Load all messages for a thread, ordered by creation time."""
    cursor = await db.execute(
        "SELECT role, content FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
        (thread_id,),
    )
    rows = await cursor.fetchall()
    return [{"role": row[0], "content": row[1]} for row in rows]


def build_rag_system_message(context_chunks: list[dict]) -> str:
    """Build system message with retrieved context."""
    if not context_chunks:
        return "You are a helpful assistant."

    context_parts = []
    for chunk in context_chunks:
        context_parts.append(
            f"[Source: {chunk['filename']}, Chunk {chunk['chunk_index']}]\n{chunk['content']}"
        )
    context_text = "\n---\n".join(context_parts)

    return (
        "You are a helpful assistant. Use the following retrieved context from the user's "
        "documents when relevant. Cite the source document when using retrieved information.\n\n"
        f"Retrieved context:\n---\n{context_text}\n---"
    )


async def stream_chat_completion(
    messages: list[dict],
    stop_event: asyncio.Event | None = None,
    system_message: str | None = None,
    client=None,
    model: str | None = None,
    provider: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream chat completion deltas from the LLM.

    Supports both OpenAI-compatible and Anthropic providers.
    """
    effective_model = model or settings.llm_model

    if provider == "anthropic":
        async for delta in stream_anthropic_completion(
            messages,
            client=client,
            model=effective_model,
            stop_event=stop_event,
            system_message=system_message,
        ):
            yield delta
        return

    effective_client = client or openai_client

    # OpenAI-compatible path
    llm_messages = list(messages)
    if system_message:
        llm_messages = [{"role": "system", "content": system_message}] + llm_messages

    response = await effective_client.chat.completions.create(
        model=effective_model,
        messages=llm_messages,
        stream=True,
    )
    try:
        async for chunk in response:
            if stop_event and stop_event.is_set():
                break
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    finally:
        await response.close()


async def generate_thread_title(
    user_message: str,
    client=None,
    model: str | None = None,
    provider: str | None = None,
) -> str:
    """Generate a short, descriptive title for a chat thread."""
    effective_model = model or settings.llm_model

    if provider == "anthropic":
        return await generate_anthropic_title(user_message, client, effective_model)

    effective_client = client or openai_client
    response = await effective_client.chat.completions.create(
        model=effective_model,
        messages=[
            {
                "role": "system",
                "content": "Generate a short, concise title (max 6 words) for a chat conversation based on the user's first message. Return only the title, no quotes or punctuation at the end.",
            },
            {"role": "user", "content": user_message},
        ],
        max_tokens=20,
    )
    title = response.choices[0].message.content.strip().strip('"\'')
    return title[:80] if title else user_message[:50]
