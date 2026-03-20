FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user
RUN addgroup --system appuser && adduser --system --ingroup appuser appuser

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY init_superadmin.py ./init_superadmin.py

# Create uploads directory and give appuser write access to it
RUN mkdir -p /app/static/uploads && chown -R appuser:appuser /app/static

# Switch to non-root user
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
