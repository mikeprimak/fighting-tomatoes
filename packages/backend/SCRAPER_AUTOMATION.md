# UFC Scraper Automation Guide

## Overview

The UFC data scraper has been optimized for automated execution via cron jobs or schedulers. It includes configurable delays, timeout protection, and comprehensive error handling with alerting.

## Files

- **`src/services/scrapeAllUFCData.js`** - Main scraper with configurable delays
- **`cron-scraper.js`** - Cron-ready wrapper with alerting and auto-parsing
- **`logs/`** - Directory for scraper logs (auto-created)

## Manual Execution

### Quick scrape (default delays)
```bash
cd packages/backend
node src/services/scrapeAllUFCData.js
```

### Automated mode (faster delays)
```bash
SCRAPER_MODE=automated node src/services/scrapeAllUFCData.js
```

### Custom timeout
```bash
SCRAPER_TIMEOUT=900000 node src/services/scrapeAllUFCData.js  # 15 minutes
```

## Automated Execution (Cron)

### Using the cron wrapper
```bash
cd packages/backend
node cron-scraper.js
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRAPER_MODE` | Set to `automated` for faster delays | `manual` |
| `SCRAPER_TIMEOUT` | Overall timeout in milliseconds | `600000` (10min) |
| `ALERT_EMAIL` | Email for failure alerts | None |
| `ALERT_WEBHOOK` | Webhook URL (Slack/Discord) | None |
| `AUTO_PARSE` | Auto-run parser after scraping | `true` |
| `LOG_DIR` | Directory for logs | `./logs` |

### Example Crontab Entries

**Every 6 hours:**
```cron
0 */6 * * * cd /path/to/backend && node cron-scraper.js >> logs/cron.log 2>&1
```

**Daily at 3 AM:**
```cron
0 3 * * * cd /path/to/backend && node cron-scraper.js >> logs/cron.log 2>&1
```

**With environment variables:**
```cron
0 */6 * * * cd /path/to/backend && ALERT_WEBHOOK=https://hooks.slack.com/your-webhook node cron-scraper.js >> logs/cron.log 2>&1
```

## Configuration Modes

### Manual Mode (default)
- Slower, more cautious delays
- Better for testing and development
- Delays:
  - Between events: 1000ms
  - Between athletes: 500ms
  - Between images: 400ms

### Automated Mode
- Faster execution for scheduled runs
- Optimized for reliability
- Delays:
  - Between events: 300ms
  - Between athletes: 200ms
  - Between images: 100ms

## Alerting

### Webhook Alerts (Slack/Discord)

The cron wrapper can send alerts to Slack, Discord, or any webhook endpoint.

**Slack Setup:**
1. Create a Slack webhook at https://api.slack.com/messaging/webhooks
2. Set environment variable: `ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL`
3. Alerts will be sent on success or failure

**Discord Setup:**
1. Create a Discord webhook in channel settings
2. Set environment variable: `ALERT_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL`
3. Alerts will be sent on success or failure

**Alert Contents:**
- ✅ Success: Events, athletes, fights count, duration
- 🚨 Failure: Error message, duration, log file path

### Email Alerts

Requires `sendmail` or similar mail transfer agent installed.

```bash
ALERT_EMAIL=admin@example.com node cron-scraper.js
```

Email alerts are sent **only on failure** to reduce noise.

## Logging

All scraper runs create timestamped log files in the `logs/` directory:

- **`scraper-YYYY-MM-DDTHH-mm-ss-SSSZ.log`** - Standard output log
- **`scraper-error-YYYY-MM-DDTHH-mm-ss-SSSZ.log`** - Error log (only on failure)

Logs include:
- Timestamps for all operations
- Detailed progress (events, athletes, fights)
- Error messages and stack traces
- Duration and success/failure status

## Timeout Handling

The scraper includes two-level timeout protection:

1. **Overall timeout** (default 10 minutes)
   - Prevents the entire scraper from hanging indefinitely
   - Configurable via `SCRAPER_TIMEOUT` environment variable
   - Kills the process if exceeded

2. **Page timeouts** (hardcoded in Puppeteer)
   - Individual page navigation timeouts
   - Falls back gracefully on single-page failures

If the scraper times out, it will:
- Log the timeout error
- Send failure alert (if configured)
- Exit with code 1
- Save any data scraped before timeout

## Auto-Parsing

By default, the cron wrapper automatically runs the parser after successful scraping.

**Disable auto-parsing:**
```bash
AUTO_PARSE=false node cron-scraper.js
```

**Manual parsing:**
```bash
node run-parser.ts
```

The parser will use the latest timestamped files from `scraped-data/`.

## Monitoring

### Check if scraper is running
```bash
ps aux | grep scrapeAllUFCData
```

### View latest log
```bash
tail -f logs/scraper-*.log | head -n 1
```

### Check for failures
```bash
ls -lh logs/scraper-error-*.log
```

### View cron job status
```bash
crontab -l  # List cron jobs
tail -f logs/cron.log  # View cron output
```

## Troubleshooting

### Scraper times out frequently

1. **Increase timeout:**
   ```bash
   SCRAPER_TIMEOUT=1200000 node cron-scraper.js  # 20 minutes
   ```

2. **Use manual mode for slower execution:**
   ```bash
   SCRAPER_MODE=manual node cron-scraper.js
   ```

3. **Check network/VPN issues:**
   - UFC.com may have rate limiting
   - Consider running less frequently

### No alerts received

1. **Check webhook URL:**
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"text":"Test"}' \
     YOUR_WEBHOOK_URL
   ```

2. **Check email setup:**
   ```bash
   echo "Test" | sendmail -v your@email.com
   ```

3. **Check logs:**
   ```bash
   grep -i "alert" logs/scraper-*.log
   ```

### Parser fails after scraping

1. **Check database connection:**
   ```bash
   cd packages/backend
   npx prisma db pull
   ```

2. **Run parser manually:**
   ```bash
   node run-parser.ts
   ```

3. **Check scraped data files:**
   ```bash
   ls -lh scraped-data/
   cat scraped-data/latest-events.json | jq '.events | length'
   ```

## Best Practices

1. **Start with manual testing:**
   - Run `node cron-scraper.js` manually first
   - Verify logs and alerts work correctly
   - Check scraped data quality

2. **Set up alerting:**
   - Configure webhook or email alerts
   - Test failure scenarios
   - Monitor for false positives

3. **Schedule appropriately:**
   - UFC events are typically weekly
   - Running every 6-12 hours is sufficient
   - Avoid peak hours if using manual mode

4. **Monitor logs:**
   - Set up log rotation to prevent disk space issues
   - Review error logs regularly
   - Archive old logs periodically

5. **Keep backups:**
   - Scraped JSON files are timestamped
   - Consider backing up to S3/cloud storage
   - Keep at least the last 10 runs

## Example Production Setup

```bash
#!/bin/bash
# /path/to/backend/run-scraper.sh

cd /path/to/backend

# Set environment
export SCRAPER_MODE=automated
export SCRAPER_TIMEOUT=900000  # 15 minutes
export ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK
export AUTO_PARSE=true
export LOG_DIR=/var/log/ufc-scraper

# Run scraper
node cron-scraper.js

# Cleanup old logs (keep last 30 days)
find $LOG_DIR -name "scraper-*.log" -mtime +30 -delete
```

**Crontab:**
```cron
# UFC Scraper - Every 6 hours
0 */6 * * * /path/to/backend/run-scraper.sh >> /var/log/ufc-scraper/cron.log 2>&1
```
