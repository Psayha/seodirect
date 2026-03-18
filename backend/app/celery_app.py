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
        result_expires=3600,
        worker_prefetch_multiplier=1,
        task_soft_time_limit=600,
        task_time_limit=900,
        broker_connection_retry_on_startup=True,
        # Reject tasks back to broker if worker dies mid-task (prevents silent loss)
        task_reject_on_worker_lost=True,
        # Dead letter queue: failed tasks go to a separate queue for inspection
        task_queues={
            "celery": {
                "exchange": "celery",
                "routing_key": "celery",
                "queue_arguments": {
                    "x-dead-letter-exchange": "dlx",
                    "x-dead-letter-routing-key": "dead_letter",
                },
            }
        },
    )
    return celery


celery_app = make_celery()
