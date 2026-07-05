import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.document import Document
from app.models.document_tag import DocumentTag
from app.models.organization_user import OrgRole, OrganizationUser
from app.models.tag import Tag
from app.models.user import User
from app.schemas.tag_schema import TagCreate, TagResponse, TagUpdate

router = APIRouter(prefix="/tags", tags=["Tags"])
logger = logging.getLogger(__name__)


def _tag_dict(tag: Tag, doc_count: int = 0) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "created_by": tag.created_by,
        "is_global": tag.is_global,
        "created_at": tag.created_at,
        "doc_count": doc_count,
    }


def _require_membership(db: Session, org_id: int, user_id: int) -> OrganizationUser:
    m = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == user_id,
    ).first()
    if not m:
        raise HTTPException(status_code=403, detail="Access denied")
    return m


@router.get("", response_model=list[TagResponse])
def list_tags(
    org_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_membership(db, org_id, current_user.id)

    org_member_ids = [
        row.user_id
        for row in db.query(OrganizationUser.user_id)
            .filter(OrganizationUser.organization_id == org_id)
            .all()
    ]

    tags = db.query(Tag).filter(Tag.created_by.in_(org_member_ids)).all()

    count_map: dict[int, int] = {}
    if tags:
        tag_ids = [t.id for t in tags]
        rows = (
            db.query(DocumentTag.tag_id, func.count(DocumentTag.document_id).label("cnt"))
            .join(Document, Document.id == DocumentTag.document_id)
            .filter(DocumentTag.tag_id.in_(tag_ids), Document.organization_id == org_id)
            .group_by(DocumentTag.tag_id)
            .all()
        )
        count_map = {row.tag_id: row.cnt for row in rows}

    return [_tag_dict(t, count_map.get(t.id, 0)) for t in tags]


@router.post("", response_model=TagResponse)
def create_tag(
    body: TagCreate,
    org_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _require_membership(db, org_id, current_user.id)

    if body.is_global and m.role != OrgRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can create global tags")

    existing = db.query(Tag).filter(
        Tag.name == body.name,
        Tag.created_by == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag with this name already exists")

    tag = Tag(name=body.name, color=body.color, created_by=current_user.id, is_global=body.is_global)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    logger.info("Tag created: id=%d name=%r user_id=%d", tag.id, tag.name, current_user.id)
    return _tag_dict(tag, 0)


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    body: TagUpdate,
    org_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _require_membership(db, org_id, current_user.id)
    is_admin = m.role == OrgRole.ADMIN

    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.created_by != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot modify this tag")

    if body.name is not None:
        tag.name = body.name.strip()
    if body.color is not None:
        tag.color = body.color
    if body.is_global is not None:
        if body.is_global and not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can make tags global")
        tag.is_global = body.is_global

    db.commit()
    db.refresh(tag)

    count = db.query(func.count(DocumentTag.document_id)).filter(
        DocumentTag.tag_id == tag_id
    ).scalar() or 0
    return _tag_dict(tag, count)


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: int,
    org_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _require_membership(db, org_id, current_user.id)
    is_admin = m.role == OrgRole.ADMIN

    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.created_by != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete this tag")

    db.delete(tag)
    db.commit()
    logger.info("Tag deleted: id=%d user_id=%d", tag_id, current_user.id)
    return {"message": "Tag deleted"}
