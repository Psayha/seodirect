from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="tasks.crawl.run_crawl",
    autoretry_for=(ConnectionError, OSError),
    retry_kwargs={"max_retries": 2},
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def run_crawl(self, task_id: str, session_id: str, project_id: str, url: str, settings_dict: dict):
    """Celery task: crawl a website and save results to DB."""
    from app.crawl.crawler import SiteCrawler
    from app.db.session import SessionLocal
    from app.models.crawl import CrawlSession, CrawlStatus, Page
    from app.models.task import Task, TaskStatus

    db = SessionLocal()
    try:
        # Mark task as running
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            db.commit()

        # Mark session as running
        session = db.get(CrawlSession, uuid.UUID(session_id))
        if not session:
            return
        session.status = CrawlStatus.RUNNING
        session.started_at = datetime.now(timezone.utc)
        db.commit()

        crawler = SiteCrawler(
            base_url=url,
            crawl_delay_ms=settings_dict.get("crawl_delay_ms", 1000),
            timeout_seconds=settings_dict.get("timeout_seconds", 10),
            max_pages=settings_dict.get("max_pages", 500),
            user_agent=settings_dict.get("user_agent", "SEODirectBot/1.0 (internal)"),
            respect_robots=settings_dict.get("respect_robots", True),
        )

        pages_done = 0

        def on_page(page_data, done, total):
            nonlocal pages_done
            pages_done = done
            # Save page to DB
            p = Page(
                crawl_session_id=uuid.UUID(session_id),
                url=page_data.url,
                status_code=page_data.status_code,
                title=page_data.title,
                description=page_data.description,
                h1=page_data.h1,
                h2_list=page_data.h2_list,
                canonical=page_data.canonical,
                og_title=page_data.og_title,
                og_description=page_data.og_description,
                og_image=page_data.og_image,
                og_type=page_data.og_type,
                robots_meta=page_data.robots_meta,
                word_count=page_data.word_count,
                content_text=page_data.content_text,
                internal_links=page_data.internal_links,
                external_links=page_data.external_links,
                images_without_alt=page_data.images_without_alt,
                h1_count=page_data.h1_count,
                load_time_ms=page_data.load_time_ms,
                last_modified=page_data.last_modified,
                priority=page_data.priority,
            )
            db.add(p)
            # Update session progress
            session.pages_done = done
            session.pages_total = total
            db.commit()
            # Update Celery task state
            self.update_state(state="PROGRESS", meta={"done": done, "total": total})

        pages = asyncio.run(crawler.crawl(on_page=on_page))

        session.status = CrawlStatus.DONE
        session.finished_at = datetime.now(timezone.utc)
        session.pages_total = len(pages)
        session.pages_done = len(pages)
        db.commit()

        # Auto-audit: run SEO checklist immediately after crawl completes
        audit_result = {}
        try:
            from app.services.auto_audit import run_seo_checklist
            audit_result = run_seo_checklist(uuid.UUID(project_id), db)
            logger.info(
                "Auto-audit completed for project %s: score=%s, pages=%s",
                project_id,
                audit_result.get("score", "N/A"),
                audit_result.get("pages_total", 0),
            )
        except Exception:
            logger.exception("Auto-audit failed for project %s (non-critical)", project_id)

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {
                "pages_crawled": len(pages),
                "auto_audit": {
                    "score": audit_result.get("score"),
                    "pages_total": audit_result.get("pages_total"),
                    "issues_summary": {
                        i["name"]: i["count"]
                        for i in audit_result.get("items", [])
                        if i.get("status") != "ok"
                    } if audit_result.get("items") else {},
                },
            }
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        # Push notification
        try:
            from app.services.push import notify_project_owner
            notify_project_owner(
                db, uuid.UUID(project_id),
                "Парсинг завершён",
                f"Обработано {len(pages)} страниц",
            )
        except Exception:
            logger.debug("Push notification failed (non-critical)", exc_info=True)

    except Exception as exc:
        # Mark as failed
        try:
            session = db.get(CrawlSession, uuid.UUID(session_id))
            if session:
                from app.models.crawl import CrawlStatus
                session.status = CrawlStatus.FAILED
                session.error = str(exc)[:1000]
                session.finished_at = datetime.now(timezone.utc)
            task = db.get(Task, uuid.UUID(task_id))
            if task:
                from app.models.task import TaskStatus
                task.status = TaskStatus.FAILED
                task.error = str(exc)[:1000]
                task.finished_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
