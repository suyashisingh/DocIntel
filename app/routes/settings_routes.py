import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.rbac import get_user_role, require_role
from app.auth.security import hash_password, verify_password
from app.database import get_db
from app.models.organization import Organization
from app.models.organization_user import OrgRole, OrganizationUser
from app.models.user import User

router = APIRouter(tags=["Settings"])
logger = logging.getLogger(__name__)


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    display_name: str | None = None  # None = don't change; "" = clear


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateOrgNameRequest(BaseModel):
    name: str


# ── User profile ──────────────────────────────────────────────────────────────

@router.patch("/users/me")
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.email and body.email.lower() != current_user.email.lower():
        conflict = db.query(User).filter(User.email == body.email).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use by another account")
        current_user.email = body.email
    if body.display_name is not None:
        current_user.display_name = body.display_name.strip() or None
    db.commit()
    db.refresh(current_user)
    logger.info("User %d updated profile", current_user.id)
    return {"id": current_user.id, "email": current_user.email, "display_name": current_user.display_name}


@router.patch("/users/me/password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    logger.info("User %d changed password", current_user.id)
    return {"message": "Password updated"}


@router.delete("/users/me")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Block deletion if the user is the sole admin of any organisation.
    sole_admin_orgs = db.execute(text("""
        SELECT ou.organization_id
        FROM organization_users ou
        WHERE ou.user_id = :uid AND ou.role = 'admin'
        AND (
            SELECT COUNT(*) FROM organization_users ou2
            WHERE ou2.organization_id = ou.organization_id
            AND ou2.role = 'admin'
            AND ou2.user_id != :uid
        ) = 0
    """), {"uid": current_user.id}).fetchall()

    if sole_admin_orgs:
        raise HTTPException(
            status_code=400,
            detail="You are the last admin of an organisation — transfer ownership before deleting your account"
        )

    db.delete(current_user)
    db.commit()
    logger.info("User %d deleted their account", current_user.id)
    return {"message": "Account deleted"}


# ── Organisation ──────────────────────────────────────────────────────────────

@router.get("/organizations/{org_id}")
def get_organization(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organisation")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    return {"id": org.id, "name": org.name}


@router.patch("/organizations/{org_id}")
def update_organization(
    org_id: int,
    body: UpdateOrgNameRequest,
    db: Session = Depends(get_db),
    _actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN)),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Organisation name cannot be empty")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    org.name = body.name.strip()
    db.commit()
    db.refresh(org)
    logger.info("Organisation %d renamed to %r", org_id, org.name)
    return {"id": org.id, "name": org.name}


@router.post("/organizations/{org_id}/leave")
def leave_organization(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member of this organisation")

    if membership.role == OrgRole.ADMIN:
        admin_count = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == org_id,
            OrganizationUser.role == OrgRole.ADMIN,
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the last admin — transfer ownership first",
            )

    db.delete(membership)
    db.commit()
    logger.info("User %d left organisation %d", current_user.id, org_id)
    return {"message": "Left organisation"}
