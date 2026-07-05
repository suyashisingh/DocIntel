"""Tests for PII detection (app.pii_detector) and the /documents/{id}/pii + /redact endpoints."""

from app.models.document import DocumentStatus
from app.pii_detector import detect_pii, redact_text


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# detect_pii — unit tests, no HTTP/DB needed
# ---------------------------------------------------------------------------

def test_detect_pii_finds_12_digit_aadhaar():
    findings = detect_pii("My Aadhaar number is 123456789012 for verification.")
    aadhaar = [f for f in findings if f["type"] == "aadhaar"]
    assert len(aadhaar) == 1
    assert aadhaar[0]["value"] == "123456789012"


def test_detect_pii_finds_spaced_aadhaar():
    findings = detect_pii("Aadhaar: 1234 5678 9012 please verify.")
    aadhaar = [f for f in findings if f["type"] == "aadhaar"]
    assert len(aadhaar) == 1
    assert aadhaar[0]["value"] == "1234 5678 9012"


def test_detect_pii_finds_email_address():
    findings = detect_pii("Please contact john.doe@example.com for details.")
    emails = [f for f in findings if f["type"] == "email"]
    assert len(emails) == 1
    assert emails[0]["value"] == "john.doe@example.com"


def test_detect_pii_finds_phone_number():
    findings = detect_pii("Call me at 9876543210 tomorrow.")
    phones = [f for f in findings if f["type"] == "phone"]
    assert len(phones) == 1
    assert phones[0]["value"] == "9876543210"


def test_detect_pii_ignores_numbers_that_dont_match_phone_pattern():
    # Phone regex requires a leading digit 6-9; this starts with 1.
    findings = detect_pii("Reference number 1234567890 for your records.")
    phones = [f for f in findings if f["type"] == "phone"]
    assert phones == []


def test_detect_pii_finds_multiple_types_in_one_document():
    text = (
        "Aadhaar 1234 5678 9012, phone 9876543210, "
        "email jane@example.com, card 4111 1111 1111 1111."
    )
    findings = detect_pii(text)
    types_found = {f["type"] for f in findings}
    assert "aadhaar" in types_found
    assert "phone" in types_found
    assert "email" in types_found
    assert "credit_card" in types_found


# ---------------------------------------------------------------------------
# redact_text — unit test of the replacement logic
# ---------------------------------------------------------------------------

def test_redact_text_replaces_only_selected_types():
    text = "Call 9876543210 or email a@b.com"
    findings = detect_pii(text)
    redacted, count = redact_text(text, findings, ["phone"])
    assert "9876543210" not in redacted
    assert "[PHONE REDACTED]" in redacted
    assert "a@b.com" in redacted  # email not in the redact list — left alone
    assert count == 1


# ---------------------------------------------------------------------------
# GET /documents/{id}/pii
# ---------------------------------------------------------------------------

def test_pii_scan_endpoint_returns_categorized_findings(
    client, org, admin_user, admin_token, make_document, db
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    doc.searchable_text = "Contact us at test@example.com or call 9876543210."
    db.commit()

    r = client.get(f"/documents/{doc.id}/pii", headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total_count"] == 2
    assert len(body["email"]) == 1
    assert len(body["phone"]) == 1
    assert body["aadhaar"] == []


def test_pii_scan_endpoint_requires_searchable_text(
    client, org, admin_user, admin_token, make_document
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    r = client.get(f"/documents/{doc.id}/pii", headers=_auth(admin_token))
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /documents/{id}/redact
# ---------------------------------------------------------------------------

def test_redact_endpoint_replaces_pii_with_placeholder(
    client, org, admin_user, admin_token, make_document, db, monkeypatch
):
    captured = {}

    def fake_embed_document(document_id, org_id, text):
        captured["document_id"] = document_id
        captured["org_id"] = org_id
        captured["text"] = text

    monkeypatch.setattr("app.services.embedding_service.embed_document", fake_embed_document)

    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    doc.searchable_text = "Contact John at john@example.com or 9876543210."
    db.commit()

    r = client.post(
        f"/documents/{doc.id}/redact",
        json={"pii_types": ["email", "phone"]},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["redacted_count"] == 2
    assert set(body["types_redacted"]) == {"email", "phone"}

    db.refresh(doc)
    assert "john@example.com" not in doc.searchable_text
    assert "9876543210" not in doc.searchable_text
    assert "[EMAIL REDACTED]" in doc.searchable_text
    assert "[PHONE REDACTED]" in doc.searchable_text
    assert doc.pii_redacted is True


def test_redact_endpoint_blocked_for_viewer(
    client, org, admin_user, viewer_token, make_document, db
):
    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    doc.searchable_text = "Call 9876543210."
    db.commit()

    r = client.post(
        f"/documents/{doc.id}/redact",
        json={"pii_types": ["phone"]},
        headers=_auth(viewer_token),
    )
    assert r.status_code == 403


def test_redacted_document_does_not_leak_pii_into_reembedded_text(
    client, org, admin_user, admin_token, make_document, db, monkeypatch
):
    """The text handed to embed_document() after redaction must not contain
    the raw PII values — otherwise a redacted document would still leak PII
    into its searchable chunk embeddings."""
    captured = {}

    def fake_embed_document(document_id, org_id, text):
        captured["text"] = text

    monkeypatch.setattr("app.services.embedding_service.embed_document", fake_embed_document)

    doc = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    doc.searchable_text = "SSN-like Aadhaar 1234 5678 9012 belongs to John, email john@example.com."
    db.commit()

    r = client.post(
        f"/documents/{doc.id}/redact",
        json={"pii_types": ["aadhaar", "email"]},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200

    assert "text" in captured, "embed_document was never called after redaction"
    assert "1234 5678 9012" not in captured["text"]
    assert "john@example.com" not in captured["text"]
    assert "[AADHAAR REDACTED]" in captured["text"]
    assert "[EMAIL REDACTED]" in captured["text"]
