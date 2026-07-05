import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.schemas.user_schema import UserCreate, UserResponse, UserMeResponse
from app.auth.security import hash_password, verify_password
from app.auth.jwt_handler import create_access_token, decode_invite_token
from app.auth.dependencies import get_current_user
from app.auth.rbac import get_role_permissions
from app.models.organization_user import OrganizationUser, OrgRole
from app.models.pending_invite import PendingInvite
from app.services.audit_service import log_audit

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)


@router.get("/invite/{token}")
def get_invite_details(token: str, db: Session = Depends(get_db)):
    try:
        payload = decode_invite_token(token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")

    org = db.query(Organization).filter(Organization.id == payload["org_id"]).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "email": payload["email"],
        "org_id": payload["org_id"],
        "org_name": org.name,
        "role": payload.get("role"),
    }


@router.post("/signup", response_model=UserResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        logger.warning("Signup rejected: email already registered (%s)", user.email)
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user.email,
        password_hash=hash_password(user.password),
    )
    db.add(new_user)
    db.flush()

    # Resolve the pending invite either by JWT token or by email.
    if user.invite_token:
        try:
            inv_payload = decode_invite_token(user.invite_token)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid or expired invite token")
        if inv_payload["email"].lower() != user.email.lower():
            raise HTTPException(status_code=400, detail="Email does not match the invitation")
        pending = db.query(PendingInvite).filter(
            PendingInvite.invite_token == user.invite_token
        ).first()
        if not pending:
            raise HTTPException(status_code=400, detail="Invite not found or already used")
    else:
        pending = db.query(PendingInvite).filter(PendingInvite.email == new_user.email).first()

    if pending:
        # User was pre-invited — join the existing org instead of creating a new one.
        org_user = OrganizationUser(
            user_id=new_user.id,
            organization_id=pending.org_id,
            role=pending.role if pending.role else OrgRole.VIEWER,
        )
        db.add(org_user)
        db.delete(pending)
        db.commit()
        db.refresh(new_user)

        logger.info(
            "Invited user registered: id=%d email=%s joined org_id=%d as %s",
            new_user.id, new_user.email, pending.org_id, pending.role,
        )
    else:
        # Fresh signup — create a new org.
        if not user.org_name:
            raise HTTPException(status_code=400, detail="org_name is required when signing up without an invitation")

        new_org = Organization(name=user.org_name)
        db.add(new_org)
        db.flush()  # ensures new_org.id is available

        db.execute(
            text("INSERT INTO organization_users (user_id, organization_id, role) VALUES (:user_id, :org_id, :role)"),
            {"user_id": new_user.id, "org_id": new_org.id, "role": "admin"}
        )
        db.commit()
        db.refresh(new_user)

        logger.info(
            "New user registered: id=%d email=%s org_id=%d",
            new_user.id, new_user.email, new_org.id,
        )

    return new_user


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(User.email == form_data.username).first()

    if not db_user or not verify_password(form_data.password, db_user.password_hash):
        logger.warning("Failed login attempt for email=%s", form_data.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"user_id": db_user.id})

    logger.info("User logged in: id=%d email=%s", db_user.id, db_user.email)
    try:
        membership = db.query(OrganizationUser).filter(OrganizationUser.user_id == db_user.id).first()
        log_audit(db, org_id=membership.organization_id if membership else None,
                  user_id=db_user.id, user_email=db_user.email,
                  action="auth.login", resource_type="auth", resource_name="login")
    except Exception:
        pass
    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserMeResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(OrganizationUser)
        .filter(OrganizationUser.user_id == current_user.id)
        .order_by(OrganizationUser.organization_id.asc())
        .first()
    )

    return UserMeResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        org_id=membership.organization_id if membership else None,
        role=membership.role if membership else None,
        permissions=get_role_permissions(db, membership.role) if membership else None,
    )
