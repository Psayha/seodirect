"""Client Portal — token-based public access to project data."""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.portal import ProjectAccessToken
from app.models.project import Project
from app.models.user import UserRole

logger = logging.getLogger(__name__)


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CreateTokenBody(BaseModel):
    label: str | None = None
    expires_at: datetime | None = None


def _token_dict(t: ProjectAccessToken) -> dict:
    return {
        "id": str(t.id),
        "project_id": str(t.project_id),
        "token": t.token,
        "label": t.label,
        "created_by": t.created_by,
        "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat(),
    }


# ─── Protected: token management (requires auth) ─────────────────────────────

@router.post("/projects/{project_id}/portal/tokens", status_code=status.HTTP_201_CREATED)
def create_portal_token(
    project_id: uuid.UUID,
    body: CreateTokenBody,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate a new client portal access token."""
    _check_project_access(project_id, current_user, db)

    token_value = secrets.token_urlsafe(32)
    token = ProjectAccessToken(
        project_id=project_id,
        token=token_value,
        label=body.label,
        created_by=current_user.login if hasattr(current_user, "login") else str(current_user.id),
        expires_at=body.expires_at,
        is_active=True,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return _token_dict(token)


@router.get("/projects/{project_id}/portal/tokens")
def list_portal_tokens(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    tokens = db.scalars(
        select(ProjectAccessToken)
        .where(ProjectAccessToken.project_id == project_id)
        .order_by(ProjectAccessToken.created_at.desc())
    ).all()
    return [_token_dict(t) for t in tokens]


@router.delete("/projects/{project_id}/portal/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_portal_token(
    project_id: uuid.UUID,
    token_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    token = db.scalar(
        select(ProjectAccessToken).where(
            ProjectAccessToken.id == token_id,
            ProjectAccessToken.project_id == project_id,
        )
    )
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    token.is_active = False
    db.commit()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _resolve_token(token_value: str, db: Session) -> ProjectAccessToken:
    """Validate token and return it, raising 403 if invalid/expired."""
    now = datetime.now(timezone.utc)
    token = db.scalar(
        select(ProjectAccessToken).where(
            ProjectAccessToken.token == token_value,
            ProjectAccessToken.is_active.is_(True),
        )
    )
    if not token:
        raise HTTPException(status_code=403, detail="Invalid or revoked token")
    if token.expires_at and token.expires_at < now:
        raise HTTPException(status_code=403, detail="Token expired")
    return token


# ─── Public: portal endpoints (no auth, token-based) ─────────────────────────

@router.get("/portal/{token}")
def portal_overview(token: str, db: Annotated[Session, Depends(get_db)]):
    """Return project summary for client portal."""
    tok = _resolve_token(token, db)
    project = db.get(Project, tok.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from sqlalchemy import func

    from app.models.brief import Brief
    from app.models.crawl import CrawlSession, CrawlStatus
    from app.models.direct import Ad, AdGroup, Campaign, Keyword

    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    crawl = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project.id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project.id)).all()
    campaign_ids = [c.id for c in campaigns]
    keywords_total = 0
    ads_total = 0
    if campaign_ids:
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if group_ids:
            keywords_total = db.scalar(select(func.count(Keyword.id)).where(Keyword.ad_group_id.in_(group_ids))) or 0
            ads_total = db.scalar(select(func.count(Ad.id)).where(Ad.ad_group_id.in_(group_ids))) or 0

    return {
        "project": {
            "id": str(project.id),
            "name": project.name,
            "client_name": project.client_name,
            "url": project.url,
            "status": project.status.value,
            "budget": float(project.budget) if project.budget else None,
        },
        "brief": {
            "niche": brief.niche if brief else None,
            "geo": brief.geo if brief else None,
            "products": brief.products if brief else None,
            "usp": brief.usp if brief else None,
        },
        "stats": {
            "pages_crawled": crawl.pages_done if crawl else 0,
            "keywords_total": keywords_total,
            "ads_total": ads_total,
            "campaigns_total": len(campaigns),
        },
    }


@router.get("/portal/{token}/positions")
async def portal_positions(token: str, db: Annotated[Session, Depends(get_db)]):
    """Return Topvisor positions for client portal."""
    tok = _resolve_token(token, db)
    try:
        from app.models.project import Project as ProjectModel
        from app.services.topvisor import get_positions, get_topvisor_client_key, get_topvisor_user_id
        project = db.get(ProjectModel, tok.project_id)
        if not project or not project.topvisor_project_id:
            return {"positions": [], "message": "Topvisor не подключён"}
        api_key = get_topvisor_client_key(db)
        if not api_key:
            return {"positions": [], "message": "Topvisor API key не настроен"}
        user_id = get_topvisor_user_id(db) or ""
        from datetime import date, timedelta
        today = date.today()
        positions = await get_positions(
            api_key,
            project.topvisor_project_id,
            (today - timedelta(days=30)).isoformat(),
            today.isoformat(),
            user_id=user_id,
        )
        return {"positions": positions}
    except Exception:
        logger.exception("Portal positions failed for token project %s", tok.project_id)
        return {"positions": [], "error": "Failed to fetch positions"}


@router.get("/portal/{token}/analytics")
async def portal_analytics(token: str, db: Annotated[Session, Depends(get_db)]):
    """Return Metrika summary for client portal."""
    tok = _resolve_token(token, db)
    from app.services.settings_service import get_setting
    counter_val = get_setting(f"project_{tok.project_id}_metrika_counter", db)
    if not counter_val:
        return {"summary": None, "message": "Счётчик Метрики не подключён"}
    try:
        from app.services.metrika import get_metrika_client
        client = get_metrika_client(db)
        summary = await client.get_summary(int(counter_val))
        return {"summary": summary}
    except Exception:
        logger.exception("Portal analytics failed for token project %s", tok.project_id)
        return {"summary": None, "error": "Failed to fetch analytics"}


@router.get("/portal/{token}/mediaplan")
def portal_mediaplan(token: str, db: Annotated[Session, Depends(get_db)]):
    """Return mediaplan for client portal."""
    tok = _resolve_token(token, db)
    from app.models.mediaplan import MediaPlan
    plan = db.scalar(select(MediaPlan).where(MediaPlan.project_id == tok.project_id))
    if not plan:
        return {"rows": [], "message": "Медиаплан не заполнен"}
    return {
        "rows": plan.rows or [],
        "total_budget": sum(r.get("budget", 0) or 0 for r in (plan.rows or [])),
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


@router.get("/portal/{token}/report")
def portal_report(token: str, db: Annotated[Session, Depends(get_db)]):
    """Return HTML report for client portal (inline preview)."""
    from fastapi.responses import Response
    tok = _resolve_token(token, db)
    project = db.get(Project, tok.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from datetime import date

    from sqlalchemy import func

    from app.models.brief import Brief
    from app.models.crawl import CrawlSession, CrawlStatus
    from app.models.direct import Ad, AdGroup, Campaign, Keyword
    from app.routers.reports import _build_html

    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    crawl = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project.id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    crawl_report = crawl.report if crawl else None

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project.id)).all()
    campaign_ids = [c.id for c in campaigns]
    keywords_total = 0
    ads_total = 0
    if campaign_ids:
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if group_ids:
            keywords_total = db.scalar(select(func.count(Keyword.id)).where(Keyword.ad_group_id.in_(group_ids))) or 0
            ads_total = db.scalar(select(func.count(Ad.id)).where(Ad.ad_group_id.in_(group_ids))) or 0

    report_date = date.today().strftime("%d.%m.%Y")
    html = _build_html(project, brief, crawl_report, keywords_total, ads_total, report_date)
    return Response(content=html.encode("utf-8"), media_type="text/html; charset=utf-8")
