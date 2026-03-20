import logging
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
    delete_setting,
    get_prompt,
    get_setting,
    set_setting,
)

logger = logging.getLogger(__name__)

router = APIRouter()
AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


# ─── API Keys ────────────────────────────────────────────────────────────────

SERVICES = {
    "openrouter": {
        "keys": ["openrouter_api_key"],
        "label": "OpenRouter (LLM провайдер)",
    },
    "wordstat": {
        "keys": ["wordstat_oauth_token"],
        "label": "Яндекс Wordstat",
    },
    "topvisor": {
        "keys": ["topvisor_api_key", "topvisor_user_id"],
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


@router.delete("/api-keys/{service}/{key_name}", status_code=204)
def delete_api_key(
    service: str,
    key_name: str,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    if key_name not in SERVICES[service]["keys"]:
        raise HTTPException(status_code=400, detail=f"Key {key_name} not allowed for {service}")
    delete_setting(key_name, db)


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
    try:
        async with httpx.AsyncClient(timeout=10) as client:

            if service == "openrouter":
                key = get_setting("openrouter_api_key", db)
                if not key:
                    return {"ok": False, "message": "API ключ не задан"}
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
                if r.status_code == 200:
                    models = r.json().get("data", [])
                    claude_count = sum(1 for m in models if "anthropic" in m.get("id", ""))
                    return {"ok": True, "message": f"Подключено. Claude-моделей: {claude_count}"}
                if r.status_code in (401, 403):
                    return {"ok": False, "message": "Неверный API ключ"}
                return {"ok": False, "message": f"HTTP {r.status_code}"}

            elif service == "wordstat":
                token = get_setting("wordstat_oauth_token", db)
                if not token:
                    return {"ok": False, "message": "OAuth токен не задан"}
                r = await client.post(
                    "https://api.wordstat.yandex.net/v1/topRequests",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json;charset=utf-8"},
                    json={"phrases": ["тест"]},
                )
                if r.status_code == 200:
                    return {"ok": True, "message": "Подключено"}
                if r.status_code in (401, 403):
                    return {"ok": False, "message": "Неверный OAuth токен"}
                return {"ok": False, "message": f"HTTP {r.status_code}"}

            elif service == "metrika":
                token = get_setting("metrika_oauth_token", db)
                if not token:
                    return {"ok": False, "message": "OAuth токен не задан"}
                r = await client.get(
                    "https://api-metrika.yandex.net/management/v1/counters",
                    headers={"Authorization": f"OAuth {token}"},
                )
                if r.status_code == 200:
                    count = len(r.json().get("counters", []))
                    return {"ok": True, "message": f"Подключено. Счётчиков: {count}"}
                if r.status_code in (401, 403):
                    return {"ok": False, "message": "Неверный OAuth токен"}
                return {"ok": False, "message": f"HTTP {r.status_code}"}

            elif service == "topvisor":
                key = get_setting("topvisor_api_key", db)
                user_id = get_setting("topvisor_user_id", db)
                if not key:
                    return {"ok": False, "message": "API ключ не задан"}
                if not user_id:
                    return {"ok": False, "message": "User ID не задан"}
                from app.services.topvisor import check_connection as topvisor_check
                result = await topvisor_check(key, user_id)
                if result["ok"]:
                    count = result.get("projects_count", 0)
                    return {"ok": True, "message": f"Подключено. Проектов: {count}"}
                return {"ok": False, "message": result["message"]}

            elif service == "direct":
                token = get_setting("direct_oauth_token", db)
                login = get_setting("direct_client_login", db)
                if not token:
                    return {"ok": False, "message": "OAuth токен не задан"}
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept-Language": "ru",
                }
                if login:
                    headers["Client-Login"] = login
                r = await client.post(
                    "https://api.direct.yandex.com/json/v5/campaigns",
                    headers=headers,
                    json={"method": "get", "params": {"SelectionCriteria": {}, "FieldNames": ["Id"], "Page": {"Limit": 1}}},
                )
                if r.status_code == 200:
                    return {"ok": True, "message": "Подключено"}
                if r.status_code in (401, 403):
                    return {"ok": False, "message": "Неверный OAuth токен или логин"}
                return {"ok": False, "message": f"HTTP {r.status_code}"}

            return {"ok": False, "message": f"Неизвестный сервис: {service}"}

    except httpx.TimeoutException:
        return {"ok": False, "message": "Connection timed out — check network or API URL"}
    except httpx.ConnectError:
        return {"ok": False, "message": "Could not connect to API — check network"}
    except Exception:
        logger.exception("API key test failed for service %s", service)
        return {"ok": False, "message": "Connection test failed"}


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


# ─── AI models list ───────────────────────────────────────────────────────────

@router.get("/ai/models")
async def get_ai_models(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Fetch available models from OpenRouter."""
    try:
        openrouter_key = get_setting("openrouter_api_key", db)
        if not openrouter_key:
            raise HTTPException(status_code=400, detail="OpenRouter API ключ не задан")

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {openrouter_key}"},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"OpenRouter returned {r.status_code}")
            data = r.json().get("data", [])
            models = sorted(
                [{"id": m["id"], "name": m.get("name", m["id"])} for m in data if m.get("id")],
                key=lambda m: m["id"],
            )
            return {"provider": "openrouter", "models": models}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Таймаут запроса к OpenRouter")
    except Exception:
        logger.exception("Failed to fetch AI models")
        raise HTTPException(status_code=502, detail="Не удалось получить список моделей")


# ─── AI settings ─────────────────────────────────────────────────────────────

class AISettings(BaseModel):
    ai_model: str = "anthropic/claude-sonnet-4-20250514"
    ai_max_tokens: int = 4000
    ai_temperature: float = 0.7
    ai_language: str = "Русский"


@router.get("/ai", response_model=AISettings)
def get_ai_settings(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    return AISettings(
        ai_model=get_setting("ai_model", db) or "anthropic/claude-sonnet-4-20250514",
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


# ─── Per-task LLM settings ───────────────────────────────────────────────────

class LLMTaskSettings(BaseModel):
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None


@router.get("/ai/tasks")
def get_llm_tasks(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Get all LLM tasks with their current settings (per-task overrides + defaults)."""
    from app.services.claude import LLM_TASKS, LLM_TASK_GROUPS

    result = []
    for task_id, task_info in LLM_TASKS.items():
        # Read per-task overrides from DB
        task_model = get_setting(f"llm_{task_id}_model", db)
        task_temperature = get_setting(f"llm_{task_id}_temperature", db)
        task_max_tokens = get_setting(f"llm_{task_id}_max_tokens", db)

        result.append({
            "id": task_id,
            "label": task_info["label"],
            "group": task_info["group"],
            "group_label": LLM_TASK_GROUPS.get(task_info["group"], task_info["group"]),
            "description": task_info["description"],
            "default_model": task_info["default_model"],
            "default_temperature": task_info["default_temperature"],
            "default_max_tokens": task_info["default_max_tokens"],
            # Current overrides (null = using global/default)
            "model": task_model,
            "temperature": float(task_temperature) if task_temperature else None,
            "max_tokens": int(task_max_tokens) if task_max_tokens else None,
        })
    return {"tasks": result, "groups": LLM_TASK_GROUPS}


@router.put("/ai/tasks/{task_id}")
def update_llm_task(
    task_id: str,
    body: LLMTaskSettings,
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Update per-task LLM settings (model, temperature, max_tokens)."""
    from app.services.claude import LLM_TASKS

    if task_id not in LLM_TASKS:
        raise HTTPException(status_code=404, detail=f"Unknown LLM task: {task_id}")

    if body.model is not None:
        set_setting(f"llm_{task_id}_model", body.model, db, updated_by=current_user.id)
    if body.temperature is not None:
        set_setting(f"llm_{task_id}_temperature", str(body.temperature), db, updated_by=current_user.id)
    if body.max_tokens is not None:
        set_setting(f"llm_{task_id}_max_tokens", str(body.max_tokens), db, updated_by=current_user.id)
    return {"detail": "Updated"}


@router.delete("/ai/tasks/{task_id}", status_code=204)
def reset_llm_task(
    task_id: str,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Reset per-task LLM settings to defaults (deletes overrides)."""
    from app.services.claude import LLM_TASKS

    if task_id not in LLM_TASKS:
        raise HTTPException(status_code=404, detail=f"Unknown LLM task: {task_id}")

    for suffix in ("model", "temperature", "max_tokens"):
        delete_setting(f"llm_{task_id}_{suffix}", db)
    return None


# ─── White Label settings ─────────────────────────────────────────────────────

class WhiteLabelSettings(BaseModel):
    white_label_agency_name: str = "SEODirect Tool"
    white_label_logo_url: str = ""
    white_label_primary_color: str = "#1e40af"


@router.get("/white-label", response_model=WhiteLabelSettings)
def get_white_label_settings(
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    return WhiteLabelSettings(
        white_label_agency_name=get_setting("white_label_agency_name", db) or "SEODirect Tool",
        white_label_logo_url=get_setting("white_label_logo_url", db) or "",
        white_label_primary_color=get_setting("white_label_primary_color", db) or "#1e40af",
    )


@router.put("/white-label")
def update_white_label_settings(
    body: WhiteLabelSettings,
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


class PromptCreate(BaseModel):
    name: str
    module: str
    prompt_text: str


@router.post("/prompts", status_code=201)
def create_prompt(
    body: PromptCreate,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    existing = db.scalar(select(SystemPrompt).where(SystemPrompt.name == body.name))
    if existing:
        raise HTTPException(status_code=409, detail="Prompt with this name already exists")
    prompt = SystemPrompt(
        name=body.name,
        module=body.module,
        prompt_text=body.prompt_text,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return {"id": str(prompt.id), "name": prompt.name, "module": prompt.module, "updated_at": prompt.updated_at}


@router.delete("/prompts/{name}", status_code=204)
def delete_prompt(
    name: str,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    prompt = db.scalar(select(SystemPrompt).where(SystemPrompt.name == name))
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    db.delete(prompt)
    db.commit()


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
