#!/usr/bin/env node

/**
 * Database backup script
 * Creates a timestamped SQL dump of the PostgreSQL database
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration from environment or defaults
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5433';
const DB_USER = process.env.DB_USER || 'dev';
const DB_PASSWORD = process.env.DB_PASSWORD || 'devpassword';
const DB_NAME = process.env.DB_NAME || 'yourapp_dev';
const BACKUP_DIR = path.join(__dirname, 'backups');

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate timestamped filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
const backupFile = path.join(BACKUP_DIR, `db-backup-${timestamp}.sql`);

console.log('🔄 Starting database backup...');
console.log(`   Database: ${DB_NAME}`);
console.log(`   Host: ${DB_HOST}:${DB_PORT}`);
console.log(`   Backup file: ${backupFile}`);

try {
  // Set password environment variable and run pg_dump
  const env = { ...process.env, PGPASSWORD: DB_PASSWORD };

  const command = `pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} ${DB_NAME}`;

  console.log('   Running pg_dump...');
  const output = execSync(command, { env, maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer

  // Write to file
  fs.writeFileSync(backupFile, output);

  const stats = fs.statSync(backupFile);
  const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`✅ Backup completed successfully!`);
  console.log(`   File size: ${fileSizeMB} MB`);
  console.log(`   Location: ${backupFile}`);

  // List all backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('db-backup-') && f.endsWith('.sql'))
    .sort()
    .reverse();

  console.log(`\n📦 Total backups: ${backups.length}`);
  if (backups.length > 10) {
    console.log(`   ⚠️  You have ${backups.length} backups. Consider cleaning up old ones.`);
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Backup failed:', error.message);

  if (error.message.includes('pg_dump')) {
    console.error('\n💡 Troubleshooting:');
    console.error('   - Make sure PostgreSQL client tools are installed');
    console.error('   - Check if pg_dump is in your PATH');
    console.error('   - Verify database connection settings');
  }

  process.exit(1);
}
