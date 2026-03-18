"""UTM Constructor — manage UTM templates and build UTM URLs."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.utm import UtmTemplate

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class UtmTemplateCreate(BaseModel):
    name: str
    source: str
    medium: str
    campaign: str
    content: str | None = None
    term: str | None = None


class UtmBuildRequest(BaseModel):
    template_id: uuid.UUID
    base_url: str
    keyword: str | None = None


def _template_dict(t: UtmTemplate) -> dict:
    return {
        "id": str(t.id),
        "project_id": str(t.project_id),
        "name": t.name,
        "source": t.source,
        "medium": t.medium,
        "campaign": t.campaign,
        "content": t.content,
        "term": t.term,
        "created_at": t.created_at.isoformat(),
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/utm-templates")
def list_utm_templates(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    templates = db.scalars(
        select(UtmTemplate).where(UtmTemplate.project_id == project_id).order_by(UtmTemplate.created_at)
    ).all()
    return [_template_dict(t) for t in templates]


@router.post("/projects/{project_id}/utm-templates", status_code=status.HTTP_201_CREATED)
def create_utm_template(
    project_id: uuid.UUID,
    body: UtmTemplateCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    t = UtmTemplate(
        project_id=project_id,
        name=body.name,
        source=body.source,
        medium=body.medium,
        campaign=body.campaign,
        content=body.content,
        term=body.term,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_dict(t)


@router.delete("/projects/{project_id}/utm-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_utm_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    t = db.scalar(
        select(UtmTemplate).where(UtmTemplate.id == template_id, UtmTemplate.project_id == project_id)
    )
    if not t:
        raise HTTPException(status_code=404, detail="UTM template not found")
    db.delete(t)
    db.commit()


@router.post("/projects/{project_id}/utm-templates/build")
def build_utm_url(
    project_id: uuid.UUID,
    body: UtmBuildRequest,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Build a UTM-tagged URL from a template."""
    t = db.scalar(
        select(UtmTemplate).where(UtmTemplate.id == body.template_id, UtmTemplate.project_id == project_id)
    )
    if not t:
        raise HTTPException(status_code=404, detail="UTM template not found")

    # Build UTM params
    utm_params: dict[str, str] = {
        "utm_source": t.source,
        "utm_medium": t.medium,
        "utm_campaign": t.campaign,
    }
    if t.content:
        utm_params["utm_content"] = t.content
    # term: use keyword override if provided, else template term
    term = body.keyword or t.term
    if term:
        utm_params["utm_term"] = term

    # Append to base_url
    parsed = urlparse(body.base_url)
    existing_params = parse_qs(parsed.query, keep_blank_values=True)
    # utm params override existing ones
    for k, v in utm_params.items():
        existing_params[k] = [v]
    new_query = urlencode({k: v[0] for k, v in existing_params.items()})
    final_url = urlunparse(parsed._replace(query=new_query))

    return {"url": final_url, "utm_params": utm_params}
