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

BACKUP_FILE="$BACKUP_DIR/seodirect_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of database '$PG_DB'..."

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

FILESIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "unknown")
echo "[$(date)] Backup complete: $BACKUP_FILE ($FILESIZE bytes)"

# Cleanup old backups
if [ "$KEEP_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -name "seodirect_*.sql.gz" -mtime +"$KEEP_DAYS" -delete -print | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Removed $DELETED backup(s) older than $KEEP_DAYS days"
  fi
fi

echo "[$(date)] Done."
