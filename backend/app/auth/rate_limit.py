import redis as redis_lib

from app.config import get_settings


def _get_redis() -> redis_lib.Redis:
    settings = get_settings()
    return redis_lib.from_url(str(settings.redis_url), decode_responses=True)


def _key(ip: str) -> str:
    return f"login_attempts:{ip}"


def check_rate_limit(ip: str) -> tuple[bool, int]:
    """Returns (is_allowed, remaining_attempts)."""
    settings = get_settings()
    r = _get_redis()
    attempts = int(r.get(_key(ip)) or 0)
    allowed = attempts < settings.login_rate_limit_attempts
    remaining = max(0, settings.login_rate_limit_attempts - attempts)
    return allowed, remaining


def increment_attempts(ip: str) -> None:
    settings = get_settings()
    r = _get_redis()
    key = _key(ip)
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, settings.login_rate_limit_window_seconds)
    pipe.execute()


def clear_attempts(ip: str) -> None:
    r = _get_redis()
    r.delete(_key(ip))


def get_ttl(ip: str) -> int:
    """Returns seconds until rate limit resets."""
    r = _get_redis()
    ttl = r.ttl(_key(ip))
    return max(0, ttl)
