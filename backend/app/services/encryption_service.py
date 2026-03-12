import os
from pathlib import Path

from cryptography.fernet import Fernet

from app.config import settings, _env_file

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet

    key = settings.encryption_key
    if not key:
        # Auto-generate and persist to .env
        key = Fernet.generate_key().decode()
        with open(_env_file, "a") as f:
            f.write(f"\n# Auto-generated encryption key\nENCRYPTION_KEY={key}\n")
        settings.encryption_key = key

    _fernet = Fernet(key.encode())
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value. Returns URL-safe base64 encoded ciphertext."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted value back to plaintext."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
