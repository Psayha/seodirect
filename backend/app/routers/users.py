import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.auth.security import hash_password
from app.db.session import get_db
from app.models.user import User, UserRole

router = APIRouter()

AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


class UserCreate(BaseModel):
    login: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.SPECIALIST


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: str
    login: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/", response_model=list[UserResponse])
def list_users(
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [UserResponse(id=str(u.id), login=u.login, email=u.email, role=u.role.value, is_active=u.is_active) for u in users]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    existing = db.scalar(select(User).where(User.login == body.login))
    if existing:
        raise HTTPException(status_code=400, detail="Login already taken")
    user = User(
        login=body.login,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=str(user.id), login=user.login, email=user.email, role=user.role.value, is_active=user.is_active)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return UserResponse(id=str(user.id), login=user.login, email=user.email, role=user.role.value, is_active=user.is_active)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: uuid.UUID,
    body: dict,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = body.get("password")
    if not new_password:
        raise HTTPException(status_code=400, detail="Password required")
    user.password_hash = hash_password(new_password)
    db.commit()
