"""LLM client — OpenRouter only, with per-task model/temperature settings."""
import asyncio
import json
from typing import AsyncGenerator

import httpx


class LLMBillingError(RuntimeError):
    """Non-retryable error: billing, auth, or forbidden."""
    pass

# ── LLM Task Registry ────────────────────────────────────────────────────────
# Every place in the codebase that calls an LLM is registered here.
# Each task can have its own model, temperature, max_tokens configured via settings.

LLM_TASKS: dict[str, dict] = {
    "direct_strategy": {
        "label": "Стратегия Директ",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.7,
        "default_max_tokens": 4000,
        "description": "Генерация стратегии рекламных кампаний Яндекс Директ",
    },
    "direct_keywords": {
        "label": "Генерация ключей",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.7,
        "default_max_tokens": 4000,
        "description": "Генерация ключевых фраз для групп объявлений",
    },
    "direct_ads": {
        "label": "Генерация объявлений",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.8,
        "default_max_tokens": 4000,
        "description": "Копирайтинг заголовков и текстов объявлений",
    },
    "direct_negative_kw": {
        "label": "Минус-слова",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 4000,
        "description": "Генерация минус-слов для кампаний",
    },
    "direct_ad_rating": {
        "label": "Оценка объявлений",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 4000,
        "description": "Оценка качества объявлений с рекомендациями по улучшению",
    },
    "direct_search_queries": {
        "label": "Анализ поисковых запросов",
        "group": "direct",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 4000,
        "description": "Анализ реальных поисковых запросов и подбор минус-слов",
    },
    "seo_meta": {
        "label": "SEO мета-теги",
        "group": "seo",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.5,
        "default_max_tokens": 4000,
        "description": "Генерация title, description, OG-тегов для страниц",
    },
    "seo_schema": {
        "label": "Schema.org",
        "group": "seo",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 4000,
        "description": "Генерация Schema.org JSON-LD разметки",
    },
    "seo_schema_bulk": {
        "label": "Schema.org (пакетно)",
        "group": "seo",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 4000,
        "description": "Пакетная генерация Schema.org для нескольких страниц",
    },
    "seo_faq": {
        "label": "FAQ генерация",
        "group": "seo",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.6,
        "default_max_tokens": 4000,
        "description": "Генерация FAQ и FAQPage Schema.org для страниц",
    },
    "seo_content_gap": {
        "label": "Контентные пробелы",
        "group": "seo",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.5,
        "default_max_tokens": 4000,
        "description": "Анализ контентных пробелов vs конкуренты",
    },
    "brief_chat": {
        "label": "AI-чат по брифу",
        "group": "project",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.7,
        "default_max_tokens": 2000,
        "description": "Интерактивный чат для уточнения брифа",
    },
    "brief_improve": {
        "label": "Улучшение брифа",
        "group": "project",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.5,
        "default_max_tokens": 4000,
        "description": "Автоматический анализ и улучшение полей брифа",
    },
    "semantic_masks": {
        "label": "Генерация масок из бриф",
        "group": "marketing",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.7,
        "default_max_tokens": 4000,
        "description": "Генерация базовых масок семантического ядра из данных бриф",
    },
    "semantic_expand": {
        "label": "Расширение семантики",
        "group": "marketing",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.7,
        "default_max_tokens": 16000,
        "description": "Расширение масок ключевых слов в полный список фраз",
    },
    "semantic_cluster": {
        "label": "Кластеризация семантики",
        "group": "marketing",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.3,
        "default_max_tokens": 8000,
        "description": "Группировка ключевых слов в логические кластеры",
    },
    "crawl_analysis": {
        "label": "Анализ краулинга (ИИ)",
        "group": "crawl",
        "default_model": "anthropic/claude-sonnet-4-20250514",
        "default_temperature": 0.4,
        "default_max_tokens": 6000,
        "description": "ИИ-анализ результатов обхода сайта с рекомендациями",
    },
}

# Groups for UI display
LLM_TASK_GROUPS = {
    "direct": "Яндекс Директ",
    "seo": "SEO",
    "project": "Проект",
    "marketing": "Маркетинг",
    "crawl": "Краулинг",
}


class LLMClient:
    """OpenRouter-only LLM client."""

    OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(
        self,
        api_key: str,
        model: str = "anthropic/claude-sonnet-4-20250514",
        max_tokens: int = 4000,
        temperature: float = 0.7,
    ):
        self.api_key = api_key
        self.model = model if "/" in model else f"anthropic/{model}"
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://seodirect.tool",
            "X-Title": "SEODirect",
        }

    def _payload(self, system_prompt: str, user_message: str) -> dict:
        return {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }

    def _parse_response(self, data: dict) -> str:
        choices = data.get("choices", [])
        if not choices:
            error = data.get("error", {})
            if error:
                raise ValueError(f"OpenRouter error: {error.get('message', error)}")
            raise ValueError("Empty choices in OpenRouter response")
        choice = choices[0]
        content = choice.get("message", {}).get("content", "")
        finish_reason = choice.get("finish_reason", "")
        if finish_reason == "length":
            import logging
            logging.getLogger(__name__).warning(
                "LLM response truncated (finish_reason=length, model=%s, max_tokens=%d, content_len=%d)",
                self.model, self.max_tokens, len(content),
            )

        # Track usage from OpenRouter response
        usage = data.get("usage", {})
        if usage:
            try:
                from app.services.usage import track_llm_call
                tokens_in = usage.get("prompt_tokens", 0)
                tokens_out = usage.get("completion_tokens", 0)
                # OpenRouter may include cost in generation stats
                cost_cents = 0.0
                track_llm_call(
                    "openrouter",
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    cost_cents=cost_cents,
                    model=self.model,
                )
            except Exception:
                pass

        return content

    async def generate(self, system_prompt: str, user_message: str) -> str:
        """Generate a completion and return full text."""
        payload = self._payload(system_prompt, user_message)
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=120) as client:
            for attempt in range(3):
                try:
                    resp = await client.post(
                        self.OPENROUTER_URL, headers=self._headers(), json=payload
                    )
                    if resp.status_code in (429, 529):
                        await asyncio.sleep(2**attempt * 2)
                        continue
                    resp.raise_for_status()
                    return self._parse_response(resp.json())
                except (
                    httpx.TimeoutException,
                    httpx.ConnectError,
                    httpx.RemoteProtocolError,
                ) as e:
                    last_error = e
                    if attempt < 2:
                        await asyncio.sleep(2**attempt)
                        continue
                except httpx.HTTPStatusError as e:
                    status = e.response.status_code
                    if status in (429, 529):
                        await asyncio.sleep(2**attempt * 2)
                        continue
                    if status == 402:
                        raise LLMBillingError(
                            "Недостаточно средств на OpenRouter. "
                            "Пополните баланс на openrouter.ai/credits."
                        ) from e
                    if status == 401:
                        raise LLMBillingError(
                            "Неверный API-ключ OpenRouter. "
                            "Проверьте ключ в Настройки → API-ключи."
                        ) from e
                    if status == 403:
                        raise LLMBillingError(
                            f"Доступ к модели {self.model} запрещён. "
                            "Проверьте модель в настройках OpenRouter."
                        ) from e
                    raise
        raise RuntimeError(f"LLM API unavailable after 3 attempts: {last_error}")

    async def generate_stream(
        self, system_prompt: str, user_message: str
    ) -> AsyncGenerator[str, None]:
        """Generate with streaming, yield text chunks."""
        payload = {**self._payload(system_prompt, user_message), "stream": True}
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST", self.OPENROUTER_URL, headers=self._headers(), json=payload
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            choices = data.get("choices", [])
                            if choices:
                                text = (
                                    choices[0].get("delta", {}).get("content", "")
                                )
                                if text:
                                    yield text
                        except json.JSONDecodeError:
                            continue


# Backward-compatible alias
ClaudeClient = LLMClient


def get_llm_client(db, task_type: str | None = None) -> LLMClient:
    """Get configured LLMClient using DB settings.

    If task_type is provided, uses per-task settings with fallback to global defaults.
    Only OpenRouter is supported.
    """
    from app.services.settings_service import get_setting

    # Resolve per-task settings with fallback to global → registry default
    global_model = get_setting("ai_model", db) or "anthropic/claude-sonnet-4-20250514"
    global_max_tokens = int(get_setting("ai_max_tokens", db) or 4000)
    global_temperature = float(get_setting("ai_temperature", db) or 0.7)

    if task_type:
        # Per-task overrides: llm_{task_type}_model, etc.
        task_model = get_setting(f"llm_{task_type}_model", db)
        task_max_tokens = get_setting(f"llm_{task_type}_max_tokens", db)
        task_temperature = get_setting(f"llm_{task_type}_temperature", db)

        model = task_model or global_model
        max_tokens = int(task_max_tokens) if task_max_tokens else global_max_tokens
        temperature = float(task_temperature) if task_temperature else global_temperature
    else:
        model = global_model
        max_tokens = global_max_tokens
        temperature = global_temperature

    # Ensure model has provider prefix for OpenRouter
    if "/" not in model:
        model = f"anthropic/{model}"

    openrouter_key = get_setting("openrouter_api_key", db)
    if not openrouter_key:
        raise RuntimeError(
            "API ключ OpenRouter не настроен. Задайте OpenRouter API key в Настройки -> API ключи."
        )

    return LLMClient(
        api_key=openrouter_key,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
    )


# Backward-compatible alias
get_claude_client = get_llm_client
