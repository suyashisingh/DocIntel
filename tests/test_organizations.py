"""Tests for /organizations/* endpoints — creation, membership, RBAC."""

import pytest
from app.auth.jwt_handler import create_access_token
from app.auth.security import hash_password
from app.models.organization_user import OrgRole, OrganizationUser
from app.models.pending_invite import PendingInvite
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, email: str) -> User:
    u = User(email=email, password_hash=hash_password("pass"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ---------------------------------------------------------------------------
# Create organisation
# ---------------------------------------------------------------------------

def test_create_organization_returns_name_and_id(client, admin_user, admin_token):
    r = client.post("/organizations/", json={"name": "Acme"}, headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Acme"
    assert isinstance(body["id"], int)


def test_create_organization_creator_enrolled_as_admin(client, admin_user, admin_token, db):
    r = client.post("/organizations/", json={"name": "Audit Co"}, headers=_auth(admin_token))
    org_id = r.json()["id"]

    membership = db.query(OrganizationUser).filter_by(
        organization_id=org_id, user_id=admin_user.id
    ).first()
    assert membership is not None
    assert membership.role == OrgRole.ADMIN


def test_create_organization_requires_authentication(client):
    r = client.post("/organizations/", json={"name": "Ghost Org"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Invite member
# ---------------------------------------------------------------------------

def test_invite_blocked_for_user_with_existing_account(client, org, admin_token, db):
    # The invite flow only supports genuinely new emails (async signup via a
    # PendingInvite + emailed link) — any email that already has a User row,
    # org-less or not, is rejected rather than added directly.
    fresh = _make_user(db, "fresh@test.com")
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": fresh.email, "role": OrgRole.ANALYST},
        headers=_auth(admin_token),
    )
    assert r.status_code == 400
    assert "already registered with another organization" in r.json()["detail"]

    membership = db.query(OrganizationUser).filter_by(
        organization_id=org.id, user_id=fresh.id
    ).first()
    assert membership is None


def test_invite_member_blocked_for_analyst(client, org, analyst_token, db):
    fresh = _make_user(db, "fresh2@test.com")
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": fresh.email, "role": OrgRole.VIEWER},
        headers=_auth(analyst_token),
    )
    assert r.status_code == 403


def test_invite_member_blocked_for_viewer(client, org, viewer_token, db):
    fresh = _make_user(db, "fresh3@test.com")
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": fresh.email, "role": OrgRole.VIEWER},
        headers=_auth(viewer_token),
    )
    assert r.status_code == 403


def test_invite_nonexistent_user_returns_200_and_creates_pending_invite(client, org, admin_token, db):
    # Inviting an email with no existing account queues an async, emailed
    # signup invite rather than failing — no User row is created up front.
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": "ghost@test.com", "role": OrgRole.VIEWER},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["message"] == "Invitation sent"

    invite = db.query(PendingInvite).filter_by(org_id=org.id, email="ghost@test.com").first()
    assert invite is not None
    assert invite.role == OrgRole.VIEWER


def test_invite_existing_member_returns_400(client, org, admin_token, analyst_user):
    # analyst_user is already enrolled via the org fixture
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": analyst_user.email, "role": OrgRole.VIEWER},
        headers=_auth(admin_token),
    )
    assert r.status_code == 400
    assert "Already a member" in r.json()["detail"]


def test_invite_accepts_any_nonempty_role_string(client, org, admin_token, db):
    # OrganizationInvite.role is a plain, non-empty string (not an OrgRole/
    # CustomRole-constrained enum) — the invite endpoint stores whatever
    # value is sent verbatim without checking it against real role names.
    r = client.post(
        f"/organizations/{org.id}/invite",
        json={"email": "fresh4@test.com", "role": "superuser"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200

    invite = db.query(PendingInvite).filter_by(org_id=org.id, email="fresh4@test.com").first()
    assert invite is not None
    assert invite.role == "superuser"


# ---------------------------------------------------------------------------
# List members
# ---------------------------------------------------------------------------

def test_list_members_visible_to_roles_with_team_view_permission(client, org, admin_token, analyst_token):
    # admin and analyst both have team.view=True in the default permission set
    for token in (admin_token, analyst_token):
        r = client.get(f"/organizations/{org.id}/members", headers=_auth(token))
        assert r.status_code == 200
        assert len(r.json()) == 3  # admin + analyst + viewer enrolled by org fixture


def test_list_members_blocked_for_viewer(client, org, viewer_token):
    # viewer has team.view=False in the default permission set
    r = client.get(f"/organizations/{org.id}/members", headers=_auth(viewer_token))
    assert r.status_code == 403


def test_list_members_blocked_for_non_member(client, org, db):
    outsider = _make_user(db, "outsider@test.com")
    outsider_token = create_access_token({"user_id": outsider.id})
    r = client.get(f"/organizations/{org.id}/members", headers=_auth(outsider_token))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Remove member
# ---------------------------------------------------------------------------

def test_remove_member_as_admin_succeeds(client, org, admin_token, viewer_user, db):
    r = client.delete(
        f"/organizations/{org.id}/members/{viewer_user.id}",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["message"] == "Member removed"

    membership = db.query(OrganizationUser).filter_by(
        organization_id=org.id, user_id=viewer_user.id
    ).first()
    assert membership is None


def test_remove_member_blocked_for_analyst(client, org, analyst_token, viewer_user):
    r = client.delete(
        f"/organizations/{org.id}/members/{viewer_user.id}",
        headers=_auth(analyst_token),
    )
    assert r.status_code == 403


def test_remove_nonexistent_member_returns_404(client, org, admin_token):
    r = client.delete(
        f"/organizations/{org.id}/members/99999",
        headers=_auth(admin_token),
    )
    assert r.status_code == 404
