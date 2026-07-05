import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.rbac import require_role, require_permission
from app.auth.jwt_handler import create_invite_token
from app.config import settings
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser, OrgRole
from app.models.pending_invite import PendingInvite
from app.schemas.organization_schema import OrganizationCreate, OrganizationResponse
from app.models.user import User
from app.schemas.organization_user_schema import OrganizationInvite, OrganizationMemberResponse
from app.services.email_service import send_invite_email
from app.services.notification_service import create_notification
from app.services.audit_service import log_audit

router = APIRouter(prefix="/organizations", tags=["Organizations"])
logger = logging.getLogger(__name__)


class _RoleAssignRequest(BaseModel):
    role: str


@router.post("/", response_model=OrganizationResponse)
def create_organization(
    org_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_org = Organization(name=org_data.name)
    db.add(new_org)
    db.flush()  # ensures new_org.id is available without committing

    org_user = OrganizationUser(
        user_id=current_user.id,
        organization_id=new_org.id,
        role=OrgRole.ADMIN,
    )
    db.add(org_user)
    db.commit()
    db.refresh(new_org)

    logger.info(
        "Organization created: id=%d name=%r by user id=%d",
        new_org.id, new_org.name, current_user.id,
    )
    return new_org


@router.post("/{org_id}/invite")
def invite_user(
    org_id: int,
    invite_data: OrganizationInvite,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_permission("team", "invite")),
):
    # 1. If the email already has an account, reject — they must be added via the team page
    #    once they already exist, not via a signup invite.
    existing_user = db.query(User).filter(User.email == invite_data.email).first()
    if existing_user:
        in_this_org = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == org_id,
            OrganizationUser.user_id == existing_user.id,
        ).first()
        if in_this_org:
            raise HTTPException(status_code=400, detail="Already a member")
        raise HTTPException(
            status_code=400,
            detail="This email is already registered with another organization",
        )

    # 2. Clear any stale pending invite for this org + email, then create a fresh one.
    db.query(PendingInvite).filter(
        PendingInvite.org_id == org_id,
        PendingInvite.email == invite_data.email,
    ).delete()

    token = create_invite_token(invite_data.email, org_id, invite_data.role)
    db.add(PendingInvite(
        org_id=org_id,
        email=invite_data.email,
        role=invite_data.role,
        invite_token=token,
    ))
    db.commit()

    # 3. Send invite email with signup link.
    org = db.query(Organization).filter(Organization.id == org_id).first()
    invite_link = f"{settings.FRONTEND_URL}/signup?invite={token}"
    try:
        send_invite_email(
            invite_data.email,
            org.name if org else "your organization",
            invite_link,
        )
    except Exception:
        logger.warning("Failed to send invite email to %s", invite_data.email)

    logger.info(
        "Invite sent: email=%s role=%s org_id=%d by user_id=%d",
        invite_data.email, invite_data.role, org_id, actor.user_id,
    )
    try:
        create_notification(db, user_id=actor.user_id, title="Invitation sent",
            message=f"Invitation sent — {invite_data.email} was invited as {invite_data.role}",
            ntype="other")
    except Exception:
        pass
    try:
        actor_user = db.query(User).filter(User.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="team.member_invited", resource_type="team", resource_name=invite_data.email,
                  details={"role": str(invite_data.role)})
    except Exception:
        pass
    return {"message": "Invitation sent"}


@router.get("/{org_id}/invites")
def list_pending_invites(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("team", "invite")),
):
    invites = db.query(PendingInvite).filter(PendingInvite.org_id == org_id).all()
    return [
        {
            "id": inv.id,
            "email": inv.email,
            "role": inv.role,
            "created_at": inv.created_at,
        }
        for inv in invites
    ]


@router.get("/{org_id}/members", response_model=list[OrganizationMemberResponse])
def list_members(
    org_id: int,
    db: Session = Depends(get_db),
    _: OrganizationUser = Depends(require_permission("team", "view")),
):
    members = (
        db.query(OrganizationUser)
        .options(joinedload(OrganizationUser.user))
        .filter(OrganizationUser.organization_id == org_id)
        .all()
    )
    return [
        {
            "user_id": m.user_id,
            "organization_id": m.organization_id,
            "role": m.role,
            "email": m.user.email,
            "joined_at": m.joined_at,
        }
        for m in members
    ]


@router.delete("/{org_id}/members/{user_id}")
def remove_member(
    org_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_permission("team", "remove")),
):
    target = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == user_id,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    # Prevent removing the last admin (blocks self-removal and external removal)
    if target.role == OrgRole.ADMIN:
        admin_count = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == org_id,
            OrganizationUser.role == OrgRole.ADMIN,
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last admin from the organization",
            )

    removed_user = db.query(User).filter(User.id == user_id).first()
    removed_email = removed_user.email if removed_user else str(user_id)

    db.delete(target)
    db.commit()

    logger.info(
        "Member removed: user_id=%d from org_id=%d by user id=%d",
        user_id, org_id, actor.user_id,
    )
    try:
        create_notification(db, user_id=actor.user_id, title="Member removed",
            message=f"Member removed — {removed_email} was removed from the team",
            ntype="other")
    except Exception:
        pass
    try:
        actor_user = db.query(User).filter(User.id == actor.user_id).first()
        log_audit(db, org_id=org_id, user_id=actor.user_id,
                  user_email=actor_user.email if actor_user else str(actor.user_id),
                  action="team.member_removed", resource_type="team", resource_name=removed_email,
                  details={"removed_user_id": user_id})
    except Exception:
        pass
    return {"message": "Member removed"}


@router.put("/{org_id}/members/{user_id}/role")
def reassign_member_role(
    org_id: int,
    user_id: int,
    body: _RoleAssignRequest,
    db: Session = Depends(get_db),
    actor: OrganizationUser = Depends(require_role(OrgRole.ADMIN)),
):
    from app.models.custom_role import CustomRole

    if not db.query(CustomRole).filter(CustomRole.name == body.role).first():
        raise HTTPException(status_code=400, detail=f"Role '{body.role}' does not exist")

    target = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == user_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == OrgRole.ADMIN and body.role != OrgRole.ADMIN:
        admin_count = (
            db.query(OrganizationUser)
            .filter(
                OrganizationUser.organization_id == org_id,
                OrganizationUser.role == OrgRole.ADMIN,
            )
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    target.role = body.role
    db.commit()
    logger.info(
        "Member role updated: user_id=%d org_id=%d new_role=%r by user_id=%d",
        user_id, org_id, body.role, actor.user_id,
    )
    return {"message": "Role updated", "role": body.role}
