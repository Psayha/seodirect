"""SEO module: meta tags audit + generation, OG tags audit, technical checklist."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.limiter import limiter
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.meta_history import SeoMetaHistory
from app.models.seo import SeoPageMeta
from app.models.task import Task, TaskStatus, TaskType

logger = logging.getLogger(__name__)

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
        "twitter_card": meta.twitter_card if meta else None,
        "twitter_title": meta.twitter_title if meta else None,
        "twitter_description": meta.twitter_description if meta else None,
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
    twitter_card: str | None = None
    twitter_title: str | None = None
    twitter_description: str | None = None


@router.patch("/projects/{project_id}/seo/meta")
def update_page_meta(
    project_id: uuid.UUID,
    body: MetaUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
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
        db.flush()

    changed_fields = body.model_dump(exclude_none=True)
    changed_by = current_user.login if hasattr(current_user, "login") else str(current_user.id)

    # Track changes in history
    for field, new_value in changed_fields.items():
        old_value = getattr(meta, field, None)
        if str(old_value or "") != str(new_value or ""):
            history_entry = SeoMetaHistory(
                project_id=project_id,
                page_url=page_url,
                field_name=field,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(new_value) if new_value is not None else None,
                changed_by=changed_by,
            )
            db.add(history_entry)

    for field, value in changed_fields.items():
        setattr(meta, field, value)
    meta.manually_edited = True
    db.commit()
    db.refresh(meta)
    return {"ok": True, "meta_id": str(meta.id)}


@router.get("/projects/{project_id}/seo/meta-history")
def get_meta_history(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    page_url: str | None = None,
):
    """Return last 50 meta changes for a project (optionally filtered by page_url)."""
    q = select(SeoMetaHistory).where(SeoMetaHistory.project_id == project_id)
    if page_url:
        q = q.where(SeoMetaHistory.page_url == page_url)
    q = q.order_by(SeoMetaHistory.changed_at.desc()).limit(50)
    items = db.scalars(q).all()
    return [
        {
            "id": str(h.id),
            "page_url": h.page_url,
            "field_name": h.field_name,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "changed_by": h.changed_by,
            "changed_at": h.changed_at.isoformat(),
        }
        for h in items
    ]


# ─── Generate meta via Claude (async Celery) ──────────────────────────────────

class GenerateMetaRequest(BaseModel):
    generate_og: bool = False
    page_urls: Optional[list[Annotated[str, StringConstraints(max_length=2048)]]] = None  # if None, generate for ALL pages
    only_missing: bool = False  # only pages without title/description
    only_issues: bool = False   # only pages with SEO issues


@router.post("/projects/{project_id}/seo/generate-meta")
@limiter.limit("10/minute")
def generate_seo_meta(
    request: Request,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
    body: GenerateMetaRequest = None,
):
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="Нет завершённого парсинга. Сначала запустите парсинг сайта.")

    if body is None:
        body = GenerateMetaRequest()

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
    result = task_generate_seo_meta.delay(
        str(task.id),
        str(project_id),
        body.generate_og,
        body.page_urls,
        body.only_missing,
        body.only_issues,
    )
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

    from collections import Counter

    no_title = sum(1 for p in pages if not p.title)
    short_title = sum(1 for p in pages if p.title and len(p.title) < 10)
    long_title = sum(1 for p in pages if p.title and len(p.title) > 70)
    no_desc = sum(1 for p in pages if not p.description)
    short_desc = sum(1 for p in pages if p.description and len(p.description) < 50)
    long_desc = sum(1 for p in pages if p.description and len(p.description) > 160)
    no_h1 = sum(1 for p in pages if not p.h1)
    multi_h1 = sum(1 for p in pages if p.h1_count > 1)
    noindex = sum(1 for p in pages if p.robots_meta and "noindex" in p.robots_meta.lower())
    slow = sum(1 for p in pages if p.load_time_ms > 3000)
    images_no_alt = sum(p.images_without_alt or 0 for p in pages)
    no_canonical = sum(1 for p in pages if not p.canonical)
    no_og_title = sum(1 for p in pages if not p.og_title)
    no_og_desc = sum(1 for p in pages if not p.og_description)
    no_og_image = sum(1 for p in pages if not p.og_image)
    errors_4xx = sum(1 for p in pages if p.status_code and 400 <= p.status_code < 500)
    errors_5xx = sum(1 for p in pages if p.status_code and p.status_code >= 500)

    title_counts = Counter(p.title for p in pages if p.title)
    dup_title = sum(1 for p in pages if p.title and title_counts[p.title] > 1)
    desc_counts = Counter(p.description for p in pages if p.description)
    dup_desc = sum(1 for p in pages if p.description and desc_counts[p.description] > 1)

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
        item("Мета-теги", "Дублирующихся title", dup_title, description="Одинаковый title на нескольких страницах"),
        item("Мета-теги", "Страниц без description", no_desc),
        item("Мета-теги", "Description слишком короткий (<50 симв.)", short_desc),
        item("Мета-теги", "Description слишком длинный (>160 симв.)", long_desc),
        item("Мета-теги", "Дублирующихся description", dup_desc, description="Одинаковый description на нескольких страницах"),
        item("Структура", "Страниц без H1", no_h1),
        item("Структура", "Страниц с несколькими H1", multi_h1, description="На странице более одного тега H1"),
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


# ─── SEO Keyword Clustering ───────────────────────────────────────────────────

def _cluster_keywords(phrases: list[str]) -> list[dict]:
    """Group keyword phrases by shared semantic roots.

    Algorithm:
    1. Tokenise each phrase into significant words (≥4 chars, non-stop)
    2. Build co-occurrence graph: phrases sharing ≥1 significant token are
       in the same cluster (union-find)
    3. Name each cluster by the most frequent token across its members
    4. Sort clusters by size descending
    """
    STOP = {
        "как", "что", "для", "при", "без", "под", "про", "над", "или",
        "это", "так", "все", "уже", "там", "вот", "здесь", "где", "когда",
        "цена", "цены", "купить", "заказать", "онлайн", "недорого",
    }

    def tokens(phrase: str) -> list[str]:
        return [w.lower() for w in phrase.split() if len(w) >= 4 and w.lower() not in STOP]

    # Union-Find
    parent = list(range(len(phrases)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        parent[find(x)] = find(y)

    token_to_indices: dict[str, list[int]] = {}
    for i, ph in enumerate(phrases):
        for t in tokens(ph):
            token_to_indices.setdefault(t, []).append(i)

    for indices in token_to_indices.values():
        for j in range(1, len(indices)):
            union(indices[0], indices[j])

    # Group by root
    groups: dict[int, list[int]] = {}
    for i in range(len(phrases)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    # Build cluster objects
    clusters = []
    for root, indices in groups.items():
        member_phrases = [phrases[i] for i in indices]

        # Name = most frequent significant token among members
        freq: dict[str, int] = {}
        for ph in member_phrases:
            for t in tokens(ph):
                freq[t] = freq.get(t, 0) + 1
        name = max(freq, key=lambda t: freq[t]) if freq else member_phrases[0]

        clusters.append({
            "cluster_name": name,
            "keywords": member_phrases,
            "count": len(member_phrases),
        })

    clusters.sort(key=lambda c: c["count"], reverse=True)
    return clusters


@router.post("/projects/{project_id}/seo/cluster")
async def cluster_keywords(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Cluster all Direct keywords for the project by semantic similarity.

    Returns a list of clusters each with a suggested name and keyword members.
    Optionally uses Topvisor clustering API if the project has a linked
    Topvisor project and the API key is configured.
    """
    from sqlalchemy import select

    from app.models.direct import AdGroup, Campaign, Keyword

    # Collect all Direct keywords for this project
    campaigns = db.scalars(
        select(Campaign).where(Campaign.project_id == project_id)
    ).all()
    if not campaigns:
        return {"source": "local", "clusters": [], "total_keywords": 0}

    campaign_ids = [c.id for c in campaigns]
    groups = db.scalars(
        select(AdGroup).where(AdGroup.campaign_id.in_(campaign_ids))
    ).all()
    group_ids = [g.id for g in groups]

    keywords = db.scalars(
        select(Keyword).where(Keyword.ad_group_id.in_(group_ids))
    ).all() if group_ids else []

    phrases = [kw.phrase for kw in keywords]
    if not phrases:
        return {"source": "local", "clusters": [], "total_keywords": 0}

    # Try Topvisor clustering if project is linked and API key exists
    from app.models.project import Project as ProjectModel
    prj = db.get(ProjectModel, project_id)
    if prj and prj.topvisor_project_id:
        from app.services.settings_service import get_setting
        from app.services.topvisor import get_topvisor_client_key
        api_key = get_setting("topvisor_api_key", db)
        if api_key:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=20) as client:
                    r = await client.post(
                        "https://api.topvisor.com/v2/json/get/keywords_2/claster",
                        headers={"Authorization": f"bearer {api_key}", "Content-Type": "application/json"},
                        json={"project_id": prj.topvisor_project_id, "keywords": phrases},
                    )
                if r.status_code == 200:
                    tv_clusters = r.json().get("result", [])
                    if tv_clusters:
                        return {
                            "source": "topvisor",
                            "clusters": tv_clusters,
                            "total_keywords": len(phrases),
                        }
            except Exception:
                pass  # fall through to local clustering

    clusters = _cluster_keywords(phrases)
    return {
        "source": "local",
        "clusters": clusters,
        "total_keywords": len(phrases),
    }

