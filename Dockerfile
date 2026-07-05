FROM python:3.12-slim

# System dependencies:
#   tesseract-ocr        — OCR binary used by pytesseract
#   libpoppler-cpp-dev   — pdfplumber's C++ PDF backend
#   poppler-utils        — pdfplumber CLI tools (pdfinfo, pdftotext, etc.)
#   gcc                  — needed to compile some Python C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        libpoppler-cpp-dev \
        poppler-utils \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — all subsequent commands run as this user
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Install CPU-only PyTorch before the rest of requirements so pip does not
# pull the default CUDA wheel (~2.5 GB vs ~200 MB for the CPU build).
RUN pip install --no-cache-dir \
    torch==2.10.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model (en_core_web_sm, ~12 MB)
RUN python -m spacy download en_core_web_sm

# Copy application source
COPY app/ ./app/

# Create the upload directory and hand ownership to the non-root user
RUN mkdir -p storage/documents \
    && chown -R appuser:appuser /app
RUN mkdir -p /app/.cache/huggingface && chown -R appuser:appuser /app/.cache

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
