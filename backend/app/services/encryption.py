import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key(encryption_key: str) -> bytes:
    """Derive a 32-byte AES key from the raw encryption key using SHA-256.

    This replaces the previous insecure ljust padding approach.
    SHA-256 always produces exactly 32 bytes with full entropy distribution.
    """
    return hashlib.sha256(encryption_key.encode("utf-8")).digest()


def encrypt(plaintext: str, encryption_key: str) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns base64-encoded nonce+ciphertext."""
    key = _get_key(encryption_key)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt(ciphertext: str, encryption_key: str) -> str:
    """Decrypt base64-encoded nonce+ciphertext."""
    key = _get_key(encryption_key)
    aesgcm = AESGCM(key)
    raw = base64.b64decode(ciphertext)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()


def mask_value(value: str) -> str:
    """Show first 8 chars + *** + last 4 chars."""
    if len(value) <= 12:
        return "***"
    return value[:8] + "..." + value[-4:]
