import os

from celery import Celery
from celery.schedules import crontab

_broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "docintel",
    broker=_broker,
    backend=_broker,
    include=["app.tasks", "app.comparison_tasks", "app.backfill_tables_task", "app.retention_task"],
)

celery_app.conf.task_routes = {
    "app.tasks.*": {"queue": "document_queue"},
    "app.comparison_tasks.*": {"queue": "document_queue"},
    "app.backfill_tables_task.*": {"queue": "document_queue"},
    "app.retention_task.*": {"queue": "document_queue"},
}

celery_app.conf.beat_schedule = {
    "expire-documents-daily": {
        "task": "app.retention_task.expire_documents",
        "schedule": crontab(hour=2, minute=0),  # 2 AM UTC daily
    },
}
celery_app.conf.timezone = "UTC"