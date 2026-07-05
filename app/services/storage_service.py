import io
import logging
import os
import zipfile
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.config import settings

logger = logging.getLogger(__name__)


def ensure_storage_directory():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def save_document(file: UploadFile) -> str:
    ensure_storage_directory()

    # --- Extension validation -------------------------------------------
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in settings.ALLOWED_EXTENSIONS:
        allowed = ", ".join(f".{e}" for e in sorted(settings.ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' is not allowed. Accepted types: {allowed}",
        )

    # --- Read content & size validation ---------------------------------
    content = file.file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
        )

    # --- Persist --------------------------------------------------------
    unique_filename = f"{uuid4()}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    return file_path


def extract_zip_documents(content: bytes) -> list[tuple[str, str]]:
    """
    Extract valid document files from a ZIP archive.
    Returns list of (saved_file_path, original_filename).
    Skips directories, hidden files, macOS metadata, and extensions not in
    ALLOWED_EXTENSIONS. Enforces per-file and 200 MB total uncompressed caps.
    """
    ensure_storage_directory()

    max_file_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    max_total_bytes = 200 * 1024 * 1024  # zip-bomb guard

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        logger.warning("Uploaded file is not a valid ZIP archive")
        return []

    saved: list[tuple[str, str]] = []
    total_uncompressed = 0

    with zf:
        for info in zf.infolist():
            # Skip directory entries
            if info.filename.endswith("/"):
                continue

            basename = os.path.basename(info.filename)

            # Skip macOS metadata and hidden files
            if not basename or basename.startswith(".") or "__MACOSX" in info.filename:
                continue

            ext = basename.rsplit(".", 1)[-1].lower() if "." in basename else ""
            if ext not in settings.ALLOWED_EXTENSIONS:
                continue

            # Per-file size guard (uncompressed)
            if info.file_size > max_file_bytes:
                logger.info(
                    "Skipping ZIP member %r: uncompressed size %d B exceeds per-file limit",
                    basename, info.file_size,
                )
                continue

            # Total uncompressed size guard
            total_uncompressed += info.file_size
            if total_uncompressed > max_total_bytes:
                logger.warning("ZIP total uncompressed content exceeds 200 MB cap — stopping extraction")
                break

            file_data = zf.read(info.filename)
            unique_filename = f"{uuid4()}.{ext}"
            file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
            with open(file_path, "wb") as buf:
                buf.write(file_data)

            saved.append((file_path, basename))
            logger.info("Extracted from ZIP: %r → %s", basename, file_path)

    return saved
