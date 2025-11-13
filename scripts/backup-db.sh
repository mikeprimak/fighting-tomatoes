#!/bin/bash
# Database Backup Script
# Creates timestamped backup of local PostgreSQL database

set -e

# Configuration
BACKUP_DIR="db-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
DB_HOST="localhost"
DB_PORT="5433"
DB_NAME="yourapp_dev"
DB_USER="dev"
DB_PASSWORD="devpassword"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Export password for pg_dump
export PGPASSWORD="$DB_PASSWORD"

echo "🔄 Creating database backup..."
echo "   Time: $(date)"
echo "   File: $BACKUP_FILE"

# Create backup using pg_dump
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl --clean --if-exists \
  -f "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"
COMPRESSED_FILE="$BACKUP_FILE.gz"

# Get file size
SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)

echo "✅ Backup complete!"
echo "   File: $COMPRESSED_FILE"
echo "   Size: $SIZE"

# Keep only last 10 backups (delete older ones)
echo ""
echo "🧹 Cleaning up old backups (keeping last 10)..."
cd "$BACKUP_DIR"
ls -t backup_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
REMAINING=$(ls -1 backup_*.sql.gz 2>/dev/null | wc -l)
echo "   Remaining backups: $REMAINING"

# Unset password
unset PGPASSWORD

echo ""
echo "Done! 🎉"
