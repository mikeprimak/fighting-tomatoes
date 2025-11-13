#!/bin/bash
# Database Restore Script
# Restores database from a backup file

set -e

# Configuration
BACKUP_DIR="db-backups"
DB_HOST="localhost"
DB_PORT="5433"
DB_NAME="yourapp_dev"
DB_USER="dev"
DB_PASSWORD="devpassword"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "❌ Error: No backup file specified"
  echo ""
  echo "Usage: ./scripts/restore-db.sh <backup_file>"
  echo ""
  echo "Available backups:"
  ls -1t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -10 || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Export password for psql
export PGPASSWORD="$DB_PASSWORD"

echo "⚠️  WARNING: This will overwrite your current database!"
echo "   Database: $DB_NAME"
echo "   Backup: $BACKUP_FILE"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "🔄 Restoring database..."
echo "   Time: $(date)"

# Decompress if needed
TEMP_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "   Decompressing backup..."
  TEMP_FILE="${BACKUP_FILE%.gz}"
  gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
  CLEANUP_TEMP=true
fi

# Restore backup using psql
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$TEMP_FILE"

# Cleanup temporary file if we decompressed
if [ "$CLEANUP_TEMP" = true ]; then
  rm "$TEMP_FILE"
fi

# Unset password
unset PGPASSWORD

echo ""
echo "✅ Restore complete! 🎉"
echo ""
echo "💡 Tip: You may need to restart your backend server to pick up the changes."
