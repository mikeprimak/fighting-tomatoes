/**
 * Tapology Snapshot Tool
 *
 * Captures HTML snapshots of a Tapology event page at regular intervals.
 * Use this during live events to collect data for later scraper development.
 *
 * Usage:
 *   npx ts-node src/scripts/snapshotTapology.ts [url] [intervalMinutes]
 *
 * Example:
 *   npx ts-node src/scripts/snapshotTapology.ts "https://www.tapology.com/fightcenter/events/137070-zuffa-boxing" 5
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_URL = 'https://www.tapology.com/fightcenter/events/137070-zuffa-boxing';
const DEFAULT_INTERVAL_MINUTES = 5;

interface SnapshotMetadata {
  url: string;
  startedAt: string;
  snapshots: {
    filename: string;
    timestamp: string;
    size: number;
  }[];
}

class TapologySnapshotter {
  private url: string;
  private intervalMs: number;
  private outputDir: string;
  private metadata: SnapshotMetadata;
  private intervalId: NodeJS.Timeout | null = null;
  private snapshotCount = 0;

  constructor(url: string, intervalMinutes: number) {
    this.url = url;
    this.intervalMs = intervalMinutes * 60 * 1000;

    // Create output directory based on event slug
    const slug = this.extractSlug(url);
    const dateStr = new Date().toISOString().split('T')[0];
    this.outputDir = path.join(__dirname, '../../snapshots', `${slug}-${dateStr}`);

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.metadata = {
      url,
      startedAt: new Date().toISOString(),
      snapshots: [],
    };
  }

  private extractSlug(url: string): string {
    const match = url.match(/events\/(\d+-[^/?]+)/);
    return match ? match[1] : 'unknown-event';
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  async takeSnapshot(): Promise<void> {
    this.snapshotCount++;
    const timestamp = this.getTimestamp();
    const filename = `snapshot-${timestamp}.html`;
    const filepath = path.join(this.outputDir, filename);

    console.log(`\n[${new Date().toLocaleTimeString()}] Taking snapshot #${this.snapshotCount}...`);

    try {
      const response = await fetch(this.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Save HTML
      fs.writeFileSync(filepath, html);

      // Update metadata
      this.metadata.snapshots.push({
        filename,
        timestamp: new Date().toISOString(),
        size: html.length,
      });

      // Save metadata
      fs.writeFileSync(
        path.join(this.outputDir, 'metadata.json'),
        JSON.stringify(this.metadata, null, 2)
      );

      console.log(`  ✅ Saved: ${filename} (${(html.length / 1024).toFixed(1)} KB)`);
      console.log(`  📁 Total snapshots: ${this.metadata.snapshots.length}`);

    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  async start(): Promise<void> {
    console.log('\n🎬 Tapology Snapshotter Started');
    console.log(`📍 URL: ${this.url}`);
    console.log(`⏱️  Interval: ${this.intervalMs / 60000} minutes`);
    console.log(`📁 Output: ${this.outputDir}`);
    console.log('\n💡 Press Ctrl+C to stop\n');

    // Take initial snapshot
    await this.takeSnapshot();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log(`\n\n🛑 Snapshotter stopped`);
    console.log(`📊 Total snapshots taken: ${this.metadata.snapshots.length}`);
    console.log(`📁 Saved to: ${this.outputDir}`);
  }
}

// ============== CLI ==============

if (require.main === module) {
  const url = process.argv[2] || DEFAULT_URL;
  const intervalMinutes = parseInt(process.argv[3] || String(DEFAULT_INTERVAL_MINUTES), 10);

  const snapshotter = new TapologySnapshotter(url, intervalMinutes);

  // Handle shutdown
  process.on('SIGINT', () => {
    snapshotter.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    snapshotter.stop();
    process.exit(0);
  });

  snapshotter.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default TapologySnapshotter;
