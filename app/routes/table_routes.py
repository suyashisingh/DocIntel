import csv
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.document import Document
from app.models.document_table import DocumentTable
from app.models.organization_user import OrganizationUser
from app.models.user import User

router = APIRouter(tags=["Tables"])
logger = logging.getLogger(__name__)


def _check_access(db: Session, document_id: int, user_id: int) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == doc.organization_id,
        OrganizationUser.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    return doc


def _serialize(t: DocumentTable) -> dict:
    return {
        "id": t.id,
        "document_id": t.document_id,
        "page_number": t.page_number,
        "table_index_on_page": t.table_index_on_page,
        "headers": t.headers,
        "rows": t.rows,
        "row_count": t.row_count,
        "column_count": t.column_count,
        "bbox": t.bbox,
        "extraction_confidence": t.extraction_confidence,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/documents/{doc_id}/tables")
def list_document_tables(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_access(db, doc_id, current_user.id)
    tables = (
        db.query(DocumentTable)
        .filter(DocumentTable.document_id == doc_id)
        .order_by(DocumentTable.page_number, DocumentTable.table_index_on_page)
        .all()
    )
    return [_serialize(t) for t in tables]


@router.get("/tables/{table_id}")
def get_table(
    table_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(DocumentTable).filter(DocumentTable.id == table_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    _check_access(db, t.document_id, current_user.id)
    return _serialize(t)


@router.get("/tables/{table_id}/export")
def export_table(
    table_id: int,
    format: str = Query(..., pattern="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(DocumentTable).filter(DocumentTable.id == table_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    doc = _check_access(db, t.document_id, current_user.id)

    base_name = (doc.original_filename or f"doc_{doc.id}").rsplit(".", 1)[0]
    filename = f"{base_name}_p{t.page_number}_table"

    headers = t.headers or []
    rows = t.rows or []

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        if headers:
            writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        content = buf.getvalue().encode("utf-8")
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )

    # xlsx
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=503, detail="openpyxl not installed")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Page {t.page_number}"
    if headers:
        ws.append(headers)
    for row in rows:
        ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
    )
