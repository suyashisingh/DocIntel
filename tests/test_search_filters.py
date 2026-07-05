"""Tests for /documents/search filters — document_type, date range, tags,
and the underlying search_tables / search_entities service functions."""

from datetime import datetime, timedelta, timezone

from app.models.document import DocumentStatus
from app.models.document_table import DocumentTable
from app.models.document_tag import DocumentTag
from app.models.extracted_data import ExtractedData
from app.models.tag import Tag
from app.services.search_service import search_entities, search_tables


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _completed_doc(make_document, make_extracted, org_id, user_id, *, document_type=None,
                    filename=None, upload_time=None, db=None):
    doc = make_document(org_id, user_id, status=DocumentStatus.completed)
    make_extracted(doc.id)
    if document_type is not None:
        doc.document_type = document_type
    if filename is not None:
        doc.original_filename = filename
    if upload_time is not None:
        doc.upload_time = upload_time
    if db is not None:
        db.commit()
        db.refresh(doc)
    return doc


# ---------------------------------------------------------------------------
# document_type filter
# ---------------------------------------------------------------------------

def test_search_document_type_filter_returns_only_matching_type(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    invoice = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                              document_type="invoice", db=db)
    _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                    document_type="contract", db=db)

    r = client.get(
        f"/documents/search?org_id={org.id}&document_type=invoice",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    doc_ids = [d["id"] for d in body["documents"]]
    assert doc_ids == [invoice.id]
    assert body["total"] == 1


def test_search_without_document_type_filter_returns_all(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    _completed_doc(make_document, make_extracted, org.id, admin_user.id, document_type="invoice", db=db)
    _completed_doc(make_document, make_extracted, org.id, admin_user.id, document_type="contract", db=db)

    r = client.get(f"/documents/search?org_id={org.id}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["total"] == 2


# ---------------------------------------------------------------------------
# Date range filter
# ---------------------------------------------------------------------------

def test_search_date_range_filter_excludes_out_of_range_documents(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    now = datetime.now(timezone.utc)
    old_doc = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                              upload_time=now - timedelta(days=365), db=db)
    recent_doc = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                                 upload_time=now, db=db)

    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    r = client.get(
        f"/documents/search?org_id={org.id}&date_from={date_from}",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    doc_ids = [d["id"] for d in r.json()["documents"]]
    assert recent_doc.id in doc_ids
    assert old_doc.id not in doc_ids


def test_search_date_range_filter_with_both_bounds(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    now = datetime.now(timezone.utc)
    in_range = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                               upload_time=now - timedelta(days=3), db=db)
    too_old = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                              upload_time=now - timedelta(days=100), db=db)
    too_new = _completed_doc(make_document, make_extracted, org.id, admin_user.id,
                              upload_time=now + timedelta(days=1), db=db)

    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    date_to = now.strftime("%Y-%m-%d")
    r = client.get(
        f"/documents/search?org_id={org.id}&date_from={date_from}&date_to={date_to}",
        headers=_auth(admin_token),
    )
    doc_ids = [d["id"] for d in r.json()["documents"]]
    assert in_range.id in doc_ids
    assert too_old.id not in doc_ids
    assert too_new.id not in doc_ids


# ---------------------------------------------------------------------------
# Tag filter — AND mode (search endpoint) and OR mode (list endpoint)
# ---------------------------------------------------------------------------

def test_search_tag_filter_and_mode_requires_all_tags(
    client, org, admin_user, admin_token, make_document, make_extracted, db
):
    tag_a = Tag(name="urgent", created_by=admin_user.id)
    tag_b = Tag(name="reviewed", created_by=admin_user.id)
    db.add_all([tag_a, tag_b])
    db.commit()

    both = _completed_doc(make_document, make_extracted, org.id, admin_user.id, db=db)
    only_a = _completed_doc(make_document, make_extracted, org.id, admin_user.id, db=db)

    db.add(DocumentTag(document_id=both.id, tag_id=tag_a.id))
    db.add(DocumentTag(document_id=both.id, tag_id=tag_b.id))
    db.add(DocumentTag(document_id=only_a.id, tag_id=tag_a.id))
    db.commit()

    r = client.get(
        f"/documents/search?org_id={org.id}&tag_ids={tag_a.id}&tag_ids={tag_b.id}",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    doc_ids = [d["id"] for d in r.json()["documents"]]
    assert doc_ids == [both.id]


def test_list_documents_tag_filter_or_mode_matches_any_tag(
    client, org, admin_user, admin_token, make_document, db
):
    tag_a = Tag(name="urgent", created_by=admin_user.id)
    tag_b = Tag(name="reviewed", created_by=admin_user.id)
    db.add_all([tag_a, tag_b])
    db.commit()

    doc_a = make_document(org.id, admin_user.id)
    doc_b = make_document(org.id, admin_user.id)
    doc_neither = make_document(org.id, admin_user.id)

    db.add(DocumentTag(document_id=doc_a.id, tag_id=tag_a.id))
    db.add(DocumentTag(document_id=doc_b.id, tag_id=tag_b.id))
    db.commit()

    r = client.get(
        f"/documents/{org.id}?tag_ids_any={tag_a.id}&tag_ids_any={tag_b.id}",
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    doc_ids = {d["id"] for d in r.json()}
    assert doc_ids == {doc_a.id, doc_b.id}
    assert doc_neither.id not in doc_ids


# ---------------------------------------------------------------------------
# search_tables / search_entities — document_type + date filters
# ---------------------------------------------------------------------------

def test_search_tables_respects_document_type_filter(
    client, org, admin_user, make_document, db
):
    invoice = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    invoice.document_type = "invoice"
    contract = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    contract.document_type = "contract"
    db.commit()

    for doc in (invoice, contract):
        db.add(DocumentTable(
            document_id=doc.id,
            page_number=1,
            table_index_on_page=0,
            headers=["Vendor", "Total"],
            rows=[["Acme Corp", "500"]],
            row_count=1,
            column_count=2,
        ))
    db.commit()

    results = search_tables(db, organization_id=org.id, query="Acme", document_type="invoice")
    doc_ids = {r["document_id"] for r in results}
    assert doc_ids == {invoice.id}


def test_search_tables_respects_date_filter(client, org, admin_user, make_document, db):
    now = datetime.now(timezone.utc)
    recent = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    recent.upload_time = now
    old = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    old.upload_time = now - timedelta(days=365)
    db.commit()

    for doc in (recent, old):
        db.add(DocumentTable(
            document_id=doc.id,
            page_number=1,
            table_index_on_page=0,
            headers=["Vendor", "Total"],
            rows=[["Acme Corp", "500"]],
            row_count=1,
            column_count=2,
        ))
    db.commit()

    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    results = search_tables(db, organization_id=org.id, query="Acme", date_from=date_from)
    doc_ids = {r["document_id"] for r in results}
    assert doc_ids == {recent.id}


def test_search_entities_respects_document_type_filter(
    client, org, admin_user, make_document, db
):
    invoice = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    invoice.document_type = "invoice"
    contract = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    contract.document_type = "contract"
    db.commit()

    for doc in (invoice, contract):
        db.add(ExtractedData(
            document_id=doc.id,
            version_number=1,
            structured_json={"entities": [{"text": "Acme Corp", "label": "ORG"}]},
        ))
    db.commit()

    results = search_entities(db, organization_id=org.id, query="Acme", document_type="invoice")
    doc_ids = {r["document_id"] for r in results}
    assert doc_ids == {invoice.id}


def test_search_entities_respects_date_filter(client, org, admin_user, make_document, db):
    now = datetime.now(timezone.utc)
    recent = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    recent.upload_time = now
    old = make_document(org.id, admin_user.id, status=DocumentStatus.completed)
    old.upload_time = now - timedelta(days=365)
    db.commit()

    for doc in (recent, old):
        db.add(ExtractedData(
            document_id=doc.id,
            version_number=1,
            structured_json={"entities": [{"text": "Acme Corp", "label": "ORG"}]},
        ))
    db.commit()

    date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    results = search_entities(db, organization_id=org.id, query="Acme", date_from=date_from)
    doc_ids = {r["document_id"] for r in results}
    assert doc_ids == {recent.id}
