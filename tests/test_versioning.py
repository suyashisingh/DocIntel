"""
Tests for document versioning:
  GET  /documents/results/{document_id}                    — returns latest version
  GET  /documents/results/{document_id}/versions           — returns all versions
  POST /documents/{org_id}/{document_id}/reprocess         — queues reprocessing
"""

from app.auth.jwt_handler import create_access_token
from app.auth.security import hash_password
from app.models.document import DocumentStatus
from app.models.user import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# GET /results/{document_id}  — latest version
# ---------------------------------------------------------------------------

def test_results_returns_latest_version(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1, doc_type="invoice")
    make_extracted(doc.id, version_number=2, doc_type="contract")

    r = client.get(f"/documents/results/{doc.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["version_number"] == 2
    assert body["structured_json"]["document_type"] == "contract"


def test_results_single_version(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1)

    r = client.get(f"/documents/results/{doc.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["version_number"] == 1


def test_results_response_contains_required_fields(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    r = client.get(f"/documents/results/{doc.id}", headers=_auth(admin_token))
    body = r.json()
    for field in ("id", "document_id", "version_number", "structured_json",
                  "confidence_score", "processed_at"):
        assert field in body, f"Missing field: {field}"


def test_results_returns_404_when_no_extracted_data(
    client, org, admin_user, admin_token, make_document
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.processing)
    r = client.get(f"/documents/results/{doc.id}", headers=_auth(admin_token))
    assert r.status_code == 404
    assert "not available yet" in r.json()["detail"]


def test_results_returns_404_for_unknown_document(client, admin_user, admin_token):
    r = client.get("/documents/results/99999", headers=_auth(admin_token))
    assert r.status_code == 404


def test_results_blocked_for_non_member(client, org, admin_user, make_document, make_extracted, db):
    outsider = User(email="out@test.com", password_hash=hash_password("p"))
    db.add(outsider)
    db.commit()
    token = create_access_token({"user_id": outsider.id})

    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    r = client.get(f"/documents/results/{doc.id}", headers=_auth(token))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# GET /results/{document_id}/versions  — full version history
# ---------------------------------------------------------------------------

def test_versions_returns_all_versions(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1)
    make_extracted(doc.id, version_number=2)
    make_extracted(doc.id, version_number=3)

    r = client.get(f"/documents/results/{doc.id}/versions", headers=_auth(admin_token))
    assert r.status_code == 200
    assert len(r.json()) == 3


def test_versions_ordered_ascending(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    # Insert out of order to confirm the endpoint sorts them
    make_extracted(doc.id, version_number=3)
    make_extracted(doc.id, version_number=1)
    make_extracted(doc.id, version_number=2)

    r = client.get(f"/documents/results/{doc.id}/versions", headers=_auth(admin_token))
    versions = [v["version_number"] for v in r.json()]
    assert versions == sorted(versions)


def test_versions_accessible_to_all_roles(
    client, org, admin_user, admin_token, analyst_token, viewer_token,
    make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    for token in (admin_token, analyst_token, viewer_token):
        r = client.get(f"/documents/results/{doc.id}/versions", headers=_auth(token))
        assert r.status_code == 200


def test_versions_empty_when_no_extracted_data(
    client, org, admin_user, admin_token, make_document
):
    doc = make_document(org.id, admin_user.id)
    r = client.get(f"/documents/results/{doc.id}/versions", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json() == []


def test_versions_blocked_for_non_member(
    client, org, admin_user, make_document, make_extracted, db
):
    outsider = User(email="out2@test.com", password_hash=hash_password("p"))
    db.add(outsider)
    db.commit()
    token = create_access_token({"user_id": outsider.id})

    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    r = client.get(f"/documents/results/{doc.id}/versions", headers=_auth(token))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /documents/{org_id}/{document_id}/reprocess
# ---------------------------------------------------------------------------

def test_reprocess_queues_celery_task(
    client, org, admin_user, admin_token, make_document, mock_celery
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)

    r = client.post(f"/documents/{org.id}/{doc.id}/reprocess", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["document_id"] == doc.id
    mock_celery.delay.assert_called_once_with(doc.id)


def test_reprocess_resets_document_status_to_queued(
    client, org, admin_user, admin_token, make_document, db
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)

    client.post(f"/documents/{org.id}/{doc.id}/reprocess", headers=_auth(admin_token))

    db.refresh(doc)
    assert doc.status == DocumentStatus.queued


def test_reprocess_allowed_for_analyst(
    client, org, admin_user, analyst_token, make_document
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    r = client.post(f"/documents/{org.id}/{doc.id}/reprocess", headers=_auth(analyst_token))
    assert r.status_code == 200


def test_reprocess_blocked_for_viewer(
    client, org, admin_user, viewer_token, make_document
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    r = client.post(f"/documents/{org.id}/{doc.id}/reprocess", headers=_auth(viewer_token))
    assert r.status_code == 403


def test_reprocess_blocked_for_non_member(
    client, org, admin_user, make_document, db
):
    outsider = User(email="out3@test.com", password_hash=hash_password("p"))
    db.add(outsider)
    db.commit()
    token = create_access_token({"user_id": outsider.id})

    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    r = client.post(f"/documents/{org.id}/{doc.id}/reprocess", headers=_auth(token))
    assert r.status_code == 403


def test_reprocess_returns_404_for_unknown_document(client, org, admin_token):
    r = client.post(f"/documents/{org.id}/99999/reprocess", headers=_auth(admin_token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Incremental version numbers — integration of the two above concerns
# ---------------------------------------------------------------------------

def test_latest_version_advances_after_each_extraction(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    """The results endpoint should always return the row with the highest version."""
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)

    for v in (1, 2, 3):
        make_extracted(doc.id, version_number=v, doc_type=f"type_{v}")

    r = client.get(f"/documents/results/{doc.id}", headers=_auth(admin_token))
    body = r.json()
    assert body["version_number"] == 3
    assert body["structured_json"]["document_type"] == "type_3"
