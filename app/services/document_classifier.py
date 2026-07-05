import re
from typing import Dict

# ---------------------------------------------------------------------------
# Configurable constants
# ---------------------------------------------------------------------------

# Zero-shot confidence below this threshold triggers the keyword fallback.
FALLBACK_CONFIDENCE_THRESHOLD = 0.4

# Keyword patterns per document type.  "generic" is the catch-all — no
# patterns needed because it is returned whenever nothing else matches.
PATTERNS: Dict[str, list[str]] = {
    "invoice": [
        r"\binvoice\b",
        r"\btotal\b",
        r"\bamount due\b",
        r"\bgst\b",
        r"\bpayable\b",
        r"\bbill\b",
        r"\bpurchase order\b",
    ],
    "resume": [
        r"\bskills\b",
        r"\beducation\b",
        r"\bexperience\b",
        r"\bcurriculum vitae\b",
        r"\bcv\b",
        r"\bwork history\b",
        r"\bqualifications\b",
    ],
    "contract": [
        r"\bagreement\b",
        r"\bparty\b",
        r"\bterms\b",
        r"\bclause\b",
        r"\bhereby\b",
        r"\bobligations\b",
        r"\bsignatory\b",
    ],
    "bank_statement": [
        r"\baccount\b",
        r"\bbalance\b",
        r"\bcredit\b",
        r"\bdebit\b",
        r"\btransaction\b",
        r"\bifsc\b",
        r"\bstatement\b",
    ],
    "offer_letter": [
        r"\boffer\b",
        r"\bsalary\b",
        r"\bjoining\b",
        r"\bposition\b",
        r"\bemployment\b",
        r"\bcompensation\b",
        r"\bstart date\b",
    ],
}


class DocumentClassifier:
    """Keyword/regex-based document classifier used as a fallback when
    zero-shot confidence is below *FALLBACK_CONFIDENCE_THRESHOLD*.
    """

    def detect(self, text: str) -> str:
        text_lower = text.lower()
        scores: Dict[str, int] = {}

        for doc_type, patterns in PATTERNS.items():
            scores[doc_type] = sum(
                len(re.findall(p, text_lower)) for p in patterns
            )

        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else "generic"
