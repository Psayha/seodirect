"""Content plan: blog article planning per project."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.content_plan import ContentPlanArticle, ArticleStatus

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ArticleCreate(BaseModel):
    title: str
    target_keyword: str | None = None
    cluster: str | None = None
    intent: str | None = None
    status: ArticleStatus = ArticleStatus.IDEA
    priority: int = 0
    due_date: str | None = None
    assigned_to: str | None = None
    notes: str | None = None
    url: str | None = None
    word_count_target: int | None = None


class ArticleUpdate(BaseModel):
    title: str | None = None
    target_keyword: str | None = None
    cluster: str | None = None
    intent: str | None = None
    status: ArticleStatus | None = None
    priority: int | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    notes: str | None = None
    url: str | None = None
    word_count_target: int | None = None


def _to_dict(a: ContentPlanArticle) -> dict:
    return {
        "id": str(a.id),
        "project_id": str(a.project_id),
        "title": a.title,
        "target_keyword": a.target_keyword,
        "cluster": a.cluster,
        "intent": a.intent,
        "status": a.status.value,
        "priority": a.priority,
        "due_date": a.due_date,
        "assigned_to": a.assigned_to,
        "notes": a.notes,
        "url": a.url,
        "word_count_target": a.word_count_target,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/content-plan")
def list_articles(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    articles = db.scalars(
        select(ContentPlanArticle)
        .where(ContentPlanArticle.project_id == project_id)
        .order_by(ContentPlanArticle.priority.desc(), ContentPlanArticle.created_at.asc())
    ).all()
    return {"articles": [_to_dict(a) for a in articles]}


@router.post("/projects/{project_id}/content-plan", status_code=status.HTTP_201_CREATED)
def create_article(
    project_id: uuid.UUID,
    body: ArticleCreate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    article = ContentPlanArticle(project_id=project_id, **body.model_dump())
    db.add(article)
    db.commit()
    db.refresh(article)
    return _to_dict(article)


@router.patch("/projects/{project_id}/content-plan/{article_id}")
def update_article(
    project_id: uuid.UUID,
    article_id: uuid.UUID,
    body: ArticleUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    article = db.scalar(
        select(ContentPlanArticle)
        .where(ContentPlanArticle.id == article_id, ContentPlanArticle.project_id == project_id)
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(article, k, v)
    db.commit()
    db.refresh(article)
    return _to_dict(article)


@router.delete("/projects/{project_id}/content-plan/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    project_id: uuid.UUID,
    article_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    article = db.scalar(
        select(ContentPlanArticle)
        .where(ContentPlanArticle.id == article_id, ContentPlanArticle.project_id == project_id)
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(article)
    db.commit()
