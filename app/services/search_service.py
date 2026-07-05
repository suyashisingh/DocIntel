from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from sqlalchemy import text

from app.models.document import Document, DocumentStatus
from app.models.extracted_data import ExtractedData
from app.services.embedding_service import get_embedding


def search_documents(
    db: Session,
    organization_id: int,
    document_type: str | None = None,
    entity_query: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tag_ids: list[int] | None = None,
    skip: int = 0,
    limit: int = 10,
):
    query = (
        db.query(Document)
        .join(ExtractedData, Document.id == ExtractedData.document_id)
        .filter(
            Document.organization_id == organization_id,
            Document.status == DocumentStatus.completed,
        )
    )

    if document_type:
        query = query.filter(Document.document_type == document_type)

    if date_from:
        query = query.filter(Document.upload_time >= date_from)
    if date_to:
        query = query.filter(Document.upload_time <= date_to + " 23:59:59")

    if entity_query:
        fts_clause = text(
            "to_tsvector('english', COALESCE(documents.searchable_text, '')) "
            "@@ plainto_tsquery('english', :q)"
        ).bindparams(q=entity_query)
        filename_clause = Document.original_filename.ilike(f"%{entity_query}%")
        query = query.filter(or_(fts_clause, filename_clause))

    if tag_ids:
        from app.models.document_tag import DocumentTag
        for tid in tag_ids:
            query = query.filter(
                Document.id.in_(
                    db.query(DocumentTag.document_id).filter(DocumentTag.tag_id == tid)
                )
            )

    total = query.count()

    documents = (
        query.order_by(desc(Document.upload_time))
        .offset(skip)
        .limit(limit)
        .all()
    )

    return documents, total


def semantic_search_documents(
    db: Session,
    organization_id: int,
    query_text: str,
    skip: int = 0,
    limit: int = 10,
):
    query_embedding = get_embedding(query_text)

    sql = text("""
        SELECT d.*,
               1 - (ed.embedding <=> :query_embedding) AS similarity
        FROM documents d
        JOIN extracted_data ed ON d.id = ed.document_id
        WHERE d.organization_id = :org_id
          AND d.status = 'completed'
        ORDER BY ed.embedding <=> :query_embedding
        OFFSET :skip
        LIMIT :limit
    """)

    results = db.execute(sql, {
        "query_embedding": query_embedding,
        "org_id": organization_id,
        "skip": skip,
        "limit": limit,
    }).fetchall()

    return results


def search_tables(
    db: Session,
    organization_id: int,
    query: str,
    document_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 10,
):
    sql = text("""
        SELECT dt.id, dt.document_id, dt.page_number, dt.headers, dt.rows,
               d.original_filename
        FROM document_tables dt
        JOIN documents d ON d.id = dt.document_id
        WHERE d.organization_id = :org_id
          AND d.status = 'completed'
          AND (dt.headers::text ILIKE :q OR dt.rows::text ILIKE :q)
          AND (:document_type IS NULL OR d.document_type = :document_type)
          AND (:date_from IS NULL OR d.upload_time >= :date_from)
          AND (:date_to IS NULL OR d.upload_time <= (:date_to || ' 23:59:59')::timestamptz)
        ORDER BY d.upload_time DESC
        LIMIT :limit
    """)
    rows = db.execute(sql, {
        "org_id": organization_id,
        "q": f"%{query}%",
        "document_type": document_type,
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
    }).fetchall()

    q_lower = query.lower()
    results = []
    for row in rows:
        headers = row.headers or []
        table_rows = row.rows or []

        matched_column = None
        for h in headers:
            if isinstance(h, str) and q_lower in h.lower():
                matched_column = h
                break

        preview_rows = []
        for r in table_rows:
            if not isinstance(r, list):
                continue
            for i, cell in enumerate(r):
                if isinstance(cell, str) and q_lower in cell.lower():
                    if matched_column is None and i < len(headers):
                        matched_column = headers[i]
                    preview_rows.append(r)
                    break
            if len(preview_rows) >= 3:
                break

        if not preview_rows:
            preview_rows = [r for r in table_rows if isinstance(r, list)][:3]

        if not preview_rows:
            continue  # no actual row data — skip rather than return an empty table

        results.append({
            "id": row.id,
            "document_id": row.document_id,
            "original_filename": row.original_filename,
            "page_number": row.page_number,
            "headers": headers,
            "matched_column": matched_column,
            "preview_rows": preview_rows,
        })

    return results


def search_entities(
    db: Session,
    organization_id: int,
    query: str,
    document_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
):
    sql = text("""
        SELECT DISTINCT
               d.id AS document_id,
               d.original_filename,
               e->>'label' AS entity_type,
               e->>'text'  AS entity_value
        FROM extracted_data ed
        JOIN documents d ON d.id = ed.document_id,
             jsonb_array_elements(
                 CASE jsonb_typeof(ed.structured_json->'entities')
                     WHEN 'array' THEN ed.structured_json->'entities'
                     ELSE '[]'::jsonb
                 END
             ) AS e
        WHERE d.organization_id = :org_id
          AND d.status = 'completed'
          AND e->>'text' ILIKE :q
          AND (:document_type IS NULL OR d.document_type = :document_type)
          AND (:date_from IS NULL OR d.upload_time >= :date_from)
          AND (:date_to IS NULL OR d.upload_time <= (:date_to || ' 23:59:59')::timestamptz)
        ORDER BY d.original_filename, entity_type, entity_value
        LIMIT :limit
    """)
    rows = db.execute(sql, {
        "org_id": organization_id,
        "q": f"%{query}%",
        "document_type": document_type,
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
    }).fetchall()

    return [
        {
            "document_id": row.document_id,
            "original_filename": row.original_filename,
            "entity_type": row.entity_type,
            "entity_value": row.entity_value,
        }
        for row in rows
    ]
