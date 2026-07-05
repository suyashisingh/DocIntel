"""Tests for /documents/* endpoints — upload, list, delete, export, RBAC."""

import csv
import io
import json

from app.models.document import DocumentStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _upload(client, org_id: int, token: str):
    return client.post(
        f"/documents/{org_id}/upload",
        files={"files": ("report.pdf", b"fake pdf content", "application/pdf")},
        headers=_auth(token),
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def test_upload_as_admin_succeeds(client, org, admin_token, mock_celery):
    r = _upload(client, org.id, admin_token)
    assert r.status_code == 200
    body = r.json()[0]  # endpoint accepts a list of files, always returns a list
    assert body["organization_id"] == org.id
    assert body["status"] == DocumentStatus.uploaded
    assert body["uploaded_by"] is not None
    mock_celery.delay.assert_called_once()


def test_upload_as_analyst_succeeds(client, org, analyst_token):
    r = _upload(client, org.id, analyst_token)
    assert r.status_code == 200


def test_upload_blocked_for_viewer(client, org, viewer_token):
    r = _upload(client, org.id, viewer_token)
    assert r.status_code == 403


def test_upload_blocked_for_non_member(client, org, db):
    from app.auth.jwt_handler import create_access_token
    from app.auth.security import hash_password
    from app.models.user import User

    outsider = User(email="out@test.com", password_hash=hash_password("p"))
    db.add(outsider)
    db.commit()
    token = create_access_token({"user_id": outsider.id})
    r = _upload(client, org.id, token)
    assert r.status_code == 403


def test_upload_queues_celery_task(client, org, admin_token, mock_celery):
    r = _upload(client, org.id, admin_token)
    doc_id = r.json()[0]["id"]
    mock_celery.delay.assert_called_once_with(doc_id)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def test_list_documents_returns_all_in_org(client, org, admin_user, admin_token, make_document):
    make_document(org.id, admin_user.id)
    make_document(org.id, admin_user.id)
    r = client.get(f"/documents/{org.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_list_documents_accessible_to_viewer(client, org, admin_user, viewer_token, make_document):
    make_document(org.id, admin_user.id)
    r = client.get(f"/documents/{org.id}", headers=_auth(viewer_token))
    assert r.status_code == 200


def test_list_documents_empty_org(client, org, admin_token):
    r = client.get(f"/documents/{org.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_document_as_admin_succeeds(client, org, admin_user, admin_token, make_document, db):
    from app.models.document import Document

    doc = make_document(org.id, admin_user.id)
    r = client.delete(f"/documents/{org.id}/{doc.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["message"] == "Document deleted"
    assert db.query(Document).filter_by(id=doc.id).first() is None


def test_delete_document_blocked_for_analyst(client, org, admin_user, analyst_token, make_document):
    doc = make_document(org.id, admin_user.id)
    r = client.delete(f"/documents/{org.id}/{doc.id}", headers=_auth(analyst_token))
    assert r.status_code == 403


def test_delete_document_blocked_for_viewer(client, org, admin_user, viewer_token, make_document):
    doc = make_document(org.id, admin_user.id)
    r = client.delete(f"/documents/{org.id}/{doc.id}", headers=_auth(viewer_token))
    assert r.status_code == 403


def test_delete_nonexistent_document_returns_404(client, org, admin_token):
    r = client.delete(f"/documents/{org.id}/99999", headers=_auth(admin_token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Export — CSV
# ---------------------------------------------------------------------------

def test_export_csv_content_type_and_disposition(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1)

    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(admin_token))
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "attachment" in r.headers["content-disposition"]
    assert f"org_{org.id}_export.csv" in r.headers["content-disposition"]


def test_export_csv_header_row_present(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(admin_token))
    reader = csv.DictReader(io.StringIO(r.text))
    expected_columns = {
        "document_id", "organization_id", "uploaded_by", "file_path",
        "document_type", "status", "upload_time",
        "version_number", "confidence_score", "processed_at",
        "text_length", "entities",
    }
    assert expected_columns == set(reader.fieldnames)


def test_export_csv_data_row_matches_document(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1, doc_type="invoice")

    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(admin_token))
    reader = csv.DictReader(io.StringIO(r.text))
    rows = list(reader)
    assert len(rows) == 1
    assert int(rows[0]["document_id"]) == doc.id
    assert int(rows[0]["version_number"]) == 1


def test_export_csv_uses_latest_version_only(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1)
    make_extracted(doc.id, version_number=2)

    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(admin_token))
    rows = list(csv.DictReader(io.StringIO(r.text)))
    # One document → one row, with the latest version
    assert len(rows) == 1
    assert int(rows[0]["version_number"]) == 2


# ---------------------------------------------------------------------------
# Export — JSON
# ---------------------------------------------------------------------------

def test_export_json_content_type_and_disposition(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id)

    r = client.get(f"/documents/{org.id}/export?format=json", headers=_auth(admin_token))
    assert r.status_code == 200
    assert "application/json" in r.headers["content-type"]
    assert "attachment" in r.headers["content-disposition"]
    assert f"org_{org.id}_export.json" in r.headers["content-disposition"]


def test_export_json_structure(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1, doc_type="contract")

    r = client.get(f"/documents/{org.id}/export?format=json", headers=_auth(admin_token))
    body = json.loads(r.text)
    assert isinstance(body, list)
    assert len(body) == 1

    entry = body[0]
    assert entry["document_id"] == doc.id
    assert entry["organization_id"] == org.id
    assert entry["version_number"] == 1
    assert "extracted_data" in entry
    assert entry["extracted_data"]["document_type"] == "contract"


def test_export_json_uses_latest_version_only(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(doc.id, version_number=1)
    make_extracted(doc.id, version_number=3)

    r = client.get(f"/documents/{org.id}/export?format=json", headers=_auth(admin_token))
    body = json.loads(r.text)
    assert len(body) == 1
    assert body[0]["version_number"] == 3


# ---------------------------------------------------------------------------
# Export — edge cases
# ---------------------------------------------------------------------------

def test_export_empty_org_returns_headers_only(client, org, admin_token):
    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(admin_token))
    assert r.status_code == 200
    non_empty_lines = [line for line in r.text.strip().splitlines() if line]
    assert len(non_empty_lines) == 1  # header row only


def test_export_empty_org_returns_empty_json_array(client, org, admin_token):
    r = client.get(f"/documents/{org.id}/export?format=json", headers=_auth(admin_token))
    assert r.status_code == 200
    assert json.loads(r.text) == []


def test_export_excludes_non_completed_documents(
    client, org, admin_user, admin_token, make_document, make_extracted
):
    completed = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    make_extracted(completed.id)
    make_document(org.id, admin_user.id, status=DocumentStatus.processing)
    make_document(org.id, admin_user.id, status=DocumentStatus.failed)
    make_document(org.id, admin_user.id, status=DocumentStatus.queued)

    r = client.get(f"/documents/{org.id}/export?format=json", headers=_auth(admin_token))
    body = json.loads(r.text)
    assert len(body) == 1
    assert body[0]["document_id"] == completed.id


def test_export_blocked_for_viewer(client, org, viewer_token):
    r = client.get(f"/documents/{org.id}/export?format=csv", headers=_auth(viewer_token))
    assert r.status_code == 403


def test_export_invalid_format_returns_422(client, org, admin_token):
    r = client.get(f"/documents/{org.id}/export?format=xml", headers=_auth(admin_token))
    assert r.status_code == 422


def test_export_missing_format_returns_422(client, org, admin_token):
    r = client.get(f"/documents/{org.id}/export", headers=_auth(admin_token))
    assert r.status_code == 422
