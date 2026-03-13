"""Sub-agent service: autonomous document analysis via tool-calling loop."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

import aiosqlite
from langfuse import get_client, observe

from app.config import settings
from app.services.langfuse_service import openai_client
from app.services.sub_agent_tools import (
    ANTHROPIC_TOOL_DEFINITIONS,
    TOOL_DEFINITIONS,
    execute_tool,
    read_document_chunks,
)

logger = logging.getLogger(__name__)

SUB_AGENT_SYSTEM_PROMPT = """\
You are analyzing the document '{filename}' (ID: {document_id}).

Use the available tools to read and search the document, then provide a comprehensive answer to the user's question. You can:
1. Use `get_document_info` to understand the document's structure and metadata
2. Use `read_document_chunks` to read the document's content (read sequentially for full coverage)
3. Use `search_within_document` to find specific information

Read enough of the document to fully answer the question. Be thorough but efficient — don't re-read chunks you've already seen.
"""


def _truncate_result(text: str, max_len: int = 500) -> str:
    """Truncate tool result for SSE summary."""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


@observe(name="sub_agent_execution")
async def run_sub_agent(
    user_message: str,
    document_id: str,
    document_filename: str,
    user_id: str,
    chat_history: list[dict],
    client=None,
    model: str | None = None,
    provider: str | None = None,
    stop_event: asyncio.Event | None = None,
    db: aiosqlite.Connection | None = None,
) -> AsyncGenerator[dict, None]:
    """Run sub-agent tool-calling loop, yielding SSE event dicts."""
    effective_model = model or settings.llm_model
    effective_client = client or openai_client

    yield {"type": "sub_agent_start", "document": document_filename}

    system_prompt = SUB_AGENT_SYSTEM_PROMPT.format(
        filename=document_filename,
        document_id=document_id,
    )

    tool_calls_count = 0
    iterations = 0
    fallback_used = False

    if provider == "anthropic":
        async for event in _run_anthropic_loop(
            user_message=user_message,
            document_id=document_id,
            document_filename=document_filename,
            user_id=user_id,
            chat_history=chat_history,
            client=effective_client,
            model=effective_model,
            system_prompt=system_prompt,
            stop_event=stop_event,
            db=db,
        ):
            if event["type"] == "sub_agent_tool_call":
                tool_calls_count += 1
            if event["type"] == "_iteration":
                iterations = event["count"]
                continue
            if event["type"] == "_fallback":
                fallback_used = True
                continue
            yield event
    else:
        async for event in _run_openai_loop(
            user_message=user_message,
            document_id=document_id,
            document_filename=document_filename,
            user_id=user_id,
            chat_history=chat_history,
            client=effective_client,
            model=effective_model,
            system_prompt=system_prompt,
            stop_event=stop_event,
            db=db,
        ):
            if event["type"] == "sub_agent_tool_call":
                tool_calls_count += 1
            if event["type"] == "_iteration":
                iterations = event["count"]
                continue
            if event["type"] == "_fallback":
                fallback_used = True
                continue
            yield event

    yield {"type": "sub_agent_end"}

    get_client().update_current_span(
        metadata={
            "document_id": document_id,
            "document_filename": document_filename,
            "tool_calls_count": tool_calls_count,
            "iterations": iterations,
            "fallback_used": fallback_used,
        }
    )


async def _run_openai_loop(
    user_message: str,
    document_id: str,
    document_filename: str,
    user_id: str,
    chat_history: list[dict],
    client,
    model: str,
    system_prompt: str,
    stop_event: asyncio.Event | None,
    db: aiosqlite.Connection | None,
) -> AsyncGenerator[dict, None]:
    """OpenAI-compatible tool-calling loop."""
    messages = [{"role": "system", "content": system_prompt}]

    # Add recent history (last 4 messages for context)
    for msg in chat_history[-4:]:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    max_iterations = settings.sub_agent_max_iterations
    iteration = 0

    while iteration < max_iterations:
        if stop_event and stop_event.is_set():
            break

        iteration += 1
        yield {"type": "_iteration", "count": iteration}

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                stream=False,
            )
        except Exception as e:
            # Tool calling not supported — fall back to single-shot
            logger.warning("Tool calling failed, falling back to single-shot: %s", e)
            yield {"type": "_fallback"}
            async for event in _fallback_single_shot(
                user_message=user_message,
                document_id=document_id,
                document_filename=document_filename,
                user_id=user_id,
                client=client,
                model=model,
                system_prompt=system_prompt,
                stop_event=stop_event,
                provider=None,
            ):
                yield event
            return

        choice = response.choices[0]
        msg = choice.message

        if not msg.tool_calls:
            # Final response — stream it
            if msg.content:
                # Re-issue as streaming for consistent UX
                messages.append({"role": "assistant", "content": msg.content})
                for i in range(0, len(msg.content), 20):
                    chunk = msg.content[i : i + 20]
                    yield {"type": "delta", "content": chunk}
            break

        # Process tool calls
        messages.append(msg)  # Add assistant message with tool_calls

        for tool_call in msg.tool_calls:
            tool_name = tool_call.function.name
            try:
                args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                args = {}

            yield {
                "type": "sub_agent_tool_call",
                "tool": tool_name,
                "args": args,
            }

            result = await execute_tool(tool_name, args, user_id, db)

            yield {
                "type": "sub_agent_tool_result",
                "tool": tool_name,
                "summary": _truncate_result(result),
            }

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    else:
        # Max iterations reached — get final answer without tools
        if stop_event and not stop_event.is_set():
            messages.append({
                "role": "user",
                "content": "Please provide your final answer based on what you've read so far.",
            })
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True,
                )
                async for chunk in response:
                    if stop_event and stop_event.is_set():
                        break
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield {"type": "delta", "content": chunk.choices[0].delta.content}
                await response.close()
            except Exception:
                logger.warning("Final streaming response failed", exc_info=True)


async def _run_anthropic_loop(
    user_message: str,
    document_id: str,
    document_filename: str,
    user_id: str,
    chat_history: list[dict],
    client,
    model: str,
    system_prompt: str,
    stop_event: asyncio.Event | None,
    db: aiosqlite.Connection | None,
) -> AsyncGenerator[dict, None]:
    """Anthropic tool-calling loop."""
    messages = []

    # Add recent history
    for msg in chat_history[-4:]:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    max_iterations = settings.sub_agent_max_iterations
    iteration = 0

    while iteration < max_iterations:
        if stop_event and stop_event.is_set():
            break

        iteration += 1
        yield {"type": "_iteration", "count": iteration}

        try:
            response = await client.messages.create(
                model=model,
                messages=messages,
                system=system_prompt,
                tools=ANTHROPIC_TOOL_DEFINITIONS,
                max_tokens=4096,
            )
        except Exception as e:
            logger.warning("Anthropic tool calling failed, falling back: %s", e)
            yield {"type": "_fallback"}
            async for event in _fallback_single_shot(
                user_message=user_message,
                document_id=document_id,
                document_filename=document_filename,
                user_id=user_id,
                client=client,
                model=model,
                system_prompt=system_prompt,
                stop_event=stop_event,
                provider="anthropic",
            ):
                yield event
            return

        # Process response content blocks
        has_tool_use = False
        text_content = ""
        tool_results = []

        for block in response.content:
            if block.type == "text":
                text_content += block.text
            elif block.type == "tool_use":
                has_tool_use = True
                tool_name = block.name
                args = block.input if isinstance(block.input, dict) else {}

                yield {
                    "type": "sub_agent_tool_call",
                    "tool": tool_name,
                    "args": args,
                }

                result = await execute_tool(tool_name, args, user_id, db)

                yield {
                    "type": "sub_agent_tool_result",
                    "tool": tool_name,
                    "summary": _truncate_result(result),
                }

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        if not has_tool_use:
            # Final text response
            if text_content:
                for i in range(0, len(text_content), 20):
                    chunk = text_content[i : i + 20]
                    yield {"type": "delta", "content": chunk}
            break

        # Add assistant response and tool results to continue loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    else:
        # Max iterations — get final answer
        if stop_event and not stop_event.is_set():
            messages.append({
                "role": "user",
                "content": "Please provide your final answer based on what you've read so far.",
            })
            try:
                stream = await client.messages.create(
                    model=model,
                    messages=messages,
                    system=system_prompt,
                    max_tokens=4096,
                    stream=True,
                )
                async for event in stream:
                    if stop_event and stop_event.is_set():
                        break
                    if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                        yield {"type": "delta", "content": event.delta.text}
                await stream.close()
            except Exception:
                logger.warning("Anthropic final streaming failed", exc_info=True)


async def _fallback_single_shot(
    user_message: str,
    document_id: str,
    document_filename: str,
    user_id: str,
    client,
    model: str,
    system_prompt: str,
    stop_event: asyncio.Event | None,
    provider: str | None,
) -> AsyncGenerator[dict, None]:
    """Fallback: read all chunks and inject into context for single-shot completion."""
    # Read all document chunks
    all_content = read_document_chunks(
        document_id=document_id,
        user_id=user_id,
        start_chunk=0,
        max_chunks=200,  # Read as much as possible
    )

    yield {
        "type": "sub_agent_tool_call",
        "tool": "read_document_chunks",
        "args": {"document_id": document_id, "start_chunk": 0, "max_chunks": 200},
    }
    yield {
        "type": "sub_agent_tool_result",
        "tool": "read_document_chunks",
        "summary": f"Read full document ({len(all_content)} chars)",
    }

    fallback_system = (
        f"{system_prompt}\n\n"
        f"Here is the full content of '{document_filename}':\n\n{all_content}"
    )

    if provider == "anthropic":
        try:
            stream = await client.messages.create(
                model=model,
                messages=[{"role": "user", "content": user_message}],
                system=fallback_system,
                max_tokens=4096,
                stream=True,
            )
            async for event in stream:
                if stop_event and stop_event.is_set():
                    break
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    yield {"type": "delta", "content": event.delta.text}
            await stream.close()
        except Exception:
            logger.warning("Anthropic fallback streaming failed", exc_info=True)
    else:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": fallback_system},
                    {"role": "user", "content": user_message},
                ],
                stream=True,
            )
            async for chunk in response:
                if stop_event and stop_event.is_set():
                    break
                if chunk.choices and chunk.choices[0].delta.content:
                    yield {"type": "delta", "content": chunk.choices[0].delta.content}
            await response.close()
        except Exception:
            logger.warning("OpenAI fallback streaming failed", exc_info=True)
