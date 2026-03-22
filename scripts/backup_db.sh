#!/usr/bin/env bash
# SEODirect — PostgreSQL backup script
# Usage:
#   ./scripts/backup_db.sh                    # uses docker-compose service
#   BACKUP_DIR=/mnt/backups ./scripts/backup_db.sh
#
# Crontab (daily at 3:00 AM):
#   0 3 * * * cd /path/to/seodirect && ./scripts/backup_db.sh >> /var/log/seodirect-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# Postgres credentials from .env or defaults
PG_USER="${POSTGRES_USER:-seodirect}"
PG_DB="${POSTGRES_DB:-seodirect}"

mkdir -p "$BACKUP_DIR"

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_FILE="$BACKUP_DIR/seodirect_${TIMESTAMP}.sql.gz.enc"
else
  BACKUP_FILE="$BACKUP_DIR/seodirect_${TIMESTAMP}.sql.gz"
fi

echo "[$(date)] Starting backup of database '$PG_DB'..."

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-acl \
    | gzip | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY > "$BACKUP_FILE"
else
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-acl \
    | gzip > "$BACKUP_FILE"
fi

FILESIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "unknown")
echo "[$(date)] Backup complete: $BACKUP_FILE ($FILESIZE bytes)"

# ── Redis backup ────────────────────────────────────────────────────────────
REDIS_BACKUP_FILE="$BACKUP_DIR/redis_${TIMESTAMP}.rdb"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

echo "[$(date)] Starting Redis backup..."
if [ -n "$REDIS_PASSWORD" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning BGSAVE >/dev/null 2>&1
  sleep 2
  docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$REDIS_BACKUP_FILE" 2>/dev/null
else
  docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE >/dev/null 2>&1
  sleep 2
  docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$REDIS_BACKUP_FILE" 2>/dev/null
fi

if [ -f "$REDIS_BACKUP_FILE" ]; then
  REDIS_SIZE=$(stat -c%s "$REDIS_BACKUP_FILE" 2>/dev/null || stat -f%z "$REDIS_BACKUP_FILE" 2>/dev/null || echo "unknown")
  echo "[$(date)] Redis backup complete: $REDIS_BACKUP_FILE ($REDIS_SIZE bytes)"
else
  echo "[$(date)] Warning: Redis backup failed (non-critical)"
fi

# Cleanup old backups
if [ "$KEEP_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" \( -name "seodirect_*.sql.gz" -o -name "seodirect_*.sql.gz.enc" -o -name "redis_*.rdb" \) -mtime +"$KEEP_DAYS" -delete -print | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Removed $DELETED backup(s) older than $KEEP_DAYS days"
  fi
fi

echo "[$(date)] Done."
