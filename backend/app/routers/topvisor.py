"""Topvisor integration: project linking, position monitoring, competitors, clustering."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.project import Project
from app.models.user import UserRole
from app.services.topvisor import (
    get_cluster_percent,
    get_competitors,
    get_positions,
    get_positions_summary,
    get_project_keywords,
    get_snapshots,
    get_topvisor_client_key,
    get_topvisor_user_id,
    list_projects,
    start_cluster_task,
    trigger_positions_check,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _require_credentials(db: Session) -> tuple[str, str]:
    """Return (api_key, user_id), raising 400 if either is missing."""
    key = get_topvisor_client_key(db)
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Topvisor API key not configured. Set it in Settings → API keys.",
        )
    user_id = get_topvisor_user_id(db) or ""
    return key, user_id


def _require_linked(project: Project) -> int:
    if not project.topvisor_project_id:
        raise HTTPException(
            status_code=400,
            detail="No Topvisor project linked. Use POST /topvisor/link first.",
        )
    return project.topvisor_project_id


def _default_dates(date_from: str, date_to: str) -> tuple[str, str]:
    from datetime import date, timedelta
    today = date.today()
    return (
        date_from or (today - timedelta(days=30)).isoformat(),
        date_to or today.isoformat(),
    )


# ── List available Topvisor projects ─────────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/projects")
async def topvisor_list_projects(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """List all Topvisor projects available for the current API key."""
    _check_project_access(project_id, current_user, db)
    key, user_id = _require_credentials(db)
    try:
        projects = await list_projects(key, user_id)
    except Exception:
        logger.exception("Topvisor list_projects failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")
    return {"projects": projects}


# ── Link / unlink a Topvisor project ─────────────────────────────────────────

class LinkBody(BaseModel):
    topvisor_project_id: int | None = None


@router.post("/projects/{project_id}/topvisor/link")
def topvisor_link_project(
    project_id: uuid.UUID,
    body: LinkBody,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
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
    """Get keyword positions from the linked Topvisor project."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)
    date_from, date_to = _default_dates(date_from, date_to)

    try:
        positions = await get_positions(key, tv_id, date_from, date_to, region_index=region_index, user_id=user_id)
    except Exception:
        logger.exception("Topvisor get_positions failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    return {"topvisor_project_id": tv_id, "date_from": date_from, "date_to": date_to, "keywords": positions}


# ── Positions summary ─────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/summary")
async def topvisor_summary(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date_from: str = "",
    date_to: str = "",
    region_index: int = 0,
):
    """Get positions summary: avg position, visibility, TOP-3/10/30 distribution."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)
    date_from, date_to = _default_dates(date_from, date_to)

    try:
        summary = await get_positions_summary(key, tv_id, date_from, date_to, region_index=region_index, user_id=user_id)
    except Exception:
        logger.exception("Topvisor get_positions_summary failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    return {"topvisor_project_id": tv_id, "date_from": date_from, "date_to": date_to, "summary": summary}


# ── Snapshots (SERP snapshots per keyword) ────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/snapshots")
async def topvisor_snapshots(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date: str = "",
    region_index: int = 0,
):
    """Get SERP snapshots for all keywords in the linked Topvisor project."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)

    try:
        snapshots = await get_snapshots(key, tv_id, date=date, region_index=region_index, user_id=user_id)
    except Exception:
        logger.exception("Topvisor get_snapshots failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    return {"topvisor_project_id": tv_id, "date": date, "keywords": snapshots}


# ── Competitors (top domains in SERP) ─────────────────────────────────────────

@router.get("/projects/{project_id}/topvisor/competitors")
async def topvisor_competitors(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date_from: str = "",
    date_to: str = "",
    region_index: int = 0,
):
    """Get top competitor domains from SERP snapshots."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)
    date_from, date_to = _default_dates(date_from, date_to)

    try:
        competitors = await get_competitors(key, tv_id, date_from, date_to, region_index=region_index, user_id=user_id)
    except Exception:
        logger.exception("Topvisor get_competitors failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    return {"topvisor_project_id": tv_id, "date_from": date_from, "date_to": date_to, "competitors": competitors}


# ── Trigger positions check ───────────────────────────────────────────────────

@router.post("/projects/{project_id}/topvisor/check-positions")
async def topvisor_check_positions(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Trigger an on-demand positions check in Topvisor."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)

    try:
        result = await trigger_positions_check(key, tv_id, user_id=user_id)
    except Exception:
        logger.exception("Topvisor trigger_check failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


# ── Clustering ────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/topvisor/cluster/start")
async def topvisor_cluster_start(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Start a Topvisor clustering task (by TOP-10) for the linked project."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)

    try:
        result = await start_cluster_task(key, tv_id, user_id=user_id)
    except Exception:
        logger.exception("Topvisor cluster start failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/projects/{project_id}/topvisor/cluster/status")
async def topvisor_cluster_status(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return clustering completion percentage (0–100). -1 means no active task."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)

    try:
        percent = await get_cluster_percent(key, tv_id, user_id=user_id)
    except Exception:
        logger.exception("Topvisor cluster status failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    return {"percent": percent, "done": percent == 100}


@router.get("/projects/{project_id}/topvisor/cluster/keywords")
async def topvisor_cluster_keywords(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return project keywords with cluster group assignments."""
    project = _check_project_access(project_id, current_user, db)
    tv_id = _require_linked(project)
    key, user_id = _require_credentials(db)

    try:
        keywords = await get_project_keywords(key, tv_id, user_id=user_id)
    except Exception:
        logger.exception("Topvisor get_project_keywords failed for project %s", project_id)
        raise HTTPException(status_code=502, detail="Topvisor API error")

    # Group by cluster
    clusters: dict[str, list[str]] = {}
    for kw in keywords:
        group = str(kw.get("group_id") or "ungrouped")
        clusters.setdefault(group, []).append(kw.get("name", ""))

    return {
        "topvisor_project_id": tv_id,
        "total_keywords": len(keywords),
        "clusters": [{"group_id": k, "keywords": v} for k, v in clusters.items()],
    }
