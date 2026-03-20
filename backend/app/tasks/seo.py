"""Celery tasks for SEO module."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from app.celery_app import celery_app


def _run_async(coro):
    """Safely run async coroutine from sync Celery worker thread."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="tasks.seo.generate_seo_meta",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def task_generate_seo_meta(
    self,
    task_id: str,
    project_id: str,
    generate_og: bool = False,
    page_urls: list | None = None,
    only_missing: bool = False,
    only_issues: bool = False,
):
    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models.crawl import CrawlSession, CrawlStatus, Page
    from app.models.seo import SeoPageMeta
    from app.models.task import Task, TaskStatus
    from app.services.settings_service import get_setting

    db = SessionLocal()
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            db.commit()

        # Get latest crawl
        crawl = db.scalar(
            select(CrawlSession)
            .where(
                CrawlSession.project_id == uuid.UUID(project_id),
                CrawlSession.status == CrawlStatus.DONE,
            )
            .order_by(CrawlSession.finished_at.desc())
        )
        if not crawl:
            raise RuntimeError("No completed crawl found")

        page_query = select(Page).where(Page.crawl_session_id == crawl.id)

        # Apply page_urls filter
        if page_urls:
            page_query = page_query.where(Page.url.in_(page_urls))

        # Apply only_missing filter
        if only_missing:
            from sqlalchemy import or_
            page_query = page_query.where(
                or_(Page.title.is_(None), Page.description.is_(None))
            )

        # Apply only_issues filter
        if only_issues:
            from sqlalchemy import func as sqlfunc
            from sqlalchemy import or_
            page_query = page_query.where(
                or_(
                    Page.title.is_(None),
                    Page.description.is_(None),
                    sqlfunc.length(Page.title) < 10,
                    sqlfunc.length(Page.title) > 70,
                    sqlfunc.length(Page.description) < 50,
                    sqlfunc.length(Page.description) > 160,
                )
            )

        pages = db.scalars(page_query.order_by(Page.url)).all()

        if not pages:
            if task:
                task.status = TaskStatus.SUCCESS
                task.progress = 100
                task.result = {"pages_generated": 0, "pages_total": 0, "message": "Нет страниц, подходящих под фильтры"}
                task.finished_at = datetime.now(timezone.utc)
                db.commit()
            return

        # Get LLM client with per-task settings
        from app.services.claude import get_claude_client
        claude = get_claude_client(db, task_type="seo_meta")

        from app.services.settings_service import get_prompt

        system_prompt = get_prompt("seo_meta", db) or (
            "Ты — SEO-специалист. Генерируй краткие title и description для веб-страниц на русском языке.\n"
            "title: 50-65 символов, включает ключевое слово, конкретный и информативный.\n"
            "description: 120-155 символов, призыв к действию, ключевые слова, уникально для страницы."
        )

        if generate_og:
            system_prompt += """
og:title: 60-90 символов, цепляющий заголовок для социальных сетей.
og:description: 150-200 символов, интригующий анонс страницы."""

        generated = 0
        consecutive_failures = 0
        for i, page in enumerate(pages):
            if task:
                task.progress = round(i / len(pages) * 100)
                db.commit()

            # Check if already has good meta and not generating OG
            has_good_meta = (
                page.title and 10 <= len(page.title) <= 70
                and page.description and 50 <= len(page.description) <= 160
            )
            has_good_og = (
                page.og_title and page.og_description
            )
            if has_good_meta and (not generate_og or has_good_og):
                continue

            user_msg = f"""URL: {page.url}
Текущий title: {page.title or 'нет'}
Текущий description: {page.description or 'нет'}
H1: {page.h1 or 'нет'}
H2: {', '.join((page.h2_list or [])[:3])}
Слов на странице: {page.word_count}"""

            if generate_og:
                user_msg += f"""
Текущий og:title: {page.og_title or 'нет'}
Текущий og:description: {page.og_description or 'нет'}"""

            user_msg += """

Ответь ТОЛЬКО в формате JSON (без markdown):
{
  "title": "...",
  "description": "..."
"""
            if generate_og:
                user_msg += '  ,"og_title": "..."\n  ,"og_description": "..."\n'
            user_msg += "}"

            try:
                response_text = _run_async(claude.generate(system_prompt, user_msg))
                # Parse JSON from response
                import json
                import re
                json_match = re.search(r'\{[^{}]+\}', response_text, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                    meta = db.scalar(
                        select(SeoPageMeta)
                        .where(
                            SeoPageMeta.project_id == uuid.UUID(project_id),
                            SeoPageMeta.page_url == page.url,
                        )
                    )
                    if not meta:
                        meta = SeoPageMeta(
                            project_id=uuid.UUID(project_id),
                            page_url=page.url,
                        )
                        db.add(meta)
                    if not meta.manually_edited:
                        if "title" in data:
                            meta.rec_title = data["title"][:512]
                        if "description" in data:
                            meta.rec_description = data["description"][:500]
                        if generate_og:
                            if "og_title" in data:
                                meta.rec_og_title = data["og_title"][:512]
                            if "og_description" in data:
                                meta.rec_og_description = data["og_description"][:500]
                        meta.generated_at = datetime.now(timezone.utc)
                    db.commit()
                    generated += 1
                    consecutive_failures = 0
            except Exception as page_err:
                consecutive_failures += 1
                # If first 3 pages all fail, likely a config/auth issue — fail fast
                if generated == 0 and consecutive_failures >= 3:
                    raise RuntimeError(
                        f"Первые {consecutive_failures} страниц не удалось обработать. "
                        f"Проверьте настройки API ключа. Последняя ошибка: {page_err}"
                    ) from page_err
                continue  # Skip failed pages, continue with others

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {"pages_generated": generated, "pages_total": len(pages)}
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"status": "success", "pages_generated": generated}

    except Exception as e:
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(
    bind=True,
    name="tasks.seo.generate_schema_bulk",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def task_generate_schema_bulk(
    self,
    task_id: str,
    project_id: str,
    schema_types: list | None = None,
    page_urls: list | None = None,
    only_missing: bool = False,
):
    import json
    import re

    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models.crawl import CrawlSession, CrawlStatus, Page
    from app.models.seo import SeoPageMeta
    from app.models.task import Task, TaskStatus
    from app.services.claude import get_claude_client

    db = SessionLocal()
    task = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            db.commit()

        crawl = db.scalar(
            select(CrawlSession)
            .where(
                CrawlSession.project_id == uuid.UUID(project_id),
                CrawlSession.status == CrawlStatus.DONE,
            )
            .order_by(CrawlSession.finished_at.desc())
        )
        if not crawl:
            raise RuntimeError("No completed crawl found")

        page_query = select(Page).where(
            Page.crawl_session_id == crawl.id,
            Page.status_code == 200,
        )
        if page_urls:
            page_query = page_query.where(Page.url.in_(page_urls))

        pages = db.scalars(page_query.order_by(Page.url)).all()
        if not pages:
            raise RuntimeError("No pages found in crawl")

        if only_missing:
            existing_meta = db.scalars(
                select(SeoPageMeta).where(
                    SeoPageMeta.project_id == uuid.UUID(project_id),
                    SeoPageMeta.schema_org_json.isnot(None),
                )
            ).all()
            urls_with_schema = {m.page_url for m in existing_meta}
            pages = [p for p in pages if p.url not in urls_with_schema]

        if not pages:
            if task:
                task.status = TaskStatus.SUCCESS
                task.progress = 100
                task.result = {"pages_generated": 0, "pages_total": 0}
                task.finished_at = datetime.now(timezone.utc)
                db.commit()
            return {"status": "success", "pages_generated": 0}

        from app.models.brief import Brief
        brief = db.scalar(select(Brief).where(Brief.project_id == uuid.UUID(project_id)))
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

        _DEFAULT_SCHEMA_TYPES = [
            "Organization", "LocalBusiness", "Product", "Article",
            "WebSite", "WebPage", "Service", "FAQPage", "HowTo",
        ]
        allowed_types = schema_types if schema_types else _DEFAULT_SCHEMA_TYPES
        types_list = ", ".join(allowed_types)

        claude = get_claude_client(db, task_type="seo_schema_bulk")
        from app.services.settings_service import get_prompt as _get_prompt

        system_prompt = _get_prompt("seo_schema_bulk", db) or "Ты — SEO-специалист. Генерируй корректный Schema.org JSON-LD. Отвечай только валидным JSON-LD объектом без markdown и пояснений."

        generated = 0
        consecutive_failures = 0
        for i, page in enumerate(pages):
            if task:
                task.progress = round(i / len(pages) * 100)
                db.commit()

            user_msg = f"""Выбери наиболее подходящий тип Schema.org из списка [{types_list}] для данной страницы и сгенерируй JSON-LD.

URL: {page.url}
Title: {page.title or 'нет'}
H1: {page.h1 or 'нет'}
Description: {page.description or 'нет'}

{brief_context}

Верни ТОЛЬКО JSON-LD объект (без markdown, без пояснений)."""

            try:
                response_text = _run_async(claude.generate(system_prompt, user_msg))
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if not json_match:
                    consecutive_failures += 1
                    if generated == 0 and consecutive_failures >= 3:
                        raise RuntimeError(
                            f"Первые {consecutive_failures} страниц не удалось обработать. "
                            "Проверьте настройки API ключа."
                        )
                    continue
                schema_json = json_match.group()
                json.loads(schema_json)  # validate

                meta = db.scalar(
                    select(SeoPageMeta).where(
                        SeoPageMeta.project_id == uuid.UUID(project_id),
                        SeoPageMeta.page_url == page.url,
                    )
                )
                if not meta:
                    meta = SeoPageMeta(project_id=uuid.UUID(project_id), page_url=page.url)
                    db.add(meta)
                meta.schema_org_json = schema_json
                db.commit()
                generated += 1
                consecutive_failures = 0
            except RuntimeError:
                raise
            except Exception as page_err:
                consecutive_failures += 1
                if generated == 0 and consecutive_failures >= 3:
                    raise RuntimeError(
                        f"Первые {consecutive_failures} страниц не удалось обработать. "
                        f"Проверьте настройки API ключа. Последняя ошибка: {page_err}"
                    ) from page_err
                continue

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {"pages_generated": generated, "pages_total": len(pages)}
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"status": "success", "pages_generated": generated}

    except Exception as e:
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()
