import logging

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    *,
    org_id,
    user_id: int,
    user_email: str,
    action: str,
    resource_type: str,
    resource_name: str,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    if details is None:
        details = {}
    try:
        entry = AuditLog(
            org_id=org_id,
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_name=resource_name,
            details=details,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
        logger.info("Audit: %s user=%s resource=%s/%s", action, user_email, resource_type, resource_name)
    except Exception:
        logger.warning("Failed to write audit log action=%s user_id=%d", action, user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
