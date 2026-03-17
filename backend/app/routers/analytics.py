"""Analytics router — Яндекс Метрика integration."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project

router = APIRouter()


# ─── Counter management ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/analytics/counters")
async def get_available_counters(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """List available Metrika counters from the OAuth token."""
    try:
        from app.services.metrika import get_metrika_client
        client = get_metrika_client(db)
        counters = await client.get_counters()
        return {"counters": counters}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Metrika API error: {str(e)}")


class SetCounterBody(BaseModel):
    counter_id: int


@router.post("/projects/{project_id}/analytics/counter")
def set_counter(
    project_id: uuid.UUID,
    body: SetCounterBody,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Save Metrika counter ID to project settings."""
    from app.services.settings_service import set_setting
    set_setting(f"project_{project_id}_metrika_counter", str(body.counter_id), db, updated_by=current_user.id)
    return {"ok": True, "counter_id": body.counter_id}


@router.get("/projects/{project_id}/analytics/counter")
def get_counter(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    from app.services.settings_service import get_setting
    counter_id = get_setting(f"project_{project_id}_metrika_counter", db)
    return {"counter_id": int(counter_id) if counter_id else None}


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/analytics/summary")
async def get_summary(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    date_from: str | None = None,
    date_to: str | None = None,
):
    counter_id = _get_counter_or_raise(project_id, db)
    try:
        from app.services.metrika import get_metrika_client
        client = get_metrika_client(db)
        summary = await client.get_summary(counter_id, date_from, date_to)
        sources = await client.get_traffic_sources(counter_id, date_from, date_to)
        daily = await client.get_daily_visits(counter_id, date_from, date_to)
        return {"summary": summary, "sources": sources, "daily": daily}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Metrika API error: {str(e)[:200]}")


@router.get("/projects/{project_id}/analytics/goals")
async def get_goals(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    counter_id = _get_counter_or_raise(project_id, db)
    try:
        from app.services.metrika import get_metrika_client
        client = get_metrika_client(db)
        goals = await client.get_goals(counter_id)
        return {"goals": goals}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:200])


def _get_counter_or_raise(project_id: uuid.UUID, db: Session) -> int:
    from app.services.settings_service import get_setting
    val = get_setting(f"project_{project_id}_metrika_counter", db)
    if not val:
        raise HTTPException(
            status_code=400,
            detail="Счётчик Метрики не привязан. Выберите счётчик в настройках вкладки «Аналитика».",
        )
    return int(val)
