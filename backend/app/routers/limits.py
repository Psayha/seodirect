"""API usage & limits dashboard — admin only."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, require_roles
from app.db.session import get_db
from app.models.user import UserRole

router = APIRouter()
AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


@router.get("/limits/usage")
def get_usage(
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    days: int = Query(default=30, ge=1, le=90),
):
    """Return API usage statistics for all external services."""
    from app.services.usage import get_usage_summary
    return get_usage_summary(days=days)


@router.get("/limits/status")
def get_limits_status(
    current_user: CurrentUser,
    _: Annotated[object, AdminDep],
    db: Annotated[Session, Depends(get_db)],
):
    """Return connection status and limit info for each configured service."""
    from app.services.settings_service import get_setting
    from app.services.usage import SERVICE_LIMITS, get_today_usage

    services = []
    for service, info in SERVICE_LIMITS.items():
        today = get_today_usage(service)

        # Check if API key is configured
        key_mapping = {
            "openrouter": "openrouter_api_key",
            "wordstat": "wordstat_api_key",
            "topvisor": "topvisor_api_key",
            "metrika": "metrika_oauth_token",
            "pagespeed": "google_pagespeed_api_key",
            "openrouter_crawl": "openrouter_api_key",
        }
        key_name = key_mapping.get(service, "")
        is_configured = bool(get_setting(key_name, db)) if key_name else False

        # For pagespeed, it works without a key (free tier)
        if service == "pagespeed" and not is_configured:
            is_configured = True  # works without key

        limit_pct = None
        if info["daily_limit"] and today["calls"] > 0:
            limit_pct = round(today["calls"] / info["daily_limit"] * 100, 1)

        services.append({
            "service": service,
            "label": info["label"],
            "configured": is_configured,
            "daily_limit": info["daily_limit"],
            "rate_limit": info["rate_limit"],
            "today_calls": today["calls"],
            "today_tokens": today["tokens"],
            "today_cost": round(today["cost"], 2),
            "limit_used_pct": limit_pct,
        })

    return services
