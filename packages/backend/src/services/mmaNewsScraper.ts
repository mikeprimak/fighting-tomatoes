import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface NewsArticle {
  headline: string;
  description: string;
  url: string;
  source: string;
  imageUrl: string;
  localImagePath?: string;
  scrapedAt: Date;
}

export class MMANewsScraper {
  private browser: Browser | null = null;
  private imageDir: string;

  constructor() {
    // Create directory for downloaded images
    this.imageDir = path.join(process.cwd(), 'public', 'news-images');
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async downloadImage(imageUrl: string, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const filepath = path.join(this.imageDir, filename);
      const file = fs.createWriteStream(filepath);

      const protocol = imageUrl.startsWith('https') ? https : http;

      protocol.get(imageUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(`/news-images/${filename}`);
        });
      }).on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete partial file
        reject(err);
      });
    });
  }

  private generateFilename(url: string, source: string): string {
    const timestamp = Date.now();
    const ext = path.extname(url).split('?')[0] || '.jpg';
    const safeName = source.toLowerCase().replace(/\s+/g, '-');
    return `${safeName}-${timestamp}${ext}`;
  }

  async scrapeMMAfighting(): Promise<NewsArticle[]> {
    console.log('Scraping MMA Fighting...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://www.mmafighting.com/latest-news', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for articles to load
      await page.waitForSelector('article, .c-entry-box', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // Try multiple selectors for MMA Fighting's structure
        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll('article.c-entry-box--compact, .c-entry-box--compact');

        articleElements.forEach((article: any) => {
          try {
            const linkElement = article.querySelector('a.c-entry-box--compact__image-wrapper, h2 a, .c-entry-box--compact__title a');
            const titleElement = article.querySelector('h2, .c-entry-box--compact__title');
            const descElement = article.querySelector('.c-entry-box--compact__dek, p.c-entry-box--compact__dek');
            const imageElement = article.querySelector('img, picture img');

            if (linkElement && titleElement) {
              const url = (linkElement as any).href;
              const headline = titleElement.textContent?.trim() || '';
              const description = descElement?.textContent?.trim() || '';

              let imageUrl = '';
              if (imageElement) {
                imageUrl = (imageElement as any).src ||
                          (imageElement as any).dataset?.src || '';
              }

              if (headline && url) {
                items.push({ headline, description, url, imageUrl });
              }
            }
          } catch (err) {
            console.error('Error parsing article:', err);
          }
        });

        return items;
      });

      // Download images and create article objects
      for (const item of scrapedArticles) {
        let localImagePath: string | undefined;

        if (item.imageUrl) {
          try {
            const filename = this.generateFilename(item.imageUrl, 'mmafighting');
            localImagePath = await this.downloadImage(item.imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${item.imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'MMA Fighting',
          imageUrl: item.imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ MMA Fighting: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping MMA Fighting:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeBloodyElbow(): Promise<NewsArticle[]> {
    console.log('Scraping Bloody Elbow...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://bloodyelbow.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await page.waitForSelector('article, .post-list article', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];
        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll('.post-list article, article');

        articleElements.forEach((article: any) => {
          try {
            const linkElement = article.querySelector('a');
            const titleElement = article.querySelector('h2, h3, .article-title');
            const descElement = article.querySelector('.article-excerpt, .excerpt, p');
            const imageElement = article.querySelector('img, .article-image img');

            if (linkElement && titleElement) {
              const url = (linkElement as any).href;
              const headline = titleElement.textContent?.trim() || '';
              const description = descElement?.textContent?.trim() || '';

              let imageUrl = '';
              if (imageElement) {
                imageUrl = (imageElement as any).src ||
                          (imageElement as any).dataset?.src || '';
              }

              if (headline && url && !items.some(i => i.url === url)) {
                items.push({ headline, description, url, imageUrl });
              }
            }
          } catch (err) {
            console.error('Error parsing article:', err);
          }
        });

        return items.slice(0, 15); // Limit to 15 articles
      });

      for (const item of scrapedArticles) {
        let localImagePath: string | undefined;

        if (item.imageUrl) {
          try {
            const filename = this.generateFilename(item.imageUrl, 'bloodyelbow');
            localImagePath = await this.downloadImage(item.imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${item.imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'Bloody Elbow',
          imageUrl: item.imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ Bloody Elbow: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping Bloody Elbow:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeUFC(): Promise<NewsArticle[]> {
    console.log('Scraping UFC.com...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://www.ufc.com/news', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for content to load
      await page.waitForSelector('.view-news-landing, article, .l-listing__item', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // Try multiple selectors for UFC's structure
        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll(
          '.l-listing__item, .view-news-landing article, .c-card-event--news, article'
        );

        articleElements.forEach((article: any) => {
          try {
            const linkElement = article.querySelector('a');
            const titleElement = article.querySelector('h3, .c-card-event--news__headline, .field--name-title');
            const descElement = article.querySelector('.c-card-event--news__description, .field--name-body, p');
            const imageElement = article.querySelector('img');

            if (linkElement && titleElement) {
              let url = (linkElement as any).href;

              // Fix relative URLs
              if (url.startsWith('/')) {
                url = 'https://www.ufc.com' + url;
              }

              const headline = titleElement.textContent?.trim() || '';
              const description = descElement?.textContent?.trim() || '';

              let imageUrl = '';
              if (imageElement) {
                imageUrl = (imageElement as any).src ||
                          (imageElement as any).dataset?.src ||
                          (imageElement as any).dataset?.srcset?.split(',')[0]?.trim().split(' ')[0] || '';

                // Fix relative image URLs
                if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://www.ufc.com' + imageUrl;
                }
              }

              if (headline && url && !items.some(i => i.url === url)) {
                items.push({ headline, description, url, imageUrl });
              }
            }
          } catch (err) {
            console.error('Error parsing UFC article:', err);
          }
        });

        return items.slice(0, 15);
      });

      for (const item of scrapedArticles) {
        let localImagePath: string | undefined;

        if (item.imageUrl) {
          try {
            const filename = this.generateFilename(item.imageUrl, 'ufc');
            localImagePath = await this.downloadImage(item.imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${item.imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'UFC',
          imageUrl: item.imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ UFC: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping UFC:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeBleacherReport(): Promise<NewsArticle[]> {
    console.log('Scraping Bleacher Report...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://bleacherreport.com/mma', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for articles to load
      await page.waitForSelector('article, .contentStream, [data-testid="contentStream"]', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll(
          'article, .contentStream article, [class*="ContentCard"], [class*="articleCard"]'
        );

        articleElements.forEach((article: any) => {
          try {
            const linkElement = article.querySelector('a[href*="/articles/"]');
            const titleElement = article.querySelector('h3, h2, [class*="title"], [class*="headline"]');
            const descElement = article.querySelector('p, [class*="excerpt"], [class*="description"]');
            const imageElement = article.querySelector('img');

            if (linkElement && titleElement) {
              let url = (linkElement as any).href;

              if (url.startsWith('/')) {
                url = 'https://bleacherreport.com' + url;
              }

              const headline = titleElement.textContent?.trim() || '';
              const description = descElement?.textContent?.trim() || '';

              let imageUrl = '';
              if (imageElement) {
                imageUrl = (imageElement as any).src ||
                          (imageElement as any).dataset?.src || '';
              }

              if (headline && url && !items.some(i => i.url === url)) {
                items.push({ headline, description, url, imageUrl });
              }
            }
          } catch (err) {
            console.error('Error parsing B/R article:', err);
          }
        });

        return items.slice(0, 15);
      });

      for (const item of scrapedArticles) {
        let localImagePath: string | undefined;

        if (item.imageUrl) {
          try {
            const filename = this.generateFilename(item.imageUrl, 'bleacherreport');
            localImagePath = await this.downloadImage(item.imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${item.imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'Bleacher Report',
          imageUrl: item.imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ Bleacher Report: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping Bleacher Report:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeAll(): Promise<NewsArticle[]> {
    console.log('Starting MMA news scraping...');
    await this.init();

    const allArticles: NewsArticle[] = [];

    try {
      // Run scrapers in parallel for better performance
      const [mmafighting, bloodyelbow, ufc, bleacherreport] = await Promise.allSettled([
        this.scrapeMMAfighting(),
        this.scrapeBloodyElbow(),
        this.scrapeUFC(),
        this.scrapeBleacherReport(),
      ]);

      if (mmafighting.status === 'fulfilled') {
        allArticles.push(...mmafighting.value);
      } else {
        console.error('MMA Fighting scraping failed:', mmafighting.reason);
      }

      if (bloodyelbow.status === 'fulfilled') {
        allArticles.push(...bloodyelbow.value);
      } else {
        console.error('Bloody Elbow scraping failed:', bloodyelbow.reason);
      }

      if (ufc.status === 'fulfilled') {
        allArticles.push(...ufc.value);
      } else {
        console.error('UFC scraping failed:', ufc.reason);
      }

      if (bleacherreport.status === 'fulfilled') {
        allArticles.push(...bleacherreport.value);
      } else {
        console.error('Bleacher Report scraping failed:', bleacherreport.reason);
      }

      console.log(`\n✓ Total articles scraped: ${allArticles.length}`);
      console.log('Scraping complete!\n');
    } finally {
      await this.close();
    }

    return allArticles;
  }
}
