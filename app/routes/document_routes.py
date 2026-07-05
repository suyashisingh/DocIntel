import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, field_validator

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.rbac import require_role, require_permission, check_permission

from app.models.document import Document, DocumentStatus
from app.models.organization_user import OrganizationUser, OrgRole
from app.models.extracted_data import ExtractedData
from app.models.user import User

from app.schemas.document_schema import DocumentResponse, DocumentListItem
from app.schemas.extracted_data_schema import ExtractedDataResponse

from app.services.storage_service import save_document, extract_zip_documents
from app.services.search_service import search_documents, search_tables, search_entities
from app.services.notification_service import create_notification
from app.services.audit_service import log_audit
from app.pii_detector import detect_pii, redact_text as _redact_text

from app.tasks import process_document_task
from app.utils.task_dispatch import dispatch_task

router = APIRouter(prefix="/documents", tags=["Documents"])
logger = logging.getLogger(__name__)


class BulkIdsRequest(BaseModel):
    document_ids: list[int]


class AddTagBody(BaseModel):
    tag_id: int


class RetentionUpdate(BaseModel):
    retention_days: int | None = None
    expires_at: datetime | None = None

    @field_validator("retention_days")
    @classmethod
    def validate_days(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("retention_days must be a positive integer")
        return v


class BulkExportRequest(BaseModel):
    document_ids: list[int]
    format: Literal["csv", "json"]


class RedactRequest(BaseModel):
    pii_types: list[str]


# ⭐ SEARCH
@router.get("/search")
def search_docs(
    org_id: int,
    document_type: str | None = Query(None),
    entity: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tag_ids: list[int] | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("search", "use")),
):
    documents, total = search_documents(
        db=db,
        organization_id=org_id,
        document_type=document_type,
        entity_query=entity,
        date_from=date_from,
        date_to=date_to,
        tag_ids=tag_ids,
        skip=skip,
        limit=limit,
    )

    tables = []
    entities = []
    if entity:
        tables = search_tables(db, organization_id=org_id, query=entity, document_type=document_type, date_from=date_from, date_to=date_to)
        entities = search_entities(db, organization_id=org_id, query=entity, document_type=document_type, date_from=date_from, date_to=date_to)

    return {
        "total": total,
        "documents": documents,
        "tables": tables,
        "entities": entities,
    }


# ⭐ EXPIRING SOON
@router.get("/expiring-soon")
def get_expiring_soon(
    org_id: int,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_role(*OrgRole)),
):
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)
    docs = (
        db.query(Document)
        .filter(
            Document.organization_id == org_id,
            Document.expires_at.isnot(None),
            Document.expires_at > now,
            Document.expires_at <= cutoff,
        )
        .order_by(Document.expires_at.asc())
        .all()
    )
    return [
        {
            "id": d.id,
            "original_filename": d.original_filename,
            "expires_at": d.expires_at,
            "retention_days": d.retention_days,
            "upload_time": d.upload_time,
            "status": d.status,
            "document_type": d.document_type,
        }
        for d in docs
    ]


# ⭐ RESULTS (latest version)
@router.get("/results/{document_id}", response_model=ExtractedDataResponse)
def get_document_results(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if not check_permission(db, current_user, document.organization_id, "documents", "view"):
        raise HTTPException(status_code=403, detail="Requires permission: documents.view")

    results = (
        db.query(ExtractedData)
        .options(joinedload(ExtractedData.document))
        .filter(ExtractedData.document_id == document_id)
        .order_by(ExtractedData.version_number.desc())
        .first()
    )

    if not results:
        raise HTTPException(status_code=404, detail="Results not available yet")

    d = results.document
    return {
        "id": results.id,
        "document_id": results.document_id,
        "version_number": results.version_number,
        "structured_json": results.structured_json,
        "confidence_score": results.confidence_score,
        "processed_at": results.processed_at,
        "original_filename": d.original_filename if d else None,
        "summary": d.summary if d else None,
        "suggested_questions": d.suggested_questions if d else None,
        "expires_at": d.expires_at if d else None,
        "retention_days": d.retention_days if d else None,
        "pii_detected": d.pii_detected if d else None,
        "pii_types_found": d.pii_types_found if d else None,
        "pii_redacted": d.pii_redacted if d else None,
        "pii_redacted_types": d.pii_redacted_types if d else None,
        "pii_redacted_at": d.pii_redacted_at if d else None,
    }


# ⭐ ALL VERSIONS
@router.get("/results/{document_id}/versions", response_model=list[ExtractedDataResponse])
def get_document_versions(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if not check_permission(db, current_user, document.organization_id, "documents", "view"):
        raise HTTPException(status_code=403, detail="Requires permission: documents.view")

    versions = (
        db.query(ExtractedData)
        .options(joinedload(ExtractedData.document))
        .filter(ExtractedData.document_id == document_id)
        .order_by(ExtractedData.version_number.asc())
        .all()
    )
    return [
        {
            "id": v.id,
            "document_id": v.document_id,
            "version_number": v.version_number,
            "structured_json": v.structured_json,
            "confidence_score": v.confidence_score,
            "processed_at": v.processed_at,
            "original_filename": v.document.original_filename if v.document else None,
            "summary": v.document.summary if v.document else None,
        }
        for v in versions
    ]


# ⭐ DOWNLOAD ORIGINAL FILE
@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    if not document.file_path or not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=document.file_path,
        filename=document.original_filename or os.path.basename(document.file_path),
        media_type="application/octet-stream",
    )


# ⭐ DOCUMENT TAGS
@router.get("/{doc_id}/tags")
def get_document_tags(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.tag import Tag
    from app.models.document_tag import DocumentTag

    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    tags = (
        db.query(Tag)
        .join(DocumentTag, DocumentTag.tag_id == Tag.id)
        .filter(DocumentTag.document_id == doc_id)
        .all()
    )
    return [{"id": t.id, "name": t.name, "color": t.color, "created_by": t.created_by,
             "is_global": t.is_global, "created_at": t.created_at, "doc_count": 0} for t in tags]


@router.post("/{doc_id}/tags")
def add_tag_to_document(
    doc_id: int,
    body: AddTagBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.tag import Tag
    from app.models.document_tag import DocumentTag

    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    tag = db.query(Tag).filter(Tag.id == body.tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.created_by != current_user.id and not tag.is_global:
        raise HTTPException(status_code=403, detail="Tag not accessible")

    existing = db.query(DocumentTag).filter(
        DocumentTag.document_id == doc_id, DocumentTag.tag_id == body.tag_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag already applied")

    db.add(DocumentTag(document_id=doc_id, tag_id=body.tag_id, tagged_by=current_user.id))
    db.commit()
    return {"message": "Tag applied"}


@router.delete("/{doc_id}/tags/{tag_id}")
def remove_tag_from_document(
    doc_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.document_tag import DocumentTag

    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    dt = db.query(DocumentTag).filter(
        DocumentTag.document_id == doc_id, DocumentTag.tag_id == tag_id
    ).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Tag not applied to document")

    db.delete(dt)
    db.commit()
    return {"message": "Tag removed"}


# ⭐ RETENTION
@router.put("/{doc_id}/retention")
def set_retention(
    doc_id: int,
    body: RetentionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if membership.role not in (OrgRole.ADMIN, OrgRole.ANALYST):
        raise HTTPException(status_code=403, detail="Requires admin or analyst role")

    now = datetime.now(timezone.utc)

    if body.retention_days is not None:
        document.retention_days = body.retention_days
        document.expires_at = now + timedelta(days=body.retention_days)
    elif body.expires_at is not None:
        document.expires_at = body.expires_at
        delta = body.expires_at - now
        document.retention_days = max(1, delta.days)
    else:
        document.retention_days = None
        document.expires_at = None

    db.commit()
    db.refresh(document)
    logger.info(
        "Retention set: doc_id=%d expires_at=%s user_id=%d",
        doc_id, document.expires_at, current_user.id,
    )
    return {
        "document_id": doc_id,
        "expires_at": document.expires_at,
        "retention_days": document.retention_days,
    }


# ⭐ PII DETECTION
@router.get("/{document_id}/pii")
def scan_pii(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    if not document.searchable_text:
        raise HTTPException(status_code=400, detail="Document has no extracted text to scan")

    findings = detect_pii(document.searchable_text)

    grouped: dict[str, list] = {}
    for f in findings:
        grouped.setdefault(f["type"], []).append(f)

    document.pii_detected = len(findings) > 0
    document.pii_types_found = list(grouped.keys()) if grouped else None
    db.commit()

    logger.info("PII scan: doc_id=%d findings=%d user_id=%d", document_id, len(findings), current_user.id)
    return {
        "aadhaar":     grouped.get("aadhaar", []),
        "pan":         grouped.get("pan", []),
        "phone":       grouped.get("phone", []),
        "email":       grouped.get("email", []),
        "person":      grouped.get("person", []),
        "credit_card": grouped.get("credit_card", []),
        "total_count": len(findings),
    }


# ⭐ PII REDACTION
@router.post("/{document_id}/redact")
def redact_pii(
    document_id: int,
    body: RedactRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone

    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if membership.role not in (OrgRole.ADMIN, OrgRole.ANALYST):
        raise HTTPException(status_code=403, detail="Requires admin or analyst role")

    if not document.searchable_text:
        raise HTTPException(status_code=400, detail="Document has no extracted text")
    if not body.pii_types:
        raise HTTPException(status_code=400, detail="No PII types specified")

    findings = detect_pii(document.searchable_text)
    new_text, count = _redact_text(document.searchable_text, findings, body.pii_types)

    document.searchable_text = new_text
    document.pii_redacted = True
    document.pii_redacted_types = body.pii_types
    document.pii_redacted_at = datetime.now(timezone.utc)
    db.commit()

    from app.models.document_chunk import DocumentChunk
    from app.services.embedding_service import embed_document
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
    db.commit()

    embed_document(document_id, document.organization_id, new_text)

    document.status = DocumentStatus.completed
    db.commit()

    try:
        log_audit(
            db,
            org_id=membership.organization_id,
            user_id=current_user.id,
            user_email=current_user.email,
            action="document.redact",
            resource_type="document",
            resource_name=document.original_filename or f"Document #{document_id}",
            details={"document_id": document_id, "types_redacted": body.pii_types, "count": count},
        )
    except Exception:
        pass

    logger.info(
        "PII redacted: doc_id=%d types=%s count=%d user_id=%d",
        document_id, body.pii_types, count, current_user.id,
    )
    return {"redacted_count": count, "types_redacted": body.pii_types}


# ⭐ QA HISTORY
@router.get("/{doc_id}/qa-history")
def get_qa_history(
    doc_id: int,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == document.organization_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.models.document_qa import DocumentQA

    total = db.query(DocumentQA).filter(DocumentQA.document_id == doc_id).count()

    rows = (
        db.query(DocumentQA, User)
        .outerjoin(User, User.id == DocumentQA.user_id)
        .filter(DocumentQA.document_id == doc_id)
        .order_by(DocumentQA.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "items": [
            {
                "id": str(qa.id),
                "question": qa.question,
                "answer": qa.answer,
                "created_at": qa.created_at,
                "user_name": user.email if user else "Unknown",
            }
            for qa, user in rows
        ],
    }


# ⭐ REPROCESS (analyst / admin only)
@router.post("/{org_id}/{document_id}/reprocess")
def reprocess_document(
    org_id: int,
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.organization_id == org_id,
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.status == DocumentStatus.processing:
        raise HTTPException(
            status_code=400,
            detail="Document is already being processed",
        )

    document.status = DocumentStatus.queued
    db.commit()

    dispatch_task(process_document_task, background_tasks, document_id)

    logger.info(
        "Reprocess queued: document_id=%d org_id=%d by user_id=%d",
        document_id, org_id, actor.user_id,
    )
    try:
        fname = document.original_filename or f"Document #{document_id}"
        create_notification(
            db, user_id=actor.user_id, title="Reprocess started",
            message=f"Reprocess started — {fname}", ntype="info",
            link=f"/documents/{document_id}",
        )
    except Exception:
        pass
    try:
        fname = document.original_filename or f"Document #{document_id}"
        actor_user = db.query(User).filter(User.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="document.reprocess", resource_type="document", resource_name=fname,
                  details={"document_id": document_id})
    except Exception:
        pass
    return {"message": "Reprocessing queued", "document_id": document_id}


# ⭐ BULK DELETE
@router.post("/bulk-delete")
def bulk_delete_documents(
    body: BulkIdsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of any organization")

    is_admin = membership.role == OrgRole.ADMIN
    deleted = 0
    failed = []

    for doc_id in body.document_ids:
        doc = db.query(Document).filter(
            Document.id == doc_id,
            Document.organization_id == membership.organization_id,
        ).first()
        if not doc:
            failed.append(doc_id)
            continue
        if not is_admin and doc.uploaded_by != current_user.id:
            failed.append(doc_id)
            continue
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except OSError:
                pass
        db.delete(doc)
        deleted += 1

    db.commit()
    logger.info("Bulk delete: user_id=%d deleted=%d failed=%d", current_user.id, deleted, len(failed))
    return {"deleted": deleted, "failed": failed}


# ⭐ BULK REPROCESS
@router.post("/bulk-reprocess")
def bulk_reprocess_documents(
    body: BulkIdsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    queued = 0

    for doc_id in body.document_ids:
        doc = db.query(Document).filter(
            Document.id == doc_id,
            Document.organization_id == actor.organization_id,
        ).first()
        if not doc or doc.status == DocumentStatus.processing:
            continue
        doc.status = DocumentStatus.queued
        dispatch_task(process_document_task, background_tasks, doc_id)
        queued += 1

    db.commit()
    logger.info("Bulk reprocess: user_id=%d queued=%d", actor.user_id, queued)
    return {"queued": queued}


# ⭐ BULK EXPORT
@router.post("/bulk-export")
def bulk_export_documents(
    body: BulkExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of any organization")

    docs = (
        db.query(Document)
        .filter(
            Document.id.in_(body.document_ids),
            Document.organization_id == membership.organization_id,
        )
        .all()
    )

    doc_ids = [d.id for d in docs]
    latest_sq = (
        db.query(
            ExtractedData.document_id,
            func.max(ExtractedData.version_number).label("max_version"),
        )
        .filter(ExtractedData.document_id.in_(doc_ids))
        .group_by(ExtractedData.document_id)
        .subquery()
    )
    ext_rows = (
        db.query(ExtractedData)
        .join(
            latest_sq,
            (latest_sq.c.document_id == ExtractedData.document_id)
            & (latest_sq.c.max_version == ExtractedData.version_number),
        )
        .all()
    )
    ext_by_id = {e.document_id: e for e in ext_rows}

    rows = []
    for doc in docs:
        ext = ext_by_id.get(doc.id)
        entity_count = (
            len(ext.structured_json.get("entities", [])) if ext and ext.structured_json else 0
        )
        rows.append({
            "id": doc.id,
            "original_filename": doc.original_filename or "",
            "upload_time": doc.upload_time.isoformat() if doc.upload_time else "",
            "document_type": doc.document_type or "",
            "status": doc.status,
            "entity_count": entity_count,
            "summary": (doc.summary or "")[:200],
        })

    if body.format == "json":
        content = json.dumps(rows, indent=2).encode()
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=bulk_export.json"},
        )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "original_filename", "upload_time", "document_type", "status", "entity_count", "summary"],
    )
    writer.writeheader()
    writer.writerows(rows)
    content = output.getvalue().encode()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bulk_export.csv"},
    )


# ⭐ UPLOAD (CELERY QUEUE TRIGGER)
@router.post("/{org_id}/upload", response_model=list[DocumentResponse])
def upload_document(
    org_id: int,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    created = []
    for file in files:
        filename = file.filename or ""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext == "zip":
            content = file.file.read()
            extracted = extract_zip_documents(content)
            for file_path, original_name in extracted:
                new_document = Document(
                    organization_id=org_id,
                    uploaded_by=current_user.id,
                    file_path=file_path,
                    original_filename=original_name,
                    status=DocumentStatus.uploaded,
                )
                db.add(new_document)
                db.commit()
                db.refresh(new_document)
                dispatch_task(process_document_task, background_tasks, new_document.id)
                logger.info(
                    "ZIP member uploaded: id=%d org_id=%d user_id=%d filename=%r",
                    new_document.id, org_id, current_user.id, original_name,
                )
                try:
                    create_notification(
                        db, user_id=current_user.id, title="Document uploaded",
                        message=f"Document uploaded — {original_name}", ntype="info",
                        link=f"/documents/{new_document.id}",
                    )
                except Exception:
                    pass
                try:
                    log_audit(db, org_id=org_id, user_id=current_user.id,
                              user_email=current_user.email, action="document.upload",
                              resource_type="document", resource_name=original_name,
                              details={"document_id": new_document.id})
                except Exception:
                    pass
                created.append(new_document)
        else:
            file_path = save_document(file)
            new_document = Document(
                organization_id=org_id,
                uploaded_by=current_user.id,
                file_path=file_path,
                original_filename=filename or None,
                status=DocumentStatus.uploaded,
            )
            db.add(new_document)
            db.commit()
            db.refresh(new_document)
            dispatch_task(process_document_task, background_tasks, new_document.id)
            logger.info(
                "Document uploaded: id=%d org_id=%d user_id=%d filename=%r",
                new_document.id, org_id, current_user.id, filename,
            )
            try:
                create_notification(
                    db, user_id=current_user.id, title="Document uploaded",
                    message=f"Document uploaded — {filename or 'unknown file'}", ntype="info",
                    link=f"/documents/{new_document.id}",
                )
            except Exception:
                pass
            try:
                log_audit(db, org_id=org_id, user_id=current_user.id,
                          user_email=current_user.email, action="document.upload",
                          resource_type="document", resource_name=filename or "unknown",
                          details={"document_id": new_document.id})
            except Exception:
                pass
            created.append(new_document)
    return created


# ⭐ EXPORT (admin / analyst only)
@router.get("/{org_id}/export")
def export_documents(
    org_id: int,
    export_format: Literal["csv", "json"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    # Subquery: latest version number per document
    latest_sq = (
        db.query(
            ExtractedData.document_id,
            func.max(ExtractedData.version_number).label("max_version"),
        )
        .group_by(ExtractedData.document_id)
        .subquery()
    )

    # Join completed documents with their latest extracted data row
    rows = (
        db.query(Document, ExtractedData)
        .join(ExtractedData, ExtractedData.document_id == Document.id)
        .join(
            latest_sq,
            (latest_sq.c.document_id == ExtractedData.document_id)
            & (latest_sq.c.max_version == ExtractedData.version_number),
        )
        .filter(
            Document.organization_id == org_id,
            Document.status == DocumentStatus.completed,
        )
        .order_by(Document.id)
        .all()
    )

    logger.info(
        "Export requested: org_id=%d format=%s user_id=%d documents=%d",
        org_id, export_format, actor.user_id, len(rows),
    )

    if export_format == "json":
        payload = [
            {
                "document_id": doc.id,
                "organization_id": doc.organization_id,
                "uploaded_by": doc.uploaded_by,
                "file_path": doc.file_path,
                "document_type": doc.document_type,
                "status": doc.status,
                "upload_time": doc.upload_time.isoformat(),
                "version_number": ext.version_number,
                "confidence_score": ext.confidence_score,
                "processed_at": ext.processed_at.isoformat(),
                "extracted_data": ext.structured_json,
            }
            for doc, ext in rows
        ]
        return Response(
            content=json.dumps(payload, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=org_{org_id}_export.json"
            },
        )

    # CSV — flatten structured_json top-level scalars; keep entities as JSON string
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "document_id", "organization_id", "uploaded_by", "file_path",
        "document_type", "status", "upload_time",
        "version_number", "confidence_score", "processed_at",
        "text_length", "entities",
    ])
    for doc, ext in rows:
        sj = ext.structured_json or {}
        writer.writerow([
            doc.id,
            doc.organization_id,
            doc.uploaded_by,
            doc.file_path,
            doc.document_type,
            doc.status,
            doc.upload_time.isoformat(),
            ext.version_number,
            ext.confidence_score,
            ext.processed_at.isoformat(),
            sj.get("text_length", ""),
            json.dumps(sj.get("entities", [])),
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=org_{org_id}_export.csv"
        },
    )


def _filtered_documents_query(
    db: Session,
    org_id: int,
    folder_id: int | None,
    tag_ids: list[int] | None,
    tag_ids_any: list[int] | None,
    expiring_soon: bool,
):
    from app.models.document_folder import DocumentFolder
    from app.models.document_tag import DocumentTag

    q = db.query(Document).filter(Document.organization_id == org_id)
    if folder_id is not None:
        q = q.join(DocumentFolder, DocumentFolder.document_id == Document.id).filter(
            DocumentFolder.folder_id == folder_id
        )
    if tag_ids:
        for tid in tag_ids:
            q = q.filter(
                Document.id.in_(
                    db.query(DocumentTag.document_id).filter(DocumentTag.tag_id == tid)
                )
            )
    if tag_ids_any:
        q = q.filter(
            Document.id.in_(
                db.query(DocumentTag.document_id).filter(
                    DocumentTag.tag_id.in_(tag_ids_any)
                )
            )
        )
    if expiring_soon:
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=7)
        q = q.filter(
            Document.expires_at.isnot(None),
            Document.expires_at > now,
            Document.expires_at <= cutoff,
        )
    return q


# ⭐ DOCUMENT COUNT (total across all pages, respects the same filters as the list endpoint)
@router.get("/{org_id}/count")
def count_documents(
    org_id: int,
    folder_id: int | None = Query(None),
    tag_ids: list[int] | None = Query(None),
    tag_ids_any: list[int] | None = Query(None),
    expiring_soon: bool = Query(False),
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("documents", "view")),
):
    q = _filtered_documents_query(db, org_id, folder_id, tag_ids, tag_ids_any, expiring_soon)
    return {"total": q.count()}


# ⭐ LIST DOCUMENTS
@router.get("/{org_id}", response_model=list[DocumentListItem])
def list_documents(
    org_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    folder_id: int | None = Query(None),
    tag_ids: list[int] | None = Query(None),
    tag_ids_any: list[int] | None = Query(None),
    expiring_soon: bool = Query(False),
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("documents", "view")),
):
    from app.models.document_folder import DocumentFolder
    from app.models.document_tag import DocumentTag
    from app.models.tag import Tag

    q = _filtered_documents_query(db, org_id, folder_id, tag_ids, tag_ids_any, expiring_soon)

    if expiring_soon:
        docs = q.order_by(Document.expires_at.asc()).offset(skip).limit(limit).all()
    else:
        docs = q.order_by(Document.upload_time.desc()).offset(skip).limit(limit).all()

    folder_map: dict[int, list[int]] = {}
    tag_map: dict[int, list[dict]] = {}
    if docs:
        doc_ids = [d.id for d in docs]
        for m in db.query(DocumentFolder).filter(
            DocumentFolder.document_id.in_(doc_ids)
        ).all():
            folder_map.setdefault(m.document_id, []).append(m.folder_id)

        tag_rows = (
            db.query(
                DocumentTag.document_id.label("doc_id"),
                Tag.id.label("tag_id"),
                Tag.name.label("tag_name"),
                Tag.color.label("tag_color"),
            )
            .join(Tag, Tag.id == DocumentTag.tag_id)
            .filter(DocumentTag.document_id.in_(doc_ids))
            .all()
        )
        for row in tag_rows:
            tag_map.setdefault(row.doc_id, []).append(
                {"id": row.tag_id, "name": row.tag_name, "color": row.tag_color}
            )

    return [
        {
            "id": d.id,
            "organization_id": d.organization_id,
            "uploaded_by": d.uploaded_by,
            "file_path": d.file_path,
            "original_filename": d.original_filename,
            "document_type": d.document_type,
            "status": d.status,
            "upload_time": d.upload_time,
            "expires_at": d.expires_at,
            "retention_days": d.retention_days,
            "folder_ids": folder_map.get(d.id, []),
            "tags": tag_map.get(d.id, []),
            "pii_detected": d.pii_detected,
            "pii_redacted": d.pii_redacted,
        }
        for d in docs
    ]


# ⭐ DELETE DOCUMENT (admin only)
@router.delete("/{org_id}/{document_id}")
def delete_document(
    org_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN)),
):
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.organization_id == org_id,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    fname = document.original_filename or f"Document #{document_id}"
    db.delete(document)
    db.commit()

    logger.info(
        "Document deleted: id=%d org_id=%d by user_id=%d",
        document_id, org_id, actor.user_id,
    )
    try:
        create_notification(
            db, user_id=actor.user_id, title="Document deleted",
            message=f"Document deleted — {fname}", ntype="info",
        )
    except Exception:
        pass
    try:
        actor_user = db.query(User).filter(User.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="document.delete", resource_type="document", resource_name=fname,
                  details={"document_id": document_id})
    except Exception:
        pass
    return {"message": "Document deleted"}
