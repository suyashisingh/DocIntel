import json
import logging
import os
from datetime import datetime, timezone

import redis

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.comparison import Comparison
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.comparison_service import (
    compare_textual,
    compare_semantic,
    generate_change_summary,
)

logger = logging.getLogger(__name__)


def _publish(r: redis.Redis, comparison_id: int, payload: dict) -> None:
    try:
        r.publish(f"comparison:{comparison_id}", json.dumps(payload))
    except Exception as exc:
        logger.warning("Redis publish failed for comparison %d: %s", comparison_id, exc)


@celery_app.task(name="app.comparison_tasks.run_comparison")
def run_comparison(comparison_id: int) -> None:
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))

    try:
        comparison = db.query(Comparison).filter(Comparison.id == comparison_id).first()
        if not comparison:
            logger.error("Comparison %d not found", comparison_id)
            return

        comparison.status = "processing"
        db.commit()
        _publish(r, comparison_id, {"status": "processing", "progress": 10, "message": "Loading documents…"})

        doc_a = db.query(Document).filter(Document.id == comparison.doc_a_id).first()
        doc_b = db.query(Document).filter(Document.id == comparison.doc_b_id).first()

        if not doc_a or not doc_b:
            raise ValueError("One or both documents not found")

        if comparison.mode == "textual":
            _publish(r, comparison_id, {"status": "processing", "progress": 40, "message": "Extracting text…"})
            text_a = doc_a.searchable_text or ""
            text_b = doc_b.searchable_text or ""

            _publish(r, comparison_id, {"status": "processing", "progress": 70, "message": "Computing diff…"})
            result = compare_textual(text_a, text_b)
            similarity_score = result["stats"]["ratio"]
            summary = None

        else:  # semantic
            _publish(r, comparison_id, {"status": "processing", "progress": 30, "message": "Loading embeddings…"})

            raw_a = (
                db.query(DocumentChunk)
                .filter(DocumentChunk.document_id == comparison.doc_a_id)
                .order_by(DocumentChunk.chunk_index)
                .all()
            )
            raw_b = (
                db.query(DocumentChunk)
                .filter(DocumentChunk.document_id == comparison.doc_b_id)
                .order_by(DocumentChunk.chunk_index)
                .all()
            )

            chunks_a = [c.chunk_text for c in raw_a if c.embedding is not None]
            chunks_b = [c.chunk_text for c in raw_b if c.embedding is not None]
            embeddings_a = [list(c.embedding) for c in raw_a if c.embedding is not None]
            embeddings_b = [list(c.embedding) for c in raw_b if c.embedding is not None]

            _publish(r, comparison_id, {"status": "processing", "progress": 60, "message": "Comparing semantics…"})
            result = compare_semantic(chunks_a, embeddings_a, chunks_b, embeddings_b)
            similarity_score = result["overall_similarity"]

            _publish(r, comparison_id, {"status": "processing", "progress": 85, "message": "Generating summary…"})
            summary = generate_change_summary(result["pairings"])

        comparison.status = "completed"
        comparison.result = result
        comparison.summary = summary
        comparison.similarity_score = similarity_score
        comparison.completed_at = datetime.now(timezone.utc)
        db.commit()

        _publish(r, comparison_id, {
            "status": "completed",
            "progress": 100,
            "message": "Comparison complete",
            "similarity_score": similarity_score,
        })
        logger.info(
            "Comparison %d completed (mode=%s similarity=%.3f)",
            comparison_id, comparison.mode, similarity_score,
        )

        if comparison.user_id:
            try:
                from app.services.notification_service import create_notification
                name_a = doc_a.original_filename or f"Document #{comparison.doc_a_id}"
                name_b = doc_b.original_filename or f"Document #{comparison.doc_b_id}"
                create_notification(
                    db,
                    user_id=comparison.user_id,
                    title="Comparison ready",
                    message=f"Comparison ready — comparison between {name_a} and {name_b} is complete",
                    ntype="success",
                    link=f"/compare/{comparison_id}",
                )
            except Exception:
                logger.warning("Could not create comparison notification for comparison %d", comparison_id)

    except Exception:
        logger.exception("Comparison %d failed", comparison_id)
        try:
            comparison = db.query(Comparison).filter(Comparison.id == comparison_id).first()
            if comparison:
                import traceback
                comparison.status = "failed"
                comparison.result = {"error": traceback.format_exc()}
                db.commit()
        except Exception:
            db.rollback()
        _publish(r, comparison_id, {"status": "failed", "progress": 0, "message": "Comparison failed"})
    finally:
        db.close()
        r.close()
