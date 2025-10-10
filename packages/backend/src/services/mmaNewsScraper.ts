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

    // Extract clean extension from URL (handle query params and special chars)
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let ext = path.extname(pathname);

      // Remove any remaining query params or special chars from extension
      ext = ext.split('?')[0].split('&')[0].split('#')[0];

      // Validate extension (only allow common image formats)
      const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!validExts.includes(ext.toLowerCase())) {
        ext = '.jpg'; // Default to jpg
      }

      const safeName = source.toLowerCase().replace(/\s+/g, '-');
      return `${safeName}-${timestamp}${ext}`;
    } catch (err) {
      // Fallback if URL parsing fails
      const safeName = source.toLowerCase().replace(/\s+/g, '-');
      return `${safeName}-${timestamp}.jpg`;
    }
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

      // Wait for articles to load - updated selector for new structure
      await page.waitForSelector('[class*="content-card"]', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // Updated selectors for MMA Fighting's new structure
        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll('div.duet--content-cards--content-card, [class*="content-card"]');

        articleElements.forEach((article: any) => {
          try {
            // The title link is the second <a> tag with class _1ngvuhm0
            const linkElement = article.querySelector('a._1ngvuhm0');
            // Title can be in the link text or in a div with specific classes
            const titleElement = linkElement || article.querySelector('div.ls9zuh9');
            const imageElement = article.querySelector('img');

            if (linkElement && titleElement) {
              const url = linkElement.href;
              const headline = titleElement.textContent?.trim() || '';
              // MMA Fighting doesn't show descriptions on listing page
              const description = '';

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

      // Wait for content to load - updated selector
      await page.waitForSelector('.c-card--grid-card-trending', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // Updated selector: The card itself IS the link
        // @ts-ignore - document is available in browser context
        const articleElements = document.querySelectorAll('a.c-card--grid-card-trending');

        articleElements.forEach((article: any) => {
          try {
            // The article element IS the link
            const linkElement = article;
            const titleElement = article.querySelector('h3.c-card--grid-card-trending__headline, h3');
            const imageElement = article.querySelector('img');

            if (linkElement && titleElement) {
              let url = linkElement.href;

              // Fix relative URLs
              if (url.startsWith('/')) {
                url = 'https://www.ufc.com' + url;
              }

              const headline = titleElement.textContent?.trim() || '';
              // UFC doesn't show descriptions on listing page
              const description = '';

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

      // Wait for MUI cards to load
      await page.waitForSelector('a.MuiCardActionArea-root', { timeout: 10000 });

      // Wait a bit more for JS-rendered content
      await new Promise(resolve => setTimeout(resolve, 2000));

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];

        // Updated selector: Find all links with /articles/ in href
        // @ts-ignore - document is available in browser context
        const allLinks = document.querySelectorAll('a[href*="/articles/"]');

        allLinks.forEach((link: any) => {
          try {
            const url = link.href;

            // Extract title from link text
            // Bleacher Report embeds title in link text like "Bleacher Report•2dConor Accepts Anti-Doping Ban..."
            const fullText = link.textContent?.trim() || '';

            // Try to extract the headline (usually after a date marker like "2d", "19h", etc.)
            let headline = '';

            // Split by common patterns and take the meaningful part
            const parts = fullText.split(/\d+[dh]|Bleacher Report•/i);
            if (parts.length > 1) {
              // Take the part after the date
              headline = parts[parts.length - 1].split(/Full details|📲/)[0].trim();
            }

            // Fallback: just clean up the full text
            if (!headline || headline.length < 10) {
              headline = fullText.replace(/Bleacher Report•\d+[dh]/i, '').split(/📲/)[0].trim();
            }

            // Find image - Bleacher Report stores images at Level 2 (card's parent container)
            let imageUrl = '';

            const card = link.closest('.MuiCard-root');
            if (card) {
              const cardParent = card.parentElement;
              if (cardParent) {
                const allImages = cardParent.querySelectorAll('img');

                // Find first valid article image (skip logos)
                for (const img of allImages) {
                  const src = (img as any).src || '';
                  const alt = (img as any).alt || '';

                  // Skip logos and profile images
                  if (src &&
                      !src.includes('/mma.png') &&
                      !src.includes('profile_images') &&
                      alt !== 'tag-logo') {
                    imageUrl = src;
                    break;
                  }
                }
              }
            }

            // Only add if we have a valid headline and it's a unique URL
            if (headline && headline.length > 10 && url && !items.some(i => i.url === url)) {
              items.push({
                headline: headline,
                description: '', // Bleacher Report doesn't show descriptions
                url: url,
                imageUrl: imageUrl,
              });
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

      // Randomize article order for this scrape session to create variety
      // This shuffles articles from all sources together, but only for this batch
      // Previously scraped articles in the database remain in their original order
      this.shuffleArray(allArticles);

      console.log(`\n✓ Total articles scraped: ${allArticles.length}`);
      console.log('Scraping complete!\n');
    } finally {
      await this.close();
    }

    return allArticles;
  }

  // Fisher-Yates shuffle algorithm for randomizing array order
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
