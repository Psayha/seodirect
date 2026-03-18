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
if docker compose -f "${COMPOSE_FILE}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" 2>/dev/null; then
    echo "[deploy] ✓ Backend healthy"
elif curl -sf http://localhost:80/api/health > /dev/null 2>&1; then
    echo "[deploy] ✓ Backend healthy (via nginx)"
else
    echo "[deploy] ⚠ Health check inconclusive, checking if container is running..."
    if docker compose -f "${COMPOSE_FILE}" ps backend | grep -q "running"; then
        echo "[deploy] ✓ Backend container is running"
    else
        echo "[deploy] ✗ Backend is not running!"
        docker compose -f "${COMPOSE_FILE}" logs --tail=20 backend
        exit 1
    fi
fi

echo "[deploy] Done!"
