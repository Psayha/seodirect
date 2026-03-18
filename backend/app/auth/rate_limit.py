import redis as redis_lib

from app.config import get_settings


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
