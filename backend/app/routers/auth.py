import uuid
from datetime import timedelta, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status, Cookie
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import rate_limit
from app.auth.deps import get_current_user, CurrentUser
from app.auth.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User, UserRole

router = APIRouter()


class LoginRequest(BaseModel):
    login: str
    password: str
    remember_me: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    login: str
    email: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    settings = get_settings()
    ip = _get_client_ip(request)

    # Rate limit check
    if not rate_limit.check_rate_limit(ip):
        ttl = rate_limit.get_ttl(ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {ttl} seconds.",
        )

    # Проверяем super_admin из .env (приоритет над БД)
    is_super_admin_env = False
    authenticated_user_id = None
    user_role = None

    if body.login == settings.super_admin_login:
        if verify_password(body.password, settings.super_admin_password_hash):
            is_super_admin_env = True
            authenticated_user_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, settings.super_admin_login))
            user_role = UserRole.SUPER_ADMIN
        else:
            rate_limit.increment_attempts(ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
    else:
        # Обычный пользователь из БД
        user = db.scalar(select(User).where(User.login == body.login))
        if not user or not user.is_active or not verify_password(body.password, user.password_hash):
            rate_limit.increment_attempts(ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        authenticated_user_id = str(user.id)
        user_role = user.role
        # Обновляем last_login
        user.last_login = datetime.now(timezone.utc)
        db.commit()

    rate_limit.clear_attempts(ip)

    token_data: dict = {"sub": authenticated_user_id, "role": user_role}
    if is_super_admin_env:
        token_data["is_super_admin_env"] = True

    refresh_days = (
        settings.refresh_token_remember_days if body.remember_me else settings.refresh_token_days
    )

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data, timedelta(days=refresh_days))

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    db: Annotated[Session, Depends(get_db)],
    token: str | None = None,
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    if not token:
        raise credentials_exception

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    settings = get_settings()
    is_super_admin_env = payload.get("is_super_admin_env", False)
    user_role = payload.get("role", UserRole.SPECIALIST)

    if not is_super_admin_env:
        import uuid as _uuid
        user = db.scalar(select(User).where(User.id == _uuid.UUID(user_id)))
        if not user or not user.is_active:
            raise credentials_exception
        user_role = user.role

    token_data: dict = {"sub": user_id, "role": user_role}
    if is_super_admin_env:
        token_data["is_super_admin_env"] = True

    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
def logout():
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(current_user: CurrentUser):
    return UserResponse(
        id=str(current_user.id),
        login=current_user.login,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
    )
