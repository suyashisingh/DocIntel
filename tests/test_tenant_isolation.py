"""Tests proving one organization's data is never visible to another
organization's members — cross-tenant isolation for documents, team
membership, and search."""

from app.auth.jwt_handler import create_access_token
from app.auth.security import hash_password
from app.models.document import DocumentStatus
from app.models.organization import Organization
from app.models.organization_user import OrgRole, OrganizationUser
from app.models.user import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_org_with_admin(db, org_name: str, email: str):
    """Create a second, fully independent organisation with its own admin user."""
    user = User(email=email, password_hash=hash_password("secret"))
    db.add(user)
    db.flush()

    o = Organization(name=org_name)
    db.add(o)
    db.flush()

    db.add(OrganizationUser(user_id=user.id, organization_id=o.id, role=OrgRole.ADMIN))
    db.commit()
    db.refresh(o)
    db.refresh(user)

    token = create_access_token({"user_id": user.id})
    return o, user, token


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def test_org_a_admin_cannot_access_org_b_document_results(
    client, org, admin_token, make_document, make_extracted, db
):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb@test.com")

    doc_b = make_document(org_b.id, user_b.id, status=DocumentStatus.completed)
    make_extracted(doc_b.id)

    r = client.get(f"/documents/results/{doc_b.id}", headers=_auth(admin_token))
    assert r.status_code == 403


def test_org_a_admin_cannot_access_org_b_document_pii(
    client, org, admin_token, make_document, db
):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb2@test.com")

    doc_b = make_document(org_b.id, user_b.id, status=DocumentStatus.completed)
    doc_b.searchable_text = "call 9876543210"
    db.commit()

    r = client.get(f"/documents/{doc_b.id}/pii", headers=_auth(admin_token))
    assert r.status_code in (403, 404)


def test_org_a_admin_cannot_delete_org_b_document(
    client, org, admin_token, make_document, db
):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb3@test.com")
    doc_b = make_document(org_b.id, user_b.id, status=DocumentStatus.completed)

    # org_id in the path must belong to the caller — cross-org path is rejected
    r = client.delete(f"/documents/{org.id}/{doc_b.id}", headers=_auth(admin_token))
    assert r.status_code == 404


def test_org_a_admin_only_sees_own_org_documents_in_list(
    client, org, admin_user, admin_token, make_document, db
):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb4@test.com")

    own_doc = make_document(org.id, admin_user.id)
    make_document(org_b.id, user_b.id)

    r = client.get(f"/documents/{org.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    doc_ids = [d["id"] for d in r.json()]
    assert doc_ids == [own_doc.id]


# ---------------------------------------------------------------------------
# Team membership
# ---------------------------------------------------------------------------

def test_org_a_admin_cannot_see_org_b_team_members(client, org, admin_token, db):
    org_b, _user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb5@test.com")

    r = client.get(f"/organizations/{org_b.id}/members", headers=_auth(admin_token))
    assert r.status_code == 403


def test_org_b_admin_cannot_see_org_a_team_members(client, org, db):
    _org_b, _user_b, token_b = _make_org_with_admin(db, "Org B", "adminb6@test.com")

    r = client.get(f"/organizations/{org.id}/members", headers=_auth(token_b))
    assert r.status_code == 403


def test_org_a_admin_cannot_remove_org_b_member(client, org, admin_token, db):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb7@test.com")

    r = client.delete(
        f"/organizations/{org_b.id}/members/{user_b.id}",
        headers=_auth(admin_token),
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def test_search_results_never_leak_across_organizations(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    org_b, user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb8@test.com")

    own_doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    own_doc.original_filename = "shared-keyword-invoice.pdf"
    make_extracted(own_doc.id)

    other_doc = make_document(org_b.id, user_b.id, status=DocumentStatus.completed)
    other_doc.original_filename = "shared-keyword-invoice.pdf"
    make_extracted(other_doc.id)
    db.commit()

    r = client.get(
        f"/documents/search?org_id={org.id}&entity=shared-keyword",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    doc_ids = [d["id"] for d in r.json()["documents"]]
    assert own_doc.id in doc_ids
    assert other_doc.id not in doc_ids


def test_search_blocked_across_org_id_mismatch(client, org, admin_token, db):
    org_b, _user_b, _token_b = _make_org_with_admin(db, "Org B", "adminb9@test.com")

    # admin_token belongs to `org`, not org_b — searching org_b's org_id must fail
    r = client.get(f"/documents/search?org_id={org_b.id}", headers=_auth(admin_token))
    assert r.status_code == 403
