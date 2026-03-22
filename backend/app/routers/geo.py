"""GEO/AEO router — AI visibility tracking and AI-readiness auditing."""
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.brief import Brief
from app.models.crawl import CrawlSession, Page
from app.models.geo import AiReadinessAudit, GeoKeyword, GeoScanResult
from app.models.project import Project
from app.models.task import Task, TaskStatus, TaskType
from app.models.user import UserRole
from app.services import ai_checker

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_project(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _create_task(project_id: uuid.UUID, task_type: TaskType, db: Session) -> Task:
    task = Task(
        id=uuid.uuid4(),
        project_id=project_id,
        type=task_type,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(tz=timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ── Keywords ──────────────────────────────────────────────────────────────────

class GeoKeywordIn(BaseModel):
    keyword: str
    source: str = "manual"


@router.get("/projects/{project_id}/geo/keywords")
def list_geo_keywords(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    kws = db.scalars(
        select(GeoKeyword)
        .where(GeoKeyword.project_id == project_id, GeoKeyword.is_active.is_(True))
        .order_by(GeoKeyword.created_at)
    ).all()
    return [{"id": str(k.id), "keyword": k.keyword, "source": k.source} for k in kws]


@router.post("/projects/{project_id}/geo/keywords", status_code=201)
def add_geo_keywords(
    project_id: uuid.UUID,
    body: list[GeoKeywordIn],
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    now = datetime.now(tz=timezone.utc)
    created = []
    for item in body:
        phrase = item.keyword.strip()
        if not phrase:
            continue
        kw = GeoKeyword(
            id=uuid.uuid4(),
            project_id=project_id,
            keyword=phrase,
            source=item.source,
            is_active=True,
            created_at=now,
        )
        db.add(kw)
        created.append(kw)
    db.commit()
    return [{"id": str(k.id), "keyword": k.keyword, "source": k.source} for k in created]


@router.delete("/projects/{project_id}/geo/keywords/{kw_id}", status_code=204)
def delete_geo_keyword(
    project_id: uuid.UUID,
    kw_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    kw = db.get(GeoKeyword, kw_id)
    if not kw or kw.project_id != project_id:
        raise HTTPException(status_code=404)
    kw.is_active = False
    db.commit()


# ── Available models ──────────────────────────────────────────────────────────

@router.get("/geo/models")
def list_available_models(current_user: CurrentUser):
    """Return available OpenRouter models for GEO scanning."""
    return [
        {"id": model_id, "name": name, "is_default": model_id in ai_checker.DEFAULT_SCAN_MODELS}
        for model_id, name in ai_checker.ONLINE_MODELS.items()
    ]


# ── Scan ──────────────────────────────────────────────────────────────────────

class ScanBody(BaseModel):
    keyword_ids: list[str]
    models: list[str] = ai_checker.DEFAULT_SCAN_MODELS


@router.post("/projects/{project_id}/geo/scan")
def start_geo_scan(
    project_id: uuid.UUID,
    body: ScanBody,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    if not body.keyword_ids:
        raise HTTPException(status_code=422, detail="Выберите хотя бы один запрос")
    if len(body.keyword_ids) > 50:
        raise HTTPException(status_code=422, detail="Максимум 50 запросов за один запуск")

    task = _create_task(project_id, TaskType.GEO_SCAN, db)
    try:
        from app.tasks.geo import task_geo_scan  # noqa: PLC0415
        task_geo_scan.delay(str(task.id), str(project_id), body.keyword_ids, body.models)
    except Exception as exc:
        logger.exception("Failed to dispatch task_geo_scan for project %s", project_id)
        task.status = TaskStatus.FAILED
        task.error = f"Не удалось запустить задачу: {exc}"
        db.commit()
        raise HTTPException(status_code=503, detail=f"Не удалось запустить задачу: {exc}")
    return {"task_id": str(task.id), "status": "pending"}


@router.get("/projects/{project_id}/geo/results")
def get_geo_results(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return scan results as a keyword × model matrix with AI Visibility Score."""
    _check_project(project_id, current_user, db)

    keywords = db.scalars(
        select(GeoKeyword).where(
            GeoKeyword.project_id == project_id,
            GeoKeyword.is_active.is_(True),
        )
    ).all()

    scan_rows = db.scalars(
        select(GeoScanResult)
        .where(GeoScanResult.project_id == project_id)
        .order_by(GeoScanResult.scanned_at.desc())
    ).all()

    # Keep only the latest result per keyword × model
    matrix: dict[str, dict[str, dict]] = {}
    for r in scan_rows:
        kid = str(r.keyword_id)
        if kid not in matrix:
            matrix[kid] = {}
        if r.ai_model not in matrix[kid]:
            matrix[kid][r.ai_model] = {
                "mentioned": r.mentioned,
                "position": r.mention_position,
                "sentiment": r.sentiment,
                "snippet": r.response_snippet,
                "competitor_domains": r.competitor_domains_json or [],
                "scanned_at": r.scanned_at.isoformat(),
            }

    rows = []
    for kw in keywords:
        kid = str(kw.id)
        rows.append({
            "keyword_id": kid,
            "keyword": kw.keyword,
            "source": kw.source,
            "results": matrix.get(kid, {}),
        })

    all_results = [v for kid in matrix.values() for v in kid.values()]
    score = (
        round(sum(1 for r in all_results if r["mentioned"]) / len(all_results) * 100)
        if all_results else None
    )

    all_competitors = [
        d
        for kid in matrix.values()
        for v in kid.values()
        for d in (v.get("competitor_domains") or [])
    ]
    top_competitors = [
        {"domain": d, "count": c}
        for d, c in Counter(all_competitors).most_common(10)
    ]

    return {
        "ai_visibility_score": score,
        "rows": rows,
        "top_competitors": top_competitors,
    }


# ── AI Readiness Audit ────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/geo/audit/run")
def run_geo_audit(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    task = _create_task(project_id, TaskType.GEO_AUDIT, db)
    try:
        from app.tasks.geo import task_geo_audit  # noqa: PLC0415
        task_geo_audit.delay(str(task.id), str(project_id))
    except Exception as exc:
        logger.exception("Failed to dispatch task_geo_audit for project %s", project_id)
        task.status = TaskStatus.FAILED
        task.error = f"Не удалось запустить задачу: {exc}"
        db.commit()
        raise HTTPException(status_code=503, detail=f"Не удалось запустить задачу: {exc}")
    return {"task_id": str(task.id), "status": "pending"}
    return {"task_id": str(task.id), "status": "pending"}


@router.get("/projects/{project_id}/geo/audit")
def get_latest_audit(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project(project_id, current_user, db)
    audit = db.scalar(
        select(AiReadinessAudit)
        .where(AiReadinessAudit.project_id == project_id)
        .order_by(desc(AiReadinessAudit.created_at))
    )
    if not audit:
        return None
    return {
        "id": str(audit.id),
        "ai_readiness_score": audit.ai_readiness_score,
        "blocked_bots": audit.blocked_bots_json,
        "cloudflare_detected": audit.cloudflare_detected,
        "has_llms_txt": audit.has_llms_txt,
        "llms_txt_content": audit.llms_txt_content,
        "has_about_page": audit.has_about_page,
        "has_author_page": audit.has_author_page,
        "pages_freshness": audit.pages_freshness_json,
        "audit_json": audit.audit_json,
        "created_at": audit.created_at.isoformat(),
    }


@router.get("/projects/{project_id}/geo/audit/llms-txt")
def generate_llms_txt_template(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Generate an llms.txt file template based on crawl data."""
    project = _check_project(project_id, current_user, db)

    latest_session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id)
        .order_by(desc(CrawlSession.started_at))
    )
    pages: list[dict] = []
    if latest_session:
        page_rows = db.scalars(
            select(Page)
            .where(Page.crawl_session_id == latest_session.id, Page.status_code == 200)
            .limit(20)
        ).all()
        pages = [{"url": p.url, "title": p.title} for p in page_rows]

    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    niche = brief.niche if brief else None

    content = ai_checker.generate_llms_txt(project.name, project.url or "", niche, pages)
    return {"content": content, "filename": "llms.txt"}
