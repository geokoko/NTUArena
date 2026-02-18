#!/bin/bash
# ============================================================
# MongoDB Backup Script for NTUArena
# ============================================================
# Usage:   ./scripts/backup-mongo.sh
# Crontab: 0 3 * * * /path/to/ArenaManager/scripts/backup-mongo.sh
#
# Backs up the MongoDB database to a timestamped archive.
# Keeps the last 7 daily backups by default.
# ============================================================

set -euo pipefail

# Load env variables if .env exists
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
MONGO_CONTAINER="${MONGO_CONTAINER:-$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps -q mongo)}"
DB_NAME="${MONGO_DB:-ntuarena}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="ntuarena_${TIMESTAMP}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "🗄️  Starting MongoDB backup: $BACKUP_NAME"
echo "   Database: $DB_NAME"
echo "   Target:   $BACKUP_DIR/$BACKUP_NAME.archive"

# Dump the database
docker exec "$MONGO_CONTAINER" mongodump \
    --db="$DB_NAME" \
    --archive="/tmp/$BACKUP_NAME.archive" \
    --gzip \
    2>&1

# Copy the dump out of the container
docker cp "$MONGO_CONTAINER:/tmp/$BACKUP_NAME.archive" "$BACKUP_DIR/$BACKUP_NAME.archive"

# Clean up temp file inside container
docker exec "$MONGO_CONTAINER" rm -f "/tmp/$BACKUP_NAME.archive"

# Verify backup file exists and has content
BACKUP_SIZE=$(stat -c%s "$BACKUP_DIR/$BACKUP_NAME.archive" 2>/dev/null || echo "0")
if [ "$BACKUP_SIZE" -lt 100 ]; then
    echo "❌ Backup failed — file is too small ($BACKUP_SIZE bytes)"
    exit 1
fi

echo "✅ Backup complete: $BACKUP_DIR/$BACKUP_NAME.archive ($BACKUP_SIZE bytes)"

# Prune old backups
echo "🧹 Pruning backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "ntuarena_*.archive" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
echo "   Deleted $DELETED old backup(s)"

echo "Done."
