/**
 * Live Event Tester - UFC 320 (October 4, 2025)
 *
 * This script tests multiple data sources during a live UFC event to determine
 * which provides the best round-by-round timing data.
 *
 * Data Sources:
 * 1. SerpAPI (Google UFC search results)
 * 2. api-sports.io (MMA API with EOR/WO status codes)
 * 3. ESPN scraping (fallback)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface DataSnapshot {
  timestamp: string;
  source: string;
  data: any;
}

class LiveEventTester {
  private snapshots: DataSnapshot[] = [];
  private outputDir: string;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  // API Keys
  private readonly SERPAPI_KEY = process.env.SERPAPI_KEY || '';
  private readonly API_SPORTS_KEY = '14e4b644096bdd8b8ef603af7f90725a';

  constructor() {
    // Create output directory for test results
    this.outputDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Test SerpAPI - Google UFC search results
   * Try multiple queries to find fight detail box
   */
  private async testSerpAPI(): Promise<any> {
    try {
      // Try multiple search queries to capture different data
      const queries = [
        'ufc',
        'ufc 320',
        'ufc live',
        'ankalaev vs pereira',
      ];

      const results: any = {};

      for (const query of queries) {
        const response = await axios.get('https://serpapi.com/search.json', {
          params: {
            engine: 'google',
            q: query,
            api_key: this.SERPAPI_KEY,
          },
          timeout: 10000,
        });

        results[query] = {
          sports_results: response.data.sports_results,
          knowledge_graph: response.data.knowledge_graph,
          game_spotlight: response.data.game_spotlight, // Might contain detailed fight info
        };

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success: true,
        results,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Test api-sports.io - Look for live fight data
   */
  private async testAPISports(): Promise<any> {
    try {
      // Try getting today's fights
      const today = new Date().toISOString().split('T')[0];

      const response = await axios.get('https://v1.mma.api-sports.io/fights', {
        params: {
          date: today,
        },
        headers: {
          'x-rapidapi-key': this.API_SPORTS_KEY,
          'x-rapidapi-host': 'v1.mma.api-sports.io',
        },
        timeout: 10000,
      });

      return {
        success: true,
        fights: response.data.response,
        count: response.data.results,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Test ESPN scraping (basic structure test)
   */
  private async testESPN(): Promise<any> {
    try {
      // Just test if we can access ESPN MMA page
      const response = await axios.get('https://www.espn.com/mma/schedule', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      return {
        success: true,
        status: response.status,
        contentLength: response.data.length,
        note: 'Would need cheerio/puppeteer for actual parsing',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run all tests and capture snapshot
   */
  private async captureSnapshot(): Promise<void> {
    const timestamp = new Date().toISOString();

    console.log(`\n[${timestamp}] Capturing data snapshot...`);

    // Test all sources in parallel
    const [serpapi, apiSports, espn] = await Promise.all([
      this.testSerpAPI(),
      this.testAPISports(),
      this.testESPN(),
    ]);

    // Save individual snapshots
    this.snapshots.push({
      timestamp,
      source: 'serpapi',
      data: serpapi,
    });

    this.snapshots.push({
      timestamp,
      source: 'api-sports',
      data: apiSports,
    });

    this.snapshots.push({
      timestamp,
      source: 'espn',
      data: espn,
    });

    // Log results
    console.log('SerpAPI:', serpapi.success ? '✅ Success' : `❌ ${serpapi.error}`);
    console.log('api-sports.io:', apiSports.success ? `✅ ${apiSports.count} fights` : `❌ ${apiSports.error}`);
    console.log('ESPN:', espn.success ? '✅ Accessible' : `❌ ${espn.error}`);

    // Save to file every 10 snapshots
    if (this.snapshots.length % 10 === 0) {
      this.saveSnapshots();
    }
  }

  /**
   * Save snapshots to JSON file
   */
  private saveSnapshots(): void {
    const filename = `ufc-320-test-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.snapshots, null, 2));
    console.log(`💾 Saved ${this.snapshots.length} snapshots to ${filename}`);
  }

  /**
   * Start polling (every 30 seconds)
   */
  public start(intervalSeconds: number = 30): void {
    if (this.isRunning) {
      console.log('⚠️  Already running!');
      return;
    }

    console.log('🚀 Starting live event tester...');
    console.log(`📊 Polling every ${intervalSeconds} seconds`);
    console.log(`📁 Results will be saved to: ${this.outputDir}`);
    console.log('\nUFC 320: Ankalaev vs. Pereira 2');
    console.log('Date: Saturday, October 4, 2025');
    console.log('Time: Check local listings\n');

    this.isRunning = true;

    // Capture initial snapshot
    this.captureSnapshot();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.captureSnapshot();
    }, intervalSeconds * 1000);
  }

  /**
   * Stop polling and save results
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Not running!');
      return;
    }

    console.log('\n🛑 Stopping live event tester...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.isRunning = false;

    // Save final results
    this.saveSnapshots();

    // Generate summary
    this.generateSummary();
  }

  /**
   * Generate test summary
   */
  private generateSummary(): void {
    const summary = {
      totalSnapshots: this.snapshots.length,
      duration: {
        start: this.snapshots[0]?.timestamp,
        end: this.snapshots[this.snapshots.length - 1]?.timestamp,
      },
      sources: {
        serpapi: this.snapshots.filter(s => s.source === 'serpapi' && s.data.success).length,
        apiSports: this.snapshots.filter(s => s.source === 'api-sports' && s.data.success).length,
        espn: this.snapshots.filter(s => s.source === 'espn' && s.data.success).length,
      },
    };

    console.log('\n📊 Test Summary:');
    console.log(JSON.stringify(summary, null, 2));

    const summaryPath = path.join(this.outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }
}

// Export for programmatic use
export default LiveEventTester;

// CLI usage
if (require.main === module) {
  const tester = new LiveEventTester();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    tester.stop();
    process.exit(0);
  });

  // Start testing (30 second intervals)
  tester.start(30);

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
