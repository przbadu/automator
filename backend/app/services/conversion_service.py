import logging
from pathlib import Path

from docling.document_converter import DocumentConverter

logger = logging.getLogger(__name__)

DOCLING_EXTENSIONS = {".pdf", ".docx", ".pptx", ".html", ".htm", ".xlsx", ".csv"}
PLAINTEXT_EXTENSIONS = {".txt", ".md"}
ALL_SUPPORTED_EXTENSIONS = DOCLING_EXTENSIONS | PLAINTEXT_EXTENSIONS


def needs_conversion(filename: str) -> bool:
    """Return True if the file requires Docling conversion (not plain text)."""
    ext = Path(filename).suffix.lower()
    return ext in DOCLING_EXTENSIONS


def convert_document(file_path: Path) -> str:
    """Convert a document to markdown text using Docling. Synchronous."""
    logger.info("Converting document: %s", file_path)
    converter = DocumentConverter()
    result = converter.convert(source=str(file_path))
    text = result.document.export_to_markdown()
    logger.info("Conversion complete: %s (%d chars)", file_path.name, len(text))
    return text
