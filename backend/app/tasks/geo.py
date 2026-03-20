"""Celery tasks for GEO/AEO scanning and AI-readiness auditing."""
import asyncio
import uuid
from datetime import datetime, timezone

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.geo import AiReadinessAudit, GeoKeyword, GeoScanResult
from app.models.project import Project
from app.models.task import Task, TaskStatus, TaskType
from app.services import ai_checker
from app.services.settings import settings_service


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _update_task(db: Session, task: Task, **kwargs) -> None:
    for k, v in kwargs.items():
        setattr(task, k, v)
    db.commit()


# ── GEO Scan ──────────────────────────────────────────────────────────────────

@shared_task(bind=True, name="task_geo_scan")
def task_geo_scan(
    self,
    task_id: str,
    project_id: str,
    keyword_ids: list[str],
    models: list[str],
) -> None:
    db: Session = SessionLocal()
    task: Task | None = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if not task:
            return
        _update_task(db, task, status=TaskStatus.RUNNING, progress=0)

        project = db.get(Project, uuid.UUID(project_id))
        if not project:
            _update_task(db, task, status=TaskStatus.FAILED, error="Project not found")
            return

        openrouter_key = settings_service.get_api_key(db, "openrouter", "api_key")
        if not openrouter_key:
            _update_task(db, task, status=TaskStatus.FAILED, error="OpenRouter API key not configured")
            return

        domain = project.url if "://" not in (project.url or "") else project.url

        keywords = db.scalars(
            select(GeoKeyword).where(
                GeoKeyword.id.in_([uuid.UUID(k) for k in keyword_ids]),
                GeoKeyword.project_id == project.id,
                GeoKeyword.is_active.is_(True),
            )
        ).all()

        total = len(keywords) * len(models)
        done = 0

        for kw in keywords:
            for model in models:
                result = _run_async(
                    ai_checker.check_domain_in_ai_response(
                        kw.keyword, domain, model, openrouter_key
                    )
                )
                scan = GeoScanResult(
                    id=uuid.uuid4(),
                    project_id=project.id,
                    keyword_id=kw.id,
                    ai_model=model,
                    mentioned=result.get("mentioned", False),
                    mention_position=result.get("position"),
                    sentiment=result.get("sentiment"),
                    sources_json=result.get("sources"),
                    competitor_domains_json=result.get("competitor_domains"),
                    response_snippet=result.get("snippet"),
                    scanned_at=datetime.now(tz=timezone.utc),
                )
                db.add(scan)
                done += 1
                _update_task(db, task, progress=int(done / total * 100))

        _update_task(
            db, task,
            status=TaskStatus.SUCCESS,
            progress=100,
            finished_at=datetime.now(tz=timezone.utc),
            result={"scanned": done},
        )
    except Exception as exc:
        if task:
            _update_task(
                db, task,
                status=TaskStatus.FAILED,
                error=str(exc)[:500],
                finished_at=datetime.now(tz=timezone.utc),
            )
        raise
    finally:
        db.close()


# ── GEO Audit ─────────────────────────────────────────────────────────────────

@shared_task(bind=True, name="task_geo_audit")
def task_geo_audit(self, task_id: str, project_id: str) -> None:
    db: Session = SessionLocal()
    task: Task | None = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if not task:
            return
        _update_task(db, task, status=TaskStatus.RUNNING, progress=5)

        project = db.get(Project, uuid.UUID(project_id))
        if not project:
            _update_task(db, task, status=TaskStatus.FAILED, error="Project not found")
            return

        site_url = project.url
        if "://" not in (site_url or ""):
            site_url = f"https://{site_url}"

        # Step 1: robots.txt AI-bot check
        robots = _run_async(ai_checker.check_robots_for_ai_bots(site_url))
        _update_task(db, task, progress=30)

        # Step 2: llms.txt
        llms = _run_async(ai_checker.check_llms_txt(site_url))
        _update_task(db, task, progress=50)

        # Step 3: E-E-A-T basics
        eeat = _run_async(ai_checker.check_eeat_basics(site_url))
        _update_task(db, task, progress=70)

        # Step 4: Freshness of main page
        freshness = _run_async(ai_checker.check_page_freshness(site_url))
        _update_task(db, task, progress=85)

        # Compute AI Readiness Score
        score = 100
        blocked = robots.get("blocked_bots", [])
        score -= min(len(blocked) * 15, 40)
        if robots.get("cloudflare_detected"):
            score -= 10
        if not llms.get("has_llms_txt"):
            score -= 10
        if not eeat.get("has_about_page"):
            score -= 10
        if not eeat.get("has_author_page"):
            score -= 10
        if freshness.get("status") == "red":
            score -= 20
        elif freshness.get("status") == "yellow":
            score -= 10
        score = max(0, score)

        audit = AiReadinessAudit(
            id=uuid.uuid4(),
            project_id=project.id,
            blocked_bots_json=blocked,
            cloudflare_detected=robots.get("cloudflare_detected", False),
            has_llms_txt=llms.get("has_llms_txt", False),
            llms_txt_content=llms.get("content"),
            has_about_page=eeat.get("has_about_page", False),
            has_author_page=eeat.get("has_author_page", False),
            pages_freshness_json={"main": freshness},
            ai_readiness_score=score,
            audit_json={
                "robots": robots,
                "llms_txt": llms,
                "eeat": eeat,
                "freshness": freshness,
            },
            created_at=datetime.now(tz=timezone.utc),
        )
        db.add(audit)

        _update_task(
            db, task,
            status=TaskStatus.SUCCESS,
            progress=100,
            finished_at=datetime.now(tz=timezone.utc),
            result={"audit_id": str(audit.id), "score": score},
        )
    except Exception as exc:
        if task:
            _update_task(
                db, task,
                status=TaskStatus.FAILED,
                error=str(exc)[:500],
                finished_at=datetime.now(tz=timezone.utc),
            )
        raise
    finally:
        db.close()
