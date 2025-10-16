# Render Cron Jobs Setup Guide

## Overview

This guide explains how to set up automated news scraping on Render's free tier using a hybrid approach:
1. **Internal node-cron** jobs that run when the server is awake
2. **External UptimeRobot** pings to keep the server alive and trigger scrapes

## The Challenge: Render Free Tier Limitations

- **Spins down after 15 minutes of inactivity**
- First request after spin-down takes ~30-60 seconds to wake up
- Internal cron jobs only run when server is awake

## The Solution

### 1. Internal Cron Jobs (node-cron)

The backend has 5 scheduled jobs that run at specific times:

- **6:00 AM EDT** (10:00 UTC) - Morning scrape
- **9:30 AM EDT** (13:30 UTC) - Mid-morning scrape
- **1:00 PM EDT** (17:00 UTC) - Afternoon scrape
- **4:00 PM EDT** (20:00 UTC) - Evening scrape
- **7:00 PM EDT** (23:00 UTC) - Night scrape

**Location**: `packages/backend/src/services/backgroundJobs.ts`

```typescript
const newsScraperTimes = [
  '0 10 * * *',   // 6am EDT = 10am UTC
  '30 13 * * *',  // 9:30am EDT = 1:30pm UTC
  '0 17 * * *',   // 1pm EDT = 5pm UTC
  '0 20 * * *',   // 4pm EDT = 8pm UTC
  '0 23 * * *',   // 7pm EDT = 11pm UTC
];
```

**Important Note**: During EST (winter), these times will be off by 1 hour. You may need to update the cron times when daylight saving changes.

### 2. External Trigger Endpoint

**Endpoint**: `POST /api/news/scrape`

This endpoint can be called by external services (like UptimeRobot) to:
1. Wake up the Render server if it's sleeping
2. Manually trigger a news scrape

**Example**:
```bash
curl -X POST https://fightcrewapp-backend.onrender.com/api/news/scrape
```

### 3. UptimeRobot Setup (Recommended)

UptimeRobot is a free service that pings your endpoint at regular intervals.

**Steps**:

1. **Sign up for UptimeRobot**: https://uptimerobot.com (free plan allows 50 monitors)

2. **Create 5 monitors** (one for each scrape time):

   **Monitor 1: 6am EDT Scrape**
   - Monitor Type: HTTP(s)
   - URL: `https://fightcrewapp-backend.onrender.com/api/news/scrape`
   - Method: POST
   - Monitoring Interval: Custom
   - Schedule: Daily at 10:00 UTC (6am EDT)
   - Alert Contact: Your email (optional)

   **Monitor 2: 9:30am EDT Scrape**
   - URL: Same
   - Schedule: Daily at 13:30 UTC (9:30am EDT)

   **Monitor 3: 1pm EDT Scrape**
   - URL: Same
   - Schedule: Daily at 17:00 UTC (1pm EDT)

   **Monitor 4: 4pm EDT Scrape**
   - URL: Same
   - Schedule: Daily at 20:00 UTC (4pm EDT)

   **Monitor 5: 7pm EDT Scrape**
   - URL: Same
   - Schedule: Daily at 23:00 UTC (7pm EDT)

3. **Optional: Add Health Check Monitor**
   - URL: `https://fightcrewapp-backend.onrender.com/health`
   - Method: GET
   - Interval: Every 5 minutes
   - This keeps your server warm between scrapes

**Benefits**:
- Server stays awake during peak hours
- Guaranteed scrapes even if server was asleep
- Email alerts if scrapes fail
- Free for up to 50 monitors

## API Endpoints

### Get News Articles
```bash
GET /api/news?page=1&limit=20&source=UFC
```

**Query Params**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Articles per page (default: 20, max: 100)
- `source` (optional): Filter by source ("MMA Fighting", "Bloody Elbow", "UFC", etc.)

**Response**:
```json
{
  "articles": [
    {
      "id": "abc-123",
      "headline": "UFC 320 Preview",
      "description": "All you need to know...",
      "url": "https://...",
      "source": "MMA Fighting",
      "imageUrl": "https://...",
      "localImagePath": "/news-images/mmafighting-123.jpg",
      "scrapedAt": "2025-10-16T10:00:00Z",
      "createdAt": "2025-10-16T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Trigger Manual Scrape
```bash
POST /api/news/scrape
```

**Response**:
```json
{
  "message": "News scraping completed",
  "articlesScraped": 75,
  "newArticles": 12,
  "sources": {
    "MMA Fighting": 15,
    "Bloody Elbow": 15,
    "UFC": 15,
    "Bleacher Report": 10,
    "Sherdog": 15,
    "ESPN Boxing": 5
  }
}
```

### Get Scraper Status
```bash
GET /api/news/scrape/status
```

**Response**:
```json
{
  "isScrapingInProgress": false,
  "lastScrapeTime": "2025-10-16T10:00:00Z",
  "lastScrapeResults": {
    "totalArticles": 75,
    "newArticles": 12,
    "sources": ["MMA Fighting", "UFC", "Bloody Elbow"],
    "duration": 45000
  }
}
```

### Get News Sources
```bash
GET /api/news/sources
```

**Response**:
```json
{
  "sources": [
    {
      "name": "MMA Fighting",
      "count": 150,
      "latestArticle": "2025-10-16T10:00:00Z"
    },
    {
      "name": "UFC",
      "count": 120,
      "latestArticle": "2025-10-16T10:00:00Z"
    }
  ]
}
```

## Database Schema

The news scraper uses the `NewsArticle` table in your Prisma schema:

```prisma
model NewsArticle {
  id             String   @id @default(uuid())
  headline       String
  description    String
  url            String   @unique
  source         String
  imageUrl       String
  localImagePath String?
  scrapedAt      DateTime
  createdAt      DateTime @default(now())
  isActive       Boolean  @default(true)
}
```

## Testing the Setup

### 1. Test on Local Server

```bash
# Start your local backend
cd packages/backend
pnpm dev

# In another terminal, trigger a scrape
curl -X POST http://localhost:3001/api/news/scrape

# Check the results
curl http://localhost:3001/api/news?limit=5
```

### 2. Test on Render Production

```bash
# Wake up the server and trigger scrape
curl -X POST https://fightcrewapp-backend.onrender.com/api/news/scrape

# Check the results
curl https://fightcrewapp-backend.onrender.com/api/news?limit=5

# Check scraper status
curl https://fightcrewapp-backend.onrender.com/api/news/scrape/status
```

### 3. Monitor Logs on Render

1. Go to your Render dashboard
2. Click on your web service "fightcrewapp-backend"
3. Click "Logs" tab
4. Look for:
   ```
   [Background Jobs] News scraper scheduled (5 times daily: 6am, 9:30am, 1pm, 4pm, 7pm EDT)
   [News Scraper] Starting scrape...
   [News Scraper] Scraped 75 articles, saving to database...
   [News Scraper] Completed in 45s - 12 new articles from 6 sources
   ```

## Troubleshooting

### Server Sleeps Before Cron Runs

**Problem**: Server spins down before scheduled cron time, so cron doesn't execute.

**Solution**: Use UptimeRobot to ping the `/api/news/scrape` endpoint at scheduled times. This both wakes the server AND triggers the scrape.

### Scrapes Take Too Long (Timeout)

**Problem**: News scraper times out on Render (Puppeteer can be slow).

**Solutions**:
1. Increase Render's timeout (requires paid plan)
2. Optimize scraper selectors to be more specific
3. Reduce number of articles scraped per source (currently 15 per source)
4. Skip slow sources (Bleacher Report takes longest)

### Duplicate Articles

**Problem**: Same articles appear multiple times in database.

**Solution**: Already handled! The scraper uses `upsert` logic based on article URL to prevent duplicates.

### Wrong Timezone

**Problem**: Scrapes run at wrong times due to EDT/EST confusion.

**Solution**:
- Render servers use UTC time
- Update cron times when daylight saving changes:
  - EDT (March-November): UTC - 4 hours
  - EST (November-March): UTC - 5 hours

### Images Not Downloading

**Problem**: Article images aren't saved locally.

**Solution**:
1. Check that `public/news-images/` directory exists (auto-created)
2. Check Render file system permissions
3. Consider using cloud storage (S3, Cloudinary) for production

## Cost Optimization

### Free Tier Strategy

- Use UptimeRobot free plan (50 monitors)
- Keep 5 monitors for scheduled scrapes
- Keep 1 monitor for health checks (optional)
- Total: 6 monitors (well within free limit)

### Paid Tier Benefits ($7/month)

- No spin-down (server always awake)
- Longer timeout limits
- Better for reliable cron jobs
- Consider upgrading when app goes live

## Monitoring Best Practices

1. **Set up email alerts** in UptimeRobot for failed scrapes
2. **Check logs daily** for the first week to verify timing
3. **Monitor database growth** - consider cleanup job for old articles (>30 days)
4. **Track scrape success rate** - some sources may break over time

## Future Improvements

1. **Add scrape history table** to track success/failure rates
2. **Implement retry logic** for failed scrapes
3. **Add webhook notifications** (Slack/Discord) for scrape failures
4. **Create admin dashboard** to view scrape statistics
5. **Add article deduplication** across sources (same story from multiple outlets)
6. **Implement incremental scraping** (only fetch new articles since last scrape)

## Quick Reference

**Render Backend URL**: https://fightcrewapp-backend.onrender.com

**Trigger Scrape**: `curl -X POST https://fightcrewapp-backend.onrender.com/api/news/scrape`

**Check Status**: `curl https://fightcrewapp-backend.onrender.com/api/news/scrape/status`

**View Articles**: `curl https://fightcrewapp-backend.onrender.com/api/news?limit=5`

**Scrape Times (EDT)**:
- 6:00 AM
- 9:30 AM
- 1:00 PM
- 4:00 PM
- 7:00 PM

**Scrape Times (UTC)**:
- 10:00
- 13:30
- 17:00
- 20:00
- 23:00
