"""Tests for custom roles: /roles/* CRUD and permission enforcement via custom_roles."""

from app.auth.jwt_handler import create_access_token
from app.auth.rbac import check_permission
from app.auth.security import hash_password
from app.models.custom_role import CustomRole
from app.models.organization_user import OrganizationUser
from app.models.user import User

ADMIN_PERMISSIONS = {
    "documents": {"upload": True, "view": True, "delete": True, "reprocess": True, "export": True},
    "chat": {"use": True},
    "analytics": {"view": True},
    "team": {"view": True, "invite": True, "remove": True},
    "roles": {"view": True, "manage": True},
    "compare": {"use": True},
    "search": {"use": True},
}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_custom_role(db, name: str, permissions: dict, is_system: bool = False) -> CustomRole:
    role = CustomRole(name=name, description=f"{name} role", permissions=permissions, is_system=is_system)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def _make_role_user(db, org_id: int, role_name: str, email: str) -> User:
    """Create a fresh user, enroll them in *org_id* with the given custom role name."""
    user = User(email=email, password_hash=hash_password("secret"))
    db.add(user)
    db.flush()
    db.add(OrganizationUser(user_id=user.id, organization_id=org_id, role=role_name))
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Creating a custom role
# ---------------------------------------------------------------------------

def test_create_custom_role_saves_correctly(client, org, admin_token, db):
    permissions = {
        "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": False},
        "chat": {"use": True},
        "analytics": {"view": False},
        "team": {"view": False, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": False},
        "search": {"use": False},
    }
    r = client.post(
        "/roles",
        json={"name": "hr", "description": "Human Resources", "permissions": permissions},
        headers=_auth(admin_token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "hr"
    assert body["description"] == "Human Resources"
    assert body["is_system"] is False
    assert body["permissions"]["documents"]["view"] is True
    assert body["permissions"]["documents"]["upload"] is False

    saved = db.query(CustomRole).filter_by(name="hr").first()
    assert saved is not None
    assert saved.permissions["documents"]["view"] is True
    assert saved.is_system is False


# ---------------------------------------------------------------------------
# Custom role permissions are read correctly from custom_roles
# ---------------------------------------------------------------------------

def test_custom_role_permissions_read_correctly_from_table(client, org, db):
    permissions = {
        "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": False},
        "chat": {"use": True},
        "analytics": {"view": False},
        "team": {"view": False, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": False},
        "search": {"use": False},
    }
    _make_custom_role(db, "hr", permissions)
    hr_user = _make_role_user(db, org.id, "hr", "hr_user@test.com")

    assert check_permission(db, hr_user, org.id, "documents", "view") is True
    assert check_permission(db, hr_user, org.id, "chat", "use") is True
    assert check_permission(db, hr_user, org.id, "documents", "upload") is False
    assert check_permission(db, hr_user, org.id, "analytics", "view") is False
    assert check_permission(db, hr_user, org.id, "team", "view") is False


# ---------------------------------------------------------------------------
# Endpoint access — allowed vs. blocked by custom role permissions
# ---------------------------------------------------------------------------

def test_custom_role_user_can_access_allowed_endpoint(client, org, db, make_document, admin_user):
    permissions = {
        "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": False},
        "chat": {"use": True},
        "analytics": {"view": False},
        "team": {"view": False, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": False},
        "search": {"use": False},
    }
    _make_custom_role(db, "hr", permissions)
    hr_user = _make_role_user(db, org.id, "hr", "hr_user2@test.com")
    hr_token = create_access_token({"user_id": hr_user.id})

    make_document(org.id, admin_user.id)

    r = client.get(f"/documents/{org.id}", headers=_auth(hr_token))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_custom_role_user_gets_403_on_disallowed_endpoint(client, org, db):
    permissions = {
        "documents": {"upload": False, "view": True, "delete": False, "reprocess": False, "export": False},
        "chat": {"use": True},
        "analytics": {"view": False},
        "team": {"view": False, "invite": False, "remove": False},
        "roles": {"view": False, "manage": False},
        "compare": {"use": False},
        "search": {"use": False},
    }
    _make_custom_role(db, "hr", permissions)
    hr_user = _make_role_user(db, org.id, "hr", "hr_user3@test.com")
    hr_token = create_access_token({"user_id": hr_user.id})

    # analytics.view = False for this custom role
    r = client.get(f"/analytics/{org.id}/summary", headers=_auth(hr_token))
    assert r.status_code == 403

    # team.view = False for this custom role
    r = client.get(f"/organizations/{org.id}/members", headers=_auth(hr_token))
    assert r.status_code == 403

    # roles.view = False for this custom role
    r = client.get("/roles", headers=_auth(hr_token))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# System roles cannot be edited or deleted
# ---------------------------------------------------------------------------

def test_system_role_cannot_be_updated(client, org, admin_token, db):
    system_role = _make_custom_role(db, "admin", ADMIN_PERMISSIONS, is_system=True)

    r = client.put(
        f"/roles/{system_role.id}",
        json={"description": "Trying to rename the system role"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 403
    assert "System roles cannot be modified" in r.json()["detail"]

    db.refresh(system_role)
    assert system_role.description == "admin role"  # unchanged


def test_system_role_cannot_be_deleted(client, org, admin_token, db):
    system_role = _make_custom_role(db, "admin", ADMIN_PERMISSIONS, is_system=True)

    r = client.delete(f"/roles/{system_role.id}", headers=_auth(admin_token))
    assert r.status_code == 403
    assert "System roles cannot be deleted" in r.json()["detail"]

    assert db.query(CustomRole).filter_by(id=system_role.id).first() is not None


def test_custom_non_system_role_can_be_updated_and_deleted(client, org, admin_token, db):
    role = _make_custom_role(db, "hr", {"documents": {"view": True}})

    r = client.put(
        f"/roles/{role.id}",
        json={"description": "Updated description"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["description"] == "Updated description"

    r = client.delete(f"/roles/{role.id}", headers=_auth(admin_token))
    assert r.status_code == 204
    assert db.query(CustomRole).filter_by(id=role.id).first() is None
