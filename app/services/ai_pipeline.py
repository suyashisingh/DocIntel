import json
import logging
import os
import traceback

import redis as sync_redis
from sqlalchemy.orm import Session
from sqlalchemy import text, func as sqlfunc

from app.config import settings
from app.logging_config import setup_logging

# Ensure correct log format when this module is imported by Celery workers,
# which do not pass through main.py. basicConfig is a no-op if the root
# logger already has handlers (e.g. when running under uvicorn).
setup_logging(settings.LOG_LEVEL)

logger = logging.getLogger(__name__)

from app.database import SessionLocal
from app.models.document import Document, DocumentStatus
from app.models.extracted_data import ExtractedData

from app.services.nlp_service import extract_entities
from app.services.ocr_service import extract_text_from_document
from app.services.confidence_service import compute_confidence
from app.services.ml_classifier_service import MLDocumentClassifier
from app.services.document_classifier import DocumentClassifier, FALLBACK_CONFIDENCE_THRESHOLD
from app.services.embedding_service import embed_document
from app.services.chat_service import generate_summary

# Module-level singletons — loaded once per worker process.
zero_shot_classifier = MLDocumentClassifier()
keyword_classifier = DocumentClassifier()


def _publish(r: sync_redis.Redis, document_id: int, status: str, progress: int, message: str) -> None:
    try:
        r.publish(f"doc_status:{document_id}", json.dumps({
            "document_id": document_id,
            "status": status,
            "progress": progress,
            "message": message,
        }))
    except Exception as e:
        logger.warning("Redis publish failed for doc %d: %s", document_id, e)


def process_document(document_id: int):

    logger.info("Pipeline started for document %d", document_id)
    document = None

    r = sync_redis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))
    db: Session = SessionLocal()

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            logger.error("Pipeline aborted: document %d not found", document_id)
            return

        # mark processing
        document.status = DocumentStatus.processing
        db.commit()
        db.refresh(document)
        _publish(r, document_id, "processing", 5, "Starting…")

        logger.info("Document %d status → processing", document_id)

        pii_redacted = bool(document.pii_redacted)

        if pii_redacted and document.searchable_text:
            # Text was already redacted — skip OCR so we don't clobber it
            text_data = document.searchable_text
            logger.info(
                "Document %d: PII-redacted, skipping OCR, using stored text (%d chars)",
                document_id, len(text_data),
            )
            _publish(r, document_id, "processing", 30, "Using redacted text…")
        else:
            pii_redacted = False  # treat empty-text edge case as normal
            logger.info("Document %d: starting OCR", document_id)
            text_data = extract_text_from_document(document.file_path)
            logger.info("Document %d: OCR complete, extracted %d characters", document_id, len(text_data))
            _publish(r, document_id, "processing", 30, "Text extracted")

        if not text_data or not text_data.strip():
            logger.warning(
                "Document %d: OCR returned empty text, skipping NLP and classification",
                document_id,
            )
            entities = []
            doc_type = "unknown"
            ml_confidence = 0.0
            classification_method = "none"
        else:
            try:
                embed_document(document.id, document.organization_id, text_data)
                logger.info("Document %d: embedding complete", document_id)
            except Exception:
                logger.warning("Document %d: embedding failed (non-fatal), continuing pipeline", document_id)
            _publish(r, document_id, "processing", 42, "Building search index…")

            # Table extraction — PDF only, non-fatal
            if document.file_path and document.file_path.lower().endswith(".pdf"):
                try:
                    from app.services.table_extraction_service import (
                        extract_tables_from_pdf,
                        table_to_embedding_text,
                    )
                    from app.models.document_table import DocumentTable
                    from app.services.embedding_service import get_embedding

                    _publish(r, document_id, "processing", 45, "Extracting tables…")
                    tables = extract_tables_from_pdf(document.file_path)

                    db.query(DocumentTable).filter(
                        DocumentTable.document_id == document_id
                    ).delete()

                    for tbl in tables:
                        emb_text = table_to_embedding_text(tbl)
                        try:
                            tbl_embedding = get_embedding(emb_text) if emb_text.strip() else None
                        except Exception:
                            tbl_embedding = None
                        db.add(DocumentTable(
                            document_id=document_id,
                            page_number=tbl["page_number"],
                            table_index_on_page=tbl["table_index_on_page"],
                            headers=tbl["headers"],
                            rows=tbl["rows"],
                            row_count=tbl["row_count"],
                            column_count=tbl["column_count"],
                            bbox=tbl["bbox"],
                            extraction_confidence=tbl["extraction_confidence"],
                            embedding=tbl_embedding,
                        ))
                    db.commit()
                    logger.info("Document %d: extracted %d tables", document_id, len(tables))

                    if len(tables) == 0 and text_data:
                        from app.services.table_extraction_service import extract_tables_from_ocr_text
                        ocr_tables = extract_tables_from_ocr_text(text_data)
                        if ocr_tables:
                            for tbl in ocr_tables:
                                emb_text = table_to_embedding_text(tbl)
                                try:
                                    tbl_embedding = get_embedding(emb_text) if emb_text.strip() else None
                                except Exception:
                                    tbl_embedding = None
                                db.add(DocumentTable(
                                    document_id=document_id,
                                    page_number=tbl["page_number"],
                                    table_index_on_page=tbl["table_index_on_page"],
                                    headers=tbl["headers"],
                                    rows=tbl["rows"],
                                    row_count=tbl["row_count"],
                                    column_count=tbl["column_count"],
                                    bbox=tbl["bbox"],
                                    extraction_confidence=tbl["extraction_confidence"],
                                    embedding=tbl_embedding,
                                ))
                            db.commit()
                            logger.info("Document %d: extracted %d tables from OCR text", document_id, len(ocr_tables))
                except Exception:
                    logger.warning("Document %d: table extraction failed (non-fatal)", document_id)
                    try:
                        db.rollback()
                    except Exception:
                        pass
            _publish(r, document_id, "processing", 50, "Building search index…")

            logger.info("Document %d: starting NLP entity extraction", document_id)
            entities = extract_entities(text_data)
            logger.info("Document %d: NLP complete, found %d entities", document_id, len(entities))
            _publish(r, document_id, "processing", 55, "Extracting entities…")

            if not settings.USE_ZERO_SHOT_CLASSIFIER:
                logger.info(
                    "Document %d: zero-shot classifier disabled (USE_ZERO_SHOT_CLASSIFIER=false), "
                    "using keyword classifier",
                    document_id,
                )
                doc_type = keyword_classifier.detect(text_data)
                # Same capped value the keyword-fallback path below uses, so
                # the stored confidence score honestly reflects a
                # keyword-only result rather than a zero-shot prediction.
                ml_confidence = FALLBACK_CONFIDENCE_THRESHOLD - 0.01
                classification_method = "keyword_fallback"
                _publish(r, document_id, "processing", 75, "Classifying document…")
            else:
                logger.info("Document %d: starting zero-shot classification", document_id)
                doc_type, ml_confidence = zero_shot_classifier.predict(text_data)
                logger.info(
                    "Document %d: zero-shot → '%s' (score=%.3f)",
                    document_id, doc_type, ml_confidence,
                )
                _publish(r, document_id, "processing", 75, "Classifying document…")

                # Fall back to keyword classifier when zero-shot confidence is low.
                if ml_confidence < FALLBACK_CONFIDENCE_THRESHOLD:
                    fallback_type = keyword_classifier.detect(text_data)
                    logger.info(
                        "Document %d: zero-shot confidence %.3f < %.2f threshold, "
                        "keyword fallback → '%s'",
                        document_id, ml_confidence, FALLBACK_CONFIDENCE_THRESHOLD, fallback_type,
                    )
                    doc_type = fallback_type
                    # Cap ml_confidence just below the threshold so the stored
                    # confidence score honestly reflects a keyword-fallback result,
                    # not a confident zero-shot prediction.
                    ml_confidence = FALLBACK_CONFIDENCE_THRESHOLD - 0.01
                    classification_method = "keyword_fallback"
                else:
                    classification_method = "zero_shot"

        confidence = compute_confidence(text_data, entities, ml_confidence)
        logger.info("Document %d: confidence score %.4f", document_id, confidence)

        structured_output = {
            "entities": entities,
            "text_length": len(text_data),
            "document_type": doc_type,
            "classification_method": classification_method,
        }

        try:
            summary = generate_summary(text_data)
            if summary:
                document.summary = summary
        except Exception:
            logger.warning("Document %d: summary generation failed (non-fatal)", document_id)

        max_version = db.query(sqlfunc.max(ExtractedData.version_number)).filter(
            ExtractedData.document_id == document.id
        ).scalar() or 0
        next_version = max_version + 1

        logger.info("Document %d: saving extracted data as version %d", document_id, next_version)
        extracted = ExtractedData(
            document_id=document.id,
            structured_json=structured_output,
            confidence_score=confidence,
            version_number=next_version,
        )

        db.add(extracted)
        db.commit()
        db.refresh(extracted)
        _publish(r, document_id, "processing", 90, "Saving results…")

        logger.info("Document %d: updating search index / document type", document_id)
        if pii_redacted:
            # Don't overwrite the redacted searchable_text — only update doc type
            db.execute(
                text("UPDATE documents SET document_type = :doc_type WHERE id = :doc_id"),
                {"doc_type": doc_type, "doc_id": document.id},
            )
        else:
            db.execute(
                text("""
                    UPDATE documents
                    SET searchable_text = :text_data,
                        document_type = :doc_type
                    WHERE id = :doc_id
                """),
                {"text_data": text_data, "doc_type": doc_type, "doc_id": document.id},
            )
        db.commit()

        try:
            from app.services.chat_service import generate_suggested_questions
            suggested = generate_suggested_questions(text_data, doc_type)
            if suggested:
                document.suggested_questions = suggested
                db.commit()
                logger.info("Document %d: generated %d suggested questions", document_id, len(suggested))
        except Exception:
            logger.warning("Document %d: suggested questions generation failed (non-fatal)", document_id)

        document.status = DocumentStatus.completed
        db.commit()
        db.refresh(document)
        _publish(r, document_id, "completed", 100, "Processing complete")

        logger.info(
            "Pipeline completed for document %d (type=%s, version=%d, confidence=%.4f)",
            document_id, doc_type, next_version, confidence,
        )

        if document.uploaded_by:
            try:
                from app.services.notification_service import create_notification
                fname = document.original_filename or f"Document #{document_id}"
                create_notification(
                    db,
                    user_id=document.uploaded_by,
                    title="Document ready",
                    message=f"Document ready — {fname} finished processing",
                    ntype="success",
                    link=f"/documents/{document_id}",
                )
            except Exception:
                logger.warning("Could not create success notification for document %d", document_id)

    except Exception:
        logger.exception("Pipeline failed for document %d", document_id)
        _publish(r, document_id, "failed", 0, "Processing failed")
        try:
            document.status = DocumentStatus.failed
            db.commit()
        except Exception:
            logger.error("Could not mark document %d as failed after pipeline error", document_id)
        try:
            if document is not None and document.uploaded_by:
                from app.services.notification_service import create_notification
                fname = document.original_filename or f"Document #{document_id}"
                create_notification(
                    db,
                    user_id=document.uploaded_by,
                    title="Processing failed",
                    message=f"Processing failed — {fname} could not be processed",
                    ntype="error",
                    link=f"/documents/{document_id}",
                )
        except Exception:
            logger.warning("Could not create failure notification for document %d", document_id)

    finally:
        r.close()
        db.close()
