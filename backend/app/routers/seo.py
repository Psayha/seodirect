"""SEO module: meta tags audit + generation, OG tags audit, technical checklist."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.seo import SeoPageMeta
from app.models.task import Task, TaskType, TaskStatus

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_latest_crawl(project_id: uuid.UUID, db: Session) -> CrawlSession | None:
    return db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )


def _meta_dict(page: Page, meta: SeoPageMeta | None) -> dict:
    return {
        "page_url": page.url,
        "current_title": page.title,
        "current_description": page.description,
        "current_og_title": page.og_title,
        "current_og_description": page.og_description,
        "current_og_image": page.og_image,
        "rec_title": meta.rec_title if meta else None,
        "rec_description": meta.rec_description if meta else None,
        "rec_og_title": meta.rec_og_title if meta else None,
        "rec_og_description": meta.rec_og_description if meta else None,
        "meta_id": str(meta.id) if meta else None,
        "manually_edited": meta.manually_edited if meta else False,
        "generated_at": meta.generated_at.isoformat() if meta and meta.generated_at else None,
        # Issues
        "has_title_issue": not page.title or len(page.title) < 10 or len(page.title) > 70,
        "has_desc_issue": not page.description or len(page.description) < 50 or len(page.description) > 160,
        "has_og_issue": not page.og_title or not page.og_description,
    }


# ─── Pages list (meta audit) ─────────────────────────────────────────────────

@router.get("/projects/{project_id}/seo/pages")
def list_seo_pages(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    issues_only: bool = False,
    limit: int = 100,
    offset: int = 0,
):
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        return {"pages": [], "total": 0, "crawl_status": "not_done"}

    q = select(Page).where(Page.crawl_session_id == crawl.id)
    if issues_only:
        from sqlalchemy import or_
        q = q.where(
            or_(
                Page.title.is_(None),
                Page.description.is_(None),
                func.length(Page.title) < 10,
                func.length(Page.title) > 70,
                func.length(Page.description) < 50,
                func.length(Page.description) > 160,
            )
        )

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    pages = db.scalars(q.order_by(Page.url).offset(offset).limit(limit)).all()

    # Fetch recommendations for these pages
    page_urls = [p.url for p in pages]
    metas = db.scalars(
        select(SeoPageMeta)
        .where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url.in_(page_urls))
    ).all()
    meta_by_url = {m.page_url: m for m in metas}

    return {
        "pages": [_meta_dict(p, meta_by_url.get(p.url)) for p in pages],
        "total": total,
        "crawl_status": "done",
    }


# ─── Update a single page meta ────────────────────────────────────────────────

class MetaUpdate(BaseModel):
    rec_title: str | None = None
    rec_description: str | None = None
    rec_og_title: str | None = None
    rec_og_description: str | None = None


@router.patch("/projects/{project_id}/seo/meta")
def update_page_meta(
    project_id: uuid.UUID,
    body: MetaUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    page_url: str = "",
):
    if not page_url:
        raise HTTPException(status_code=400, detail="page_url required")
    meta = db.scalar(
        select(SeoPageMeta)
        .where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url == page_url)
    )
    if not meta:
        meta = SeoPageMeta(project_id=project_id, page_url=page_url)
        db.add(meta)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(meta, field, value)
    meta.manually_edited = True
    db.commit()
    db.refresh(meta)
    return {"ok": True, "meta_id": str(meta.id)}


# ─── Generate meta via Claude (async Celery) ──────────────────────────────────

@router.post("/projects/{project_id}/seo/generate-meta")
def generate_seo_meta(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    generate_og: bool = False,
):
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="Нет завершённого парсинга. Сначала запустите парсинг сайта.")

    task = Task(
        project_id=project_id,
        type=TaskType.GENERATE_SEO_META,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.seo import task_generate_seo_meta
    result = task_generate_seo_meta.delay(str(task.id), str(project_id), generate_og)
    task.celery_task_id = result.id
    db.commit()

    return {"task_id": str(task.id)}


# ─── Task status polling ──────────────────────────────────────────────────────

@router.get("/projects/{project_id}/seo/task/{task_id}")
def get_seo_task_status(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "task_id": str(task.id),
        "status": task.status.value,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
    }


# ─── Technical SEO Checklist ─────────────────────────────────────────────────

@router.get("/projects/{project_id}/seo/checklist")
def seo_checklist(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        return {"status": "no_crawl", "items": []}

    pages = db.scalars(select(Page).where(Page.crawl_session_id == crawl.id)).all()
    total = len(pages)
    if total == 0:
        return {"status": "empty", "items": []}

    def pct(n: int) -> str:
        return f"{round(n / total * 100)}%"

    no_title = sum(1 for p in pages if not p.title)
    short_title = sum(1 for p in pages if p.title and len(p.title) < 10)
    long_title = sum(1 for p in pages if p.title and len(p.title) > 70)
    no_desc = sum(1 for p in pages if not p.description)
    short_desc = sum(1 for p in pages if p.description and len(p.description) < 50)
    long_desc = sum(1 for p in pages if p.description and len(p.description) > 160)
    no_h1 = sum(1 for p in pages if not p.h1)
    noindex = sum(1 for p in pages if p.robots_meta and "noindex" in p.robots_meta.lower())
    slow = sum(1 for p in pages if p.load_time_ms > 3000)
    images_no_alt = sum(p.images_without_alt or 0 for p in pages)
    no_canonical = sum(1 for p in pages if not p.canonical)
    no_og_title = sum(1 for p in pages if not p.og_title)
    no_og_desc = sum(1 for p in pages if not p.og_description)
    no_og_image = sum(1 for p in pages if not p.og_image)
    errors_4xx = sum(1 for p in pages if p.status_code and 400 <= p.status_code < 500)
    errors_5xx = sum(1 for p in pages if p.status_code and p.status_code >= 500)

    def item(category, name, count, ok_if_zero=True, description=""):
        status = "ok" if (count == 0 if ok_if_zero else count == total) else ("warn" if count < total * 0.2 else "error")
        return {
            "category": category,
            "name": name,
            "count": count,
            "total": total,
            "pct": pct(count),
            "status": status,
            "description": description,
        }

    items = [
        item("Мета-теги", "Страниц без title", no_title),
        item("Мета-теги", "Title слишком короткий (<10 симв.)", short_title),
        item("Мета-теги", "Title слишком длинный (>70 симв.)", long_title),
        item("Мета-теги", "Страниц без description", no_desc),
        item("Мета-теги", "Description слишком короткий (<50 симв.)", short_desc),
        item("Мета-теги", "Description слишком длинный (>160 симв.)", long_desc),
        item("Структура", "Страниц без H1", no_h1),
        item("Структура", "noindex страниц", noindex, description="Проверьте, нужен ли noindex"),
        item("Структура", "Страниц без canonical", no_canonical),
        item("Производительность", "Медленных страниц (>3с)", slow),
        item("Изображения", "Картинок без alt", images_no_alt),
        item("OpenGraph", "Страниц без og:title", no_og_title),
        item("OpenGraph", "Страниц без og:description", no_og_desc),
        item("OpenGraph", "Страниц без og:image", no_og_image),
        item("Ошибки", "Страниц 4xx", errors_4xx),
        item("Ошибки", "Страниц 5xx", errors_5xx),
    ]

    score_ok = sum(1 for i in items if i["status"] == "ok")
    return {
        "status": "done",
        "pages_total": total,
        "score": round(score_ok / len(items) * 100),
        "items": items,
        "crawl_date": crawl.finished_at.isoformat() if crawl.finished_at else None,
    }
