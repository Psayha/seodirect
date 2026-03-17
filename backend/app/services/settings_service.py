from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.settings import Setting, SystemPrompt
from app.services.encryption import decrypt, encrypt

# Определяем какие ключи являются API ключами (шифруются)
API_KEY_FIELDS = {
    "anthropic_api_key",
    "wordstat_oauth_token",
    "topvisor_api_key",
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
}

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
    return setting.value_encrypted  # plain for non-API fields


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
