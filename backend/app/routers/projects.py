import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.db.session import get_db
from app.models.brief import Brief
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    client_name: str
    url: str
    specialist_id: uuid.UUID | None = None
    budget: float | None = None
    notes: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_name: str | None = None
    url: str | None = None
    specialist_id: uuid.UUID | None = None
    budget: float | None = None
    status: ProjectStatus | None = None
    notes: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    client_name: str
    url: str
    specialist_id: str | None
    budget: float | None
    status: str
    notes: str | None
    created_at: str
    updated_at: str


class BriefUpdate(BaseModel):
    niche: str | None = None
    products: str | None = None
    price_segment: str | None = None
    geo: str | None = None
    target_audience: str | None = None
    pains: str | None = None
    usp: str | None = None
    competitors_urls: list[str] | None = None
    campaign_goal: str | None = None
    ad_geo: list[str] | None = None
    excluded_geo: str | None = None
    monthly_budget: str | None = None
    restrictions: str | None = None
    raw_data: dict | None = None


def _project_response(p: Project) -> ProjectResponse:
    return ProjectResponse(
        id=str(p.id),
        name=p.name,
        client_name=p.client_name,
        url=p.url,
        specialist_id=str(p.specialist_id) if p.specialist_id else None,
        budget=float(p.budget) if p.budget else None,
        status=p.status.value,
        notes=p.notes,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


# ─── Projects CRUD ────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ProjectResponse])
def list_projects(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    specialist_id: uuid.UUID | None = None,
):
    q = select(Project)

    # Specialists see only their projects
    if current_user.role == UserRole.SPECIALIST:
        q = q.where(Project.specialist_id == current_user.id)
    elif specialist_id:
        q = q.where(Project.specialist_id == specialist_id)

    if status_filter:
        try:
            q = q.where(Project.status == ProjectStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")

    q = q.order_by(Project.created_at.desc())
    projects = db.scalars(q).all()
    return [_project_response(p) for p in projects]


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    # Auto-assign to current specialist if not admin
    specialist_id = body.specialist_id
    if current_user.role == UserRole.SPECIALIST:
        specialist_id = current_user.id

    project = Project(
        name=body.name,
        client_name=body.client_name,
        url=body.url,
        specialist_id=specialist_id,
        budget=body.budget,
        notes=body.notes,
    )
    db.add(project)
    db.flush()

    # Create empty brief
    brief = Brief(project_id=project.id)
    db.add(brief)
    db.commit()
    db.refresh(project)
    return _project_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _get_project_or_404(project_id, current_user, db)
    return _project_response(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    project = _get_project_or_404(project_id, current_user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _project_response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")
    project = db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()


# ─── Brief ────────────────────────────────────────────────────────────────────

@router.get("/{project_id}/brief")
def get_brief(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _get_project_or_404(project_id, current_user, db)
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    return _brief_to_dict(brief)


@router.put("/{project_id}/brief")
def update_brief(
    project_id: uuid.UUID,
    body: BriefUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    _get_project_or_404(project_id, current_user, db)
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    if not brief:
        brief = Brief(project_id=project_id)
        db.add(brief)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(brief, field, value)
    db.commit()
    db.refresh(brief)
    return _brief_to_dict(brief)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: uuid.UUID, current_user: User, db: Session) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if (
        current_user.role == UserRole.SPECIALIST
        and project.specialist_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    return project


def _brief_to_dict(brief: Brief) -> dict:
    return {
        "id": str(brief.id),
        "project_id": str(brief.project_id),
        "niche": brief.niche,
        "products": brief.products,
        "price_segment": brief.price_segment,
        "geo": brief.geo,
        "target_audience": brief.target_audience,
        "pains": brief.pains,
        "usp": brief.usp,
        "competitors_urls": brief.competitors_urls or [],
        "campaign_goal": brief.campaign_goal,
        "ad_geo": brief.ad_geo or [],
        "excluded_geo": brief.excluded_geo,
        "monthly_budget": brief.monthly_budget,
        "restrictions": brief.restrictions,
        "raw_data": brief.raw_data,
        "updated_at": brief.updated_at.isoformat() if brief.updated_at else None,
    }
