"""Shared rate limiter instance (slowapi)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Key by authenticated user ID when available, otherwise by IP
def _get_key(request):
    user = getattr(request.state, "current_user", None)
    if user:
        return str(user.id)
    return get_remote_address(request)


limiter = Limiter(key_func=_get_key)
