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

# Save current image digests for rollback
echo "[deploy] Saving current image digests for rollback..."
PREV_BACKEND=$(docker compose -f "${COMPOSE_FILE}" images backend --format json 2>/dev/null | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('ID',''))" 2>/dev/null || echo "")
PREV_FRONTEND=$(docker compose -f "${COMPOSE_FILE}" images frontend --format json 2>/dev/null | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('ID',''))" 2>/dev/null || echo "")

echo "[deploy] Pulling latest images..."
docker compose -f "${COMPOSE_FILE}" pull

echo "[deploy] Starting services..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "[deploy] Running migrations..."
docker compose -f "${COMPOSE_FILE}" exec -T backend alembic upgrade head

echo "[deploy] Health check..."
sleep 5

HEALTHY=false
for attempt in 1 2 3; do
    if docker compose -f "${COMPOSE_FILE}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" 2>/dev/null; then
        echo "[deploy] ✓ Backend healthy"
        HEALTHY=true
        break
    elif curl -sf http://localhost:80/api/health > /dev/null 2>&1; then
        echo "[deploy] ✓ Backend healthy (via nginx)"
        HEALTHY=true
        break
    fi
    echo "[deploy] Health check attempt $attempt/3 failed, waiting..."
    sleep 5
done

if [ "$HEALTHY" = false ]; then
    echo "[deploy] ✗ Health check failed after 3 attempts!"
    docker compose -f "${COMPOSE_FILE}" logs --tail=30 backend

    # Attempt rollback if we have previous images
    if [ -n "$PREV_BACKEND" ]; then
        echo "[deploy] Attempting rollback..."
        docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans 2>/dev/null || true
    fi
    exit 1
fi

echo "[deploy] Cleaning up old images..."
docker image prune -f

echo "[deploy] Done!"
