from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.settings import Setting, SystemPrompt
from app.services.encryption import decrypt, encrypt

# Определяем какие ключи являются API ключами (шифруются)
API_KEY_FIELDS = {
    "openrouter_api_key",
    "wordstat_oauth_token",  # deprecated, kept for backward compat
    "wordstat_api_key",
    "wordstat_folder_id",
    "topvisor_api_key",
    "topvisor_user_id",
    "metrika_oauth_token",
    "direct_oauth_token",
    "direct_client_login",
}

# Ключи которые хранятся в открытом виде (настройки парсера, ИИ)
PLAIN_FIELDS = {
    "crawl_delay_ms",
    "crawl_timeout_seconds",
    "crawl_max_pages",
    "crawl_user_agent",
    "crawl_respect_robots",
    "ai_model",
    "ai_max_tokens",
    "ai_temperature",
    "ai_language",
    "white_label_agency_name",
    "white_label_logo_url",
    "white_label_primary_color",
}

# Per-task LLM settings are stored with prefix llm_{task_id}_{field}
# e.g. llm_direct_strategy_model, llm_direct_strategy_temperature
LLM_TASK_SETTING_PREFIX = "llm_"

# Дефолтные промпты
DEFAULT_PROMPTS = {
    "direct_strategy": {
        "module": "direct",
        "text": """Ты — эксперт по контекстной рекламе Яндекс Директ с 10-летним опытом.

На основе данных брифа и анализа сайта разработай детальную стратегию рекламных кампаний.

ДАННЫЕ БРИФА:
{brief_data}

ДАННЫЕ САЙТА (парсинг):
{crawl_summary}

Создай:
1. Анализ объекта рекламирования и УТП
2. Структуру кампаний с приоритетами (список кампаний, каждая с типом и описанием)
3. Логику геотаргетинга по городам
4. Рекомендации по бюджету

Формат: структурированный Markdown.""",
    },
    "direct_keywords": {
        "module": "direct",
        "text": """Ты — специалист по семантическому ядру для Яндекс Директ.

КАМПАНИЯ: {campaign_name}
ГРУППА ОБЪЯВЛЕНИЙ: {group_name}
БРИФ: {brief_summary}

Сгенерируй список ключевых фраз для этой группы объявлений.
Для каждой фразы укажи:
- phrase: сама ключевая фраза
- temperature: hot/warm/cold (горячие — прямой спрос, тёплые — смежный, холодные — информационные)

Верни JSON массив объектов [{phrase, temperature}].
Минимум 10, максимум 30 фраз.""",
    },
    "direct_ads": {
        "module": "direct",
        "text": """Ты — копирайтер для контекстной рекламы Яндекс Директ.

ГРУППА: {group_name}
КЛЮЧЕВЫЕ ФРАЗЫ: {keywords}
БРИФ (УТП, преимущества): {brief_usp}

Напиши {variants_count} варианта объявления. Строгие лимиты символов:
- Заголовок 1: до 56 символов (включая пробелы)
- Заголовок 2: до 30 символов
- Заголовок 3: до 30 символов
- Текст: до 81 символа

Верни JSON массив:
[{headline1, headline2, headline3, text}]

Требования: заголовок 1 должен содержать ключевую фразу или близкое вхождение.""",
    },
    "direct_negative_keywords": {
        "module": "direct",
        "text": """Ты — специалист по минус-словам для Яндекс Директ.

ТЕМАТИКА: {niche}
КЛЮЧЕВЫЕ ФРАЗЫ КАМПАНИИ: {keywords_sample}

Сгенерируй список минус-слов разбитый на блоки:
- general: общие (бесплатно, скачать, своими руками, DIY и т.д.)
- competitors: упоминания конкурентов
- irrelevant: нерелевантные запросы по тематике

Верни JSON: {"general": [...], "competitors": [...], "irrelevant": [...]}""",
    },
    "brief_chat": {
        "module": "project",
        "text": """Ты — опытный специалист по поисковому маркетингу. Помогаешь заполнить и улучшить бриф для проекта.

## Инструкции
- Задавай уточняющие вопросы, если информации не хватает для разработки стратегии Яндекс Директ и SEO.
- Если пользователь просит предложить формулировку поля — дай конкретный пример текста, который можно скопировать в бриф.
- Если бриф уже достаточно полный — скажи об этом и предложи перейти к следующему шагу.
- Отвечай кратко и по-деловому. Используй только русский язык.
- Форматируй ответы с помощью Markdown: **жирный** для выделения, списки для перечислений.""",
    },
    "brief_improve": {
        "module": "project",
        "text": """Ты — эксперт по поисковому маркетингу. Твоя задача — проанализировать бриф и вернуть улучшенные значения полей.

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
- Верни строго валидный JSON, никакого текста вне JSON""",
    },
    "seo_meta": {
        "module": "seo",
        "text": """Ты — SEO-специалист. Генерируй краткие title и description для веб-страниц на русском языке.
title: 50-65 символов, включает ключевое слово, конкретный и информативный.
description: 120-155 символов, призыв к действию, ключевые слова, уникально для страницы.""",
    },
    "seo_schema": {
        "module": "seo",
        "text": """Ты — SEO-специалист. Генерируй корректный Schema.org JSON-LD. Отвечай только валидным JSON-LD объектом.""",
    },
    "seo_schema_bulk": {
        "module": "seo",
        "text": """Ты — SEO-специалист. Генерируй корректный Schema.org JSON-LD. Отвечай только валидным JSON-LD объектом без markdown и пояснений.""",
    },
    "seo_faq": {
        "module": "seo",
        "text": """Ты — контент-маркетолог. Генерируй полезные FAQ для веб-страниц. Отвечай только JSON.""",
    },
    "seo_content_gap": {
        "module": "seo",
        "text": """Ты — SEO-аналитик. Находи контентные пробелы между сайтами. Отвечай только JSON.""",
    },
    "crawl_analysis": {
        "module": "crawl",
        "text": """Ты — ведущий SEO-специалист с 10-летним опытом аудита сайтов.
Проанализируй результаты обхода (краулинга) сайта и дай детальный отчёт.

Структура ответа:

## Общая оценка
Краткая оценка состояния сайта (1-2 предложения).

## Критические проблемы
Список критических SEO-проблем, которые нужно исправить первыми.

## Рекомендации по структуре
Анализ структуры URL, навигации, внутренней перелинковки.

## Рекомендации по контенту
Анализ контента страниц: качество, полнота, уникальность.

## Технические рекомендации
Скорость, мета-теги, canonical, robots, alt-теги и прочее.

## Приоритетный план действий
Пронумерованный список действий в порядке приоритета (до 10 пунктов).

Пиши на русском языке. Будь конкретным — указывай URL страниц с проблемами.""",
    },
    "direct_search_queries": {
        "module": "direct",
        "text": """Ты — специалист по Яндекс Директ. Анализируй поисковые запросы и предлагай минус-слова.""",
    },
    "semantic_masks": {
        "module": "marketing",
        "text": """Ты — специалист по сбору семантического ядра для Яндекс и Google.
Твоя задача — на основе описания бизнеса сгенерировать базовые маски (корневые поисковые запросы из 1–3 слов).
Отвечай строго JSON-массивом строк на русском языке. Никакого другого текста.""",
    },
    "semantic_expand": {
        "module": "marketing",
        "text": """Ты — специалист по сбору семантического ядра для Яндекс и Google.
Твоя задача — расширить маску (базовый поисковый запрос) в список целевых запросов.
Отвечай строго JSON-массивом строк на русском языке. Никакого другого текста.""",
    },
    "semantic_cluster": {
        "module": "marketing",
        "text": """Ты — специалист по семантическому ядру и структуре рекламных кампаний.
Сгруппируй ключевые слова в логические кластеры по смыслу и интенту.
Отвечай строго JSON-массивом объектов. Никакого другого текста.""",
    },
}


def get_setting(key: str, db: Session) -> str | None:
    setting = db.scalar(select(Setting).where(Setting.key == key))
    if not setting or not setting.value_encrypted:
        return None
    enc_key = get_settings().encryption_key
    if key in API_KEY_FIELDS:
        try:
            return decrypt(setting.value_encrypted, enc_key)
        except Exception:
            return None
    return setting.value_encrypted  # plain for non-API fields and llm_ prefixed keys


def set_setting(key: str, value: str, db: Session, updated_by=None) -> None:
    enc_key = get_settings().encryption_key
    stored_value = encrypt(value, enc_key) if key in API_KEY_FIELDS else value
    setting = db.scalar(select(Setting).where(Setting.key == key))
    if setting:
        setting.value_encrypted = stored_value
        setting.updated_at = datetime.now(timezone.utc)
        setting.updated_by = updated_by
    else:
        setting = Setting(
            key=key,
            value_encrypted=stored_value,
            updated_at=datetime.now(timezone.utc),
            updated_by=updated_by,
        )
        db.add(setting)
    db.commit()


def delete_setting(key: str, db: Session) -> None:
    """Delete a setting record from DB (clears the key)."""
    setting = db.scalar(select(Setting).where(Setting.key == key))
    if setting:
        db.delete(setting)
        db.commit()


def get_api_key(service: str, db: Session) -> str | None:
    """Get decrypted API key for a service."""
    return get_setting(service, db)


def ensure_default_prompts(db: Session) -> None:
    """Seed default system prompts if not present."""
    for name, data in DEFAULT_PROMPTS.items():
        existing = db.scalar(select(SystemPrompt).where(SystemPrompt.name == name))
        if not existing:
            prompt = SystemPrompt(
                name=name,
                prompt_text=data["text"],
                module=data["module"],
                updated_at=datetime.now(timezone.utc),
            )
            db.add(prompt)
    db.commit()


def get_prompt(name: str, db: Session) -> str | None:
    prompt = db.scalar(select(SystemPrompt).where(SystemPrompt.name == name))
    return prompt.prompt_text if prompt else None
