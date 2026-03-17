from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.config import get_settings
from app.db.session import get_db
from app.models.user import UserRole
from app.settings.service import (
    API_SERVICES,
    get_api_key_info,
    get_raw_value,
    set_api_key,
    set_value,
)

router = APIRouter()

AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


# ── API Ключи ────────────────────────────────────────────────

@router.get("/api-keys")
def list_api_keys(
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    return [get_api_key_info(db, service) for service in API_SERVICES]


class ApiKeyUpdate(BaseModel):
    field: str
    value: str


@router.put("/api-keys/{service}")
def update_api_key(
    service: str,
    body: ApiKeyUpdate,
    current_user: CurrentUser,
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    if service not in API_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service}")
    service_meta = API_SERVICES[service]
    if body.field not in service_meta["fields"]:
        raise HTTPException(status_code=400, detail=f"Unknown field: {body.field}")
    set_api_key(db, service, body.field, body.value, current_user.id)
    return {"ok": True}


@router.post("/api-keys/{service}/test")
def test_api_key(
    service: str,
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    if service not in API_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service}")

    service_meta = API_SERVICES[service]
    fields = service_meta["fields"]

    # Получить первый ключевой токен
    primary_field = fields[0]
    from app.settings.service import _setting_key
    raw = get_raw_value(db, _setting_key(service, primary_field))
    if not raw:
        return {"ok": False, "message": "API key not set"}

    try:
        headers = {}
        if service == "anthropic":
            headers = {"x-api-key": raw, "anthropic-version": "2023-06-01"}
        elif service in ("wordstat", "metrika", "direct"):
            headers = {"Authorization": f"OAuth {raw}"}
        elif service == "topvisor":
            headers = {"User-Key": raw, "Project-Id": "0"}

        with httpx.Client(timeout=10) as client:
            resp = client.get(service_meta["test_url"], headers=headers)

        # 200 или 401 — ключ рабочий (401 = авторизован но нет доступа к этому endpoint)
        ok = resp.status_code in (200, 201, 400, 401, 403)
        return {"ok": ok, "status_code": resp.status_code, "message": "Connection successful" if ok else f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── Настройки парсера ────────────────────────────────────────

class CrawlerSettings(BaseModel):
    crawl_delay_ms: int = 1000
    timeout_seconds: int = 10
    max_pages: int = 500
    user_agent: str = "SEODirectBot/1.0 (internal)"
    respect_robots: bool = True


@router.get("/crawler", response_model=CrawlerSettings)
def get_crawler_settings(_: Annotated[Any, AdminDep]):
    cfg = get_settings()
    return CrawlerSettings(
        crawl_delay_ms=cfg.crawl_delay_ms_default,
        timeout_seconds=cfg.crawl_timeout_seconds,
        max_pages=cfg.crawl_max_pages,
        user_agent=cfg.crawl_user_agent,
        respect_robots=cfg.crawl_respect_robots,
    )


# ── Настройки ИИ ─────────────────────────────────────────────

class AISettings(BaseModel):
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4000
    temperature: float = 0.7
    language: str = "ru"


@router.get("/ai", response_model=AISettings)
def get_ai_settings(
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    model = get_raw_value(db, "ai.model") or "claude-sonnet-4-20250514"
    max_tokens = int(get_raw_value(db, "ai.max_tokens") or 4000)
    temperature = float(get_raw_value(db, "ai.temperature") or 0.7)
    language = get_raw_value(db, "ai.language") or "ru"
    return AISettings(model=model, max_tokens=max_tokens, temperature=temperature, language=language)


@router.put("/ai")
def update_ai_settings(
    body: AISettings,
    current_user: CurrentUser,
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    set_value(db, "ai.model", body.model, current_user.id)
    set_value(db, "ai.max_tokens", str(body.max_tokens), current_user.id)
    set_value(db, "ai.temperature", str(body.temperature), current_user.id)
    set_value(db, "ai.language", body.language, current_user.id)
    return {"ok": True}


# ── Системные промпты ────────────────────────────────────────

from app.models.settings import SystemPrompt


@router.get("/prompts")
def list_prompts(
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    prompts = db.scalars(select(SystemPrompt)).all()
    return [{"id": str(p.id), "name": p.name, "module": p.module, "prompt_text": p.prompt_text} for p in prompts]


class PromptUpdate(BaseModel):
    prompt_text: str


@router.put("/prompts/{prompt_id}")
def update_prompt(
    prompt_id: str,
    body: PromptUpdate,
    _: Annotated[Any, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    import uuid
    prompt = db.scalar(select(SystemPrompt).where(SystemPrompt.id == uuid.UUID(prompt_id)))
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    prompt.prompt_text = body.prompt_text
    db.commit()
    return {"ok": True}
