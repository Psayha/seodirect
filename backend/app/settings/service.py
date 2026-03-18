from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.encryption import decrypt, encrypt, mask_value
from app.config import get_settings
from app.models.settings import Setting

# Известные API сервисы и их поля
API_SERVICES = {
    "anthropic": {
        "label": "Anthropic (Claude)",
        "fields": ["api_key", "model"],
        "test_url": "https://api.anthropic.com/v1/models",
    },
    "wordstat": {
        "label": "Яндекс Wordstat",
        "fields": ["oauth_token", "client_id"],
        "test_url": "https://api.wordstat.yandex.net",
    },
    "topvisor": {
        "label": "Topvisor",
        "fields": ["api_key"],
        "test_url": "https://api.topvisor.com/v2",
    },
    "metrika": {
        "label": "Яндекс Метрика",
        "fields": ["oauth_token"],
        "test_url": "https://api-metrika.yandex.net/management/v1/counters",
    },
    "direct": {
        "label": "Яндекс Директ",
        "fields": ["oauth_token", "client_login"],
        "test_url": "https://api.direct.yandex.com/json/v5/campaigns",
    },
}


def _setting_key(service: str, field: str) -> str:
    return f"api.{service}.{field}"


def get_raw_value(db: Session, key: str) -> str | None:
    """Get decrypted value from settings table."""
    row = db.scalar(select(Setting).where(Setting.key == key))
    if not row or not row.value_encrypted:
        return None
    config = get_settings()
    try:
        return decrypt(row.value_encrypted, config.encryption_key)
    except Exception:
        return None


def set_value(db: Session, key: str, value: str, user_id=None) -> None:
    """Encrypt and save value to settings table."""
    config = get_settings()
    encrypted = encrypt(value, config.encryption_key)
    row = db.scalar(select(Setting).where(Setting.key == key))
    if row:
        row.value_encrypted = encrypted
        row.updated_at = datetime.now(timezone.utc)
        row.updated_by = user_id
    else:
        row = Setting(
            key=key,
            value_encrypted=encrypted,
            updated_at=datetime.now(timezone.utc),
            updated_by=user_id,
        )
        db.add(row)
    db.commit()


def get_api_key_info(db: Session, service: str) -> dict:
    """Get info about a service's API keys (masked values + is_set flags)."""
    service_meta = API_SERVICES.get(service, {})
    fields = service_meta.get("fields", [])
    result = {"service": service, "label": service_meta.get("label", service), "fields": {}}
    for field in fields:
        key = _setting_key(service, field)
        raw = get_raw_value(db, key)
        result["fields"][field] = {
            "is_set": raw is not None and len(raw) > 0,
            "masked_value": mask_value(raw) if raw else None,
        }
    return result


def set_api_key(db: Session, service: str, field: str, value: str, user_id=None) -> None:
    key = _setting_key(service, field)
    set_value(db, key, value, user_id)


def get_api_key(db: Session, service: str, field: str = "api_key") -> str | None:
    key = _setting_key(service, field)
    return get_raw_value(db, key)
