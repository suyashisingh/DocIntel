from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.models.document import Document, DocumentStatus
from app.models.extracted_data import ExtractedData

ENTITY_FREQUENCY_LIMIT = 50


def get_summary(db: Session, organization_id: int):

    total_docs = db.query(func.count(Document.id)).filter(
        Document.organization_id == organization_id
    ).scalar()

    completed_docs = db.query(func.count(Document.id)).filter(
        Document.organization_id == organization_id,
        Document.status == DocumentStatus.completed
    ).scalar()

    failed_docs = db.query(func.count(Document.id)).filter(
        Document.organization_id == organization_id,
        Document.status == DocumentStatus.failed
    ).scalar()

    return {
        "total_documents": total_docs,
        "completed_documents": completed_docs,
        "failed_documents": failed_docs
    }


def get_document_type_distribution(db: Session, organization_id: int):

    results = db.query(
        Document.document_type,
        func.count(Document.id)
    ).filter(
        Document.organization_id == organization_id,
        Document.status == DocumentStatus.completed
    ).group_by(
        Document.document_type
    ).all()

    return [
        {"document_type": r[0], "count": r[1]}
        for r in results
    ]


def get_upload_trend(db: Session, organization_id: int):

    results = db.query(
        func.date(Document.upload_time),
        func.count(Document.id)
    ).filter(
        Document.organization_id == organization_id
    ).group_by(
        func.date(Document.upload_time)
    ).order_by(
        func.date(Document.upload_time)
    ).all()

    return [
        {"date": str(r[0]), "count": r[1]}
        for r in results
    ]


def get_entity_frequency(db: Session, organization_id: int) -> list[dict]:
    """Return the most frequent named entities across all completed documents.

    Uses a single PostgreSQL query with ``jsonb_array_elements`` to aggregate
    entity counts entirely in the database — no Python-side looping over rows.
    Results are capped at ``ENTITY_FREQUENCY_LIMIT``.
    """
    sql = text("""
        SELECT
            entity->>'label'  AS label,
            entity->>'text'   AS entity_text,
            COUNT(*)          AS cnt
        FROM extracted_data ed
        JOIN documents d ON d.id = ed.document_id
        CROSS JOIN LATERAL jsonb_array_elements(
            ed.structured_json->'entities'
        ) AS entity
        WHERE d.organization_id = :org_id
          AND d.status          = 'completed'
          AND entity->>'label'  IS NOT NULL
          AND entity->>'text'   IS NOT NULL
        GROUP BY entity->>'label', entity->>'text'
        ORDER BY cnt DESC
        LIMIT :lim
    """)

    rows = db.execute(sql, {"org_id": organization_id, "lim": ENTITY_FREQUENCY_LIMIT}).fetchall()

    return [
        {"entity": row.entity_text, "label": row.label, "count": row.cnt}
        for row in rows
    ]
