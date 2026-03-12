from dataclasses import dataclass

import tiktoken

from app.config import settings


@dataclass
class ChunkResult:
    content: str
    chunk_index: int
    token_count: int


_encoder = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_encoder.encode(text))


def chunk_text(
    text: str,
    chunk_size: int = settings.chunk_size,
    chunk_overlap: int = settings.chunk_overlap,
) -> list[ChunkResult]:
    """Split text into overlapping chunks using recursive character splitting."""
    if not text.strip():
        return []

    segments = _recursive_split(text, chunk_size)
    chunks: list[ChunkResult] = []
    current_tokens: list[str] = []
    current_count = 0

    for segment in segments:
        seg_tokens = _encoder.encode(segment)
        seg_count = len(seg_tokens)

        if current_count + seg_count > chunk_size and current_tokens:
            chunk_text_str = _encoder.decode(current_tokens)
            chunks.append(ChunkResult(
                content=chunk_text_str.strip(),
                chunk_index=len(chunks),
                token_count=current_count,
            ))
            # Keep overlap tokens from the end of current chunk
            overlap_tokens = current_tokens[-chunk_overlap:] if chunk_overlap > 0 else []
            current_tokens = list(overlap_tokens)
            current_count = len(current_tokens)

        current_tokens.extend(seg_tokens)
        current_count += seg_count

    if current_tokens:
        chunk_text_str = _encoder.decode(current_tokens)
        chunks.append(ChunkResult(
            content=chunk_text_str.strip(),
            chunk_index=len(chunks),
            token_count=current_count,
        ))

    return chunks


def _recursive_split(text: str, chunk_size: int, sep_index: int = 0) -> list[str]:
    """Recursively split text by paragraph, sentence, then word boundaries."""
    separators = ["\n\n", "\n", ". ", " "]

    if _count_tokens(text) <= chunk_size:
        return [text]

    for i in range(sep_index, len(separators)):
        sep = separators[i]
        parts = text.split(sep)
        if len(parts) == 1:
            continue

        segments: list[str] = []
        for j, part in enumerate(parts):
            # Re-attach separator (except for last part)
            piece = part + sep if j < len(parts) - 1 else part
            if _count_tokens(piece) > chunk_size:
                # Try next finer separator
                segments.extend(_recursive_split(piece, chunk_size, i + 1))
            else:
                segments.append(piece)
        return segments

    # Base case: text cannot be split further by any separator
    return [text]
