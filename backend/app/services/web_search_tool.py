"""Web search tool: search the web via SearXNG, Tavily, Brave, or Exa."""

import logging

import httpx
from langfuse import get_client, observe

from app.config import settings

logger = logging.getLogger(__name__)

# OpenAI function-calling format
WEB_SEARCH_TOOL_OPENAI = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for current information. Use when the user's question is about recent events, external topics, or information not found in their documents.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
            },
            "required": ["query"],
        },
    },
}

# Anthropic format
WEB_SEARCH_TOOL_ANTHROPIC = {
    "name": "web_search",
    "description": "Search the web for current information. Use when the user's question is about recent events, external topics, or information not found in their documents.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query",
            },
        },
        "required": ["query"],
    },
}


def _format_results(query: str, results: list[dict]) -> str:
    """Format search results into readable text."""
    if not results:
        return f'No results found for "{query}".'

    lines = [f'Web Search Results for "{query}":\n']
    for i, r in enumerate(results, 1):
        title = r.get("title", "No title")
        url = r.get("url", "")
        snippet = r.get("snippet", "")
        lines.append(f"{i}. {title}")
        if url:
            lines.append(f"   {url}")
        if snippet:
            lines.append(f"   {snippet}")
        lines.append("")

    return "\n".join(lines)


async def _search_searxng(query: str, max_results: int) -> list[dict]:
    """Search via SearXNG instance."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{settings.web_search_url}/search",
            params={"q": query, "format": "json", "categories": "general"},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for r in data.get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
        })
    return results


async def _search_tavily(query: str, max_results: int) -> list[dict]:
    """Search via Tavily API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "query": query,
                "max_results": max_results,
                "api_key": settings.web_search_api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for r in data.get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
        })
    return results


async def _search_brave(query: str, max_results: int) -> list[dict]:
    """Search via Brave Search API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": max_results},
            headers={"X-Subscription-Token": settings.web_search_api_key},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for r in data.get("web", {}).get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("description", ""),
        })
    return results


async def _search_exa(query: str, max_results: int) -> list[dict]:
    """Search via Exa API."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.exa.ai/search",
            headers={
                "x-api-key": settings.web_search_api_key,
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "numResults": max_results,
                "type": "auto",
                "contents": {
                    "highlights": True,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for r in data.get("results", [])[:max_results]:
        highlights = r.get("highlights", [])
        snippet = highlights[0] if highlights else ""
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": snippet,
        })
    return results


_PROVIDERS = {
    "searxng": _search_searxng,
    "tavily": _search_tavily,
    "brave": _search_brave,
    "exa": _search_exa,
}


@observe(name="tool_web_search")
async def search_web(query: str, max_results: int | None = None) -> str:
    """Search the web using the configured provider."""
    effective_max = max_results or settings.web_search_max_results
    provider = settings.web_search_provider

    if not settings.web_search_url and provider == "searxng":
        return "Web search is not configured (no SearXNG URL set)."
    if not settings.web_search_api_key and provider in ("tavily", "brave", "exa"):
        return f"Web search is not configured (no API key for {provider})."

    search_fn = _PROVIDERS.get(provider)
    if not search_fn:
        return f"Unknown web search provider: {provider}"

    try:
        results = await search_fn(query, effective_max)
        formatted = _format_results(query, results)

        get_client().update_current_span(
            metadata={
                "provider": provider,
                "query": query,
                "result_count": len(results),
            }
        )

        return formatted
    except Exception as e:
        logger.warning("Web search failed (%s): %s", provider, e)
        get_client().update_current_span(
            metadata={
                "provider": provider,
                "query": query,
                "error": str(e),
            }
        )
        return f"Web search error: {e}"
