"""Shared rate limiter instance (slowapi).

The @limiter.limit() decorator (from slowapi) wraps route functions with a
new callable whose __globals__ belong to the slowapi module — not to the
router module. FastAPI uses the function's __globals__ to resolve forward
references created by 'from __future__ import annotations'. If __globals__
doesn't contain 'uuid', Pydantic raises:

    PydanticUserError: TypeAdapter[Annotated[ForwardRef('uuid.UUID'), ...]]
    is not fully defined

Fix: after wrapping, eagerly resolve all string annotations on the wrapped
function by calling typing.get_type_hints() with the ORIGINAL function's
globals, then writing the resolved concrete types back to __annotations__.
Pydantic then sees concrete types instead of ForwardRefs and the error goes away.
"""
import functools
import typing

from slowapi import Limiter
from slowapi.util import get_remote_address


def _get_key(request):
    """Rate-limit key: user ID when authenticated, remote IP otherwise."""
    user = getattr(request.state, "current_user", None)
    if user:
        return str(user.id)
    return get_remote_address(request)


class _WrappingLimiter(Limiter):
    """Limiter that preserves route-function type annotations after wrapping."""

    def limit(self, *args, **kwargs):
        base_decorator = super().limit(*args, **kwargs)

        def decorator(func):
            wrapped = base_decorator(func)
            functools.update_wrapper(wrapped, func)

            # Eagerly resolve string annotations (from __future__ import annotations)
            # using the ORIGINAL function's module globals so FastAPI/Pydantic can
            # build the OpenAPI schema without hitting unresolvable ForwardRefs.
            try:
                resolved = typing.get_type_hints(func, include_extras=True)
                wrapped.__annotations__ = resolved
            except Exception:
                pass  # best-effort; fall back to string annotations

            return wrapped

        return decorator


limiter = _WrappingLimiter(key_func=_get_key)
