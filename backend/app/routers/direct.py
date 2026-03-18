from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.limiter import limiter
from app.models.direct import (
    Ad,
    AdGroup,
    AdStatus,
    Campaign,
    CampaignStatus,
    Keyword,
    KeywordStatus,
    KeywordTemperature,
    NegativeKeyword,
)
from app.models.project import Project
from app.models.task import Task, TaskStatus, TaskType
from app.models.user import UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Access control helpers ──────────────────────────────────────────────────

def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _check_campaign_access(campaign_id: uuid.UUID, current_user, db: Session) -> Campaign:
    """Load campaign and verify user has access to its parent project."""
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _check_project_access(c.project_id, current_user, db)
    return c


def _check_group_access(group_id: uuid.UUID, current_user, db: Session) -> AdGroup:
    """Load group and verify user has access via campaign → project chain."""
    g = db.get(AdGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _check_campaign_access(g.campaign_id, current_user, db)
    return g


# ─── Strategy ─────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/direct/strategy/generate")
@limiter.limit("10/minute")
def generate_strategy(
    request: Request,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    task = Task(
        project_id=project_id,
        type=TaskType.GENERATE_STRATEGY,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.direct import task_generate_strategy
    result = task_generate_strategy.delay(str(task.id), str(project_id))
    task.celery_task_id = result.id
    db.commit()

    return {"task_id": str(task.id)}


@router.get("/projects/{project_id}/direct/strategy")
def get_strategy(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    campaign = db.scalar(
        select(Campaign)
        .where(Campaign.project_id == project_id, Campaign.strategy_text.isnot(None))
        .order_by(Campaign.priority)
    )
    if not campaign:
        return {"strategy_text": None}
    return {"strategy_text": campaign.strategy_text, "campaign_id": str(campaign.id)}


class UpdateStrategyRequest(BaseModel):
    strategy_text: str = Field(default="", max_length=50000)


@router.put("/projects/{project_id}/direct/strategy")
def update_strategy(
    project_id: uuid.UUID,
    body: UpdateStrategyRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    campaign = db.scalar(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    )
    if not campaign:
        campaign = Campaign(project_id=project_id, name="Стратегия")
        db.add(campaign)
    campaign.strategy_text = body.strategy_text
    db.commit()
    return {"ok": True}


# ─── Campaigns ────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str | None = None
    priority: int = 0
    geo: dict | None = None
    budget_monthly: float | None = None


class CampaignUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    type: str | None = None
    priority: int | None = None
    status: str | None = None
    geo: dict | None = None
    budget_monthly: float | None = None
    sitelinks: list | None = None


@router.get("/projects/{project_id}/direct/campaigns")
def list_campaigns(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    campaigns = db.scalars(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    ).all()
    return [_campaign_dict(c) for c in campaigns]


@router.post("/projects/{project_id}/direct/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(
    project_id: uuid.UUID,
    body: CampaignCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    c = Campaign(project_id=project_id, **body.model_dump(exclude_none=True))
    db.add(c)
    db.commit()
    db.refresh(c)
    return _campaign_dict(c)


@router.patch("/direct/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: uuid.UUID,
    body: CampaignUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    c = _check_campaign_access(campaign_id, current_user, db)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    db.commit()
    return _campaign_dict(c)


@router.delete("/direct/campaigns/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    c = _check_campaign_access(campaign_id, current_user, db)
    db.delete(c)
    db.commit()


# ─── Ad Groups ────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str = Field(default="Новая группа", max_length=255)


@router.get("/direct/campaigns/{campaign_id}/groups")
def list_groups(
    campaign_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_campaign_access(campaign_id, current_user, db)
    groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id == campaign_id)).all()
    return [{"id": str(g.id), "campaign_id": str(g.campaign_id), "name": g.name, "status": g.status} for g in groups]


@router.post("/direct/campaigns/{campaign_id}/groups", status_code=201)
def create_group(
    campaign_id: uuid.UUID,
    body: GroupCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_campaign_access(campaign_id, current_user, db)
    g = AdGroup(campaign_id=campaign_id, name=body.name)
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": str(g.id), "name": g.name, "campaign_id": str(g.campaign_id)}


# ─── Keywords ─────────────────────────────────────────────────────────────────

@router.get("/direct/groups/{group_id}/keywords")
def list_keywords(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    temperature: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    _check_group_access(group_id, current_user, db)
    q = select(Keyword).where(Keyword.ad_group_id == group_id)
    if temperature:
        q = q.where(Keyword.temperature == KeywordTemperature(temperature))
    if status_filter:
        q = q.where(Keyword.status == KeywordStatus(status_filter))
    kws = db.scalars(q.order_by(Keyword.frequency.desc().nullslast()).limit(limit).offset(offset)).all()
    return [_kw_dict(k) for k in kws]


@router.post("/direct/groups/{group_id}/keywords/generate")
@limiter.limit("10/minute")
async def generate_keywords(
    request: Request,
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    group = _check_group_access(group_id, current_user, db)
    campaign = db.get(Campaign, group.campaign_id)
    task = Task(
        project_id=campaign.project_id,
        type=TaskType.GENERATE_KEYWORDS,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    from app.direct.service import generate_keywords_for_group
    kws = await generate_keywords_for_group(group_id, db)
    task.status = TaskStatus.SUCCESS
    task.progress = 100
    task.result = {"keywords_created": len(kws)}
    task.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"keywords_created": len(kws), "task_id": str(task.id)}


@router.post("/direct/groups/{group_id}/keywords/check-frequency")
def check_keyword_frequency(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    group = _check_group_access(group_id, current_user, db)
    keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id == group_id)).all()
    if not keywords:
        raise HTTPException(status_code=400, detail="No keywords in group")
    campaign = db.get(Campaign, group.campaign_id)
    task = Task(
        project_id=campaign.project_id,
        type=TaskType.CHECK_FREQUENCIES,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.direct import task_check_frequencies
    result = task_check_frequencies.delay(str(task.id), [str(k.id) for k in keywords])
    task.celery_task_id = result.id
    db.commit()
    return {"task_id": str(task.id)}


@router.get("/direct/keywords/dynamics")
async def keyword_dynamics(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    phrase: str = "",
):
    """Return monthly frequency dynamics for a phrase from Wordstat."""
    if not phrase:
        raise HTTPException(status_code=400, detail="phrase required")
    from app.services.settings_service import get_setting
    from app.services.wordstat import WordstatClient
    token = get_setting("wordstat_oauth_token", db)
    if not token:
        raise HTTPException(status_code=400, detail="Wordstat OAuth token not configured")
    client = WordstatClient(token)
    data = await client.get_dynamics(phrase)
    return {"phrase": phrase, "dynamics": data}


class KeywordCreate(BaseModel):
    ad_group_id: uuid.UUID
    phrase: str = Field(..., min_length=1, max_length=500)
    temperature: str = "warm"


@router.post("/direct/keywords", status_code=201)
def add_keyword(
    body: KeywordCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_group_access(body.ad_group_id, current_user, db)
    kw = Keyword(
        ad_group_id=body.ad_group_id,
        phrase=body.phrase,
        temperature=KeywordTemperature(body.temperature),
    )
    db.add(kw)
    db.commit()
    db.refresh(kw)
    return _kw_dict(kw)


@router.delete("/direct/keywords/{keyword_id}", status_code=204)
def delete_keyword(
    keyword_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    kw = db.get(Keyword, keyword_id)
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")
    _check_group_access(kw.ad_group_id, current_user, db)
    db.delete(kw)
    db.commit()


# ─── Ads ──────────────────────────────────────────────────────────────────────

@router.get("/direct/groups/{group_id}/ads")
def list_ads(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    _check_group_access(group_id, current_user, db)
    ads = db.scalars(select(Ad).where(Ad.ad_group_id == group_id).order_by(Ad.variant).limit(limit).offset(offset)).all()
    return [_ad_dict(a) for a in ads]


@router.post("/direct/groups/{group_id}/ads/generate")
@limiter.limit("10/minute")
async def generate_ads(
    request: Request,
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
    variants: int = 2,
):
    _check_group_access(group_id, current_user, db)
    from app.direct.service import generate_ads_for_group
    ads = await generate_ads_for_group(group_id, variants, db)
    return {"ads_created": len(ads), "ads": [_ad_dict(a) for a in ads]}


class AdUpdate(BaseModel):
    headline1: str | None = Field(None, max_length=56)
    headline2: str | None = Field(None, max_length=30)
    headline3: str | None = Field(None, max_length=30)
    text: str | None = Field(None, max_length=81)
    display_url: str | None = None
    utm: str | None = None
    status: str | None = None


@router.patch("/direct/ads/{ad_id}")
def update_ad(
    ad_id: uuid.UUID,
    body: AdUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    _check_group_access(ad.ad_group_id, current_user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "status":
            value = AdStatus(value)
        setattr(ad, field, value)
    db.commit()
    return _ad_dict(ad)


# ─── Negative Keywords ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/negative-keywords")
def list_negative_keywords(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    nkws = db.scalars(select(NegativeKeyword).where(NegativeKeyword.project_id == project_id)).all()
    return [{"id": str(n.id), "phrase": n.phrase, "block": n.block, "campaign_id": str(n.campaign_id) if n.campaign_id else None} for n in nkws]


@router.post("/projects/{project_id}/direct/negative-keywords/generate")
@limiter.limit("10/minute")
async def generate_negative_keywords_endpoint(
    request: Request,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    from app.direct.service import generate_negative_keywords
    nkws = await generate_negative_keywords(project_id, db)
    return {"created": len(nkws)}


class NegativeKeywordCreate(BaseModel):
    phrase: str = Field(..., min_length=1, max_length=500)
    block: str = "general"


@router.post("/projects/{project_id}/direct/negative-keywords", status_code=201)
def add_negative_keyword(
    project_id: uuid.UUID,
    body: NegativeKeywordCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    nk = NegativeKeyword(project_id=project_id, phrase=body.phrase, block=body.block)
    db.add(nk)
    db.commit()
    db.refresh(nk)
    return {"id": str(nk.id), "phrase": nk.phrase, "block": nk.block}


@router.delete("/direct/negative-keywords/{nk_id}", status_code=204)
def delete_negative_keyword(
    nk_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    nk = db.get(NegativeKeyword, nk_id)
    if not nk:
        raise HTTPException(status_code=404, detail="Negative keyword not found")
    _check_project_access(nk.project_id, current_user, db)
    db.delete(nk)
    db.commit()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _campaign_dict(c: Campaign) -> dict:
    return {
        "id": str(c.id),
        "project_id": str(c.project_id),
        "name": c.name,
        "type": c.type,
        "priority": c.priority,
        "status": c.status.value,
        "geo": c.geo,
        "budget_monthly": c.budget_monthly,
        "sitelinks": c.sitelinks or [],
        "strategy_text": c.strategy_text,
        "created_at": c.created_at.isoformat(),
    }


def _kw_dict(k: Keyword) -> dict:
    return {
        "id": str(k.id),
        "ad_group_id": str(k.ad_group_id),
        "phrase": k.phrase,
        "frequency": k.frequency,
        "frequency_updated_at": k.frequency_updated_at,
        "temperature": k.temperature.value if k.temperature else None,
        "status": k.status.value,
        "match_type": k.match_type,
    }


def _ad_dict(a: Ad) -> dict:
    h1 = a.headline1 or ""
    h2 = a.headline2 or ""
    h3 = a.headline3 or ""
    txt = a.text or ""
    return {
        "id": str(a.id),
        "ad_group_id": str(a.ad_group_id),
        "headline1": h1, "headline1_len": len(h1),
        "headline2": h2, "headline2_len": len(h2),
        "headline3": h3, "headline3_len": len(h3),
        "text": txt, "text_len": len(txt),
        "display_url": a.display_url,
        "utm": a.utm,
        "status": a.status.value,
        "variant": a.variant,
        "valid": len(h1) <= 56 and len(h2) <= 30 and len(h3) <= 30 and len(txt) <= 81,
    }
