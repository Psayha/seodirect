import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key(raw_key: str) -> bytes:
    """Derive a 32-byte AES key from the raw encryption key using SHA-256."""
    return hashlib.sha256(raw_key.encode("utf-8")).digest()


def encrypt(plaintext: str, raw_key: str) -> str:
    """Encrypt plaintext string, return base64-encoded nonce+ciphertext."""
    key = _get_key(raw_key)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("utf-8")


def decrypt(encrypted: str, raw_key: str) -> str:
    """Decrypt base64-encoded nonce+ciphertext, return plaintext string."""
    key = _get_key(raw_key)
    aesgcm = AESGCM(key)
    combined = base64.b64decode(encrypted.encode("utf-8"))
    nonce = combined[:12]
    ciphertext = combined[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def mask_value(value: str) -> str:
    """Mask secret value for display: show first 8 + last 4 chars."""
    if len(value) <= 12:
        return "****"
    return value[:8] + "..." + value[-4:]
