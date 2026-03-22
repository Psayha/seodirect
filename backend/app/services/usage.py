"""API usage tracking via Redis counters.

Each external API call increments a daily counter:
    usage:{service}:{date}:calls   — number of API calls
    usage:{service}:{date}:tokens  — LLM tokens consumed (input+output)
    usage:{service}:{date}:cost    — estimated cost in USD cents

Counters auto-expire after 90 days.

Usage:
    from app.services.usage import track_call, track_llm_call, get_usage_summary

    track_call("wordstat")
    track_llm_call("openrouter", tokens_in=500, tokens_out=200, cost_cents=0.3)
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

_TTL_SECONDS = 90 * 86400  # 90 days


def _get_redis() -> redis.Redis:
    settings = get_settings()
    return redis.from_url(str(settings.redis_url), decode_responses=True)


def _date_key(d: date | None = None) -> str:
    return (d or date.today()).isoformat()


def track_call(service: str, count: int = 1) -> None:
    """Increment daily API call counter for a service."""
    try:
        r = _get_redis()
        key = f"usage:{service}:{_date_key()}:calls"
        r.incrby(key, count)
        r.expire(key, _TTL_SECONDS)
    except Exception:
        logger.debug("Failed to track usage for %s", service, exc_info=True)


def track_llm_call(
    service: str = "openrouter",
    tokens_in: int = 0,
    tokens_out: int = 0,
    cost_cents: float = 0,
    model: str = "",
) -> None:
    """Track LLM API call with token and cost details."""
    try:
        r = _get_redis()
        today = _date_key()
        pipe = r.pipeline()

        calls_key = f"usage:{service}:{today}:calls"
        tokens_key = f"usage:{service}:{today}:tokens"
        cost_key = f"usage:{service}:{today}:cost"

        pipe.incrby(calls_key, 1)
        pipe.incrby(tokens_key, tokens_in + tokens_out)
        pipe.incrbyfloat(cost_key, cost_cents)

        # Track per-model stats
        if model:
            model_key = f"usage:{service}:{today}:model:{model}:calls"
            pipe.incrby(model_key, 1)
            pipe.expire(model_key, _TTL_SECONDS)

        pipe.expire(calls_key, _TTL_SECONDS)
        pipe.expire(tokens_key, _TTL_SECONDS)
        pipe.expire(cost_key, _TTL_SECONDS)

        pipe.execute()
    except Exception:
        logger.debug("Failed to track LLM usage", exc_info=True)


# ── Known service limits ─────────────────────────────────────────────────────

SERVICE_LIMITS: dict[str, dict] = {
    "openrouter": {
        "label": "OpenRouter (LLM)",
        "daily_limit": None,  # Pay-as-you-go, no hard daily limit
        "rate_limit": "Depends on plan",
        "tracks": ["calls", "tokens", "cost"],
    },
    "wordstat": {
        "label": "Яндекс Wordstat",
        "daily_limit": 1000,
        "rate_limit": "10 req/s",
        "tracks": ["calls"],
    },
    "topvisor": {
        "label": "Topvisor",
        "daily_limit": None,  # Depends on plan
        "rate_limit": "Depends on plan",
        "tracks": ["calls"],
    },
    "metrika": {
        "label": "Яндекс Метрика",
        "daily_limit": 10000,
        "rate_limit": "10 req/s",
        "tracks": ["calls"],
    },
    "pagespeed": {
        "label": "Google PageSpeed",
        "daily_limit": 25000,
        "rate_limit": "400 req/100s",
        "tracks": ["calls"],
    },
    "openrouter_crawl": {
        "label": "OpenRouter (GEO/краулинг)",
        "daily_limit": None,
        "rate_limit": "Depends on plan",
        "tracks": ["calls"],
    },
}


def get_usage_summary(days: int = 30) -> list[dict]:
    """Get usage summary for all tracked services over the last N days."""
    try:
        r = _get_redis()
    except Exception:
        return []

    today = date.today()
    result = []

    for service, info in SERVICE_LIMITS.items():
        service_data = {
            "service": service,
            "label": info["label"],
            "daily_limit": info["daily_limit"],
            "rate_limit": info["rate_limit"],
            "today": {"calls": 0, "tokens": 0, "cost": 0.0},
            "period": {"calls": 0, "tokens": 0, "cost": 0.0, "days": days},
            "daily": [],
        }

        for i in range(days):
            d = today - timedelta(days=i)
            dk = d.isoformat()

            calls = int(r.get(f"usage:{service}:{dk}:calls") or 0)
            tokens = int(r.get(f"usage:{service}:{dk}:tokens") or 0)
            cost = float(r.get(f"usage:{service}:{dk}:cost") or 0)

            day_data = {"date": dk, "calls": calls, "tokens": tokens, "cost": round(cost, 2)}
            service_data["daily"].append(day_data)

            service_data["period"]["calls"] += calls
            service_data["period"]["tokens"] += tokens
            service_data["period"]["cost"] += cost

            if i == 0:
                service_data["today"] = {"calls": calls, "tokens": tokens, "cost": round(cost, 2)}

        service_data["period"]["cost"] = round(service_data["period"]["cost"], 2)

        # Only include services that have any usage or are configured
        result.append(service_data)

    return result


def get_today_usage(service: str) -> dict:
    """Quick check: today's usage for a single service."""
    try:
        r = _get_redis()
        dk = _date_key()
        return {
            "calls": int(r.get(f"usage:{service}:{dk}:calls") or 0),
            "tokens": int(r.get(f"usage:{service}:{dk}:tokens") or 0),
            "cost": float(r.get(f"usage:{service}:{dk}:cost") or 0),
        }
    except Exception:
        return {"calls": 0, "tokens": 0, "cost": 0}
