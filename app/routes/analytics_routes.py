from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.rbac import require_permission

from app.models.organization_user import OrganizationUser

from app.services.analytics_service import (
    get_summary,
    get_document_type_distribution,
    get_upload_trend,
    get_entity_frequency
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/{org_id}/summary")
def summary(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("analytics", "view")),
):
    return get_summary(db, org_id)


@router.get("/{org_id}/document-types")
def doc_types(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("analytics", "view")),
):
    return get_document_type_distribution(db, org_id)


@router.get("/{org_id}/upload-trend")
def upload_trend(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("analytics", "view")),
):
    return get_upload_trend(db, org_id)


@router.get("/{org_id}/entity-frequency")
def entity_freq(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("analytics", "view")),
):
    return get_entity_frequency(db, org_id)
