"""OpenGraph audit router."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.seo import SeoPageMeta

router = APIRouter()


def _get_latest_crawl(project_id: uuid.UUID, db: Session) -> CrawlSession | None:
    return db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )


@router.get("/projects/{project_id}/og/audit")
def og_audit(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    issues_only: bool = False,
    limit: int = 100,
    offset: int = 0,
):
    """OG audit: current og tags per page + recommended ones."""
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        return {"pages": [], "total": 0, "stats": {}, "crawl_status": "not_done"}

    q = select(Page).where(Page.crawl_session_id == crawl.id)
    if issues_only:
        from sqlalchemy import or_
        q = q.where(
            or_(
                Page.og_title.is_(None),
                Page.og_description.is_(None),
                Page.og_image.is_(None),
            )
        )

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    pages = db.scalars(q.order_by(Page.url).offset(offset).limit(limit)).all()

    # Fetch existing recommendations
    urls = [p.url for p in pages]
    metas = db.scalars(
        select(SeoPageMeta)
        .where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url.in_(urls))
    ).all()
    meta_by_url = {m.page_url: m for m in metas}

    all_pages = db.scalars(select(Page).where(Page.crawl_session_id == crawl.id)).all()
    stats = {
        "total": len(all_pages),
        "has_og_title": sum(1 for p in all_pages if p.og_title),
        "has_og_description": sum(1 for p in all_pages if p.og_description),
        "has_og_image": sum(1 for p in all_pages if p.og_image),
        "fully_ok": sum(1 for p in all_pages if p.og_title and p.og_description and p.og_image),
    }

    result = []
    for p in pages:
        meta = meta_by_url.get(p.url)
        result.append({
            "page_url": p.url,
            # Current
            "og_title": p.og_title,
            "og_description": p.og_description,
            "og_image": p.og_image,
            "og_type": p.og_type,
            # Recommended (from SeoPageMeta)
            "rec_og_title": meta.rec_og_title if meta else None,
            "rec_og_description": meta.rec_og_description if meta else None,
            "twitter_card": meta.twitter_card if meta else None,
            "twitter_title": meta.twitter_title if meta else None,
            "twitter_description": meta.twitter_description if meta else None,
            "meta_id": str(meta.id) if meta else None,
            # Status
            "missing_title": not p.og_title,
            "missing_description": not p.og_description,
            "missing_image": not p.og_image,
            "has_rec": bool(meta and (meta.rec_og_title or meta.rec_og_description)),
        })

    return {
        "pages": result,
        "total": total,
        "stats": stats,
        "crawl_status": "done",
    }


@router.post("/projects/{project_id}/og/generate")
def generate_og_tags(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Trigger async Claude generation of OG tags (reuses SEO task with generate_og=True)."""
    from datetime import datetime, timezone
    from app.models.task import Task, TaskType, TaskStatus

    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="Нет завершённого парсинга")

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
    result = task_generate_seo_meta.delay(str(task.id), str(project_id), True)
    task.celery_task_id = result.id
    db.commit()

    return {"task_id": str(task.id)}


@router.get("/projects/{project_id}/og/export-html")
def export_og_html(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Export all recommended OG tags as HTML snippets per page."""
    metas = db.scalars(
        select(SeoPageMeta)
        .where(
            SeoPageMeta.project_id == project_id,
            SeoPageMeta.rec_og_title.isnot(None),
        )
    ).all()

    snippets = []
    for m in metas:
        html_parts = [f"<!-- Open Graph: {m.page_url} -->"]
        if m.rec_og_title:
            html_parts.append(f'<meta property="og:title" content="{m.rec_og_title}" />')
        if m.rec_og_description:
            html_parts.append(f'<meta property="og:description" content="{m.rec_og_description}" />')
        html_parts.append('<meta property="og:type" content="website" />')
        html_parts.append(f'<meta property="og:url" content="{m.page_url}" />')
        # Twitter Card
        if m.twitter_card or m.twitter_title or m.twitter_description:
            html_parts.append(f'<meta name="twitter:card" content="{m.twitter_card or "summary_large_image"}" />')
            if m.twitter_title:
                html_parts.append(f'<meta name="twitter:title" content="{m.twitter_title}" />')
            if m.twitter_description:
                html_parts.append(f'<meta name="twitter:description" content="{m.twitter_description}" />')
        snippets.append({
            "page_url": m.page_url,
            "html": "\n".join(html_parts),
        })

    return {"snippets": snippets, "total": len(snippets)}
