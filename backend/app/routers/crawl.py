import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.config import get_settings
from app.db.session import get_db
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.project import Project
from app.models.task import Task, TaskType, TaskStatus

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    from app.models.user import UserRole
    project = db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


@router.post("/projects/{project_id}/crawl/start")
def start_crawl(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    cfg = get_settings()

    # Create crawl session
    session = CrawlSession(project_id=project_id, status=CrawlStatus.PENDING)
    db.add(session)
    db.flush()

    # Create task record
    task = Task(
        project_id=project_id,
        type=TaskType.CRAWL,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    db.refresh(session)

    # Dispatch Celery task
    from app.tasks.crawl import run_crawl
    celery_result = run_crawl.delay(
        str(task.id),
        str(session.id),
        str(project_id),
        project.url,
        {
            "crawl_delay_ms": cfg.crawl_delay_ms_default,
            "timeout_seconds": cfg.crawl_timeout_seconds,
            "max_pages": cfg.crawl_max_pages,
            "user_agent": cfg.crawl_user_agent,
            "respect_robots": cfg.crawl_respect_robots,
        },
    )

    task.celery_task_id = celery_result.id
    db.commit()

    return {"task_id": str(task.id), "session_id": str(session.id)}


@router.get("/projects/{project_id}/crawl/status")
def crawl_status(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id)
        .order_by(CrawlSession.started_at.desc())
    )
    if not session:
        return {"status": "not_started"}
    return {
        "session_id": str(session.id),
        "status": session.status.value,
        "pages_done": session.pages_done,
        "pages_total": session.pages_total,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "finished_at": session.finished_at.isoformat() if session.finished_at else None,
        "error": session.error,
    }


@router.get("/projects/{project_id}/crawl/pages")
def get_pages(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(50, le=500),
    offset: int = 0,
    issue: str | None = None,  # no_title, no_description, no_h1, noindex, slow
):
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        raise HTTPException(status_code=404, detail="No completed crawl found")

    q = select(Page).where(Page.crawl_session_id == session.id)

    all_pages = db.scalars(select(Page).where(Page.crawl_session_id == session.id)).all()

    if issue == "no_title":
        q = q.where(Page.title.is_(None))
    elif issue == "no_description":
        q = q.where(Page.description.is_(None))
    elif issue == "no_h1":
        q = q.where(Page.h1.is_(None))
    elif issue == "noindex":
        q = q.where(Page.robots_meta.like("%noindex%"))
    elif issue == "slow":
        q = q.where(Page.load_time_ms > 3000)
    elif issue == "orphan":
        orphan_urls = _get_orphan_urls(all_pages)
        if orphan_urls:
            q = q.where(Page.url.in_(list(orphan_urls)))
        else:
            q = q.where(False)
    elif issue == "dup_title":
        dup_titles = _get_duplicate_values([p.title for p in all_pages if p.title])
        if dup_titles:
            q = q.where(Page.title.in_(list(dup_titles)))
        else:
            q = q.where(False)
    elif issue == "dup_description":
        dup_descs = _get_duplicate_values([p.description for p in all_pages if p.description])
        if dup_descs:
            q = q.where(Page.description.in_(list(dup_descs)))
        else:
            q = q.where(False)

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    pages = db.scalars(q.offset(offset).limit(limit)).all()

    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "url": p.url,
                "status_code": p.status_code,
                "title": p.title,
                "description": p.description,
                "h1": p.h1,
                "robots_meta": p.robots_meta,
                "word_count": p.word_count,
                "load_time_ms": p.load_time_ms,
                "images_without_alt": p.images_without_alt,
                "og_title": p.og_title,
                "og_image": p.og_image,
            }
            for p in pages
        ],
    }


@router.get("/projects/{project_id}/crawl/report")
def crawl_report(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Summary report of crawl issues."""
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        raise HTTPException(status_code=404, detail="No completed crawl found")

    pages = db.scalars(select(Page).where(Page.crawl_session_id == session.id)).all()
    total = len(pages)

    title_counts = Counter(p.title for p in pages if p.title)
    desc_counts = Counter(p.description for p in pages if p.description)
    orphan_urls = _get_orphan_urls(pages)

    return {
        "session_id": str(session.id),
        "pages_total": total,
        "no_title": sum(1 for p in pages if not p.title),
        "no_description": sum(1 for p in pages if not p.description),
        "no_h1": sum(1 for p in pages if not p.h1),
        "noindex_pages": sum(1 for p in pages if p.robots_meta and "noindex" in p.robots_meta),
        "slow_pages": sum(1 for p in pages if p.load_time_ms > 3000),
        "images_without_alt": sum(p.images_without_alt for p in pages),
        "no_og_image": sum(1 for p in pages if not p.og_image),
        "dup_title": sum(1 for t, c in title_counts.items() if c > 1),
        "dup_description": sum(1 for d, c in desc_counts.items() if c > 1),
        "orphan_pages": len(orphan_urls),
    }


def _get_orphan_urls(pages: list) -> set:
    """Return set of page URLs that have no incoming internal links."""
    linked_to: set[str] = set()
    for p in pages:
        for link in (p.internal_links or []):
            normalized = link.split("#")[0].split("?")[0].rstrip("/")
            linked_to.add(normalized)
    orphans = set()
    for i, p in enumerate(pages):
        if i == 0:
            continue  # skip root
        normalized = p.url.split("#")[0].split("?")[0].rstrip("/")
        if normalized not in linked_to:
            orphans.add(p.url)
    return orphans


def _get_duplicate_values(values: list[str]) -> set[str]:
    """Return set of values that appear more than once."""
    counts = Counter(values)
    return {v for v, c in counts.items() if c > 1}


@router.get("/projects/{project_id}/crawl/tree")
def crawl_tree(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Return URL tree structure for crawled pages."""
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        raise HTTPException(status_code=404, detail="No completed crawl found")

    pages = db.scalars(select(Page).where(Page.crawl_session_id == session.id)).all()

    def build_tree(url_list: list) -> dict:
        tree: dict = {}
        for url, title, status_code in url_list:
            parsed = urlparse(url)
            parts = [p for p in parsed.path.split("/") if p]
            if not parts:
                parts = ["(root)"]
            node = tree
            for i, part in enumerate(parts):
                if part not in node:
                    node[part] = {"children": {}, "pages": []}
                if i == len(parts) - 1:
                    node[part]["pages"].append({"url": url, "title": title, "status_code": status_code})
                node = node[part]["children"]
        return tree

    url_list = [(p.url, p.title, p.status_code) for p in pages]
    tree = build_tree(url_list)
    return {"tree": tree, "total": len(pages)}
