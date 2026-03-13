from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import auth, chat, debug, documents, llm_configs, metadata_schemas


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Reset any documents stuck in processing from a previous crash
    from app.services.ingestion_service import reset_stuck_documents
    await reset_stuck_documents()
    yield


app = FastAPI(title="Automator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(debug.router)
app.include_router(documents.router)
app.include_router(llm_configs.router)
app.include_router(metadata_schemas.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.backend_host, port=settings.backend_port, reload=True)
