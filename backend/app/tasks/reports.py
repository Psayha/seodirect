"""Celery tasks for monthly auto-reports."""
from __future__ import annotations

from datetime import datetime, timezone

from app.celery_app import celery_app


@celery_app.task(name="tasks.reports.monthly_reports")
def task_monthly_reports():
    """Generate and save monthly reports for all active projects."""
    from app.db.session import SessionLocal
    from app.models.project import Project, ProjectStatus
    from app.models.history import ProjectEvent
    from sqlalchemy import select

    db = SessionLocal()
    try:
        # Get all active projects
        projects = db.scalars(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        ).all()

        generated = 0
        for project in projects:
            try:
                # Gather basic stats for the report summary
                from app.models.direct import Campaign, AdGroup, Keyword, Ad
                from app.models.crawl import CrawlSession, CrawlStatus
                from sqlalchemy import func

                campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project.id)).all()
                campaign_ids = [c.id for c in campaigns]
                keywords_total = 0
                ads_total = 0
                if campaign_ids:
                    group_ids = db.scalars(
                        select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))
                    ).all()
                    if group_ids:
                        keywords_total = db.scalar(
                            select(func.count(Keyword.id)).where(Keyword.ad_group_id.in_(group_ids))
                        ) or 0
                        ads_total = db.scalar(
                            select(func.count(Ad.id)).where(Ad.ad_group_id.in_(group_ids))
                        ) or 0

                crawl = db.scalar(
                    select(CrawlSession)
                    .where(CrawlSession.project_id == project.id, CrawlSession.status == CrawlStatus.DONE)
                    .order_by(CrawlSession.finished_at.desc())
                )

                description = (
                    f"Автоотчёт за {datetime.now(timezone.utc).strftime('%B %Y')}. "
                    f"Ключевых слов: {keywords_total}, объявлений: {ads_total}, "
                    f"страниц проанализировано: {crawl.pages_done if crawl else 0}."
                )

                # Log event
                from app.models.history import EventType
                ev = ProjectEvent(
                    project_id=project.id,
                    event_type=EventType.MONTHLY_REPORT_GENERATED,
                    description=description,
                    created_at=datetime.now(timezone.utc),
                )
                db.add(ev)
                db.commit()
                generated += 1
            except Exception:
                db.rollback()
                continue

        return {"status": "success", "reports_generated": generated}
    finally:
        db.close()
