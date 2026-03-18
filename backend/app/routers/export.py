import logging
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.project import Project
from app.models.user import UserRole
from app.services.exporter import (
    export_copywriter_docx,
    export_direct_xls,
    export_mediaplan_xlsx,
    export_strategy_html,
    export_strategy_md,
    validate_export,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and project.specialist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _safe_filename(name: str) -> str:
    """Sanitize project name for use in filenames — allow only safe chars."""
    safe = re.sub(r'[^\w\s\-]', '', name, flags=re.UNICODE).strip()
    safe = re.sub(r'\s+', '_', safe)
    return safe[:50] or "project"


@router.get("/projects/{project_id}/export/mediaplan-xlsx")
def download_mediaplan_xlsx(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    try:
        xlsx_bytes = export_mediaplan_xlsx(project_id, db)
    except Exception:
        logger.exception("Failed to export mediaplan for project %s", project_id)
        raise HTTPException(status_code=500, detail="Export failed")

    safe_name = _safe_filename(project.name)
    filename = f"mediaplan_{safe_name}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/projects/{project_id}/export/validate")
def validate(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _check_project_access(project_id, current_user, db)
    return validate_export(project_id, db)


@router.get("/projects/{project_id}/export/direct-xls")
def download_direct_xls(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    try:
        data, fmt = export_direct_xls(project_id, db)
    except Exception:
        logger.exception("Failed to export direct for project %s", project_id)
        raise HTTPException(status_code=500, detail="Export failed")

    safe_name = _safe_filename(project.name)
    if fmt == "zip":
        media_type = "application/zip"
        filename = f"direct_{safe_name}.zip"
    else:
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"direct_{safe_name}.xlsx"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/projects/{project_id}/export/strategy-md")
def download_strategy_md(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    try:
        md_text = export_strategy_md(project_id, db)
    except Exception:
        logger.exception("Failed to export strategy MD for project %s", project_id)
        raise HTTPException(status_code=500, detail="Export failed")

    safe_name = _safe_filename(project.name)
    filename = f"strategy_{safe_name}.md"

    return Response(
        content=md_text.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/projects/{project_id}/export/copywriter-brief")
def download_copywriter_brief(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    try:
        docx_bytes = export_copywriter_docx(project_id, db)
    except Exception:
        logger.exception("Failed to export copywriter brief for project %s", project_id)
        raise HTTPException(status_code=500, detail="Export failed")

    safe_name = _safe_filename(project.name)
    filename = f"brief_copywriter_{safe_name}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/projects/{project_id}/export/strategy-html")
def download_strategy_html(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _check_project_access(project_id, current_user, db)

    try:
        html = export_strategy_html(project_id, db)
    except Exception:
        logger.exception("Failed to export strategy HTML for project %s", project_id)
        raise HTTPException(status_code=500, detail="Export failed")

    safe_name = _safe_filename(project.name)
    filename = f"strategy_{safe_name}.html"
    return Response(
        content=html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
