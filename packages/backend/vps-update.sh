#!/bin/bash
# Quick update script — pull latest code and restart the scraper service
# Run on the VPS: bash /opt/scraper-service/packages/backend/vps-update.sh

set -e

cd /opt/scraper-service
echo "Pulling latest code..."
git pull

cd packages/backend
echo "Installing dependencies..."
pnpm install

echo "Generating Prisma client..."
npx prisma generate

echo "Building..."
pnpm build

echo "Restarting service..."
systemctl restart scraper-service

echo "Done! Checking status..."
sleep 2
systemctl status scraper-service --no-pager
