"""Topvisor integration: project linking and position monitoring."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.models.user import UserRole
from app.services.topvisor import (
    check_connection,
    get_positions,
    get_snapshots,
    get_topvisor_client_key,
    list_projects,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _require_key(db: Session) -> str:
    key = get_topvisor_client_key(db)
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Topvisor API key not configured. Set it in Settings → API keys.",
        )
    return key


# ── List available Topvisor projects ─────────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/projects")
async def topvisor_list_projects(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """List all Topvisor projects available for the current API key."""
    _check_project_access(project_id, current_user, db)
    key = _require_key(db)
    try:
        projects = await list_projects(key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"projects": projects}


# ── Link / unlink a Topvisor project ─────────────────────────────────────────

class LinkBody(BaseModel):
    topvisor_project_id: int | None = None


@router.post("/projects/{project_id}/topvisor/link")
def topvisor_link_project(
    project_id: uuid.UUID,
    body: LinkBody,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Save (or clear) the linked Topvisor project ID for this project."""
    project = _check_project_access(project_id, current_user, db)
    project.topvisor_project_id = body.topvisor_project_id
    db.commit()
    return {"topvisor_project_id": project.topvisor_project_id}


@router.get("/projects/{project_id}/topvisor/link")
def topvisor_get_link(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return currently linked Topvisor project ID."""
    project = _check_project_access(project_id, current_user, db)
    return {"topvisor_project_id": project.topvisor_project_id}


# ── Positions ─────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/positions")
async def topvisor_positions(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date_from: str = "",
    date_to: str = "",
    region_index: int = 0,
):
    """Get keyword positions from the linked Topvisor project.

    Requires the project to be linked via POST /topvisor/link first.
    """
    from datetime import date, timedelta

    project = _check_project_access(project_id, current_user, db)
    if not project.topvisor_project_id:
        raise HTTPException(
            status_code=400,
            detail="No Topvisor project linked. Use POST /topvisor/link first.",
        )

    key = _require_key(db)

    today = date.today()
    if not date_from:
        date_from = (today - timedelta(days=30)).isoformat()
    if not date_to:
        date_to = today.isoformat()

    try:
        positions = await get_positions(
            key,
            project.topvisor_project_id,
            date_from,
            date_to,
            region_index=region_index,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "topvisor_project_id": project.topvisor_project_id,
        "date_from": date_from,
        "date_to": date_to,
        "keywords": positions,
    }


# ── Snapshots (competitor SERP analysis) ─────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/snapshots")
async def topvisor_snapshots(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date: str = "",
    region_index: int = 0,
):
    """Get SERP snapshots for all keywords in the linked Topvisor project.

    Returns competitor URLs and positions in search results.
    """
    project = _check_project_access(project_id, current_user, db)
    if not project.topvisor_project_id:
        raise HTTPException(
            status_code=400,
            detail="No Topvisor project linked. Use POST /topvisor/link first.",
        )

    key = _require_key(db)

    try:
        snapshots = await get_snapshots(
            key,
            project.topvisor_project_id,
            date=date,
            region_index=region_index,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "topvisor_project_id": project.topvisor_project_id,
        "date": date,
        "keywords": snapshots,
    }
