import asyncio
from collections.abc import AsyncGenerator

import anthropic


def create_anthropic_client(api_key: str) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key)


async def stream_anthropic_completion(
    messages: list[dict],
    client: anthropic.AsyncAnthropic,
    model: str,
    stop_event: asyncio.Event | None = None,
    system_message: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream completion from Anthropic API, yielding text deltas."""
    # Convert messages: extract system message, keep only user/assistant
    anthropic_messages = []
    for msg in messages:
        if msg["role"] == "system":
            # system messages handled via system param
            if not system_message:
                system_message = msg["content"]
            continue
        anthropic_messages.append({"role": msg["role"], "content": msg["content"]})

    kwargs: dict = {
        "model": model,
        "messages": anthropic_messages,
        "max_tokens": 4096,
        "stream": True,
    }
    if system_message:
        kwargs["system"] = system_message

    stream = await client.messages.create(**kwargs)
    try:
        async for event in stream:
            if stop_event and stop_event.is_set():
                break
            if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                yield event.delta.text
    finally:
        await stream.close()


async def generate_anthropic_title(
    user_message: str,
    client: anthropic.AsyncAnthropic,
    model: str,
) -> str:
    response = await client.messages.create(
        model=model,
        messages=[{"role": "user", "content": user_message}],
        system="Generate a short, concise title (max 6 words) for a chat conversation based on the user's first message. Return only the title, no quotes or punctuation at the end.",
        max_tokens=20,
    )
    title = response.content[0].text.strip().strip("\"'")
    return title[:80] if title else user_message[:50]
