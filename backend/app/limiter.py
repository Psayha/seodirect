"""Shared rate limiter instance (slowapi).

Wraps slowapi's Limiter so the @limiter.limit() decorator preserves the
original function's __module__ and __globals__. This is required for
FastAPI's OpenAPI schema generation when 'from __future__ import annotations'
is active — without it, uuid.UUID and other types become unresolvable
ForwardRefs when Pydantic tries to build TypeAdapters for route parameters.
"""
import functools

from slowapi import Limiter
from slowapi.util import get_remote_address


# Key by authenticated user ID when available, otherwise by IP
def _get_key(request):
    user = getattr(request.state, "current_user", None)
    if user:
        return str(user.id)
    return get_remote_address(request)


class _WrappingLimiter(Limiter):
    """Limiter subclass that ensures decorated functions keep their metadata."""

    def limit(self, *args, **kwargs):
        base_decorator = super().limit(*args, **kwargs)

        def decorator(func):
            wrapped = base_decorator(func)
            # Preserve __module__, __globals__, __annotations__, __qualname__
            # so FastAPI/Pydantic can resolve forward references from
            # 'from __future__ import annotations' correctly.
            functools.update_wrapper(wrapped, func)
            return wrapped

        return decorator


limiter = _WrappingLimiter(key_func=_get_key)
