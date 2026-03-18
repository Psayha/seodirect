#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SEODirect — Deploy Script
# Called by GitHub Actions CD pipeline on the server
# Usage: bash deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/seodirect"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

cd "${APP_DIR}"

echo "[deploy] Pulling latest images..."
docker compose -f "${COMPOSE_FILE}" pull

echo "[deploy] Starting services..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "[deploy] Running migrations..."
docker compose -f "${COMPOSE_FILE}" exec -T backend alembic upgrade head

echo "[deploy] Cleaning up old images..."
docker image prune -f

echo "[deploy] Health check..."
sleep 5
if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "[deploy] ✓ Backend healthy"
else
    echo "[deploy] ✗ Backend health check failed!"
    docker compose -f "${COMPOSE_FILE}" logs --tail=20 backend
    exit 1
fi

echo "[deploy] Done!"
