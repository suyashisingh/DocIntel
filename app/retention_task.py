import logging
import os
from datetime import datetime, timezone

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.retention_task.expire_documents")
def expire_documents():
    """Delete all documents whose expires_at timestamp has passed."""
    from app.database import SessionLocal
    from app.models.document import Document

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired = (
            db.query(Document)
            .filter(Document.expires_at.isnot(None), Document.expires_at <= now)
            .all()
        )

        deleted = 0
        for doc in expired:
            if doc.file_path and os.path.exists(doc.file_path):
                try:
                    os.remove(doc.file_path)
                except OSError:
                    logger.warning(
                        "Could not delete file %s for document %d", doc.file_path, doc.id
                    )
            db.delete(doc)
            deleted += 1

        db.commit()
        logger.info("Retention sweep complete: deleted %d expired documents", deleted)
        return {"deleted": deleted}
    except Exception:
        db.rollback()
        logger.exception("Retention sweep failed")
        raise
    finally:
        db.close()
