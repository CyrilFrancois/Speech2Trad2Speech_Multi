FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Set model cache paths explicitly
ENV HF_HOME=/app/model_cache
ENV XDG_CACHE_HOME=/app/model_cache

# Install FFmpeg (essential for Faster-Whisper/Audio processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 2. Pre-cache Models
# This ensures the image is heavy but the container starts INSTANTLY.
# We download them during build so they are baked into the image.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
RUN python -c "from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer; \
    model='facebook/m2m100_418M'; \
    M2M100Tokenizer.from_pretrained(model); \
    M2M100ForConditionalGeneration.from_pretrained(model)"

# 3. Copy application code
COPY . .

# 4. Create internal storage for audio blobs
RUN mkdir -p temp_audio && chmod 777 temp_audio

EXPOSE 8000

# Using --workers 1 to keep memory usage predictable on CPU
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
