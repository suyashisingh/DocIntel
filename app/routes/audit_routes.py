import csv
import io
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.rbac import require_permission_own_org
from app.models.audit_log import AuditLog
from app.models.organization_user import OrganizationUser

router = APIRouter(prefix="/audit-logs", tags=["Audit"])
logger = logging.getLogger(__name__)


def _apply_filters(q, user_id, action, resource_type, date_from, date_to):
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    return q


@router.get("")
def list_audit_logs(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    membership: OrganizationUser = Depends(require_permission_own_org("roles", "view")),
):
    q = db.query(AuditLog).filter(AuditLog.org_id == membership.organization_id)
    q = _apply_filters(q, user_id, action, resource_type, date_from, date_to)
    total = q.count()
    items = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": str(item.id),
                "org_id": item.org_id,
                "user_id": item.user_id,
                "user_email": item.user_email,
                "action": item.action,
                "resource_type": item.resource_type,
                "resource_name": item.resource_name,
                "details": item.details,
                "ip_address": item.ip_address,
                "created_at": item.created_at,
            }
            for item in items
        ],
    }


@router.get("/export")
def export_audit_logs(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    membership: OrganizationUser = Depends(require_permission_own_org("roles", "view")),
):
    q = db.query(AuditLog).filter(AuditLog.org_id == membership.organization_id)
    q = _apply_filters(q, user_id, action, resource_type, date_from, date_to)
    items = q.order_by(AuditLog.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "user_email", "action", "resource_type", "resource_name", "details", "ip_address"])
    for item in items:
        writer.writerow([
            str(item.id),
            item.created_at.isoformat() if item.created_at else "",
            item.user_email,
            item.action,
            item.resource_type,
            item.resource_name,
            str(item.details) if item.details else "{}",
            item.ip_address or "",
        ])

    content = output.getvalue().encode()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )
