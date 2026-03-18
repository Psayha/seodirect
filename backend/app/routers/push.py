"""Browser push notifications: subscription management and send."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser
from app.db.session import get_db
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class SubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class SendBody(BaseModel):
    title: str
    body: str
    url: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    body: SubscribeBody,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Save push subscription for current user."""
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if existing:
        # Update keys in case they changed
        existing.p256dh = body.p256dh
        existing.auth = body.auth
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
        )
        db.add(sub)
    db.commit()


@router.delete("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    body: SubscribeBody,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Remove push subscription."""
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if existing:
        db.delete(existing)
        db.commit()


@router.post("/push/send-self", status_code=status.HTTP_204_NO_CONTENT)
def send_self(
    body: SendBody,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Send a push notification to all subscriptions of the current user (test/demo)."""
    subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == current_user.id)).all()
    if not subs:
        raise HTTPException(status_code=400, detail="No push subscriptions found for this user")

    try:
        from pywebpush import webpush, WebPushException
        import json
        from app.config import get_settings
        settings = get_settings()
        vapid_private = getattr(settings, "vapid_private_key", None)
        vapid_claims = {"sub": f"mailto:{getattr(settings, 'vapid_email', 'admin@seodirect.ru')}"}

        payload = json.dumps({"title": body.title, "body": body.body, "url": body.url or "/"})

        failed = []
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=vapid_private,
                    vapid_claims=vapid_claims,
                )
            except WebPushException as e:
                logger.warning("Push failed for endpoint %s: %s", sub.endpoint[:40], e)
                failed.append(sub.endpoint)

        if failed:
            raise HTTPException(status_code=207, detail=f"Failed to deliver to {len(failed)} subscription(s)")

    except ImportError:
        # pywebpush not installed — return VAPID public key for client-side use only
        raise HTTPException(
            status_code=501,
            detail="pywebpush not installed. Push delivery requires pywebpush package.",
        )


@router.get("/push/vapid-public-key")
def vapid_public_key():
    """Return the VAPID public key for the frontend to use when subscribing."""
    try:
        from app.config import get_settings
        settings = get_settings()
        key = getattr(settings, "vapid_public_key", None)
        if not key:
            return {"vapid_public_key": None}
        return {"vapid_public_key": key}
    except Exception:
        return {"vapid_public_key": None}
