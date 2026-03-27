# Scraping System Update: GitHub Actions → Hetzner VPS

**Date started:** 2026-03-27
**Status:** Fully deployed and running. Awaiting first live event to confirm end-to-end.

## What We're Doing

Moving live event scrapers from GitHub Actions (5-min intervals) to a dedicated Hetzner VPS (30-second intervals) for near-real-time fight notifications.

## Why

- GitHub Actions has ~2-3 min cold start per run, limiting scrape frequency to ~5 min
- Users get stale fight status data; 30-second scrapes enable near-real-time notifications
- VPS is always on — no cold starts, can reuse browser instances

## What's Done

### 1. Hetzner VPS provisioned
- **Server:** CPX11 (2 vCPU, 2GB RAM, $4.99/mo)
- **IP:** 178.156.231.241
- **OS:** Ubuntu 24.04
- **Location:** Ashburn (US East)

### 2. Site access verified from VPS
| Site | Status | Notes |
|------|--------|-------|
| UFC.com | 200 | Works with Puppeteer (curl gets 403, browser works) |
| BKFC.com | 200 | Works |
| onefc.com | 200 | Works |
| Tapology.com | 200 | Needs User-Agent header set (already configured in scraper) |
| Oktagon API | N/A | REST API, will work |

### 3. Code committed and pushed (commit e8e469c)
- **`packages/backend/src/scraperService.ts`** — VPS HTTP service that runs scraper loops every 30s
  - Endpoints: POST /track/start, /track/stop, /track/check, /track/stop-all, GET /status, /health
  - Auto-discovers active events from DB every 5 min as safety net
  - API key auth, overlap protection, auto-stop on event completion
  - Stops after 10 consecutive errors
- **`packages/backend/src/services/eventLifecycle.ts`** — Updated to try VPS first, fall back to GitHub Actions
  - Opt-in via `VPS_SCRAPER_URL` and `VPS_SCRAPER_API_KEY` env vars
  - If VPS env vars not set, behavior is identical to current (zero risk)
- **`packages/backend/vps-setup.sh`** — One-command VPS setup script
- **`packages/backend/vps-update.sh`** — Quick update script for future deploys

### 4. Deployed to VPS (done 2026-03-27)
- Installed Node.js 20, pnpm, Chromium dependencies
- Cloned repo to /opt/scraper-service, built backend
- Created systemd service (auto-starts on boot)
- Configured .env with DATABASE_URL and SCRAPER_API_KEY
- Service running: `{"ok":true,"trackers":0}`

### 5. Render env vars configured (done 2026-03-27)
- `VPS_SCRAPER_URL=http://178.156.231.241:3009`
- `VPS_SCRAPER_API_KEY=gf-scraper-2026-secret`

### 6. Render backend redeployed (done 2026-03-27)
Lifecycle service now dispatches to VPS first, falls back to GitHub Actions.

### 7. Verified connectivity (done 2026-03-27)
- VPS health check from local machine: OK
- VPS auth + status endpoint: OK
- VPS connected to Render Postgres: OK (found 0 active events correctly)

## Still To Do

### 8. Confirm during first live event
- Watch VPS logs: `ssh root@178.156.231.241 journalctl -u scraper-service -f`
- Check active trackers: `curl -H "Authorization: Bearer gf-scraper-2026-secret" http://178.156.231.241:3009/status`
- Verify fight data updates every 30s in the admin panel
- Check Render logs for `[Lifecycle] VPS tracker started` messages

### 9. (Optional) Disable GitHub Actions live tracker workflows
Once VPS is confirmed working during a real event, the GitHub Actions live tracker workflows can be disabled to save minutes. They still work as a manual fallback.

## Architecture

```
Before:  Render (every 5 min) → GitHub Actions → scrape → DB
After:   Render (every 5 min) → VPS (every 30s loop) → scrape → DB
                                  ↑ also self-discovers active events
```

## Cost

- Hetzner CPX11: $4.99/mo
- No proxy needed (all sites accessible from Hetzner with Puppeteer)
- GitHub Actions minutes saved: ~240-500 min/month

## VPS Management

```bash
# SSH in
ssh root@178.156.231.241

# Service commands
systemctl status scraper-service
systemctl restart scraper-service
journalctl -u scraper-service -f    # live logs

# Update code
bash /opt/scraper-service/packages/backend/vps-update.sh

# Edit env vars
nano /opt/scraper-service/.env
systemctl restart scraper-service
```
