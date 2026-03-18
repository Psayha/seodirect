"""MediaPlan router — monthly budget breakdown + forecasts."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.direct import Campaign, Keyword
from app.models.mediaplan import MediaPlan
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


MONTH_NAMES = [
    "", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

# ─── Default plan factory ─────────────────────────────────────────────────────

def _default_rows(total_budget: float, year: int = 2025) -> list[dict]:
    """12 equal months by default."""
    monthly = round(total_budget / 12, 2)
    rows = []
    for m in range(1, 13):
        rows.append({
            "month": m,
            "month_name": MONTH_NAMES[m],
            "year": year,
            "pct": round(100 / 12, 1),
            "budget": monthly,
            "forecast_clicks": None,
            "forecast_leads": None,
            "cpa": None,
        })
    return rows


def _recalc_row(row: dict) -> dict:
    """Recalculate derived fields."""
    row["month_name"] = MONTH_NAMES[row.get("month", 1)]
    budget = row.get("budget") or 0
    clicks = row.get("forecast_clicks")
    leads = row.get("forecast_leads")
    if budget and clicks:
        row["cpc"] = round(budget / clicks, 2)
    if budget and leads:
        row["cpa"] = round(budget / leads, 2)
    return row


# ─── GET ──────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/mediaplan")
def get_mediaplan(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    plan = db.scalar(
        select(MediaPlan).where(MediaPlan.project_id == project_id).with_for_update()
    )

    # If no plan exists yet — generate default (atomic with FOR UPDATE above)
    if not plan:
        total_budget = float(project.budget or 0)
        rows = _default_rows(total_budget)
        plan = MediaPlan(
            project_id=project_id,
            rows=rows,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

    # Enrich with total keywords frequency for click forecasts
    total_freq = _get_total_frequency(project_id, db)

    return {
        "plan_id": str(plan.id),
        "rows": plan.rows or [],
        "total_budget": sum(r.get("budget", 0) or 0 for r in (plan.rows or [])),
        "total_clicks": sum(r.get("forecast_clicks", 0) or 0 for r in (plan.rows or [])),
        "total_leads": sum(r.get("forecast_leads", 0) or 0 for r in (plan.rows or [])),
        "total_frequency": total_freq,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


def _get_total_frequency(project_id: uuid.UUID, db: Session) -> int:
    """Sum of all keyword frequencies for rough click forecast. Single JOIN query."""
    from sqlalchemy import func as sa_func

    from app.models.direct import AdGroup

    result = db.scalar(
        select(sa_func.coalesce(sa_func.sum(Keyword.frequency), 0))
        .join(AdGroup, Keyword.ad_group_id == AdGroup.id)
        .join(Campaign, AdGroup.campaign_id == Campaign.id)
        .where(Campaign.project_id == project_id, Keyword.frequency.isnot(None))
    )
    return int(result or 0)


# ─── PUT (update) ─────────────────────────────────────────────────────────────

class MediaPlanUpdate(BaseModel):
    rows: list[dict]


@router.put("/projects/{project_id}/direct/mediaplan")
def update_mediaplan(
    project_id: uuid.UUID,
    body: MediaPlanUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    plan = db.scalar(
        select(MediaPlan).where(MediaPlan.project_id == project_id).with_for_update()
    )
    if not plan:
        plan = MediaPlan(project_id=project_id)
        db.add(plan)

    rows = [_recalc_row(r) for r in body.rows]
    # Recalc percentages from budget
    total = sum(r.get("budget", 0) or 0 for r in rows)
    for r in rows:
        r["pct"] = round((r.get("budget", 0) or 0) / total * 100, 1) if total else 0

    plan.rows = rows
    plan.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Log to history
    _log_event(project_id, current_user, "mediaplan_updated", "Медиаплан обновлён", db)

    return {
        "rows": rows,
        "total_budget": total,
        "total_clicks": sum(r.get("forecast_clicks", 0) or 0 for r in rows),
        "total_leads": sum(r.get("forecast_leads", 0) or 0 for r in rows),
    }


# ─── POST: reset to defaults ───────────────────────────────────────────────────

@router.post("/projects/{project_id}/direct/mediaplan/reset")
def reset_mediaplan(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
    year: int = 2025,
):
    project = _check_project_access(project_id, current_user, db)

    plan = db.scalar(select(MediaPlan).where(MediaPlan.project_id == project_id))
    total_budget = float(project.budget or 0)
    rows = _default_rows(total_budget, year)

    if not plan:
        plan = MediaPlan(project_id=project_id)
        db.add(plan)

    plan.rows = rows
    plan.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"rows": rows}


def _log_event(project_id, user, event_type_str: str, description: str, db: Session):
    """Helper to log project event."""
    try:
        from app.models.history import EventType, ProjectEvent
        ev = ProjectEvent(
            project_id=project_id,
            user_id=user.id if hasattr(user, 'id') else None,
            user_login=user.login if hasattr(user, 'login') else None,
            event_type=EventType(event_type_str),
            description=description,
            created_at=datetime.now(timezone.utc),
        )
        db.add(ev)
        db.commit()
    except Exception:
        pass  # logging failures should never break main flow
