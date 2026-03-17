import uuid
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.config import get_settings
from app.db.session import get_db
from app.models.settings import SystemPrompt
from app.models.user import UserRole
from app.services.encryption import mask_value
from app.services.settings_service import (
    API_KEY_FIELDS,
    get_setting,
    set_setting,
    get_prompt,
)

router = APIRouter()
AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


# ─── API Keys ────────────────────────────────────────────────────────────────

SERVICES = {
    "anthropic": {
        "keys": ["anthropic_api_key"],
        "label": "Anthropic (Claude)",
    },
    "wordstat": {
        "keys": ["wordstat_oauth_token"],
        "label": "Яндекс Wordstat",
    },
    "topvisor": {
        "keys": ["topvisor_api_key"],
        "label": "Topvisor",
    },
    "metrika": {
        "keys": ["metrika_oauth_token"],
        "label": "Яндекс Метрика",
    },
    "direct": {
        "keys": ["direct_oauth_token", "direct_client_login"],
        "label": "Яндекс Директ",
    },
}


@router.get("/api-keys")
def get_api_keys(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    result = []
    for service_id, info in SERVICES.items():
        keys_info = []
        for key in info["keys"]:
            raw = get_setting(key, db)
            keys_info.append({
                "key": key,
                "is_set": raw is not None and len(raw) > 0,
                "masked": mask_value(raw) if raw else None,
            })
        result.append({
            "service": service_id,
            "label": info["label"],
            "keys": keys_info,
        })
    return result


class ApiKeyUpdate(BaseModel):
    values: dict[str, str]  # key_name -> value


@router.put("/api-keys/{service}")
def update_api_keys(
    service: str,
    body: ApiKeyUpdate,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    allowed_keys = SERVICES[service]["keys"]
    for key, value in body.values.items():
        if key not in allowed_keys:
            raise HTTPException(status_code=400, detail=f"Key {key} not allowed for {service}")
        if value:
            set_setting(key, value, db, updated_by=current_user.id)
    return {"detail": "Updated"}


@router.post("/api-keys/{service}/test")
async def test_api_key(
    service: str,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Test connectivity for an API service."""
    if service == "anthropic":
        api_key = get_setting("anthropic_api_key", db)
        if not api_key:
            return {"ok": False, "message": "API key not set"}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                )
            if r.status_code in (200, 401):
                ok = r.status_code == 200
                return {"ok": ok, "message": "Connected" if ok else "Invalid API key"}
            return {"ok": False, "message": f"HTTP {r.status_code}"}
        except Exception as e:
            return {"ok": False, "message": str(e)}
    return {"ok": False, "message": f"Test not implemented for {service}"}


# ─── Crawler settings ─────────────────────────────────────────────────────────

class CrawlerSettings(BaseModel):
    crawl_delay_ms: int = 1000
    crawl_timeout_seconds: int = 10
    crawl_max_pages: int = 500
    crawl_user_agent: str = "SEODirectBot/1.0 (internal)"
    crawl_respect_robots: bool = True


@router.get("/crawler", response_model=CrawlerSettings)
def get_crawler_settings(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    cfg = get_settings()
    return CrawlerSettings(
        crawl_delay_ms=int(get_setting("crawl_delay_ms", db) or cfg.crawl_delay_ms_default),
        crawl_timeout_seconds=int(get_setting("crawl_timeout_seconds", db) or cfg.crawl_timeout_seconds),
        crawl_max_pages=int(get_setting("crawl_max_pages", db) or cfg.crawl_max_pages),
        crawl_user_agent=get_setting("crawl_user_agent", db) or cfg.crawl_user_agent,
        crawl_respect_robots=(get_setting("crawl_respect_robots", db) or "true") == "true",
    )


@router.put("/crawler")
def update_crawler_settings(
    body: CrawlerSettings,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    for field, value in body.model_dump().items():
        set_setting(field, str(value), db, updated_by=current_user.id)
    return {"detail": "Updated"}


# ─── AI settings ─────────────────────────────────────────────────────────────

class AISettings(BaseModel):
    ai_model: str = "claude-sonnet-4-20250514"
    ai_max_tokens: int = 4000
    ai_temperature: float = 0.7
    ai_language: str = "Русский"


@router.get("/ai", response_model=AISettings)
def get_ai_settings(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    return AISettings(
        ai_model=get_setting("ai_model", db) or "claude-sonnet-4-20250514",
        ai_max_tokens=int(get_setting("ai_max_tokens", db) or 4000),
        ai_temperature=float(get_setting("ai_temperature", db) or 0.7),
        ai_language=get_setting("ai_language", db) or "Русский",
    )


@router.put("/ai")
def update_ai_settings(
    body: AISettings,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    for field, value in body.model_dump().items():
        set_setting(field, str(value), db, updated_by=current_user.id)
    return {"detail": "Updated"}


# ─── System prompts ────────────────────────────────────────────────────────────

class PromptUpdate(BaseModel):
    prompt_text: str


@router.get("/prompts")
def list_prompts(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    prompts = db.scalars(select(SystemPrompt).order_by(SystemPrompt.module, SystemPrompt.name)).all()
    return [
        {"id": str(p.id), "name": p.name, "module": p.module, "updated_at": p.updated_at}
        for p in prompts
    ]


@router.get("/prompts/{name}")
def get_prompt_by_name(
    name: str,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    prompt = db.scalar(select(SystemPrompt).where(SystemPrompt.name == name))
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"id": str(prompt.id), "name": prompt.name, "module": prompt.module, "prompt_text": prompt.prompt_text}


@router.put("/prompts/{name}")
def update_prompt(
    name: str,
    body: PromptUpdate,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    prompt = db.scalar(select(SystemPrompt).where(SystemPrompt.name == name))
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    prompt.prompt_text = body.prompt_text
    prompt.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"detail": "Updated"}
