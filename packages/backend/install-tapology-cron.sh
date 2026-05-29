#!/bin/bash
# Idempotently install the daily 09:00 Tapology backfill cron on the VPS.
# Safe to run more than once.
set -e
LINE='0 9 * * * /opt/scraper-service/packages/backend/run-tapology-backfill.sh >> /var/log/tapology-backfill.log 2>&1'
( crontab -l 2>/dev/null | grep -v 'run-tapology-backfill.sh' ; echo "$LINE" ) | crontab -
echo "Cron installed. Current tapology entry:"
crontab -l | grep tapology-backfill || echo "(none found — install failed)"
