from celery import Celery
from app.config import get_settings


def make_celery() -> Celery:
    settings = get_settings()
    celery = Celery(
        "seodirect",
        broker=str(settings.redis_url),
        backend=str(settings.redis_url),
        include=[
            "app.tasks.crawl",
            "app.tasks.direct",
            "app.tasks.seo",
            "app.tasks.reports",
        ],
    )
    celery.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="Europe/Moscow",
        enable_utc=True,
        task_track_started=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_soft_time_limit=600,
        task_time_limit=900,
        broker_connection_retry_on_startup=True,
    )
    return celery


celery_app = make_celery()
