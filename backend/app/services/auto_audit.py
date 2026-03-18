"""Auto-audit service — runs SEO checklist automatically after crawling completes."""
from __future__ import annotations

import logging
import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crawl import CrawlSession, CrawlStatus, Page

logger = logging.getLogger(__name__)


def run_seo_checklist(project_id: uuid.UUID, db: Session) -> dict:
    """Compute the 19-point SEO checklist for the latest completed crawl.

    Returns the same structure as the /seo/checklist endpoint.
    Can be called from Celery tasks or API endpoints.
    """
    crawl = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not crawl:
        return {"status": "no_crawl", "items": [], "score": 0}

    pages = db.scalars(select(Page).where(Page.crawl_session_id == crawl.id)).all()
    total = len(pages)
    if total == 0:
        return {"status": "empty", "items": [], "score": 0}

    def pct(n: int) -> str:
        return f"{round(n / total * 100)}%"

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

    def item(category: str, name: str, count: int, ok_if_zero: bool = True, description: str = "") -> dict:
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
    score = round(score_ok / len(items) * 100)

    return {
        "status": "done",
        "pages_total": total,
        "score": score,
        "items": items,
        "crawl_date": crawl.finished_at.isoformat() if crawl.finished_at else None,
    }
