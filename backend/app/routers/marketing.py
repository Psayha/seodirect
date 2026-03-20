"""Marketing module: semantic core collection for SEO and Yandex Direct."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.marketing import (
    CleaningSnapshot,
    KeywordCache,
    MarketingMinusWord,
    SemanticCluster,
    SemanticKeyword,
    SemanticMode,
    SemanticProject,
)
from app.models.project import Project
from app.models.user import UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

CACHE_TTL_DAYS = 30


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _get_sem_project(sem_id: uuid.UUID, project_id: uuid.UUID, db: Session) -> SemanticProject:
    sp = db.get(SemanticProject, sem_id)
    if not sp or sp.project_id != project_id:
        raise HTTPException(status_code=404, detail="Semantic project not found")
    return sp


def _classify_kw_type(exact: int | None) -> str | None:
    if exact is None:
        return None
    if exact >= 1000:
        return "ВЧ"
    if exact >= 100:
        return "СЧ"
    return "НЧ"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SemanticProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    mode: SemanticMode
    region: str | None = Field(None, max_length=100)
    region_id: int | None = None
    is_seasonal: bool = False


class SemanticProjectResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    mode: str
    region: str | None
    region_id: int | None
    is_seasonal: bool
    needs_brand_check: bool
    pipeline_step: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CollectMasksRequest(BaseModel):
    masks: list[str] = Field(..., min_length=1, max_length=50)

    @classmethod
    def __get_validators__(cls):
        yield cls._validate

    @classmethod
    def _validate(cls, v):
        return v


class SemanticKeywordResponse(BaseModel):
    id: uuid.UUID
    phrase: str
    frequency_base: int | None
    frequency_phrase: int | None
    frequency_exact: int | None
    frequency_order: int | None
    kw_type: str | None
    intent: str | None
    source: str
    is_mask: bool
    mask_selected: bool
    is_branded: bool
    is_competitor: bool
    is_seasonal: bool
    geo_dependent: bool
    is_excluded: bool
    cluster_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MaskSelectionUpdate(BaseModel):
    mask_selected: bool


class KeywordsListResponse(BaseModel):
    items: list[SemanticKeywordResponse]
    total: int
    page: int
    per_page: int


# ─── Semantic Project CRUD ─────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/marketing/semantic",
    response_model=SemanticProjectResponse,
    status_code=201,
)
def create_or_get_semantic_project(
    project_id: uuid.UUID,
    body: SemanticProjectCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Create a semantic project for a given mode. One per mode per project (UPSERT)."""
    _check_project_access(project_id, current_user, db)

    existing = db.scalar(
        select(SemanticProject).where(
            SemanticProject.project_id == project_id,
            SemanticProject.mode == body.mode,
        )
    )
    if existing:
        # Update name/region if provided
        existing.name = body.name
        existing.region = body.region
        existing.region_id = body.region_id
        existing.is_seasonal = body.is_seasonal
        db.commit()
        db.refresh(existing)
        return existing

    sp = SemanticProject(
        project_id=project_id,
        name=body.name,
        mode=body.mode,
        region=body.region,
        region_id=body.region_id,
        is_seasonal=body.is_seasonal,
        pipeline_step=0,
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp


@router.get(
    "/projects/{project_id}/marketing/semantic",
    response_model=list[SemanticProjectResponse],
)
def list_semantic_projects(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    return db.scalars(
        select(SemanticProject)
        .where(SemanticProject.project_id == project_id)
        .order_by(SemanticProject.created_at)
    ).all()


@router.get(
    "/projects/{project_id}/marketing/semantic/{sem_id}",
    response_model=SemanticProjectResponse,
)
def get_semantic_project(
    project_id: uuid.UUID,
    sem_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    return _get_sem_project(sem_id, project_id, db)


@router.delete("/projects/{project_id}/marketing/semantic/{sem_id}", status_code=204)
def delete_semantic_project(
    project_id: uuid.UUID,
    sem_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    sp = _get_sem_project(sem_id, project_id, db)
    db.delete(sp)
    db.commit()


# ─── Mask Collection ───────────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/marketing/semantic/{sem_id}/collect-masks",
    response_model=list[SemanticKeywordResponse],
)
async def collect_masks(
    project_id: uuid.UUID,
    sem_id: uuid.UUID,
    body: CollectMasksRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Collect all 4 frequency types for mask phrases via Wordstat.

    Uses cache (30-day TTL) to avoid redundant API calls.
    Saves results as SemanticKeyword records with is_mask=True.
    """
    _check_project_access(project_id, current_user, db)
    sp = _get_sem_project(sem_id, project_id, db)

    # Normalize and deduplicate
    raw_masks = [m.strip().lower() for m in body.masks if m.strip()]
    masks = list(dict.fromkeys(raw_masks))  # preserve order, remove dupes
    if not masks:
        raise HTTPException(status_code=422, detail="No valid masks provided")

    from app.services.wordstat import get_wordstat_client

    client = get_wordstat_client(db)

    # ── Cache lookup ──────────────────────────────────────────────────────────
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=CACHE_TTL_DAYS)
    cached_rows = db.scalars(
        select(KeywordCache).where(
            KeywordCache.phrase.in_(masks),
            KeywordCache.region_id == sp.region_id,
            KeywordCache.cached_at > cutoff,
        )
    ).all()
    cached_map: dict[str, KeywordCache] = {row.phrase: row for row in cached_rows}
    uncached = [m for m in masks if m not in cached_map]

    # ── Fetch uncached from Wordstat ──────────────────────────────────────────
    fresh: dict[str, dict] = {}
    if uncached:
        if not client:
            raise HTTPException(
                status_code=503,
                detail="Wordstat API token not configured. Add it in Settings → API keys.",
            )
        regions = [sp.region_id] if sp.region_id else None
        try:
            fresh = await client.get_all_frequencies(uncached, regions=regions)
        except Exception as exc:
            logger.exception("Wordstat error: %s", exc)
            raise HTTPException(status_code=502, detail="Wordstat API error")

        # Save to cache
        now = datetime.now(tz=timezone.utc)
        for phrase, freqs in fresh.items():
            existing_cache = db.scalar(
                select(KeywordCache).where(
                    KeywordCache.phrase == phrase,
                    KeywordCache.region_id == sp.region_id,
                )
            )
            if existing_cache:
                existing_cache.frequency_base = freqs["base"]
                existing_cache.frequency_phrase = freqs["phrase_freq"]
                existing_cache.frequency_exact = freqs["exact"]
                existing_cache.frequency_order = freqs["order"]
                existing_cache.cached_at = now
            else:
                db.add(KeywordCache(
                    phrase=phrase,
                    region_id=sp.region_id,
                    frequency_base=freqs["base"],
                    frequency_phrase=freqs["phrase_freq"],
                    frequency_exact=freqs["exact"],
                    frequency_order=freqs["order"],
                    cached_at=now,
                ))

    # ── Build combined frequency map ──────────────────────────────────────────
    def _freqs(phrase: str) -> dict:
        if phrase in fresh:
            return fresh[phrase]
        if phrase in cached_map:
            c = cached_map[phrase]
            return {
                "base": c.frequency_base or 0,
                "phrase_freq": c.frequency_phrase or 0,
                "exact": c.frequency_exact or 0,
                "order": c.frequency_order or 0,
            }
        return {"base": 0, "phrase_freq": 0, "exact": 0, "order": 0}

    # ── Delete old mask records for this project and re-create ────────────────
    old_masks = db.scalars(
        select(SemanticKeyword).where(
            SemanticKeyword.semantic_project_id == sem_id,
            SemanticKeyword.is_mask.is_(True),
        )
    ).all()
    # Keep records for phrases still in the new list, remove others
    existing_mask_phrases = {kw.phrase: kw for kw in old_masks}
    phrases_to_remove = set(existing_mask_phrases) - set(masks)
    for phrase in phrases_to_remove:
        db.delete(existing_mask_phrases[phrase])

    result_keywords: list[SemanticKeyword] = []
    for phrase in masks:
        f = _freqs(phrase)
        kw_type = _classify_kw_type(f["exact"])

        if phrase in existing_mask_phrases:
            kw = existing_mask_phrases[phrase]
            kw.frequency_base = f["base"]
            kw.frequency_phrase = f["phrase_freq"]
            kw.frequency_exact = f["exact"]
            kw.frequency_order = f["order"]
            kw.kw_type = kw_type
        else:
            kw = SemanticKeyword(
                semantic_project_id=sem_id,
                phrase=phrase,
                frequency_base=f["base"],
                frequency_phrase=f["phrase_freq"],
                frequency_exact=f["exact"],
                frequency_order=f["order"],
                kw_type=kw_type,
                source="wordstat",
                is_mask=True,
                mask_selected=True,
            )
            db.add(kw)
        result_keywords.append(kw)

    # Advance pipeline step if still at 0
    if sp.pipeline_step < 1:
        sp.pipeline_step = 1

    db.commit()
    for kw in result_keywords:
        db.refresh(kw)
    return result_keywords


# ─── Mask Selection Toggle ────────────────────────────────────────────────────

@router.patch(
    "/projects/{project_id}/marketing/semantic/{sem_id}/keywords/{kw_id}/mask-selection",
    response_model=SemanticKeywordResponse,
)
def update_mask_selection(
    project_id: uuid.UUID,
    sem_id: uuid.UUID,
    kw_id: uuid.UUID,
    body: MaskSelectionUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    _get_sem_project(sem_id, project_id, db)
    kw = db.get(SemanticKeyword, kw_id)
    if not kw or kw.semantic_project_id != sem_id:
        raise HTTPException(status_code=404, detail="Keyword not found")
    kw.mask_selected = body.mask_selected
    db.commit()
    db.refresh(kw)
    return kw


# ─── Keywords List ────────────────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/marketing/semantic/{sem_id}/keywords",
    response_model=KeywordsListResponse,
)
def list_keywords(
    project_id: uuid.UUID,
    sem_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    kw_type: str | None = Query(None),
    intent: str | None = Query(None),
    source: str | None = Query(None),
    only_masks: bool = Query(False),
    search: str | None = Query(None, max_length=200),
):
    _check_project_access(project_id, current_user, db)
    _get_sem_project(sem_id, project_id, db)

    q = select(SemanticKeyword).where(
        SemanticKeyword.semantic_project_id == sem_id,
        SemanticKeyword.is_excluded.is_(False),
    )
    if kw_type:
        q = q.where(SemanticKeyword.kw_type == kw_type)
    if intent:
        q = q.where(SemanticKeyword.intent == intent)
    if source:
        q = q.where(SemanticKeyword.source == source)
    if only_masks:
        q = q.where(SemanticKeyword.is_mask.is_(True))
    if search:
        q = q.where(SemanticKeyword.phrase.ilike(f"%{search}%"))

    from sqlalchemy import func
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0

    items = db.scalars(
        q.order_by(SemanticKeyword.frequency_exact.desc().nullslast())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()

    return {"items": items, "total": total, "page": page, "per_page": per_page}
