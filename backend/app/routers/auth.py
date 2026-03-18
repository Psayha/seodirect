import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.rate_limit import check_rate_limit, clear_attempts, get_ttl, increment_attempts
from app.auth.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


class LoginRequest(BaseModel):
    login: str
    password: str
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
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    ip = _get_client_ip(request)
    settings = get_settings()

    # Rate limit check
    allowed, remaining = check_rate_limit(ip)
    if not allowed:
        ttl = get_ttl(ip)
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
        if not user or not user.is_active or not verify_password(body.password, user.password_hash):
            increment_attempts(ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

    clear_attempts(ip)

    # Update last_login
    db.execute(
        update(User).where(User.id == user.id).values(last_login=datetime.now(timezone.utc))
    )
    db.commit()

    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token = create_refresh_token(str(user.id), body.remember_me)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    import uuid
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token(str(user.id), user.role.value)
    new_refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=new_refresh)


@router.get("/me", response_model=MeResponse)
def get_me(request: Request, db: Annotated[Session, Depends(get_db)]):
    # Inline to avoid circular import complexity
    from fastapi.security import HTTPAuthorizationCredentials

    from app.auth.deps import _get_token_payload, bearer_scheme, get_current_user
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[7:]
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    import uuid
    user_id = uuid.UUID(payload["sub"])
    from sqlalchemy import select
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return MeResponse(id=str(user.id), login=user.login, email=user.email, role=user.role.value)
