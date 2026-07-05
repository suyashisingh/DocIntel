# Invoke with:
# celery -A app.celery_app call app.backfill_tables_task.backfill_tables_for_existing_pdfs
import logging

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.document import Document, DocumentStatus
from app.models.document_table import DocumentTable
from app.services.table_extraction_service import extract_tables_from_pdf, table_to_embedding_text

logger = logging.getLogger(__name__)


@celery_app.task(name="app.backfill_tables_task.backfill_tables_for_existing_pdfs")
def backfill_tables_for_existing_pdfs() -> dict:
    from app.services.embedding_service import get_embedding

    db = SessionLocal()
    processed = skipped = failed = 0

    try:
        # Find completed PDF documents that have no rows in document_tables
        docs_with_tables = db.query(DocumentTable.document_id).distinct().subquery()
        candidates = (
            db.query(Document)
            .filter(
                Document.status == DocumentStatus.completed,
                Document.file_path.ilike("%.pdf"),
                ~Document.id.in_(docs_with_tables),
            )
            .all()
        )

        logger.info("Backfill: found %d PDF documents without tables", len(candidates))

        for doc in candidates:
            try:
                tables = extract_tables_from_pdf(doc.file_path)
                if not tables:
                    skipped += 1
                    continue

                for t in tables:
                    emb_text = table_to_embedding_text(t)
                    try:
                        embedding = get_embedding(emb_text) if emb_text.strip() else None
                    except Exception:
                        embedding = None

                    db.add(DocumentTable(
                        document_id=doc.id,
                        page_number=t["page_number"],
                        table_index_on_page=t["table_index_on_page"],
                        headers=t["headers"],
                        rows=t["rows"],
                        row_count=t["row_count"],
                        column_count=t["column_count"],
                        bbox=t["bbox"],
                        extraction_confidence=t["extraction_confidence"],
                        embedding=embedding,
                    ))

                db.commit()
                logger.info("Backfill: document %d → %d tables", doc.id, len(tables))
                processed += 1

            except Exception:
                logger.exception("Backfill: document %d failed", doc.id)
                db.rollback()
                failed += 1

    finally:
        db.close()

    result = {"processed": processed, "skipped": skipped, "failed": failed}
    logger.info("Backfill complete: %s", result)
    return result
