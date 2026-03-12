import os
import shutil
from pathlib import Path

from app.config import settings


def _resolve_upload_dir() -> Path:
    """Resolve the upload directory relative to the backend directory."""
    upload_dir = settings.upload_dir
    if upload_dir.startswith("./"):
        return Path(__file__).parent.parent.parent / upload_dir[2:]
    return Path(upload_dir)


UPLOAD_ROOT = _resolve_upload_dir()


def get_upload_path(user_id: str, document_id: str, filename: str) -> Path:
    """Get the full path for a file upload."""
    return UPLOAD_ROOT / user_id / document_id / filename


async def save_file(user_id: str, document_id: str, filename: str, content: bytes) -> Path:
    """Save uploaded file to disk. Returns the file path."""
    path = get_upload_path(user_id, document_id, filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def read_file_text(user_id: str, document_id: str, filename: str) -> str:
    """Read file content as text."""
    path = get_upload_path(user_id, document_id, filename)
    return path.read_text(encoding="utf-8")


def delete_file(user_id: str, document_id: str) -> None:
    """Delete all files for a document."""
    doc_dir = UPLOAD_ROOT / user_id / document_id
    if doc_dir.exists():
        shutil.rmtree(doc_dir)
