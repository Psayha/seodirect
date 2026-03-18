from __future__ import annotations

import redis as redis_lib

from app.config import get_settings

_BLACKLIST_PREFIX = "token_blacklist:"


def _get_redis() -> redis_lib.Redis:
    settings = get_settings()
    return redis_lib.from_url(str(settings.redis_url), decode_responses=True)


def _key(ip: str) -> str:
    return f"login_attempts:{ip}"


def _login_key(login: str) -> str:
    return f"login_attempts_user:{login}"


def check_rate_limit(ip: str, login: str | None = None) -> tuple[bool, int]:
    """Returns (is_allowed, remaining_attempts). Checks both IP and login-based limits."""
    settings = get_settings()
    r = _get_redis()
    ip_attempts = int(r.get(_key(ip)) or 0)

    # Also check per-login rate limit (prevents credential stuffing from multiple IPs)
    login_attempts = 0
    if login:
        login_attempts = int(r.get(_login_key(login)) or 0)

    max_attempts = settings.login_rate_limit_attempts
    worst = max(ip_attempts, login_attempts)
    allowed = worst < max_attempts
    remaining = max(0, max_attempts - worst)
    return allowed, remaining


def increment_attempts(ip: str, login: str | None = None) -> None:
    settings = get_settings()
    r = _get_redis()
    window = settings.login_rate_limit_window_seconds

    pipe = r.pipeline()
    pipe.incr(_key(ip))
    pipe.expire(_key(ip), window)
    if login:
        pipe.incr(_login_key(login))
        pipe.expire(_login_key(login), window)
    pipe.execute()


def clear_attempts(ip: str, login: str | None = None) -> None:
    r = _get_redis()
    r.delete(_key(ip))
    if login:
        r.delete(_login_key(login))


def get_ttl(ip: str, login: str | None = None) -> int:
    """Returns seconds until rate limit resets."""
    r = _get_redis()
    ip_ttl = r.ttl(_key(ip))
    login_ttl = r.ttl(_login_key(login)) if login else 0
    return max(0, ip_ttl, login_ttl)


# ── Refresh token blacklist ──────────────────────────────────────────────────


def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token (by its jti claim) to the blacklist until it expires naturally."""
    r = _get_redis()
    r.setex(f"{_BLACKLIST_PREFIX}{jti}", ttl_seconds, "1")


def is_token_blacklisted(jti: str) -> bool:
    """Check whether a refresh token has been revoked."""
    r = _get_redis()
    return r.exists(f"{_BLACKLIST_PREFIX}{jti}") > 0


def blacklist_all_user_tokens(user_id: str) -> None:
    """Bump a per-user counter so ALL existing refresh tokens become invalid."""
    r = _get_redis()
    r.set(f"token_gen:{user_id}", r.incr(f"token_gen:{user_id}"))


def get_user_token_generation(user_id: str) -> int:
    """Return current token generation for a user (0 if never bumped)."""
    r = _get_redis()
    val = r.get(f"token_gen:{user_id}")
    return int(val) if val else 0
