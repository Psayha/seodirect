import json as _json
import logging
import uuid
from typing import Annotated
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired, require_roles
from app.db.session import get_db
from app.models.brief import Brief
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client_name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., max_length=2048)
    specialist_id: uuid.UUID | None = None
    budget: float | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=10000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v:
            return v
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Only http/https URLs are allowed")
        host = (parsed.hostname or "").lower()
        blocked = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254")
        if host in blocked:
            raise ValueError("Cannot use internal/loopback addresses")
        return v


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    client_name: str | None = Field(None, min_length=1, max_length=255)
    url: str | None = Field(None, max_length=2048)
    specialist_id: uuid.UUID | None = None
    budget: float | None = Field(None, ge=0)
    status: ProjectStatus | None = None
    notes: str | None = Field(None, max_length=10000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        if not v:
            return v
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Only http/https URLs are allowed")
        host = (parsed.hostname or "").lower()
        blocked = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254")
        if host in blocked:
            raise ValueError("Cannot use internal/loopback addresses")
        return v


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
    keyword_modifiers: list[str] | None = None
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
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    q = select(Project).where(Project.deleted_at.is_(None))

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

    q = q.order_by(Project.created_at.desc()).limit(limit).offset(offset)
    projects = db.scalars(q).all()
    return [_project_response(p) for p in projects]


# ─── Trash (must be before /{project_id} to avoid UUID parse conflict) ────────

class TrashProjectResponse(BaseModel):
    id: str
    name: str
    client_name: str
    url: str
    status: str
    deleted_at: str


@router.get("/trash", response_model=list[TrashProjectResponse])
def list_trash(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")
    projects = db.scalars(
        select(Project)
        .where(Project.deleted_at.is_not(None))
        .order_by(Project.deleted_at.desc())
    ).all()
    return [
        TrashProjectResponse(
            id=str(p.id),
            name=p.name,
            client_name=p.client_name,
            url=p.url,
            status=p.status.value,
            deleted_at=p.deleted_at.isoformat(),
        )
        for p in projects
    ]


# ─── Projects CRUD ────────────────────────────────────────────────────────────

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
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
    _: Annotated[object, NonViewerRequired],
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
    project = db.scalar(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    from datetime import datetime, timezone
    project.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/{project_id}/restore", response_model=ProjectResponse)
def restore_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")
    project = db.scalar(select(Project).where(Project.id == project_id, Project.deleted_at.is_not(None)))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found in trash")
    project.deleted_at = None
    db.commit()
    db.refresh(project)
    return _project_response(project)


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
    _: Annotated[object, NonViewerRequired],
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


# ─── Brief Chat ───────────────────────────────────────────────────────────────

class BriefChatBody(BaseModel):
    message: str
    history: list[dict] | None = None
    brief_snapshot: dict | None = None  # current (possibly unsaved) form state from frontend


_BRIEF_FIELD_LABELS = {
    "niche": "Ниша",
    "products": "Продукты/услуги",
    "price_segment": "Ценовой сегмент",
    "geo": "Гео",
    "target_audience": "Целевая аудитория",
    "pains": "Боли клиентов",
    "usp": "УТП",
    "campaign_goal": "Цель кампании",
    "monthly_budget": "Месячный бюджет (₽)",
    "restrictions": "Ограничения",
    "excluded_geo": "Исключить гео",
    "keyword_modifiers": "Коммерческие модификаторы",
    "ad_geo": "Гео таргетинг",
    "competitors_urls": "Конкуренты",
}


def _build_brief_context(brief_data: dict) -> str:
    parts = []
    for key, label in _BRIEF_FIELD_LABELS.items():
        val = brief_data.get(key)
        if val is None or val == "" or val == [] or val == {}:
            continue
        if isinstance(val, list):
            display = ", ".join(str(v) for v in val if v)
            if not display:
                continue
        else:
            display = str(val)
        parts.append(f"**{label}:** {display}")
    return "\n".join(parts) if parts else "Бриф не заполнен"


@router.post("/{project_id}/brief/chat")
async def brief_chat(
    project_id: uuid.UUID,
    body: BriefChatBody,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """AI assistant answers clarifying questions about the brief."""
    project = _get_project_or_404(project_id, current_user, db)

    from app.services.claude import get_claude_client
    try:
        client = get_claude_client(db, task_type="brief_chat")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Use snapshot from frontend (includes unsaved form changes) or fall back to DB
    if body.brief_snapshot:
        brief_data = body.brief_snapshot
    else:
        brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
        brief_data = _brief_to_dict(brief) if brief else {}

    brief_context = _build_brief_context(brief_data)

    # Determine which important fields are still empty for targeted prompts
    important_empty = [
        label for key, label in _BRIEF_FIELD_LABELS.items()
        if key in ("niche", "products", "usp", "target_audience", "pains", "campaign_goal")
        and not brief_data.get(key)
    ]
    empty_hint = (
        f"\n\nОсобое внимание: следующие важные поля ещё не заполнены: {', '.join(important_empty)}."
        if important_empty else ""
    )

    intro = (
        f"Ты — опытный специалист по поисковому маркетингу."
        f" Помогаешь заполнить и улучшить бриф для проекта"
        f" «{project.name}» (сайт: {project.url})."
    )
    instructions = (
        "## Инструкции\n"
        "- Задавай уточняющие вопросы, если информации не хватает"
        " для разработки стратегии Яндекс Директ и SEO.\n"
        "- Если пользователь просит предложить формулировку поля —"
        " дай конкретный пример текста, который можно скопировать в бриф.\n"
        "- Если бриф уже достаточно полный — скажи об этом и предложи"
        " перейти к следующему шагу.\n"
        "- Отвечай кратко и по-деловому. Используй только русский язык.\n"
        "- Форматируй ответы с помощью Markdown:"
        " **жирный** для выделения, списки для перечислений."
    )
    system_prompt = (
        f"{intro}\n\n"
        f"## Текущий бриф\n{brief_context}{empty_hint}\n\n"
        f"{instructions}"
    )

    messages = []
    for h in (body.history or []):
        role = h.get("role", "user")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": h.get("content", "")})
    messages.append({"role": "user", "content": body.message})

    if client.use_openrouter:
        payload = {
            "model": client.model,
            "max_tokens": 800,
            "temperature": 0.7,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
        }
    else:
        payload = {
            "model": client.model,
            "max_tokens": 800,
            "temperature": 0.7,
            "system": system_prompt,
            "messages": messages,
        }

    try:
        async with httpx.AsyncClient(timeout=60) as http_client:
            resp = await http_client.post(
                client.base_url,
                headers=client._headers(),
                json=payload,
            )
        resp.raise_for_status()
        data = resp.json()
        if client.use_openrouter:
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        else:
            reply = data.get("content", [{}])[0].get("text", "")
        if not reply:
            raise HTTPException(status_code=502, detail="Empty response from AI")
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:500] if exc.response is not None else ""
        logger.error(
            "Claude API HTTP %s error in brief chat for project %s: %s",
            exc.response.status_code if exc.response is not None else "?",
            project_id,
            body,
        )
        raise HTTPException(
            status_code=502,
            detail=f"AI service error {exc.response.status_code}: {body}" if exc.response is not None else "AI service temporarily unavailable",
        )
    except httpx.RequestError as exc:
        logger.error("Claude API connection error in brief chat for project %s: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    except (KeyError, IndexError):
        logger.exception("Unexpected Claude API response format for project %s", project_id)
        raise HTTPException(status_code=502, detail="Unexpected AI response format")
    return {"response": reply}


# ─── Brief Improve ────────────────────────────────────────────────────────────

@router.post("/{project_id}/brief/improve")
async def brief_improve(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Ask Claude to analyze the brief and return improved field values as JSON."""
    project = _get_project_or_404(project_id, current_user, db)
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))

    from app.services.claude import get_claude_client

    try:
        client = get_claude_client(db, task_type="brief_improve")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    current = _brief_to_dict(brief) if brief else {}

    system_prompt = """Ты — эксперт по поисковому маркетингу. Твоя задача — проанализировать бриф и вернуть улучшенные значения полей.

Верни ТОЛЬКО JSON-объект без каких-либо пояснений, вводных слов и форматирования. Формат:
{
  "niche": "...",
  "products": "...",
  "price_segment": "...",
  "geo": "...",
  "target_audience": "...",
  "pains": "...",
  "usp": "...",
  "campaign_goal": "...",
  "restrictions": "...",
  "keyword_modifiers": ["купить", "заказать", "цена", ...]
}

Правила:
- Если поле уже заполнено хорошо — верни его без изменений
- Если поле пустое или слабое — дополни, опираясь на нишу и другие поля
- keyword_modifiers: предложи 8-15 коммерческих модификаторов для сбора семантики (купить, цена, заказать, оптом, доставка, официальный сайт, недорого и т.п.)
- Отвечай только на русском языке
- Верни строго валидный JSON, никакого текста вне JSON"""

    user_msg = f"""Текущий бриф:
Ниша: {current.get('niche') or 'не заполнено'}
Продукты/услуги: {current.get('products') or 'не заполнено'}
Ценовой сегмент: {current.get('price_segment') or 'не заполнено'}
Гео: {current.get('geo') or 'не заполнено'}
Целевая аудитория: {current.get('target_audience') or 'не заполнено'}
Боли клиентов: {current.get('pains') or 'не заполнено'}
УТП: {current.get('usp') or 'не заполнено'}
Цель кампании: {current.get('campaign_goal') or 'не заполнено'}
Ограничения: {current.get('restrictions') or 'не заполнено'}
Коммерческие модификаторы: {', '.join(current.get('keyword_modifiers') or []) or 'не заполнено'}
Сайт проекта: {project.url}

Улучши бриф и верни JSON."""

    if client.use_openrouter:
        payload = {
            "model": client.model,
            "max_tokens": 1500,
            "temperature": 0.4,
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_msg}],
        }
    else:
        payload = {
            "model": client.model,
            "max_tokens": 1500,
            "temperature": 0.4,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_msg}],
        }

    try:
        async with httpx.AsyncClient(timeout=60) as http_client:
            resp = await http_client.post(client.base_url, headers=client._headers(), json=payload)
        resp.raise_for_status()
        data = resp.json()
        if client.use_openrouter:
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        else:
            raw = data.get("content", [{}])[0].get("text", "")
        if not raw:
            raise HTTPException(status_code=502, detail="Empty response from AI")

        # Strip possible markdown code fences
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        improved = _json.loads(raw.strip())
        return {"improved": improved, "current": current}
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:500] if exc.response is not None else ""
        raise HTTPException(status_code=502, detail=f"AI service error: {body}")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    except Exception as exc:
        logger.exception("Error in brief improve for project %s: %s", project_id, exc)
        raise HTTPException(status_code=502, detail="Failed to parse AI response")


# ─── Project Duplication ──────────────────────────────────────────────────────

@router.post("/{project_id}/duplicate", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def duplicate_project(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Duplicate a project with its brief and campaign/group structure (no keywords/ads)."""
    from app.models.direct import AdGroup, Campaign

    original = _get_project_or_404(project_id, current_user, db)

    # Copy project
    new_project = Project(
        name=f"Копия {original.name}",
        client_name=original.client_name,
        url=original.url,
        specialist_id=original.specialist_id,
        budget=original.budget,
        notes=original.notes,
        status=original.status,
    )
    db.add(new_project)
    db.flush()

    # Copy brief
    original_brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    if original_brief:
        new_brief = Brief(
            project_id=new_project.id,
            niche=original_brief.niche,
            products=original_brief.products,
            price_segment=original_brief.price_segment,
            geo=original_brief.geo,
            target_audience=original_brief.target_audience,
            pains=original_brief.pains,
            usp=original_brief.usp,
            competitors_urls=original_brief.competitors_urls,
            campaign_goal=original_brief.campaign_goal,
            ad_geo=original_brief.ad_geo,
            excluded_geo=original_brief.excluded_geo,
            monthly_budget=original_brief.monthly_budget,
            restrictions=original_brief.restrictions,
            raw_data=original_brief.raw_data,
        )
        db.add(new_brief)
    else:
        db.add(Brief(project_id=new_project.id))

    # Copy campaign + group structure (no keywords/ads)
    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    for orig_camp in campaigns:
        new_camp = Campaign(
            project_id=new_project.id,
            name=orig_camp.name,
            type=orig_camp.type,
            priority=orig_camp.priority,
            geo=orig_camp.geo,
            budget_monthly=orig_camp.budget_monthly,
            sitelinks=orig_camp.sitelinks,
            strategy_text=orig_camp.strategy_text,
        )
        db.add(new_camp)
        db.flush()

        groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id == orig_camp.id)).all()
        for orig_group in groups:
            new_group = AdGroup(
                campaign_id=new_camp.id,
                name=orig_group.name,
            )
            db.add(new_group)

    db.commit()
    db.refresh(new_project)
    return _project_response(new_project)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: uuid.UUID, current_user: User, db: Session) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
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
        "keyword_modifiers": brief.keyword_modifiers or [],
        "raw_data": brief.raw_data,
        "updated_at": brief.updated_at.isoformat() if brief.updated_at else None,
    }
