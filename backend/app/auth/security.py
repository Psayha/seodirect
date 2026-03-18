from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    settings = get_settings()
    payload = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    settings = get_settings()
    return _create_token(
        {"sub": user_id, "role": role, "type": "access"},
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user_id: str, remember_me: bool = False, token_gen: int = 0) -> str:
    settings = get_settings()
    days = settings.refresh_token_remember_days if remember_me else settings.refresh_token_days
    return _create_token(
        {"sub": user_id, "type": "refresh", "jti": uuid.uuid4().hex, "gen": token_gen},
        timedelta(days=days),
    )


def decode_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None
