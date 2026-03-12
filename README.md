# Cloud Code Agentic RAG Masterclass

Build an agentic RAG application from scratch by collaborating with Claude Code. Follow along with our video series using the docs in this repo.

[![Claude Code RAG Masterclass](./video-thumbnail.png)](https://www.youtube.com/watch?v=xgPWCuqLoek)

[Watch the full video on YouTube](https://www.youtube.com/watch?v=xgPWCuqLoek)

## What This Is

A hands-on course where you collaborate with Claude Code to build a full-featured RAG system. You're not the one writing code—Claude is. Your job is to guide it, understand what you're building, and course-correct when needed.

**You don't need to know how to code.** You do need to be technically minded and willing to learn about APIs, databases, and system architecture.

## What You'll Build

- **Chat interface** with threaded conversations, streaming, tool calls, and subagent reasoning
- **Document ingestion** with drag-and-drop upload and processing status
- **Full RAG pipeline**: chunking, embedding, hybrid search, reranking
- **Agentic patterns**: text-to-SQL, web search, subagents with isolated context

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Tailwind, shadcn/ui, Vite |
| Backend | Python, FastAPI |
| Database | Supabase (Postgres + pgvector + Auth + Storage) |
| Doc Processing | Docling |
| AI Models | Local (LM Studio) or Cloud (OpenAI, OpenRouter) |
| Observability | LangSmith |

## The 8 Modules

1. **App Shell** — Auth, chat UI, managed RAG with OpenAI Responses API
2. **BYO Retrieval + Memory** — Ingestion, pgvector, switch to generic completions API
3. **Record Manager** — Content hashing, deduplication
4. **Metadata Extraction** — LLM-extracted metadata, filtered retrieval
5. **Multi-Format Support** — PDF, DOCX, HTML, Markdown via Docling
6. **Hybrid Search & Reranking** — Keyword + vector search, RRF, reranking
7. **Additional Tools** — Text-to-SQL, web search fallback
8. **Subagents** — Isolated context, document analysis delegation

## Getting Started

1. Clone this repo
2. Install prerequisites:
   - [Node.js](https://nodejs.org/) (v18+)
   - [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)
   - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
3. Copy `.env.example` to `.env` and fill in your API keys
4. Start the app:

```bash
# Development (hot-reload for both frontend and backend)
bin/dev

# Production (optimized build, multi-worker backend)
bin/prod
```

The scripts handle everything: creating virtual environments, installing dependencies, and starting both servers.

- **Backend:** http://localhost:8000
- **Frontend:** http://localhost:5173
- **Health check:** http://localhost:8000/health

## Docs

- [PRD.md](./PRD.md) — What to build (the 8 modules in detail)
- [CLAUDE.md](./CLAUDE.md) — Context for Claude Code
- [PROGRESS.md](./PROGRESS.md) — Track your build progress

## Join the Community

If you want to connect with hundreds of builders creating production-grade AI and RAG systems, join us in [The AI Automators community](https://www.theaiautomators.com/). Share your progress, get help when you're stuck, and see what others are building.
