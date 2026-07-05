import re

from app.services.nlp_service import nlp

_MAX_NER_CHARS = 100_000  # cap spaCy input to avoid OOM on huge documents

_PATTERNS: dict[str, tuple[re.Pattern, str]] = {
    "aadhaar": (
        re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b"),
        "[AADHAAR REDACTED]",
    ),
    "pan": (
        re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b"),
        "[PAN REDACTED]",
    ),
    "phone": (
        re.compile(r"\b[6-9]\d{9}\b"),
        "[PHONE REDACTED]",
    ),
    "email": (
        re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"),
        "[EMAIL REDACTED]",
    ),
    "credit_card": (
        re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),
        "[CREDIT CARD REDACTED]",
    ),
}


def detect_pii(text: str) -> list[dict]:
    """Return all PII findings in *text*, sorted by start position."""
    findings: list[dict] = []

    for pii_type, (pattern, replacement) in _PATTERNS.items():
        for m in pattern.finditer(text):
            findings.append({
                "type": pii_type,
                "value": m.group(),
                "start": m.start(),
                "end": m.end(),
                "replacement": replacement,
            })

    # spaCy NER for PERSON entities
    spacy_doc = nlp(text[:_MAX_NER_CHARS])
    for ent in spacy_doc.ents:
        if ent.label_ == "PERSON":
            findings.append({
                "type": "person",
                "value": ent.text,
                "start": ent.start_char,
                "end": ent.end_char,
                "replacement": "[PERSON REDACTED]",
            })

    findings.sort(key=lambda x: x["start"])
    return findings


def redact_text(text: str, findings: list[dict], pii_types: list[str]) -> tuple[str, int]:
    """Replace every occurrence of each detected value with its placeholder.

    Value-based replacement (str.replace) is used so all occurrences of a
    detected string are wiped even if the same value appears multiple times.
    Deduplication by (value, replacement) avoids double-counting.
    """
    targets = [f for f in findings if f["type"] in pii_types]

    seen: set[tuple[str, str]] = set()
    count = 0
    for f in targets:
        key = (f["value"], f["replacement"])
        if key in seen:
            continue
        seen.add(key)
        occurrences = text.count(f["value"])
        if occurrences:
            text = text.replace(f["value"], f["replacement"])
            count += occurrences

    return text, count
