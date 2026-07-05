from app.celery_app import celery_app
from app.services.ai_pipeline import process_document


@celery_app.task(name="app.tasks.process_document_task")
def process_document_task(document_id: int):
    process_document(document_id)