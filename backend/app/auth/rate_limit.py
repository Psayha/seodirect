import redis as redis_lib
from app.config import get_settings


def _get_redis() -> redis_lib.Redis:
    settings = get_settings()
    return redis_lib.from_url(str(settings.redis_url), decode_responses=True)


def _key(ip: str) -> str:
    return f"login_attempts:{ip}"


def check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    settings = get_settings()
    r = _get_redis()
    count = r.get(_key(ip))
    if count and int(count) >= settings.login_rate_limit_attempts:
        return False
    return True


def increment_attempts(ip: str) -> int:
    settings = get_settings()
    r = _get_redis()
    pipe = r.pipeline()
    pipe.incr(_key(ip))
    pipe.expire(_key(ip), settings.login_rate_limit_window_seconds)
    results = pipe.execute()
    return results[0]


def clear_attempts(ip: str) -> None:
    r = _get_redis()
    r.delete(_key(ip))


def get_ttl(ip: str) -> int:
    """Returns remaining seconds for the rate limit window."""
    r = _get_redis()
    ttl = r.ttl(_key(ip))
    return max(0, ttl)
