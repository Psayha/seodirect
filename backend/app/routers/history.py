"""Project history (audit log) router."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.history import ProjectEvent
from app.models.project import Project
from app.models.user import UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


@router.get("/projects/{project_id}/history")
def get_history(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
):
    _check_project_access(project_id, current_user, db)

    total = db.scalar(
        select(func.count()).select_from(ProjectEvent).where(ProjectEvent.project_id == project_id)
    )

    events = db.scalars(
        select(ProjectEvent)
        .where(ProjectEvent.project_id == project_id)
        .order_by(ProjectEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return {
        "total": total,
        "events": [
            {
                "id": str(e.id),
                "event_type": e.event_type.value,
                "description": e.description,
                "user_login": e.user_login,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
    }


def log_event(project_id: uuid.UUID, user, event_type_str: str, description: str, db: Session):
    """Reusable helper imported by other routers."""
    from app.models.history import EventType, ProjectEvent
    try:
        ev = ProjectEvent(
            project_id=project_id,
            user_id=getattr(user, "id", None),
            user_login=getattr(user, "login", None),
            event_type=EventType(event_type_str),
            description=description,
            created_at=datetime.now(timezone.utc),
        )
        db.add(ev)
        db.commit()
    except Exception:
        db.rollback()
