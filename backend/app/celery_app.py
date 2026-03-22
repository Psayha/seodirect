from celery import Celery
from kombu import Exchange, Queue

from app.config import get_settings

# Queue definitions
default_exchange = Exchange("default", type="direct")
heavy_exchange = Exchange("heavy", type="direct")
dlx_exchange = Exchange("dlx", type="direct")

TASK_QUEUES = (
    Queue(
        "default",
        default_exchange,
        routing_key="default",
        queue_arguments={
            "x-dead-letter-exchange": "dlx",
            "x-dead-letter-routing-key": "dead_letter",
        },
    ),
    Queue(
        "heavy",
        heavy_exchange,
        routing_key="heavy",
        queue_arguments={
            "x-dead-letter-exchange": "dlx",
            "x-dead-letter-routing-key": "dead_letter",
        },
    ),
    Queue("dead_letter", dlx_exchange, routing_key="dead_letter"),
)

# Route long-running tasks to the heavy queue
TASK_ROUTES = {
    "tasks.crawl.run_crawl": {"queue": "heavy"},
    "task_geo_scan": {"queue": "heavy"},
    "task_geo_audit": {"queue": "heavy"},
    "tasks.reports.monthly_reports": {"queue": "heavy"},
    "tasks.seo.generate_schema_bulk": {"queue": "heavy"},
}


def make_celery() -> Celery:
    settings = get_settings()
    celery = Celery(
        "seodirect",
        broker=str(settings.redis_url),
        backend=str(settings.redis_url),
        include=[
            "app.tasks.crawl",
            "app.tasks.direct",
            "app.tasks.geo",
            "app.tasks.marketing",
            "app.tasks.reports",
            "app.tasks.seo",
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
        task_compression="gzip",
        broker_connection_retry_on_startup=True,
        # Reject tasks back to broker if worker dies mid-task (prevents silent loss)
        task_reject_on_worker_lost=True,
        # Queue routing
        task_queues=TASK_QUEUES,
        task_default_queue="default",
        task_default_exchange="default",
        task_default_routing_key="default",
        task_routes=TASK_ROUTES,
    )
    return celery


celery_app = make_celery()
