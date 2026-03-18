import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.config import get_settings
from app.db.session import get_db
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.project import Project
from app.models.task import Task, TaskStatus, TaskType

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    from app.models.user import UserRole
    project = db.scalar(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


@router.post("/projects/{project_id}/crawl/start")
def start_crawl(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    # Check if crawl is already running (FOR UPDATE prevents race condition)
    running = db.scalar(
        select(CrawlSession).where(
            CrawlSession.project_id == project_id,
            CrawlSession.status.in_([CrawlStatus.PENDING, CrawlStatus.RUNNING])
        ).with_for_update(skip_locked=True)
    )
    if running:
        raise HTTPException(status_code=409, detail="Crawl already in progress for this project")

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
    elif issue == "multi_h1":
        q = q.where(Page.h1_count > 1)
    elif issue == "orphan":
        # Load only URLs and internal_links for orphan detection (not full Page objects)
        link_rows = db.execute(
            select(Page.url, Page.internal_links)
            .where(Page.crawl_session_id == session.id)
        ).all()
        linked_to: set[str] = set()
        all_urls: list[str] = []
        for row_url, row_links in link_rows:
            all_urls.append(row_url)
            for link in (row_links or []):
                linked_to.add(link.split("#")[0].split("?")[0].rstrip("/"))
        orphan_urls = set()
        for i, u in enumerate(all_urls):
            if i == 0:
                continue
            if u.split("#")[0].split("?")[0].rstrip("/") not in linked_to:
                orphan_urls.add(u)
        if orphan_urls:
            q = q.where(Page.url.in_(list(orphan_urls)))
        else:
            q = q.where(False)
    elif issue == "dup_title":
        # Use SQL subquery to find duplicate titles
        dup_subq = (
            select(Page.title)
            .where(Page.crawl_session_id == session.id, Page.title.isnot(None))
            .group_by(Page.title)
            .having(func.count(Page.id) > 1)
        ).subquery()
        q = q.where(Page.title.in_(select(dup_subq.c.title)))
    elif issue == "dup_description":
        dup_subq = (
            select(Page.description)
            .where(Page.crawl_session_id == session.id, Page.description.isnot(None))
            .group_by(Page.description)
            .having(func.count(Page.id) > 1)
        ).subquery()
        q = q.where(Page.description.in_(select(dup_subq.c.description)))

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
                "h1_count": p.h1_count,
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
        "multi_h1": sum(1 for p in pages if p.h1_count > 1),
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


@router.get("/projects/{project_id}/crawl/linking")
def crawl_linking(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Internal linking analysis using crawled page data."""
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        raise HTTPException(status_code=404, detail="No completed crawl found")

    pages = db.scalars(select(Page).where(Page.crawl_session_id == session.id)).all()
    if not pages:
        return {"pages": [], "stats": {"total": 0, "orphans": 0, "hubs": 0, "isolated": 0}}

    # Build adjacency
    url_set = {p.url for p in pages}
    incoming: dict[str, set[str]] = {p.url: set() for p in pages}
    outgoing: dict[str, set[str]] = {p.url: set() for p in pages}

    for page in pages:
        for link in (page.internal_links or []):
            link_clean = link.split("#")[0].split("?")[0]
            if link_clean in url_set and link_clean != page.url:
                outgoing[page.url].add(link_clean)
                incoming[link_clean].add(page.url)

    # Homepage = first page (lowest URL or first in list)
    homepage = pages[0].url

    max_incoming = max((len(v) for v in incoming.values()), default=0)
    hub_threshold = max(max_incoming * 0.5, 5) if max_incoming > 0 else 5

    result_pages = []
    for page in pages:
        inc = len(incoming[page.url])
        out = len(outgoing[page.url])
        is_orphan = inc == 0 and page.url != homepage
        is_hub = inc >= hub_threshold
        is_isolated = inc == 0 and out == 0
        result_pages.append({
            "url": page.url,
            "title": page.title,
            "incoming_count": inc,
            "outgoing_count": out,
            "is_orphan": is_orphan,
            "is_hub": is_hub,
            "is_isolated": is_isolated,
        })

    result_pages.sort(key=lambda x: x["incoming_count"], reverse=True)

    stats = {
        "total": len(pages),
        "orphans": sum(1 for p in result_pages if p["is_orphan"]),
        "hubs": sum(1 for p in result_pages if p["is_hub"]),
        "isolated": sum(1 for p in result_pages if p["is_isolated"]),
    }

    return {"pages": result_pages, "stats": stats}


@router.get("/projects/{project_id}/crawl/redirects")
def crawl_redirects(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Redirect chain analysis."""
    _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        raise HTTPException(status_code=404, detail="No completed crawl found")

    pages = db.scalars(
        select(Page)
        .where(Page.crawl_session_id == session.id, Page.redirect_chain.isnot(None))
    ).all()

    chains = []
    stats = {"total": 0, "ok": 0, "warn": 0, "error": 0, "loops": 0}

    for page in pages:
        chain = page.redirect_chain or []
        if not chain:
            continue

        length = len(chain)
        final_url = chain[-1] if chain else page.url

        # Detect loops
        is_loop = len(set(chain)) < len(chain) or page.url in chain

        if is_loop:
            severity = "error"
            stats["loops"] += 1
        elif length == 1:
            severity = "ok"
            stats["ok"] += 1
        elif length == 2:
            severity = "warn"
            stats["warn"] += 1
        else:
            severity = "error"
            stats["error"] += 1

        stats["total"] += 1
        chains.append({
            "url": page.url,
            "final_url": final_url,
            "chain": chain,
            "length": length,
            "severity": severity,
            "is_loop": is_loop,
        })

    chains.sort(key=lambda x: x["length"], reverse=True)
    return {"chains": chains, "stats": stats}


@router.get("/projects/{project_id}/crawl/robots-audit")
async def robots_audit(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Audit robots.txt and sitemap against crawled pages."""
    import re as _re

    import httpx

    project = _check_project_access(project_id, current_user, db)
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )

    base_url = project.url.rstrip("/")
    crawled_urls = set()
    if session:
        pages = db.scalars(select(Page.url).where(Page.crawl_session_id == session.id)).all()
        crawled_urls = set(pages)

    # Fetch robots.txt
    robots_data = {"found": False, "disallow_rules": [], "sitemap_urls": []}
    disallow_rules = []
    sitemap_urls = []

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base_url}/robots.txt")
            if r.status_code == 200:
                robots_data["found"] = True
                lines = r.text.splitlines()
                current_agent = None
                for line in lines:
                    line = line.strip()
                    if line.lower().startswith("user-agent:"):
                        current_agent = line.split(":", 1)[1].strip()
                    elif line.lower().startswith("disallow:") and current_agent in ("*", None):
                        path = line.split(":", 1)[1].strip()
                        if path:
                            disallow_rules.append(path)
                    elif line.lower().startswith("sitemap:"):
                        sm_url = line.split(":", 1)[1].strip()
                        if sm_url.startswith("/"):
                            sm_url = base_url + sm_url
                        sitemap_urls.append(sm_url)
                robots_data["disallow_rules"] = disallow_rules
                robots_data["sitemap_urls"] = sitemap_urls
    except Exception as e:
        logger.warning("Failed to fetch/parse robots.txt for %s: %s", base_url, str(e)[:200])

    # Fetch sitemap
    sitemap_page_urls: set[str] = set()
    sitemap_to_fetch = sitemap_urls or [f"{base_url}/sitemap.xml"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for sm_url in sitemap_to_fetch[:3]:
                r = await client.get(sm_url)
                if r.status_code == 200:
                    found = _re.findall(r"<loc>(.*?)</loc>", r.text)
                    sitemap_page_urls.update(found)
    except Exception as e:
        logger.warning("Failed to fetch/parse sitemap for %s: %s", base_url, str(e)[:200])

    # Cross-reference
    def is_disallowed(url: str) -> bool:
        path = url.replace(base_url, "") or "/"
        for rule in disallow_rules:
            if path.startswith(rule):
                return True
        return False

    disallowed_but_crawled = [u for u in crawled_urls if is_disallowed(u)]
    in_sitemap_not_crawled = list(sitemap_page_urls - crawled_urls)[:50]
    crawled_not_in_sitemap = len(crawled_urls - sitemap_page_urls)

    return {
        "robots_txt": robots_data,
        "sitemap_urls_found": len(sitemap_page_urls),
        "audit": {
            "disallowed_but_crawled": disallowed_but_crawled[:50],
            "crawled_not_in_sitemap_count": crawled_not_in_sitemap,
            "in_sitemap_not_crawled": in_sitemap_not_crawled,
        },
    }


class CwvRequest(BaseModel):
    urls: list[str]
    strategy: str = "mobile"


@router.post("/projects/{project_id}/crawl/cwv")
async def run_cwv(
    project_id: uuid.UUID,
    body: CwvRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Fetch Core Web Vitals for given URLs via PageSpeed API."""
    from app.services.pagespeed import get_cwv
    from app.services.settings_service import get_setting

    if len(body.urls) > 10:
        raise HTTPException(status_code=400, detail="Max 10 URLs per request")

    _check_project_access(project_id, current_user, db)
    api_key = get_setting("pagespeed_api_key", db)  # optional

    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )

    results = []
    for url in body.urls:
        try:
            data = await get_cwv(url, api_key=api_key, strategy=body.strategy)
            results.append({"url": url, "success": True, **data})

            # Save to Page model if in latest crawl
            if session:
                page = db.scalar(
                    select(Page).where(
                        Page.crawl_session_id == session.id,
                        Page.url == url,
                    )
                )
                if page:
                    if data.get("lcp") is not None:
                        page.cwv_lcp = data["lcp"]
                    if data.get("cls") is not None:
                        page.cwv_cls = data["cls"]
                    if data.get("fid") is not None:
                        page.cwv_fid = data["fid"]
                    db.commit()
        except Exception as e:
            results.append({"url": url, "success": False, "error": str(e)[:200]})

    return {"results": results, "strategy": body.strategy}


@router.get("/projects/{project_id}/crawl/tree")
def crawl_tree(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(1000, ge=1, le=5000),
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

    pages = db.scalars(select(Page).where(Page.crawl_session_id == session.id).limit(limit)).all()

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
