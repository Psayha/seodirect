import logging
logger = logging.getLogger(__name__)
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.services.exporter import (
    export_direct_xls,
    export_strategy_md,
    export_strategy_html,
    export_copywriter_docx,
    export_mediaplan_xlsx,
    validate_export,
)

router = APIRouter()


@router.get("/projects/{project_id}/export/mediaplan-xlsx")
def download_mediaplan_xlsx(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        xlsx_bytes = export_mediaplan_xlsx(project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe_name = project.name.replace(" ", "_")[:50]
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
    return validate_export(project_id, db)


@router.get("/projects/{project_id}/export/direct-xls")
def download_direct_xls(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    from sqlalchemy import select
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        data, fmt = export_direct_xls(project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe_name = project.name.replace(" ", "_")[:50]
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
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        md_text = export_strategy_md(project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe_name = project.name.replace(" ", "_")[:50]
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
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        docx_bytes = export_copywriter_docx(project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe_name = project.name.replace(" ", "_")[:50]
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
    from app.models.project import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        html = export_strategy_html(project_id, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe_name = project.name.replace(" ", "_")[:50]
    filename = f"strategy_{safe_name}.html"
    return Response(
        content=html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
