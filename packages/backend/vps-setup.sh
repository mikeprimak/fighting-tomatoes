#!/bin/bash
# VPS Scraper Service Setup Script
# Run this on a fresh Hetzner VPS (Ubuntu 24.04)
#
# Usage:
#   ssh root@178.156.231.241
#   # paste this script or scp it over and run:
#   bash vps-setup.sh

set -e

echo "========================================="
echo "  VPS Scraper Service Setup"
echo "========================================="

# 1. System dependencies
echo ""
echo "[1/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y git curl

# 2. Node.js 20
echo ""
echo "[2/6] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)"
echo "npm: $(npm -v)"

# 3. pnpm
echo ""
echo "[3/6] Installing pnpm..."
npm install -g pnpm@8
echo "pnpm: $(pnpm -v)"

# 4. Chromium dependencies (for Puppeteer)
echo ""
echo "[4/6] Installing Chromium dependencies..."
apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 libxshmfence1 \
  libxfixes3 libx11-xcb1 libxcb-dri3-0 libxcb1 libx11-6 libxext6

# 5. Clone and build
echo ""
echo "[5/6] Cloning repo and building..."
APP_DIR="/opt/scraper-service"

if [ -d "$APP_DIR" ]; then
  echo "Directory exists, pulling latest..."
  cd "$APP_DIR"
  git pull
else
  echo "Cloning repository..."
  git clone https://github.com/mikeprimak/fighting-tomatoes.git "$APP_DIR"
  cd "$APP_DIR"
fi

# Install dependencies and build
cd packages/backend
pnpm install
npx prisma generate
pnpm build

# Install Puppeteer's bundled Chromium
npx puppeteer browsers install chrome

# 6. Create systemd service
echo ""
echo "[6/6] Creating systemd service..."

# Prompt for env vars if not already set
if [ ! -f /opt/scraper-service/.env ]; then
  echo ""
  echo "Enter your environment variables:"
  echo "(You can edit these later in /opt/scraper-service/.env)"
  echo ""
  read -p "DATABASE_URL (Render external Postgres URL): " DB_URL
  read -p "SCRAPER_API_KEY (shared secret — make one up): " API_KEY

  cat > /opt/scraper-service/.env << ENVEOF
DATABASE_URL=${DB_URL}
SCRAPER_API_KEY=${API_KEY}
PORT=3009
TZ=America/New_York
ENVEOF

  echo "Saved to /opt/scraper-service/.env"
fi

cat > /etc/systemd/system/scraper-service.service << 'SERVICEEOF'
[Unit]
Description=Good Fights VPS Scraper Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/scraper-service/packages/backend
EnvironmentFile=/opt/scraper-service/.env
ExecStart=/usr/bin/node dist/scraperService.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable scraper-service
systemctl start scraper-service

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Service status:  systemctl status scraper-service"
echo "View logs:       journalctl -u scraper-service -f"
echo "Restart:         systemctl restart scraper-service"
echo "Edit env vars:   nano /opt/scraper-service/.env"
echo ""
echo "Test it:"
echo "  curl http://localhost:3009/health"
echo "  curl -H 'Authorization: Bearer YOUR_API_KEY' http://localhost:3009/status"
echo ""
echo "Next steps:"
echo "  1. On Render, set these env vars:"
echo "     VPS_SCRAPER_URL=http://178.156.231.241:3009"
echo "     VPS_SCRAPER_API_KEY=<same key you entered above>"
echo "  2. Deploy the updated backend to Render"
echo "  3. The lifecycle service will automatically dispatch to the VPS"
echo ""
