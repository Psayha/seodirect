import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.auth.rate_limit import blacklist_all_user_tokens
from app.auth.security import hash_password
from app.db.session import get_db
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


class UserCreate(BaseModel):
    login: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
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
    if body.role is not None and body.role != user.role:
        # Role change — invalidate tokens so new role takes effect immediately
        blacklist_all_user_tokens(str(user.id))
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
        # Invalidate all refresh tokens when user is deactivated
        if not body.is_active:
            blacklist_all_user_tokens(str(user.id))
    db.commit()
    db.refresh(user)
    return UserResponse(id=str(user.id), login=user.login, email=user.email, role=user.role.value, is_active=user.is_active)


class PasswordReset(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: uuid.UUID,
    body: PasswordReset,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body.password)
    # Invalidate all existing tokens after password change
    blacklist_all_user_tokens(str(user.id))
    db.commit()


# ─── Project assignment ────────────────────────────────────────────────────────

@router.get("/all-projects")
def all_projects(
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Return all projects with their current specialist assignment."""
    from app.models.project import Project
    projects = db.scalars(select(Project).order_by(Project.name)).all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "client_name": p.client_name,
            "status": p.status.value,
            "specialist_id": str(p.specialist_id) if p.specialist_id else None,
        }
        for p in projects
    ]


@router.get("/{user_id}/projects")
def get_user_projects(
    user_id: uuid.UUID,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """List projects assigned to a user."""
    from app.models.project import Project
    projects = db.scalars(select(Project).where(Project.specialist_id == user_id)).all()
    return [
        {"id": str(p.id), "name": p.name, "client_name": p.client_name, "status": p.status.value}
        for p in projects
    ]


@router.post("/{user_id}/projects/{project_id}/assign", status_code=status.HTTP_204_NO_CONTENT)
def assign_project(
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Assign a project to a user (set specialist_id)."""
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.specialist_id = user_id
    db.commit()


@router.delete("/{user_id}/projects/{project_id}/assign", status_code=status.HTTP_204_NO_CONTENT)
def unassign_project(
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    _: Annotated[User, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Unassign a project from a user."""
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(project.specialist_id) == str(user_id):
        project.specialist_id = None
        db.commit()
