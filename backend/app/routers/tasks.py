import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.models.task import Task
from app.models.user import UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/active/{project_id}")
def get_active_task(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    task_type: str | None = None,
):
    """Return the most recent running/pending task for a project."""
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    stmt = (
        select(Task)
        .where(
            Task.project_id == project_id,
            Task.status.in_(["pending", "running"]),
        )
        .order_by(Task.created_at.desc())
    )
    if task_type:
        stmt = stmt.where(Task.type == task_type)
    task = db.scalar(stmt)
    if not task:
        return None
    return {
        "id": str(task.id),
        "type": task.type.value,
        "status": task.status.value,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
    }


@router.get("/{task_id}")
def get_task(
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    task = db.scalar(select(Task).where(Task.id == task_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify the user has access to the project this task belongs to
    if task.project_id:
        project = db.get(Project, task.project_id)
        if not project or project.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Task not found")
        if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": str(task.id),
        "type": task.type.value,
        "status": task.status.value,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
    }
