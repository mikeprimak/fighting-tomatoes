// News Scraper Service
// Handles MMA news scraping and database storage

import { MMANewsScraper, NewsArticle } from './mmaNewsScraper';
import { prisma } from '../utils/prisma';

export class NewsScraperService {
  private isScrapingInProgress = false;
  private lastScrapeTime: Date | null = null;
  private lastScrapeResults: {
    totalArticles: number;
    newArticles: number;
    sources: string[];
    duration: number;
  } | null = null;

  /**
   * Run the news scraper and save articles to database
   */
  async scrapeAndSave(): Promise<{
    success: boolean;
    message: string;
    totalArticles: number;
    newArticles: number;
    sources: string[];
    duration: number;
  }> {
    // Prevent concurrent scrapes
    if (this.isScrapingInProgress) {
      return {
        success: false,
        message: 'Scraping already in progress',
        totalArticles: 0,
        newArticles: 0,
        sources: [],
        duration: 0,
      };
    }

    this.isScrapingInProgress = true;
    const startTime = Date.now();
    console.log('[News Scraper] Starting scrape at', new Date().toISOString());

    try {
      const scraper = new MMANewsScraper();
      const articles = await scraper.scrapeAll();

      if (!articles || articles.length === 0) {
        console.log('[News Scraper] No articles found');
        this.isScrapingInProgress = false;
        return {
          success: false,
          message: 'No articles found',
          totalArticles: 0,
          newArticles: 0,
          sources: [],
          duration: Date.now() - startTime,
        };
      }

      console.log(`[News Scraper] Scraped ${articles.length} articles, saving to database...`);

      // Save articles to database (upsert to avoid duplicates)
      let newArticlesCount = 0;
      for (const article of articles) {
        try {
          const result = await prisma.newsArticle.upsert({
            where: { url: article.url },
            update: {
              // Update these fields if article already exists
              headline: article.headline,
              description: article.description,
              imageUrl: article.imageUrl,
              localImagePath: article.localImagePath || null,
              scrapedAt: article.scrapedAt,
            },
            create: {
              headline: article.headline,
              description: article.description,
              url: article.url,
              source: article.source,
              imageUrl: article.imageUrl,
              localImagePath: article.localImagePath || null,
              scrapedAt: article.scrapedAt,
            },
          });

          // Check if this was a new insert (not an update)
          const wasCreated = result.createdAt.getTime() === result.scrapedAt.getTime();
          if (wasCreated) {
            newArticlesCount++;
          }
        } catch (error) {
          console.error(`[News Scraper] Failed to save article: ${article.url}`, error);
        }
      }

      const duration = Date.now() - startTime;
      const sources = [...new Set(articles.map(a => a.source))];

      this.lastScrapeTime = new Date();
      this.lastScrapeResults = {
        totalArticles: articles.length,
        newArticles: newArticlesCount,
        sources,
        duration,
      };

      console.log(`[News Scraper] Completed in ${duration}ms - ${newArticlesCount} new articles, ${articles.length - newArticlesCount} updated`);

      this.isScrapingInProgress = false;

      return {
        success: true,
        message: `Scraped ${newArticlesCount} new articles from ${sources.length} sources`,
        totalArticles: articles.length,
        newArticles: newArticlesCount,
        sources,
        duration,
      };
    } catch (error: any) {
      console.error('[News Scraper] Error:', error);
      this.isScrapingInProgress = false;

      return {
        success: false,
        message: `Scraping failed: ${error.message}`,
        totalArticles: 0,
        newArticles: 0,
        sources: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get status of news scraper
   */
  getStatus(): {
    isScrapingInProgress: boolean;
    lastScrapeTime: Date | null;
    lastScrapeResults: typeof this.lastScrapeResults;
  } {
    return {
      isScrapingInProgress: this.isScrapingInProgress,
      lastScrapeTime: this.lastScrapeTime,
      lastScrapeResults: this.lastScrapeResults,
    };
  }
}

// Singleton instance
export const newsScraperService = new NewsScraperService();
