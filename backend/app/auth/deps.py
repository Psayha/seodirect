import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import decode_token, verify_password
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise credentials_exception

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise credentials_exception

    # Проверяем super_admin по .env (не требует записи в БД)
    settings = get_settings()
    if payload.get("is_super_admin_env"):
        # Синтетический пользователь из .env
        env_user = User()
        env_user.id = uuid.UUID(user_id)
        env_user.login = settings.super_admin_login
        env_user.email = settings.super_admin_email
        env_user.role = UserRole.SUPER_ADMIN
        env_user.is_active = True
        return env_user

    user = db.scalar(select(User).where(User.id == uuid.UUID(user_id)))
    if not user or not user.is_active:
        raise credentials_exception

    return user


def require_roles(*roles: UserRole):
    """Dependency factory: требует одну из указанных ролей."""
    def checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return checker


# Готовые зависимости
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))]
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
