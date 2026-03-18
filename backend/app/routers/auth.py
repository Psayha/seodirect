import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.auth.rate_limit import (
    blacklist_token,
    check_rate_limit,
    clear_attempts,
    get_ttl,
    get_user_token_generation,
    increment_attempts,
    is_token_blacklisted,
)
from app.auth.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=256)
    remember_me: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    login: str
    email: str
    role: str


def _get_client_ip(request: Request) -> str:
    """Extract client IP. Only trust X-Forwarded-For from trusted proxies (nginx)."""
    client_ip = request.client.host if request.client else "unknown"
    # Only trust the header if request comes from a local proxy (docker network)
    if client_ip in ("127.0.0.1", "::1") or client_ip.startswith(("172.", "10.", "192.168.")):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Take the leftmost (client) IP — our nginx is the single trusted proxy
            parts = [p.strip() for p in forwarded.split(",")]
            return parts[0] if parts else client_ip
    return client_ip


def _blacklist_jti(payload: dict) -> None:
    """Blacklist a token by its jti claim until its natural expiry."""
    jti = payload.get("jti")
    if jti:
        exp = payload.get("exp", 0)
        ttl = max(int(exp) - int(time.time()), 0)
        if ttl > 0:
            blacklist_token(jti, ttl)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    ip = _get_client_ip(request)
    settings = get_settings()

    # Rate limit check (by IP + login combo)
    allowed, remaining = check_rate_limit(ip, body.login)
    if not allowed:
        ttl = get_ttl(ip, body.login)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {ttl} seconds.",
        )

    # Super admin: check against .env first
    is_super_admin = (
        body.login == settings.super_admin_login
        and verify_password(body.password, settings.super_admin_password_hash)
    )

    user: User | None = None

    if is_super_admin:
        # Load or create super_admin record in DB
        user = db.scalar(select(User).where(User.login == settings.super_admin_login))
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Super admin not initialized. Run init_superadmin.py first.",
            )
    else:
        user = db.scalar(select(User).where(User.login == body.login))
        # Always run password check to prevent timing-based user enumeration.
        # Use a valid bcrypt hash that will never match any real password.
        _DUMMY_HASH = "$2b$12$LJ3m4ys3Lg7RHwOFBSBLyOPkBiSfMNkOMarCb/JxFPDMj3ByurDAu"
        password_valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
        if not user or not user.is_active or not password_valid:
            increment_attempts(ip, body.login)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

    clear_attempts(ip, body.login)

    # Update last_login
    db.execute(
        update(User).where(User.id == user.id).values(last_login=datetime.now(timezone.utc))
    )
    db.commit()

    token_gen = get_user_token_generation(str(user.id))
    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token = create_refresh_token(str(user.id), body.remember_me, token_gen)

    logger.info("Login success: user=%s ip=%s", user.login, ip)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=4096)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Check individual token blacklist (jti-based)
    jti = payload.get("jti")
    if jti and is_token_blacklisted(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Check per-user generation (invalidates all tokens when user is deactivated)
    current_gen = get_user_token_generation(str(user_id))
    token_gen = payload.get("gen", 0)
    if token_gen < current_gen:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user = db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Revoke the old refresh token to prevent reuse (refresh token rotation)
    _blacklist_jti(payload)

    access_token = create_access_token(str(user.id), user.role.value)
    new_refresh = create_refresh_token(str(user.id), token_gen=current_gen)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=4096)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest):
    """Revoke the given refresh token so it cannot be reused."""
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        return  # silently ignore invalid tokens
    _blacklist_jti(payload)


@router.get("/me", response_model=MeResponse)
def get_me(current_user: CurrentUser):
    """Return current authenticated user info."""
    return MeResponse(
        id=str(current_user.id),
        login=current_user.login,
        email=current_user.email,
        role=current_user.role.value,
    )
