# MMA News Scraper

A comprehensive web scraper for collecting MMA news articles from multiple sources with automatic image downloading.

## Features

- **Multi-source scraping**: Scrapes news from 4 major MMA websites
- **Automatic image download**: Downloads and stores article banner images locally
- **Parallel execution**: Runs all scrapers concurrently for maximum performance
- **Error handling**: Graceful handling of failed scrapers with detailed error messages
- **Data export**: Saves scraped data to timestamped JSON files

## Supported News Sources

1. **MMA Fighting** - https://www.mmafighting.com/latest-news
2. **Bloody Elbow** - https://bloodyelbow.com/ ✅ (Working)
3. **UFC** - https://www.ufc.com/news
4. **Bleacher Report** - https://bleacherreport.com/mma

### Current Status

- ✅ **Bloody Elbow**: Fully functional (15 articles per scrape)
- ⚠️ **MMA Fighting**: Timeout issues (requires selector refinement)
- ⚠️ **UFC**: Timeout issues (requires selector refinement)
- ⚠️ **Bleacher Report**: Timeout issues (requires selector refinement)

## Data Collected

For each article, the scraper collects:

- **headline**: Article title
- **description**: Article excerpt/summary
- **url**: Full URL to the article
- **source**: Name of the website (e.g., "MMA Fighting", "Bloody Elbow")
- **imageUrl**: URL of the article banner image
- **localImagePath**: Local path to downloaded image (e.g., "/news-images/bloodyelbow-1760113631984.jpg")
- **scrapedAt**: Timestamp of when the article was scraped

## File Structure

```
packages/backend/
├── src/
│   ├── services/
│   │   └── mmaNewsScraper.ts     # Main scraper class
│   └── scripts/
│       └── scrapeNews.ts          # CLI script for testing
├── public/
│   └── news-images/               # Downloaded article images
├── scraped-data/                  # JSON output files
│   └── mma-news-[timestamp].json
└── MMA_NEWS_SCRAPER_README.md     # This file
```

## Usage

### Command Line

Run the scraper from the backend directory:

```bash
cd packages/backend
npx ts-node src/scripts/scrapeNews.ts
```

### Programmatic Usage

```typescript
import { MMANewsScraper } from './services/mmaNewsScraper';

const scraper = new MMANewsScraper();

// Scrape all sources
const articles = await scraper.scrapeAll();

// Scrape individual sources
await scraper.init();
const bloodyElbowArticles = await scraper.scrapeBloodyElbow();
const ufcArticles = await scraper.scrapeUFC();
const mmafightingArticles = await scraper.scrapeMMAfighting();
const bleacherReportArticles = await scraper.scrapeBleacherReport();
await scraper.close();
```

## Output Example

```json
[
  {
    "headline": "Israel Adesanya comically mistaken for pop star Iggy Azalea in bizarre new video",
    "description": "",
    "url": "https://bloodyelbow.com/2025/10/10/israel-adesanya-comically-mistaken-for-pop-star-iggy-azalea-in-bizarre-new-video/",
    "source": "Bloody Elbow",
    "imageUrl": "https://bloodyelbow.com/wp-content/uploads/1/2025/02/GettyImages-2197119780-750x531.jpg",
    "localImagePath": "/news-images/bloodyelbow-1760113631984.jpg",
    "scrapedAt": "2025-10-10T16:27:12.169Z"
  }
]
```

## Technical Details

### Dependencies

- **puppeteer**: Headless browser automation for dynamic content
- **node.js**: Built-in `https` and `fs` modules for image downloading

### Scraper Architecture

The `MMANewsScraper` class provides:

- `init()`: Launches the Puppeteer browser
- `close()`: Closes the browser and cleans up resources
- `scrapeAll()`: Runs all scrapers in parallel
- Individual scraper methods for each news source
- `downloadImage()`: Downloads and saves images locally
- `generateFilename()`: Creates unique timestamped filenames

### Selector Strategy

Each news source uses custom CSS selectors based on the site structure:

**Bloody Elbow** (Working):
```typescript
articleElements: '.post-list article, article'
titleElement: 'h2, h3, .article-title'
descElement: '.article-excerpt, .excerpt, p'
imageElement: 'img, .article-image img'
```

**MMA Fighting** (Needs Refinement):
```typescript
articleElements: 'article.c-entry-box--compact, .c-entry-box--compact'
linkElement: 'a.c-entry-box--compact__image-wrapper, h2 a'
titleElement: 'h2, .c-entry-box--compact__title'
```

**UFC** (Needs Refinement):
```typescript
articleElements: '.l-listing__item, .view-news-landing article, .c-card-event--news'
```

**Bleacher Report** (Needs Refinement):
```typescript
articleElements: 'article, .contentStream article, [class*="ContentCard"]'
```

## Troubleshooting

### Timeout Errors

Some sites have JavaScript-heavy loading or anti-bot protection. Solutions:

1. **Increase timeout**: Change `waitForSelector` timeout from 10000ms to 30000ms
2. **Wait for network idle**: Already using `waitUntil: 'networkidle2'`
3. **Refine selectors**: Inspect the live page and update CSS selectors
4. **Add delays**: Insert `await page.waitForTimeout(2000)` before scraping

### Getting Specific Selectors

If you encounter issues with a specific site, use browser DevTools:

1. Open the news page in Chrome
2. Press F12 to open DevTools
3. Right-click on an article → Inspect
4. Find the common container class/element
5. Update the selectors in `mmaNewsScraper.ts`

### Example Selector Update

```typescript
// If current selectors don't work:
const articleElements = document.querySelectorAll('article');

// Try more specific selectors:
const articleElements = document.querySelectorAll('.news-card, [data-type="article"]');
```

## Next Steps

### 1. Fix Failing Scrapers

Provide specific CSS selectors for:
- MMA Fighting
- UFC
- Bleacher Report

### 2. Create Database Schema

Add a `NewsArticle` table to store scraped articles:

```prisma
model NewsArticle {
  id            String   @id @default(uuid())
  headline      String
  description   String
  url           String   @unique
  source        String
  imageUrl      String
  localImagePath String?
  scrapedAt     DateTime @default(now())
  createdAt     DateTime @default(now())
}
```

### 3. Create API Endpoint

Add routes for fetching news articles:

```typescript
GET /api/news              // Get all news articles
GET /api/news/scrape       // Trigger manual scrape
GET /api/news/:source      // Get articles from specific source
```

### 4. Schedule Automatic Scraping

Use node-cron to scrape periodically:

```typescript
import cron from 'node-cron';

// Scrape every 6 hours
cron.schedule('0 */6 * * *', async () => {
  const scraper = new MMANewsScraper();
  const articles = await scraper.scrapeAll();
  // Save to database
});
```

## Performance

- **Bloody Elbow**: ~15 seconds (15 articles + images)
- **Parallel execution**: All sources scraped simultaneously
- **Image download**: Concurrent downloads with error handling
- **Memory usage**: ~150-200MB with Puppeteer running

## Notes

- Images are saved to `public/news-images/` with format `{source}-{timestamp}.{ext}`
- Scraped data is saved to `scraped-data/mma-news-{timestamp}.json`
- Each scraper has error handling to prevent one failure from stopping others
- The scraper respects the site structure and doesn't aggressively rate-limit
