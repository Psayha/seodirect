"""Shared rate limiter instance (slowapi).

Root cause
----------
`inspect.signature()` follows the `__wrapped__` chain set by `functools.wraps`,
returning the ORIGINAL function's `inspect.Signature` (with string annotations
created by `from __future__ import annotations`).  FastAPI then resolves those
strings using `getattr(wrapped_func, '__globals__', {})` — which points to the
slowapi module, not the router module — so `uuid` (and other names) are absent
and Pydantic raises:

    PydanticUserError: TypeAdapter[Annotated[ForwardRef('uuid.UUID'), ...]]
    is not fully defined

Fix
---
After wrapping, build a concrete `inspect.Signature` (with all ForwardRefs
resolved via the ORIGINAL function's globals) and attach it as
`wrapped.__signature__`.  Python's `inspect.unwrap` stops as soon as it finds
`__signature__`, so FastAPI receives concrete types and never needs to evaluate
string annotations against slowapi's globals.
"""
import functools
import inspect
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
    """Limiter that preserves route-function signatures after wrapping."""

    def limit(self, *args, **kwargs):
        base_decorator = super().limit(*args, **kwargs)

        def decorator(func):
            wrapped = base_decorator(func)
            functools.update_wrapper(wrapped, func)

            # Resolve string annotations using the ORIGINAL function's globals,
            # then attach a concrete __signature__ so inspect.signature() (used
            # by FastAPI) never falls back to slowapi's __globals__.
            try:
                resolved = typing.get_type_hints(func, include_extras=True)
                orig_sig = inspect.signature(func)
                new_params = [
                    param.replace(annotation=resolved[name])
                    if name in resolved
                    else param
                    for name, param in orig_sig.parameters.items()
                ]
                return_ann = resolved.get("return", orig_sig.return_annotation)
                wrapped.__signature__ = inspect.Signature(
                    new_params, return_annotation=return_ann
                )
                wrapped.__annotations__ = resolved
            except Exception:
                pass  # best-effort; fall back to string annotations

            return wrapped

        return decorator


limiter = _WrappingLimiter(key_func=_get_key)
