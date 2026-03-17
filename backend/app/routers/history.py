"""Project history (audit log) router."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.history import ProjectEvent

router = APIRouter()


@router.get("/projects/{project_id}/history")
def get_history(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
):
    total = db.scalar(
        __import__("sqlalchemy", fromlist=["func"]).func.count(ProjectEvent.id)
        if False else
        __import__("sqlalchemy", fromlist=["select"]).select(
            __import__("sqlalchemy", fromlist=["func"]).func.count()
        ).select_from(ProjectEvent).where(ProjectEvent.project_id == project_id)
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
    from app.models.history import ProjectEvent, EventType
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
