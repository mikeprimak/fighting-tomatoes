#!/bin/bash
# Daily Tapology results backfill — runs on the Hetzner VPS via cron.
# Tapology blocks GitHub Actions IPs (403), so this lives on the VPS instead.
# Install the cron with: bash packages/backend/install-tapology-cron.sh
set -a
. /opt/scraper-service/.env
set +a
export BACKFILL_WINDOW_DAYS=14
cd /opt/scraper-service/packages/backend
exec /usr/bin/node dist/scripts/backfillTapologyResults.js
