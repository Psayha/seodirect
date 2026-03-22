"""Send Web Push notifications to users.

Usage from Celery tasks:

    from app.services.push import notify_user
    notify_user(db, user_id, "Парсинг завершён", "Обработано 42 страницы", url="/projects/...")
"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def notify_user(
    db: Session,
    user_id: uuid.UUID,
    title: str,
    body: str,
    url: str = "/",
) -> int:
    """Send a push notification to all subscriptions of a given user.

    Returns the number of successfully delivered notifications.
    Silently returns 0 if pywebpush is not installed or VAPID is not configured.
    """
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.debug("pywebpush not installed — skipping push notification")
        return 0

    from app.config import get_settings
    from app.models.push_subscription import PushSubscription

    settings = get_settings()
    vapid_private = settings.vapid_private_key
    if not vapid_private:
        logger.debug("VAPID_PRIVATE_KEY not configured — skipping push notification")
        return 0

    subs = db.scalars(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    ).all()

    if not subs:
        return 0

    vapid_claims = {"sub": f"mailto:{settings.vapid_email}"}
    payload = json.dumps({"title": title, "body": body, "url": url})

    delivered = 0
    expired_ids: list[uuid.UUID] = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
            delivered += 1
        except WebPushException as exc:
            # 404/410 means subscription expired — clean up
            if hasattr(exc, "response") and exc.response is not None:
                status = getattr(exc.response, "status_code", 0)
                if status in (404, 410):
                    expired_ids.append(sub.id)
                    continue
            logger.warning("Push failed for endpoint %s: %s", sub.endpoint[:40], exc)
        except Exception:
            logger.exception("Unexpected push error for endpoint %s", sub.endpoint[:40])

    # Remove expired subscriptions
    if expired_ids:
        for sub_id in expired_ids:
            expired_sub = db.get(PushSubscription, sub_id)
            if expired_sub:
                db.delete(expired_sub)
        db.commit()
        logger.info("Removed %d expired push subscriptions for user %s", len(expired_ids), user_id)

    return delivered


def notify_project_owner(
    db: Session,
    project_id: uuid.UUID,
    title: str,
    body: str,
    url: str | None = None,
) -> int:
    """Send push notification to the specialist assigned to a project.

    Automatically builds the URL from project_id if not provided.
    """
    from app.models.project import Project

    project = db.get(Project, project_id)
    if not project or not project.specialist_id:
        return 0

    if url is None:
        url = f"/projects/{project_id}"

    return notify_user(db, project.specialist_id, title, body, url)
