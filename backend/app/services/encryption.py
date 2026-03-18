"""Encryption utilities — delegates to the canonical implementation in app.auth.encryption.

This module exists for backward compatibility. All encryption logic lives in
app.auth.encryption to avoid duplication.
"""
from app.auth.encryption import decrypt, encrypt, mask_value

__all__ = ["encrypt", "decrypt", "mask_value"]
