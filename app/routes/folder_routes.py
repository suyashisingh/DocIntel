import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.rbac import get_user_role, require_role
from app.database import get_db
from app.models.document import Document
from app.models.document_folder import DocumentFolder
from app.models.folder import Folder
from app.models.organization_user import OrgRole, OrganizationUser
from app.schemas.folder_schema import FolderCreate, FolderResponse, FolderUpdate
from app.services.notification_service import create_notification
from app.services.audit_service import log_audit

router = APIRouter(prefix="/folders", tags=["Folders"])
logger = logging.getLogger(__name__)


def _folder_dict(folder: Folder, count: int = 0) -> dict:
    return {
        "id": folder.id,
        "organization_id": folder.organization_id,
        "name": folder.name,
        "color": folder.color,
        "owner_id": folder.owner_id,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at,
        "document_count": count,
    }


@router.get("/{org_id}", response_model=list[FolderResponse])
def list_folders(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(get_user_role),
):
    folders = (
        db.query(Folder)
        .filter(Folder.organization_id == org_id)
        .order_by(Folder.parent_id.asc().nullsfirst(), Folder.name)
        .all()
    )

    counts: dict[int, int] = {}
    if folders:
        rows = (
            db.query(DocumentFolder.folder_id, func.count())
            .filter(DocumentFolder.folder_id.in_([f.id for f in folders]))
            .group_by(DocumentFolder.folder_id)
            .all()
        )
        counts = dict(rows)

    return [_folder_dict(f, counts.get(f.id, 0)) for f in folders]


@router.post("/{org_id}", response_model=FolderResponse, status_code=201)
def create_folder(
    org_id: int,
    body: FolderCreate,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    if body.parent_id is not None:
        parent = db.query(Folder).filter(
            Folder.id == body.parent_id,
            Folder.organization_id == org_id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="Folders can only be nested one level deep")

    folder = Folder(
        organization_id=org_id,
        name=body.name,
        color=body.color,
        owner_id=actor.user_id,
        parent_id=body.parent_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    logger.info(
        "Folder created: id=%d name=%r org_id=%d by user_id=%d",
        folder.id, folder.name, org_id, actor.user_id,
    )
    try:
        create_notification(db, user_id=actor.user_id, title="Folder created",
            message=f"Folder created — {folder.name} folder was created", ntype="other")
    except Exception:
        pass
    try:
        from app.models.user import User as UserModel
        actor_user = db.query(UserModel).filter(UserModel.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="folder.created", resource_type="folder", resource_name=folder.name,
                  details={"folder_id": folder.id})
    except Exception:
        pass
    return _folder_dict(folder)


@router.put("/{org_id}/{folder_id}", response_model=FolderResponse)
def update_folder(
    org_id: int,
    folder_id: int,
    body: FolderUpdate,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.organization_id == org_id,
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if body.name is not None:
        folder.name = body.name
    if body.color is not None:
        folder.color = body.color

    db.commit()
    db.refresh(folder)

    count = db.query(func.count(DocumentFolder.document_id)).filter(
        DocumentFolder.folder_id == folder_id
    ).scalar() or 0

    logger.info(
        "Folder updated: id=%d org_id=%d by user_id=%d",
        folder_id, org_id, actor.user_id,
    )
    return _folder_dict(folder, count)


@router.delete("/{org_id}/{folder_id}", status_code=204)
def delete_folder(
    org_id: int,
    folder_id: int,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN)),
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.organization_id == org_id,
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    fname = folder.name
    db.delete(folder)
    db.commit()
    logger.info(
        "Folder deleted: id=%d org_id=%d by user_id=%d",
        folder_id, org_id, actor.user_id,
    )
    try:
        create_notification(db, user_id=actor.user_id, title="Folder deleted",
            message=f"Folder deleted — {fname} folder was deleted", ntype="other")
    except Exception:
        pass
    try:
        from app.models.user import User as UserModel
        actor_user = db.query(UserModel).filter(UserModel.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="folder.deleted", resource_type="folder", resource_name=fname,
                  details={"folder_id": folder_id})
    except Exception:
        pass


@router.post("/{org_id}/{folder_id}/documents/{doc_id}", status_code=201)
def add_document_to_folder(
    org_id: int,
    folder_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.organization_id == org_id,
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.organization_id == org_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if db.query(DocumentFolder).filter(
        DocumentFolder.document_id == doc_id,
        DocumentFolder.folder_id == folder_id,
    ).first():
        raise HTTPException(status_code=409, detail="Document already in folder")

    db.add(DocumentFolder(document_id=doc_id, folder_id=folder_id))
    db.commit()
    return {"message": "Document added to folder"}


@router.delete("/{org_id}/{folder_id}/documents/{doc_id}", status_code=204)
def remove_document_from_folder(
    org_id: int,
    folder_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
):
    membership = db.query(DocumentFolder).filter(
        DocumentFolder.document_id == doc_id,
        DocumentFolder.folder_id == folder_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Document not in folder")

    db.delete(membership)
    db.commit()
