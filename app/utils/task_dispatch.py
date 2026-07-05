from fastapi import BackgroundTasks

from app.config import settings


def dispatch_task(task_func, background_tasks: BackgroundTasks, *args, **kwargs):
    """
    Dispatch a Celery task, routing through Celery or FastAPI BackgroundTasks
    based on settings.USE_CELERY.

    Calling task_func directly (rather than via .delay) also works correctly
    for tasks defined with bind=True — Celery binds `self` automatically when
    a task instance is called as a plain function.
    """
    if settings.USE_CELERY:
        task_func.delay(*args, **kwargs)
    else:
        background_tasks.add_task(task_func, *args, **kwargs)
