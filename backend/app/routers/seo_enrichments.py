"""SEO enrichments module: Schema.org generation, FAQ generation, content gap analysis."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.limiter import limiter
from app.models.crawl import Page
from app.models.project import Project
from app.models.seo import SeoPageMeta
from app.models.user import UserRole
from app.routers.seo import _get_latest_crawl

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


# ─── Schema.org Generator ─────────────────────────────────────────────────────

class SchemaGenerateRequest(BaseModel):
    page_url: str
    schema_type: str  # Organization|LocalBusiness|Product|Article|FAQPage|BreadcrumbList


@router.post("/projects/{project_id}/seo/schema/generate")
@limiter.limit("10/minute")
async def generate_schema_org(
    request: Request,
    project_id: uuid.UUID,
    body: SchemaGenerateRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate Schema.org JSON-LD for a page via Claude."""
    import json
    import re

    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="No completed crawl found")

    page = db.scalar(
        select(Page).where(Page.crawl_session_id == crawl.id, Page.url == body.page_url)
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found in latest crawl")

    from app.models.brief import Brief
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))

    from app.services.claude import get_claude_client
    claude = get_claude_client(db)

    brief_context = ""
    if brief:
        parts = []
        if brief.products:
            parts.append(f"Продукт/услуга: {brief.products}")
        if brief.geo:
            parts.append(f"Гео: {brief.geo}")
        if brief.usp:
            parts.append(f"УТП: {brief.usp}")
        if brief.niche:
            parts.append(f"Ниша: {brief.niche}")
        brief_context = "\n".join(parts)

    system_prompt = "Ты — SEO-специалист. Генерируй корректный Schema.org JSON-LD. Отвечай только валидным JSON-LD объектом."
    user_msg = f"""Сгенерируй Schema.org JSON-LD типа {body.schema_type} для страницы.

URL: {body.page_url}
Title: {page.title or 'нет'}
H1: {page.h1 or 'нет'}
Description: {page.description or 'нет'}

{brief_context}

Верни ТОЛЬКО JSON-LD объект (без markdown, без пояснений)."""

    response_text = await claude.generate(system_prompt, user_msg)
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=502, detail="Failed to generate valid Schema.org JSON-LD")
    schema_json = json_match.group()

    try:
        json.loads(schema_json)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Invalid Schema.org JSON from Claude for %s: %s", body.page_url, schema_json[:200])
        raise HTTPException(status_code=502, detail="Generated Schema.org JSON-LD is not valid JSON")

    meta = db.scalar(
        select(SeoPageMeta).where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url == body.page_url)
    )
    if not meta:
        meta = SeoPageMeta(project_id=project_id, page_url=body.page_url)
        db.add(meta)
    meta.schema_org_json = schema_json
    db.commit()

    return {"schema_json": schema_json}


class SchemaBulkGenerateRequest(BaseModel):
    schema_types: list[str] = []
    page_urls: list[str] | None = None
    only_missing: bool = False


@router.post("/projects/{project_id}/seo/schema/generate-bulk", status_code=202)
@limiter.limit("5/minute")
def generate_schema_org_bulk(
    request: Request,
    project_id: uuid.UUID,
    body: SchemaBulkGenerateRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Start a bulk Schema.org generation Celery task for all (or selected) pages."""
    from datetime import datetime, timezone

    from app.models.task import Task, TaskStatus, TaskType
    from app.routers.seo import _get_latest_crawl

    _check_project_access(project_id, current_user, db)
    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="Нет завершённого парсинга. Сначала запустите парсинг сайта.")

    task = Task(
        project_id=project_id,
        type=TaskType.GENERATE_SCHEMA_BULK,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.seo import task_generate_schema_bulk
    result = task_generate_schema_bulk.delay(
        str(task.id),
        str(project_id),
        body.schema_types,
        body.page_urls,
        body.only_missing,
    )
    task.celery_task_id = result.id
    db.commit()

    return {"task_id": str(task.id)}


@router.get("/projects/{project_id}/seo/schema")
def get_schema_org(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    page_url: str = "",
):
    """Return saved schema_org_json for a page."""
    _check_project_access(project_id, current_user, db)
    if not page_url:
        raise HTTPException(status_code=400, detail="page_url required")
    meta = db.scalar(
        select(SeoPageMeta).where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url == page_url)
    )
    return {"schema_json": meta.schema_org_json if meta else None}


# ─── FAQ Generator ────────────────────────────────────────────────────────────

class FaqGenerateRequest(BaseModel):
    page_url: str
    count: int = 8


@router.post("/projects/{project_id}/seo/faq/generate")
@limiter.limit("10/minute")
async def generate_faq(
    request: Request,
    project_id: uuid.UUID,
    body: FaqGenerateRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate FAQ items and FAQPage Schema.org for a page via Claude."""
    import json
    import re

    crawl = _get_latest_crawl(project_id, db)
    if not crawl:
        raise HTTPException(status_code=400, detail="No completed crawl found")

    page = db.scalar(
        select(Page).where(Page.crawl_session_id == crawl.id, Page.url == body.page_url)
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found in latest crawl")

    from app.models.brief import Brief
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))

    from app.models.direct import AdGroup, Campaign, Keyword
    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    keyword_phrases: list[str] = []
    if campaigns:
        campaign_ids = [c.id for c in campaigns]
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if group_ids:
            kws = db.scalars(select(Keyword).where(Keyword.ad_group_id.in_(group_ids)).limit(20)).all()
            keyword_phrases = [k.phrase for k in kws]

    from app.services.claude import get_claude_client
    claude = get_claude_client(db)

    products = brief.products if brief else ""
    system_prompt = "Ты — контент-маркетолог. Генерируй полезные FAQ для веб-страниц. Отвечай только JSON."
    user_msg = f"""Сгенерируй {body.count} вопросов и ответов (FAQ) для страницы.

URL: {body.page_url}
Тема/H1: {page.h1 or page.title or 'нет'}
Продукт/услуга: {products}
Ключевые слова: {', '.join(keyword_phrases[:10])}

Верни ТОЛЬКО JSON (без markdown):
{{"faq": [{{"question": "...", "answer": "..."}}]}}"""

    response_text = await claude.generate(system_prompt, user_msg)
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=502, detail="Failed to parse Claude response")

    data = json.loads(json_match.group())
    faq_items = data.get("faq", [])

    schema_items = [
        {
            "@type": "Question",
            "name": item["question"],
            "acceptedAnswer": {"@type": "Answer", "text": item["answer"]},
        }
        for item in faq_items
    ]
    schema_json = json.dumps(
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": schema_items},
        ensure_ascii=False,
        indent=2,
    )

    meta = db.scalar(
        select(SeoPageMeta).where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url == body.page_url)
    )
    if not meta:
        meta = SeoPageMeta(project_id=project_id, page_url=body.page_url)
        db.add(meta)
    meta.faq_json = json.dumps({"items": faq_items, "schema_json": schema_json}, ensure_ascii=False)
    db.commit()

    return {"faq": faq_items, "schema_json": schema_json}


@router.get("/projects/{project_id}/seo/faq")
def get_faq(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    page_url: str = "",
):
    """Return saved faq_json for a page."""
    _check_project_access(project_id, current_user, db)
    import json
    if not page_url:
        raise HTTPException(status_code=400, detail="page_url required")
    meta = db.scalar(
        select(SeoPageMeta).where(SeoPageMeta.project_id == project_id, SeoPageMeta.page_url == page_url)
    )
    if not meta or not meta.faq_json:
        return {"faq": [], "schema_json": None}
    data = json.loads(meta.faq_json)
    return {"faq": data.get("items", []), "schema_json": data.get("schema_json")}


# ─── Content Gap Analysis ─────────────────────────────────────────────────────

class ContentGapRequest(BaseModel):
    competitor_urls: list[str]  # 1-3 competitor URLs


@router.post("/projects/{project_id}/seo/content-gap")
@limiter.limit("5/minute")
async def content_gap_analysis(
    request: Request,
    project_id: uuid.UUID,
    body: ContentGapRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Analyze content gaps between client site and competitors."""
    import json
    import re

    import httpx
    from bs4 import BeautifulSoup

    if not body.competitor_urls or len(body.competitor_urls) > 3:
        raise HTTPException(status_code=400, detail="Provide 1-3 competitor URLs")

    crawl = _get_latest_crawl(project_id, db)
    client_pages: list[dict] = []
    if crawl:
        pages = db.scalars(select(Page).where(Page.crawl_session_id == crawl.id).limit(100)).all()
        client_pages = [{"url": p.url, "title": p.title, "h1": p.h1} for p in pages]

    competitor_pages: list[dict] = []
    pages_analyzed = 0

    def _is_safe_url(url: str) -> bool:
        """Block SSRF: reject internal IPs, non-http schemes, and metadata endpoints."""
        import ipaddress
        try:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https"):
                return False
            hostname = parsed.hostname or ""
            if not hostname:
                return False
            # Block obvious internal hostnames
            if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
                return False
            if hostname.endswith(".internal") or hostname.endswith(".local"):
                return False
            # Block cloud metadata endpoints
            if hostname in ("169.254.169.254", "metadata.google.internal"):
                return False
            # Block private IP ranges
            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return False
            except ValueError:
                pass  # hostname is a domain, not an IP — OK
            return True
        except Exception:
            return False

    async def fetch_page(url: str) -> dict | None:
        if not _is_safe_url(url):
            logger.warning("Blocked SSRF attempt to %s", url)
            return None
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client_http:
                r = await client_http.get(url, headers={"User-Agent": "Mozilla/5.0"})
                # Handle redirects manually to check target URL
                if r.status_code in (301, 302, 303, 307, 308):
                    redirect_url = str(r.headers.get("location", ""))
                    if not _is_safe_url(redirect_url):
                        logger.warning("Blocked SSRF redirect to %s", redirect_url)
                        return None
                    r = await client_http.get(redirect_url, headers={"User-Agent": "Mozilla/5.0"})
                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, "html.parser")
                    title_tag = soup.find("title")
                    h1_tag = soup.find("h1")
                    return {
                        "url": url,
                        "title": title_tag.get_text(strip=True) if title_tag else None,
                        "h1": h1_tag.get_text(strip=True) if h1_tag else None,
                    }
        except httpx.TimeoutException:
            logger.warning("Timeout fetching competitor page %s", url)
            return None
        except Exception:
            logger.warning("Failed to fetch competitor page %s", url, exc_info=True)
            return None

    for comp_url in body.competitor_urls[:3]:
        comp_url = comp_url.rstrip("/")
        page_data = await fetch_page(comp_url)
        if page_data:
            competitor_pages.append(page_data)
            pages_analyzed += 1

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client_http:
                r = await client_http.get(comp_url, headers={"User-Agent": "Mozilla/5.0"})
                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, "html.parser")
                    links = set()
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        if href.startswith("/"):
                            href = comp_url + href
                        if href.startswith(comp_url) and href != comp_url:
                            links.add(href.split("?")[0].split("#")[0])
                    for link in list(links)[:20]:
                        if pages_analyzed >= 20 * len(body.competitor_urls):
                            break
                        pd = await fetch_page(link)
                        if pd:
                            competitor_pages.append(pd)
                            pages_analyzed += 1
        except Exception as e:
            logger.warning("Failed to crawl competitor URL %s: %s", comp_url, str(e)[:200])

    from app.services.claude import get_claude_client
    claude = get_claude_client(db)

    client_list = "\n".join(
        f"- {p['url']}: {p.get('title', '')} | {p.get('h1', '')}"
        for p in client_pages[:50]
    )
    comp_list = "\n".join(
        f"- {p['url']}: {p.get('title', '')} | {p.get('h1', '')}"
        for p in competitor_pages[:50]
    )

    system_prompt = "Ты — SEO-аналитик. Находи контентные пробелы между сайтами. Отвечай только JSON."
    user_msg = f"""Вот страницы сайта клиента:
{client_list or 'Нет данных'}

Вот страницы конкурентов:
{comp_list or 'Нет данных'}

Найди темы/разделы, которых нет у клиента, но есть у конкурентов.
Верни ТОЛЬКО JSON (без markdown):
{{"gaps": [{{"topic": "строка", "example_url": "url", "priority": "high|medium|low", "content_type": "page|article|landing"}}]}}"""

    response_text = await claude.generate(system_prompt, user_msg)
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=502, detail="Failed to parse Claude response")

    data = json.loads(json_match.group())
    return {
        "gaps": data.get("gaps", []),
        "competitor_pages_analyzed": pages_analyzed,
        "client_pages_analyzed": len(client_pages),
    }
