"""Analytics router — Яндекс Метрика integration."""
from __future__ import annotations
import logging
logger = logging.getLogger(__name__)

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


# ─── ROI Calculator ───────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/analytics/roi")
async def get_roi(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return ROI data combining MediaPlan + Metrika actuals."""
    from app.models.mediaplan import MediaPlan
    from sqlalchemy import select

    plan = db.scalar(select(MediaPlan).where(MediaPlan.project_id == project_id))
    plan_rows = []
    if plan and plan.rows:
        plan_rows = [
            {
                "month": r.get("month"),
                "month_name": r.get("month_name"),
                "budget": r.get("budget"),
                "forecast_leads": r.get("forecast_leads"),
                "forecast_cpa": r.get("cpa"),
                "forecast_clicks": r.get("forecast_clicks"),
            }
            for r in plan.rows
        ]

    # Try to get Metrika actual data
    actual = None
    from app.services.settings_service import get_setting
    counter_val = get_setting(f"project_{project_id}_metrika_counter", db)
    if counter_val:
        try:
            from app.services.metrika import get_metrika_client
            client = get_metrika_client(db)
            summary = await client.get_summary(int(counter_val))
            goals = await client.get_goals(int(counter_val))
            total_budget = sum(r.get("budget", 0) or 0 for r in (plan.rows or [])) if plan else 0
            visits = summary.get("visits", 0)
            conversions = len(goals)  # as a proxy
            actual = {
                "visits": visits,
                "conversions": conversions,
                "cpa_actual": round(total_budget / conversions, 2) if conversions else None,
                "date_from": summary.get("date_from"),
                "date_to": summary.get("date_to"),
            }
        except Exception:
            actual = None

    return {"plan": plan_rows, "actual": actual}


# ─── Traffic Anomaly Detection ────────────────────────────────────────────────

@router.get("/projects/{project_id}/analytics/anomalies")
async def get_traffic_anomalies(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Detect traffic anomalies by comparing last 7 days vs previous 7 days."""
    from app.services.settings_service import get_setting
    counter_val = get_setting(f"project_{project_id}_metrika_counter", db)
    if not counter_val:
        return {"anomalies": [], "message": "Счётчик Метрики не подключён"}

    try:
        from app.services.metrika import get_metrika_client
        from datetime import date, timedelta

        client = get_metrika_client(db)
        today = date.today()
        date_from = (today - timedelta(days=14)).isoformat()
        date_to = (today - timedelta(days=1)).isoformat()

        daily = await client.get_daily_visits(int(counter_val), date_from, date_to)
    except RuntimeError as e:
        return {"anomalies": [], "message": str(e)}
    except Exception as e:
        return {"anomalies": [], "error": str(e)[:200]}

    if len(daily) < 14:
        return {"anomalies": [], "message": "Недостаточно данных для анализа (нужно минимум 14 дней)"}

    current_7 = daily[-7:]
    prev_7 = daily[-14:-7]

    current_avg = sum(d["visits"] for d in current_7) / 7
    prev_avg = sum(d["visits"] for d in prev_7) / 7

    if prev_avg == 0:
        return {
            "anomalies": [],
            "period_current_avg": round(current_avg, 1),
            "period_prev_avg": round(prev_avg, 1),
            "change_pct": None,
        }

    change_pct = round((current_avg - prev_avg) / prev_avg * 100, 1)

    anomalies = []
    if change_pct <= -30:
        anomalies.append({
            "severity": "error",
            "message": f"Трафик упал на {abs(change_pct)}% за последние 7 дней",
        })
    elif change_pct <= -15:
        anomalies.append({
            "severity": "warn",
            "message": f"Трафик снизился на {abs(change_pct)}% за последние 7 дней",
        })
    elif change_pct >= 50:
        anomalies.append({
            "severity": "info",
            "message": f"Трафик вырос на {change_pct}% за последние 7 дней",
        })

    return {
        "anomalies": anomalies,
        "period_current_avg": round(current_avg, 1),
        "period_prev_avg": round(prev_avg, 1),
        "change_pct": change_pct,
    }
