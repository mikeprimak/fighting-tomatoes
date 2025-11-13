# Database Backup Scripts

Automatic database backup system to prevent data loss.

## 🔄 Automatic Backups

Backups are **automatically created** before each git commit via the pre-commit hook (`.husky/pre-commit`).

- Saves to `db-backups/backup_YYYYMMDD_HHMMSS.sql.gz`
- Keeps last 10 backups (auto-deletes older ones)
- Non-blocking (won't stop commit if backup fails)
- Skips if Docker/Postgres not running

## 📋 Manual Backup

Create a backup anytime:

```bash
bash scripts/backup-db.sh
```

## 🔙 Restore from Backup

List available backups:

```bash
ls -lt db-backups/
```

Restore a specific backup:

```bash
bash scripts/restore-db.sh db-backups/backup_20251112_153000.sql.gz
```

## 🗂️ Backup Location

- **Directory**: `db-backups/` (in project root)
- **Format**: `backup_YYYYMMDD_HHMMSS.sql.gz` (compressed)
- **Retention**: Last 10 backups kept automatically
- **Git**: Excluded via `.gitignore` (local only)

## ⚠️ Important Notes

1. **Backups are local only** - not committed to Git
2. **Before `docker-compose down -v`** - always backup first! The `-v` flag deletes volumes
3. **Restoration overwrites current data** - confirm before restoring
4. **Windows users**: Run scripts via Git Bash (not PowerShell/CMD)

## 🛡️ What Caused the Database Wipe?

The Docker volume was recreated on Nov 12, 2025 at 11:08 AM, most likely due to:

1. Running `docker-compose down -v` (the `-v` flag removes volumes)
2. Running `docker volume rm fight-mobile-app_postgres_data`
3. Docker Desktop reset/reinstall

**Prevention**: This backup system now runs automatically on every commit.

## 💡 Tips

- Check backup size with: `du -h db-backups/`
- Verify backup count with: `ls db-backups/ | wc -l`
- Before major changes: `bash scripts/backup-db.sh`
- Use descriptive commit messages so you can find the right backup
