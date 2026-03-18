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
    from app.services.claude import ClaudeClient
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
            raise RuntimeError("No pages in crawl")

        # Get Claude client (supports both Anthropic and OpenRouter)
        from app.services.claude import get_claude_client
        _base_client = get_claude_client(db)
        # Re-create with task-specific settings (lower max_tokens, lower temperature)
        claude = ClaudeClient(
            api_key=_base_client.api_key,
            model=_base_client.model,
            max_tokens=2000,
            temperature=0.4,
            use_openrouter=_base_client.use_openrouter,
        )

        system_prompt = """Ты — SEO-специалист. Генерируй краткие title и description для веб-страниц на русском языке.
title: 50-65 символов, включает ключевое слово, конкретный и информативный.
description: 120-155 символов, призыв к действию, ключевые слова, уникально для страницы."""

        if generate_og:
            system_prompt += """
og:title: 60-90 символов, цепляющий заголовок для социальных сетей.
og:description: 150-200 символов, интригующий анонс страницы."""

        generated = 0
        for i, page in enumerate(pages):
            if task and i % 10 == 0:
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
            except Exception:
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
