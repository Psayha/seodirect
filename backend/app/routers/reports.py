"""Client auto-reports: HTML snapshot of project state."""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.project import Project
from app.models.user import UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _fmt(v) -> str:
    if v is None:
        return "—"
    return str(v)


def _build_html(project, brief, crawl_report, keywords_total: int, ads_total: int, report_date: str) -> str:
    budget = f"{float(project.budget):,.0f} ₽" if project.budget else "—"
    niche = _fmt(brief.niche if brief else None)
    geo = _fmt(brief.geo if brief else None)
    usp = _fmt(brief.usp if brief else None)

    crawl_section = ""
    if crawl_report:
        def row(label, value, bad=False):
            color = "#d32f2f" if bad else "#2e7d32"
            badge = f'<span style="color:{color};font-weight:600">{value}</span>'
            return f"<tr><td style='padding:6px 12px;border-bottom:1px solid #f0f0f0'>{label}</td><td style='padding:6px 12px;border-bottom:1px solid #f0f0f0'>{badge}</td></tr>"

        crawl_section = f"""
        <h2 style="margin-top:32px;font-size:16px;color:#333">Технический SEO аудит</h2>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <thead><tr style="background:#f5f5f5"><th style="padding:8px 12px;text-align:left">Метрика</th><th style="padding:8px 12px;text-align:left">Значение</th></tr></thead>
          <tbody>
            {row("Всего страниц", crawl_report.get("pages_total", 0))}
            {row("Без title", crawl_report.get("no_title", 0), crawl_report.get("no_title", 0) > 0)}
            {row("Без description", crawl_report.get("no_description", 0), crawl_report.get("no_description", 0) > 0)}
            {row("Без H1", crawl_report.get("no_h1", 0), crawl_report.get("no_h1", 0) > 0)}
            {row("noindex страниц", crawl_report.get("noindex_pages", 0), crawl_report.get("noindex_pages", 0) > 0)}
            {row("Медленных страниц (>3с)", crawl_report.get("slow_pages", 0), crawl_report.get("slow_pages", 0) > 0)}
            {row("Картинок без alt", crawl_report.get("images_without_alt", 0), crawl_report.get("images_without_alt", 0) > 0)}
          </tbody>
        </table>
        """

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Отчёт: {project.name}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8f9fa; color:#222; margin:0; padding:24px }}
    .container {{ max-width:800px; margin:0 auto }}
    .header {{ background:linear-gradient(135deg,#1a56db,#7c3aed); color:#fff; padding:32px; border-radius:12px; margin-bottom:24px }}
    .header h1 {{ margin:0 0 4px; font-size:24px }}
    .header p {{ margin:0; opacity:.8; font-size:14px }}
    .card {{ background:#fff; border-radius:8px; padding:20px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.08) }}
    .card h2 {{ margin:0 0 12px; font-size:16px; color:#333 }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:24px }}
    .stat {{ background:#fff; border-radius:8px; padding:16px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.08) }}
    .stat .value {{ font-size:28px; font-weight:700; color:#1a56db }}
    .stat .label {{ font-size:12px; color:#666; margin-top:4px }}
    table {{ width:100%; border-collapse:collapse }}
    footer {{ text-align:center; color:#aaa; font-size:12px; margin-top:32px }}
    .badge {{ display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:500 }}
    .badge-active {{ background:#dcfce7; color:#166534 }}
    .badge-paused {{ background:#fef9c3; color:#854d0e }}
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>{project.name}</h1>
    <p>Клиент: {project.client_name} &nbsp;|&nbsp; Дата отчёта: {report_date}</p>
  </div>

  <div class="stats">
    <div class="stat"><div class="value">{keywords_total}</div><div class="label">Ключевых слов</div></div>
    <div class="stat"><div class="value">{ads_total}</div><div class="label">Объявлений</div></div>
    <div class="stat"><div class="value">{budget}</div><div class="label">Бюджет / мес</div></div>
    <div class="stat"><div class="value"><span class="badge {'badge-active' if project.status.value == 'active' else 'badge-paused'}">{project.status.value}</span></div><div class="label">Статус проекта</div></div>
  </div>

  <div class="card">
    <h2>Бриф проекта</h2>
    <table>
      <tr><td style="width:40%;padding:6px 0;color:#666">Ниша</td><td style="padding:6px 0">{niche}</td></tr>
      <tr><td style="color:#666;padding:6px 0">География</td><td style="padding:6px 0">{geo}</td></tr>
      <tr><td style="color:#666;padding:6px 0">УТП</td><td style="padding:6px 0">{usp}</td></tr>
      <tr><td style="color:#666;padding:6px 0">URL сайта</td><td style="padding:6px 0"><a href="{project.url}">{project.url}</a></td></tr>
    </table>
  </div>

  {crawl_section}

  <footer>Сформировано SEODirect &nbsp;·&nbsp; {report_date}</footer>
</div>
</body>
</html>"""


def _build_report_data(project, project_id, db):
    from app.models.brief import Brief
    from app.models.crawl import CrawlSession, CrawlStatus
    from app.models.direct import Ad, AdGroup, Campaign, Keyword

    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))

    crawl = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    crawl_report = crawl.report if crawl else None

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    keywords_total = 0
    ads_total = 0
    if campaign_ids:
        from sqlalchemy import func
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if group_ids:
            keywords_total = db.scalar(select(func.count(Keyword.id)).where(Keyword.group_id.in_(group_ids))) or 0
            ads_total = db.scalar(select(func.count(Ad.id)).where(Ad.group_id.in_(group_ids))) or 0

    report_date = date.today().strftime("%d.%m.%Y")
    return _build_html(project, brief, crawl_report, keywords_total, ads_total, report_date)


@router.get("/projects/{project_id}/report/html")
def get_html_report(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Generate an HTML client-facing report for the project."""
    project = _check_project_access(project_id, current_user, db)
    html = _build_report_data(project, project_id, db)

    safe_name = project.name.replace(" ", "_")[:50]
    return Response(
        content=html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="report_{safe_name}.html"'},
    )


@router.get("/projects/{project_id}/report/preview")
def preview_report(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Preview report inline (no download header)."""
    project = _check_project_access(project_id, current_user, db)
    html = _build_report_data(project, project_id, db)
    return Response(content=html.encode("utf-8"), media_type="text/html; charset=utf-8")


@router.post("/projects/{project_id}/report/generate")
def generate_report_manually(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Trigger monthly report generation manually for a project."""
    from app.models.history import EventType, ProjectEvent

    _check_project_access(project_id, current_user, db)

    ev = ProjectEvent(
        project_id=project_id,
        user_id=current_user.id,
        user_login=current_user.login if hasattr(current_user, "login") else None,
        event_type=EventType.MONTHLY_REPORT_GENERATED,
        description=f"Отчёт сформирован вручную пользователем {current_user.login if hasattr(current_user, 'login') else str(current_user.id)}",
        created_at=datetime.now(timezone.utc),
    )
    db.add(ev)
    db.commit()

    return {"ok": True, "project_id": str(project_id), "report_url": f"/api/projects/{project_id}/report/preview"}
