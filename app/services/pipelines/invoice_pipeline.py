import re

from app.services.ocr_service import extract_text_from_document

# ---------------------------------------------------------------------------
# Extraction patterns
# ---------------------------------------------------------------------------

_INVOICE_NUMBER_RE = re.compile(
    r'(?:INV(?:OICE)?[\s\-#]*NO\.?|INVOICE\s*#|INV[\s\-#])\s*([A-Z0-9][\w\-/]{1,30})',
    re.IGNORECASE,
)

_TOTAL_AMOUNT_RE = re.compile(
    r'(?:total\s*(?:amount|due|payable)?|amount\s*due|grand\s*total|balance\s*due)'
    r'\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)',
    re.IGNORECASE,
)

# Fallback: bare currency figure like $1,234.56
_CURRENCY_RE = re.compile(r'\$\s*([\d,]+\.\d{2})')

_DATE_RE = re.compile(
    r'(?:date|invoice\s*date|issued|dated?)\s*[:\-]?\s*'
    r'(\d{1,2}[/\.\-]\d{1,2}[/\.\-]\d{2,4}'
    r'|\d{4}[/\.\-]\d{2}[/\.\-]\d{2}'
    r'|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})',
    re.IGNORECASE,
)

_VENDOR_LABEL_RE = re.compile(
    r'(?:from|vendor|bill(?:ed)?\s*from|billed\s*by|supplier|sold\s*by)\s*[:\-]\s*(.+)',
    re.IGNORECASE,
)


def _first_meaningful_line(text: str) -> str | None:
    """Return the first non-trivial capitalised line — used as a vendor fallback."""
    skip_words = {
        "invoice", "receipt", "statement", "quotation", "purchase order",
        "tax invoice", "proforma", "to", "date", "page",
    }
    for line in text.splitlines():
        line = line.strip()
        if (
            len(line) >= 4
            and line[0].isupper()
            and line.lower() not in skip_words
        ):
            return line
    return None


def _first_match(pattern: re.Pattern, text: str) -> str | None:
    m = pattern.search(text)
    return m.group(1).strip() if m else None


def run_invoice_pipeline(file_path: str) -> tuple[dict, float]:
    """Extract structured fields from an invoice document.

    Returns a tuple of (extracted_data dict, confidence_score 0-1).
    All fields default to None when not found — no fake data is returned.
    """
    text = extract_text_from_document(file_path)

    vendor = _first_match(_VENDOR_LABEL_RE, text) or _first_meaningful_line(text)
    invoice_number = _first_match(_INVOICE_NUMBER_RE, text)
    total_amount = _first_match(_TOTAL_AMOUNT_RE, text) or _first_match(_CURRENCY_RE, text)
    date = _first_match(_DATE_RE, text)

    extracted_data = {
        "document_type": "invoice",
        "vendor": vendor,
        "invoice_number": invoice_number,
        "total_amount": total_amount,
        "date": date,
    }

    # Confidence: fraction of expected fields successfully extracted.
    fields = [vendor, invoice_number, total_amount, date]
    confidence_score = round(sum(1 for f in fields if f is not None) / len(fields), 2)

    return extracted_data, confidence_score
