import logging
import re

import pdfplumber

logger = logging.getLogger(__name__)

_NUMERIC_RE = re.compile(r'^[\d.,\-+%$€₹\s]+$')

MIN_TABLE_ROWS = 2
MIN_TABLE_COLS = 2


def _is_numeric(val: str) -> bool:
    return bool(_NUMERIC_RE.match(val.strip())) and val.strip() != ""


def _cluster_x_positions(x_positions: list, threshold: int = 20) -> list:
    if not x_positions:
        return []
    sorted_x = sorted(set(x_positions))
    clusters = [sorted_x[0]]
    for x in sorted_x[1:]:
        if x - clusters[-1] > threshold:
            clusters.append(x)
    return clusters


def _find_nearest_col(x: float, clusters: list) -> int:
    return min(range(len(clusters)), key=lambda i: abs(clusters[i] - x))


def _process_explicit_table(table: list, page_num: int, table_idx: int, page) -> dict | None:
    col_count = max((len(r) for r in table), default=0)
    if col_count < MIN_TABLE_COLS:
        return None

    normalized = []
    for row in table:
        norm_row = [str(cell).strip() if cell is not None else "" for cell in row]
        while len(norm_row) < col_count:
            norm_row.append("")
        normalized.append(norm_row)

    first_row = normalized[0]
    filled = [v for v in first_row if v]
    non_numeric = sum(1 for v in filled if not _is_numeric(v))
    header_detected = len(filled) > 0 and (non_numeric / len(filled)) > 0.5

    headers = first_row if header_detected else None
    data_rows = normalized[1:] if header_detected else normalized

    if not data_rows:
        return None

    orig_lengths = [len(r) for r in table]
    consistent = len(set(orig_lengths)) <= 2
    all_cells = [c for r in data_rows for c in r]
    non_empty_ratio = sum(1 for c in all_cells if c) / max(len(all_cells), 1)
    confidence = round(
        0.4 * (1.0 if consistent else 0.5)
        + 0.3 * (1.0 if header_detected else 0.0)
        + 0.3 * non_empty_ratio,
        4,
    )

    return {
        "page_number": page_num,
        "table_index_on_page": table_idx,
        "headers": headers,
        "rows": data_rows,
        "row_count": len(data_rows),
        "column_count": col_count,
        "bbox": None,
        "extraction_confidence": confidence,
    }


def _extract_text_based_table(page, page_num: int, start_idx: int) -> list:
    words = page.extract_words()
    if not words:
        logger.info(f"Page {page_num}: no words found for fallback")
        return []

    logger.info(f"Page {page_num}: fallback found {len(words)} words")

    # Group words into rows by y-coordinate (within 5 points = same row)
    rows = {}
    for word in words:
        y = round(word['top'] / 5) * 5
        if y not in rows:
            rows[y] = []
        rows[y].append(word)

    sorted_rows = sorted(rows.items())
    logger.info(f"Page {page_num}: grouped into {len(sorted_rows)} rows")

    if len(sorted_rows) < MIN_TABLE_ROWS:
        logger.info(f"Page {page_num}: too few rows ({len(sorted_rows)}), skipping")
        return []

    # Detect columns by x-coordinate clustering across all rows
    all_x = [word['x0'] for word in words]
    if not all_x:
        return []

    x_clusters = _cluster_x_positions(all_x)
    logger.info(f"Page {page_num}: detected {len(x_clusters)} columns")

    if len(x_clusters) < MIN_TABLE_COLS:
        logger.info(f"Page {page_num}: too few columns ({len(x_clusters)}), skipping")
        return []

    # Build table grid
    table_rows = []
    for y, row_words in sorted_rows:
        row = [''] * len(x_clusters)
        for word in sorted(row_words, key=lambda w: w['x0']):
            col_idx = _find_nearest_col(word['x0'], x_clusters)
            if row[col_idx]:
                row[col_idx] += ' ' + word['text']
            else:
                row[col_idx] = word['text']
        table_rows.append(row)

    headers = table_rows[0] if table_rows else []
    data_rows = table_rows[1:] if len(table_rows) > 1 else table_rows

    confidence = min(0.7, 0.3 + (len(sorted_rows) / 20) + (len(x_clusters) / 10))

    logger.info(f"Page {page_num}: fallback extracted table with {len(table_rows)} rows x {len(x_clusters)} cols")

    return [{
        'page_number': page_num,
        'table_index_on_page': start_idx,
        'headers': headers,
        'rows': data_rows,
        'row_count': len(data_rows),
        'column_count': len(x_clusters),
        'bbox': {'x0': 0, 'y0': 0, 'x1': page.width, 'y1': page.height},
        'extraction_confidence': confidence,
    }]


def extract_tables_from_pdf(pdf_path: str) -> list:
    all_tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            # Method 1: explicit table detection
            tables = page.extract_tables()
            for idx, table in enumerate(tables):
                if table and len(table) >= MIN_TABLE_ROWS:
                    processed = _process_explicit_table(table, page_num, idx, page)
                    if processed:
                        all_tables.append(processed)

            # Method 2: text-position fallback (runs if method 1 found nothing)
            if not tables:
                fallback = _extract_text_based_table(page, page_num, len(all_tables))
                if fallback:
                    all_tables.extend(fallback)

    return all_tables


def extract_tables_from_ocr_text(ocr_text: str, page_num: int = 0) -> list:
    """
    Extract tables from OCR'd text by detecting consistent column patterns.
    Works for bank statements, invoices, and other tabular documents.
    """
    from collections import Counter

    if not ocr_text or len(ocr_text.strip()) < 50:
        return []

    lines = [line.strip() for line in ocr_text.split('\n') if line.strip()]
    if len(lines) < MIN_TABLE_ROWS:
        return []

    def tokenize(line):
        return re.split(r'\s{2,}', line)

    tokenized = [tokenize(line) for line in lines]
    col_counts = [len(t) for t in tokenized]

    most_common_cols, freq = Counter(col_counts).most_common(1)[0]

    if most_common_cols < MIN_TABLE_COLS:
        logger.info(f"OCR table: most common col count {most_common_cols} < minimum")
        return []

    table_rows = [t for t in tokenized if len(t) == most_common_cols]

    if len(table_rows) < MIN_TABLE_ROWS:
        logger.info(f"OCR table: only {len(table_rows)} consistent rows found")
        return []

    logger.info(f"OCR table: found {len(table_rows)} rows x {most_common_cols} cols")

    headers = table_rows[0]
    data_rows = table_rows[1:]

    confidence = min(0.75, 0.3 + (len(table_rows) / 20) + (most_common_cols / 10))

    return [{
        'page_number': page_num,
        'table_index_on_page': 0,
        'headers': headers,
        'rows': data_rows,
        'row_count': len(data_rows),
        'column_count': most_common_cols,
        'bbox': {'x0': 0, 'y0': 0, 'x1': 0, 'y1': 0},
        'extraction_confidence': confidence,
    }]


def table_to_markdown(table: dict) -> str:
    headers = table.get("headers")
    rows = table.get("rows", [])
    col_count = table.get("column_count", 0)

    if not col_count and rows:
        col_count = max(len(r) for r in rows)

    if headers:
        cols = headers
    else:
        cols = [f"Col {i + 1}" for i in range(col_count)]

    sep = ["---"] * len(cols)
    lines = [
        "| " + " | ".join(str(c) for c in cols) + " |",
        "| " + " | ".join(sep) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(c) for c in row) + " |")

    return "\n".join(lines)


def table_to_embedding_text(table: dict) -> str:
    headers = table.get("headers") or []
    rows = table.get("rows", [])

    parts = []
    if headers:
        parts.append(" | ".join(str(h) for h in headers))
    for row in rows[:3]:
        parts.append(" | ".join(str(c) for c in row))

    return "\n".join(parts)
