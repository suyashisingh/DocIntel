import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.rbac import check_permission
from app.models.custom_role import CustomRole
from app.models.organization_user import OrganizationUser
from app.models.user import User
from app.schemas.role_schema import RoleCreate, RoleResponse, RoleUpdate
from app.services.notification_service import create_notification
from app.services.audit_service import log_audit

router = APIRouter(prefix="/roles", tags=["Roles"])
logger = logging.getLogger(__name__)


def _require_permission(category: str, action: str):
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        membership = (
            db.query(OrganizationUser)
            .filter(OrganizationUser.user_id == current_user.id)
            .order_by(OrganizationUser.organization_id.asc())
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of any organization")
        if not check_permission(db, current_user, membership.organization_id, category, action):
            raise HTTPException(status_code=403, detail=f"Requires permission: {category}.{action}")
        return current_user
    return dependency


@router.get("", response_model=list[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(_require_permission("roles", "view")),
):
    return (
        db.query(CustomRole)
        .order_by(CustomRole.is_system.desc(), CustomRole.name)
        .all()
    )


@router.post("", response_model=RoleResponse, status_code=201)
def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_permission("roles", "manage")),
):
    if db.query(CustomRole).filter(CustomRole.name == body.name).first():
        raise HTTPException(status_code=409, detail=f"Role '{body.name}' already exists")

    role = CustomRole(
        name=body.name,
        description=body.description,
        permissions=json.loads(json.dumps(body.permissions)) if body.permissions else {},
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    logger.info("Role created: %r by user_id=%d", body.name, current_user.id)
    try:
        create_notification(db, user_id=current_user.id, title="Role created",
            message=f"Role created — {body.name} role was created", ntype="other")
    except Exception:
        pass
    try:
        from app.models.organization_user import OrganizationUser as OrgUser
        m = db.query(OrgUser).filter(OrgUser.user_id == current_user.id).first()
        log_audit(db, org_id=m.organization_id if m else None,
                  user_id=current_user.id, user_email=current_user.email,
                  action="role.created", resource_type="role", resource_name=body.name,
                  details={"role_id": role.id})
    except Exception:
        pass
    return role


@router.get("/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(_require_permission("roles", "view")),
):
    role = db.query(CustomRole).filter(CustomRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_permission("roles", "manage")),
):
    role = db.query(CustomRole).filter(CustomRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=403, detail="System roles cannot be modified")

    if body.name is not None:
        clash = (
            db.query(CustomRole)
            .filter(CustomRole.name == body.name, CustomRole.id != role_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail=f"Role name '{body.name}' is already in use")
        role.name = body.name

    if body.description is not None:
        role.description = body.description

    if body.permissions is not None:
        role.permissions = json.loads(json.dumps(body.permissions))
        flag_modified(role, "permissions")

    db.commit()
    db.refresh(role)
    logger.info("Role updated: id=%d by user_id=%d", role_id, current_user.id)
    try:
        from app.models.organization_user import OrganizationUser as OrgUser
        m = db.query(OrgUser).filter(OrgUser.user_id == current_user.id).first()
        log_audit(db, org_id=m.organization_id if m else None,
                  user_id=current_user.id, user_email=current_user.email,
                  action="role.updated", resource_type="role", resource_name=role.name,
                  details={"role_id": role_id})
    except Exception:
        pass
    return role


@router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_permission("roles", "manage")),
):
    role = db.query(CustomRole).filter(CustomRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=403, detail="System roles cannot be deleted")

    rname = role.name
    db.delete(role)
    db.commit()
    logger.info("Role deleted: id=%d by user_id=%d", role_id, current_user.id)
    try:
        from app.models.organization_user import OrganizationUser as OrgUser
        m = db.query(OrgUser).filter(OrgUser.user_id == current_user.id).first()
        log_audit(db, org_id=m.organization_id if m else None,
                  user_id=current_user.id, user_email=current_user.email,
                  action="role.deleted", resource_type="role", resource_name=rname,
                  details={"role_id": role_id})
    except Exception:
        pass
