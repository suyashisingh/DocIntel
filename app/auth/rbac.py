from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.organization_user import OrganizationUser
from app.models.user import User

# Hardcoded defaults used as fallback when a role has no custom_roles record.
_DEFAULT_PERMISSIONS: dict[str, dict[str, dict[str, bool]]] = {
    "admin": {
        "documents": {"upload": True, "view": True, "delete": True, "reprocess": True, "export": True},
        "chat": {"use": True},
        "analytics": {"view": True},
        "team": {"view": True, "invite": True, "remove": True},
        "roles": {"view": True, "manage": True},
        "compare": {"use": True},
        "search": {"use": True},
    },
    "analyst": {
        "documents": {"upload": True, "view": True, "delete": False, "reprocess": True, "export": True},
        "chat": {"use": True},
        "analytics": {"view": True},
        "team": {"view": True, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": True},
        "search": {"use": True},
    },
    "viewer": {
        "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": True},
        "chat": {"use": True},
        "analytics": {"view": True},
        "team": {"view": False, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": True},
        "search": {"use": True},
    },
}


def get_role_permissions(db: Session, role_name: str) -> dict:
    """Return the permissions JSONB for *role_name*.

    Reads from custom_roles first — system roles (admin/analyst/viewer) are
    seeded there too, so this covers both system and custom roles uniformly.
    Falls back to the hardcoded defaults table only when no matching
    custom_roles record exists (e.g. a pre-migration database).
    """
    from app.models.custom_role import CustomRole

    role_obj = db.query(CustomRole).filter(CustomRole.name == role_name).first()
    if role_obj and role_obj.permissions:
        return role_obj.permissions

    return _DEFAULT_PERMISSIONS.get(role_name, {})


def check_permission(
    db: Session,
    user: User,
    org_id: int,
    category: str,
    action: str,
) -> bool:
    """Return True if *user* has *action* in *category* for *org_id*."""
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org_id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )
    if not membership:
        return False

    return bool(get_role_permissions(db, membership.role).get(category, {}).get(action, False))


def get_user_role(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationUser:
    """Return the OrganizationUser membership record, or 403 if not a member."""
    membership = db.query(OrganizationUser).filter(
        OrganizationUser.organization_id == org_id,
        OrganizationUser.user_id == current_user.id,
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    return membership


def require_role(*allowed_roles: str):
    """
    Dependency factory. Verifies the current user holds one of *allowed_roles*
    in the target organization. Returns the membership record on success.

    Usage::

        @router.post("/{org_id}/upload")
        def upload(
            org_id: int,
            _: OrganizationUser = Depends(require_role(OrgRole.ADMIN, OrgRole.ANALYST)),
        ): ...
    """
    def dependency(
        membership: OrganizationUser = Depends(get_user_role),
    ) -> OrganizationUser:
        if membership.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {' or '.join(allowed_roles)}",
            )
        return membership

    return dependency


def require_permission(category: str, action: str):
    """
    Dependency factory for routes where ``org_id`` is a path or query
    parameter. Grants access based on the member's role permissions —
    system roles (admin/analyst/viewer) AND custom roles alike, since both
    are read from the same custom_roles.permissions JSONB via
    :func:`check_permission`. Returns the membership record on success.

    Usage::

        @router.get("/{org_id}")
        def list_documents(
            org_id: int,
            _: OrganizationUser = Depends(require_permission("documents", "view")),
        ): ...
    """
    def dependency(
        org_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> OrganizationUser:
        membership = db.query(OrganizationUser).filter(
            OrganizationUser.organization_id == org_id,
            OrganizationUser.user_id == current_user.id,
        ).first()
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this organization",
            )
        if not check_permission(db, current_user, org_id, category, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires permission: {category}.{action}",
            )
        return membership

    return dependency


def require_permission_own_org(category: str, action: str):
    """
    Dependency factory for routes with no ``org_id`` in the request (e.g.
    role management, audit log) — resolves the user's own organization
    membership first, then checks the permission against it.
    """
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> OrganizationUser:
        membership = (
            db.query(OrganizationUser)
            .filter(OrganizationUser.user_id == current_user.id)
            .order_by(OrganizationUser.organization_id.asc())
            .first()
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of any organization",
            )
        if not check_permission(db, current_user, membership.organization_id, category, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires permission: {category}.{action}",
            )
        return membership

    return dependency
