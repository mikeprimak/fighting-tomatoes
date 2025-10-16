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
      // Render/production-friendly Puppeteer config
      const isProduction = process.env.NODE_ENV === 'production';

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          // Additional Render-specific args
          ...(isProduction ? [
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ] : [])
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

  // Fetch Open Graph image from article URL
  private async fetchOGImage(articleUrl: string): Promise<string> {
    const page = await this.browser!.newPage();
    try {
      await page.goto(articleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const ogImage = await page.evaluate(() => {
        // @ts-ignore - document is available in browser context
        const ogMeta = document.querySelector('meta[property="og:image"]');
        // @ts-ignore - document is available in browser context
        const twitterMeta = document.querySelector('meta[name="twitter:image"]');
        return ogMeta?.getAttribute('content') || twitterMeta?.getAttribute('content') || '';
      });

      return ogImage;
    } catch (error) {
      console.error(`Failed to fetch OG image for ${articleUrl}:`, error);
      return '';
    } finally {
      await page.close();
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

            // Note: Bleacher Report MMA page doesn't have individual article images
            // Images are shared across the feed or loaded separately, so we leave imageUrl empty

            // Only add if we have a valid headline and it's a unique URL
            if (headline && headline.length > 10 && url && !items.some(i => i.url === url)) {
              items.push({
                headline: headline,
                description: '', // Bleacher Report doesn't show descriptions
                url: url,
                imageUrl: '', // No images available on listing page
              });
            }
          } catch (err) {
            console.error('Error parsing B/R article:', err);
          }
        });

        return items.slice(0, 15);
      });

      // Filter for combat sports articles only
      const combatSportsKeywords = [
        'ufc', 'mma', 'fight', 'pereira', 'ankalaev', 'mcgregor', 'jones', 'adesanya',
        'boxing', 'boxer', 'knockout', 'submission', 'octagon', 'cage', 'combat',
        'bellator', 'pfl', 'strikeforce', 'pride', 'wrestling', 'grappling',
        'heavyweight', 'lightweight', 'welterweight', 'bantamweight', 'featherweight',
        'flyweight', 'middleweight', 'championship', 'title fight', 'martial arts',
        'jackson', 'rampage', 'dana white', 'ko', 'tko', 'decision'
      ];

      const filteredArticles = scrapedArticles.filter((item) => {
        const textToCheck = (item.headline + ' ' + item.url).toLowerCase();
        return combatSportsKeywords.some(keyword => textToCheck.includes(keyword));
      });

      console.log(`Filtered ${scrapedArticles.length} articles to ${filteredArticles.length} combat sports articles`);

      // Fetch Open Graph images for Bleacher Report articles (second pass)
      console.log('Fetching images for Bleacher Report articles...');
      for (const item of filteredArticles) {
        let imageUrl = '';
        let localImagePath: string | undefined;

        // Fetch OG image from article page
        imageUrl = await this.fetchOGImage(item.url);

        // Download image if found
        if (imageUrl) {
          try {
            const filename = this.generateFilename(imageUrl, 'bleacherreport');
            localImagePath = await this.downloadImage(imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'Bleacher Report',
          imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ Bleacher Report: ${articles.length} articles scraped (with images)`);
    } catch (error) {
      console.error('Error scraping Bleacher Report:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeSherdog(): Promise<NewsArticle[]> {
    console.log('Scraping Sherdog...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://www.sherdog.com/news/news/list', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for news list to load
      await page.waitForSelector('.module_list_generic.latest_articles', { timeout: 10000 });

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];
        // @ts-ignore - document is available in browser context
        const linkElements = document.querySelectorAll('.module_list_generic.latest_articles ul li a');

        linkElements.forEach((link: any) => {
          try {
            let url = link.href;
            const headline = link.textContent?.trim() || '';

            // Fix relative URLs
            if (url.startsWith('/')) {
              url = 'https://www.sherdog.com' + url;
            }

            if (headline && url && !items.some(i => i.url === url)) {
              items.push({
                headline,
                description: '', // Sherdog doesn't show descriptions on listing page
                url,
                imageUrl: '', // Sherdog list doesn't have images
              });
            }
          } catch (err) {
            console.error('Error parsing Sherdog article:', err);
          }
        });

        return items.slice(0, 15); // Limit to 15 articles
      });

      for (const item of scrapedArticles) {
        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'Sherdog',
          imageUrl: item.imageUrl,
          localImagePath: undefined,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ Sherdog: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping Sherdog:', error);
    } finally {
      await page.close();
    }

    return articles;
  }

  async scrapeESPNBoxing(): Promise<NewsArticle[]> {
    console.log('Scraping ESPN Boxing...');
    const page = await this.browser!.newPage();
    const articles: NewsArticle[] = [];

    try {
      await page.goto('https://www.espn.com/boxing/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for content items to load
      await page.waitForSelector('.contentItem__content', { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const scrapedArticles = await page.evaluate(() => {
        const items: any[] = [];
        // @ts-ignore - document is available in browser context
        const contentItems = document.querySelectorAll('.contentItem__content--story');

        contentItems.forEach((item: any) => {
          try {
            const linkElement = item.querySelector('a');
            const titleElement = item.querySelector('h2.contentItem__title');
            const imageElement = item.querySelector('img.media-wrapper_image');

            if (linkElement && titleElement) {
              let url = linkElement.href;
              const headline = titleElement.textContent?.trim() || '';

              // Fix relative URLs
              if (url.startsWith('/')) {
                url = 'https://www.espn.com' + url;
              }

              let imageUrl = '';
              if (imageElement) {
                // ESPN uses lazy loading - check src first, then data-default-src attribute
                imageUrl = (imageElement as any).src ||
                          (imageElement as any).getAttribute('data-default-src') || '';
              }

              if (headline && url && !items.some(i => i.url === url)) {
                items.push({
                  headline,
                  description: '', // ESPN doesn't show descriptions on listing page
                  url,
                  imageUrl,
                });
              }
            }
          } catch (err) {
            console.error('Error parsing ESPN article:', err);
          }
        });

        return items.slice(0, 15); // Limit to 15 articles
      });

      for (const item of scrapedArticles) {
        let localImagePath: string | undefined;

        if (item.imageUrl) {
          try {
            const filename = this.generateFilename(item.imageUrl, 'espn-boxing');
            localImagePath = await this.downloadImage(item.imageUrl, filename);
          } catch (err) {
            console.error(`Failed to download image: ${item.imageUrl}`, err);
          }
        }

        articles.push({
          headline: item.headline,
          description: item.description,
          url: item.url,
          source: 'ESPN Boxing',
          imageUrl: item.imageUrl,
          localImagePath,
          scrapedAt: new Date(),
        });
      }

      console.log(`✓ ESPN Boxing: ${articles.length} articles scraped`);
    } catch (error) {
      console.error('Error scraping ESPN Boxing:', error);
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
      const [mmafighting, bloodyelbow, ufc, bleacherreport, sherdog, espnboxing] = await Promise.allSettled([
        this.scrapeMMAfighting(),
        this.scrapeBloodyElbow(),
        this.scrapeUFC(),
        this.scrapeBleacherReport(),
        this.scrapeSherdog(),
        this.scrapeESPNBoxing(),
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

      if (sherdog.status === 'fulfilled') {
        allArticles.push(...sherdog.value);
      } else {
        console.error('Sherdog scraping failed:', sherdog.reason);
      }

      if (espnboxing.status === 'fulfilled') {
        allArticles.push(...espnboxing.value);
      } else {
        console.error('ESPN Boxing scraping failed:', espnboxing.reason);
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
