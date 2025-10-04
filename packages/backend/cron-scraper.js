#!/usr/bin/env node

/**
 * Cron-ready wrapper for UFC data scraper
 *
 * Features:
 * - Automatic scraping with automated mode delays
 * - Email/webhook alerting on success/failure
 * - Detailed logging to file
 * - Graceful error handling
 * - Auto-runs parser after scraping
 *
 * Environment variables:
 * - SCRAPER_MODE: Set to 'automated' automatically
 * - SCRAPER_TIMEOUT: Overall timeout (default: 600000ms = 10min)
 * - ALERT_EMAIL: Email address for failure alerts (optional)
 * - ALERT_WEBHOOK: Webhook URL for alerts (optional, e.g., Slack/Discord)
 * - AUTO_PARSE: Run parser after scraping (default: true)
 * - LOG_DIR: Directory for logs (default: ./logs)
 *
 * Usage:
 *   node cron-scraper.js
 *
 * Crontab example (every 6 hours):
 *   0 */6 * * * cd /path/to/backend && node cron-scraper.js >> logs/cron.log 2>&1
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
  mode: 'automated',
  timeout: parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10),
  alertEmail: process.env.ALERT_EMAIL || null,
  alertWebhook: process.env.ALERT_WEBHOOK || null,
  autoParse: process.env.AUTO_PARSE !== 'false',
  logDir: process.env.LOG_DIR || path.join(__dirname, 'logs'),
};

// Create log directory
if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

// Log file paths
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(CONFIG.logDir, `scraper-${timestamp}.log`);
const errorFile = path.join(CONFIG.logDir, `scraper-error-${timestamp}.log`);

/**
 * Write to log file and console
 */
function log(message, isError = false) {
  const timestampedMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(timestampedMessage);

  const targetFile = isError ? errorFile : logFile;
  fs.appendFileSync(targetFile, timestampedMessage + '\n');
}

/**
 * Send alert via webhook (Slack, Discord, etc.)
 */
async function sendWebhookAlert(title, message, isError = false) {
  if (!CONFIG.alertWebhook) return;

  const payload = JSON.stringify({
    text: `${isError ? '🚨' : '✅'} ${title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title}*\n${message}`
        }
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.alertWebhook);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = protocol.request(options, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Webhook returned ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send email alert (requires sendmail or similar)
 */
async function sendEmailAlert(subject, body) {
  if (!CONFIG.alertEmail) return;

  try {
    const emailContent = `To: ${CONFIG.alertEmail}\nSubject: ${subject}\n\n${body}`;
    const emailFile = path.join(CONFIG.logDir, `email-${timestamp}.txt`);
    fs.writeFileSync(emailFile, emailContent);

    // Attempt to send via sendmail if available
    try {
      execSync(`sendmail -t < ${emailFile}`, { stdio: 'ignore', timeout: 5000 });
      log('Email alert sent successfully');
    } catch (error) {
      log(`Failed to send email (sendmail not available): ${emailFile}`, true);
    }
  } catch (error) {
    log(`Failed to prepare email: ${error.message}`, true);
  }
}

/**
 * Send alerts on success or failure
 */
async function sendAlert(success, details) {
  const title = success
    ? 'UFC Scraper Completed Successfully'
    : 'UFC Scraper Failed';

  const message = success
    ? `Scraper finished in ${details.duration}s\n` +
      `Events: ${details.events || 'N/A'}\n` +
      `Athletes: ${details.athletes || 'N/A'}\n` +
      `Fights: ${details.fights || 'N/A'}`
    : `Error: ${details.error}\n` +
      `Duration: ${details.duration}s\n` +
      `See logs: ${logFile}`;

  // Send webhook alert
  if (CONFIG.alertWebhook) {
    try {
      await sendWebhookAlert(title, message, !success);
      log('Webhook alert sent');
    } catch (error) {
      log(`Failed to send webhook alert: ${error.message}`, true);
    }
  }

  // Send email alert (only on failure)
  if (!success && CONFIG.alertEmail) {
    await sendEmailAlert(title, message);
  }
}

/**
 * Run the scraper
 */
async function runScraper() {
  log('🚀 Starting UFC scraper (automated mode)');
  log(`Timeout: ${CONFIG.timeout}ms (${Math.floor(CONFIG.timeout / 60000)} minutes)`);
  log(`Auto-parse: ${CONFIG.autoParse}`);

  const startTime = Date.now();

  try {
    // Set environment for automated mode
    const env = {
      ...process.env,
      SCRAPER_MODE: CONFIG.mode,
      SCRAPER_TIMEOUT: CONFIG.timeout.toString(),
    };

    // Run scraper
    log('Running scraper...');
    const scraperPath = path.join(__dirname, 'src/services/scrapeAllUFCData.js');
    execSync(`node "${scraperPath}"`, {
      stdio: 'inherit',
      env,
      timeout: CONFIG.timeout + 5000, // Add 5s buffer
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);
    log(`✅ Scraper completed successfully in ${duration}s`);

    // Parse scraped data if enabled
    if (CONFIG.autoParse) {
      log('Running parser...');
      await runParser();
    }

    // Get stats from scraped data
    const stats = getScrapedDataStats();

    await sendAlert(true, {
      duration,
      events: stats.events,
      athletes: stats.athletes,
      fights: stats.fights,
    });

    return true;
  } catch (error) {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    log(`❌ Scraper failed: ${error.message}`, true);
    log(`Stack trace: ${error.stack}`, true);

    await sendAlert(false, {
      duration,
      error: error.message,
    });

    return false;
  }
}

/**
 * Run the parser on latest scraped data
 */
async function runParser() {
  try {
    const scrapedDataDir = path.join(__dirname, 'scraped-data');

    // Find latest timestamped files
    const files = fs.readdirSync(scrapedDataDir);
    const eventFiles = files.filter(f => f.startsWith('events-') && f.endsWith('.json')).sort().reverse();
    const athleteFiles = files.filter(f => f.startsWith('athletes-') && f.endsWith('.json')).sort().reverse();

    if (eventFiles.length === 0 || athleteFiles.length === 0) {
      throw new Error('No scraped data files found');
    }

    const latestEventFile = path.join(scrapedDataDir, eventFiles[0]);
    const latestAthleteFile = path.join(scrapedDataDir, athleteFiles[0]);

    log(`Parsing data: ${eventFiles[0]}, ${athleteFiles[0]}`);

    // Create temporary parser script
    const tempParserScript = `
      const { importUFCData } = require('./src/services/ufcDataParser');
      importUFCData({
        eventsFilePath: '${latestEventFile}',
        athletesFilePath: '${latestAthleteFile}',
        year: new Date().getFullYear()
      })
      .then(() => {
        console.log('✅ Parser completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Parser failed:', error);
        process.exit(1);
      });
    `;

    const tempScriptPath = path.join(__dirname, 'temp-run-parser.js');
    fs.writeFileSync(tempScriptPath, tempParserScript);

    execSync(`node "${tempScriptPath}"`, {
      stdio: 'inherit',
      timeout: 60000, // 1 minute timeout for parser
    });

    fs.unlinkSync(tempScriptPath);
    log('✅ Parser completed successfully');
  } catch (error) {
    log(`❌ Parser failed: ${error.message}`, true);
    throw error;
  }
}

/**
 * Get stats from latest scraped data
 */
function getScrapedDataStats() {
  try {
    const latestEventsPath = path.join(__dirname, 'scraped-data/latest-events.json');
    const latestAthletesPath = path.join(__dirname, 'scraped-data/latest-athletes.json');

    if (!fs.existsSync(latestEventsPath) || !fs.existsSync(latestAthletesPath)) {
      return {};
    }

    const eventsData = JSON.parse(fs.readFileSync(latestEventsPath, 'utf-8'));
    const athletesData = JSON.parse(fs.readFileSync(latestAthletesPath, 'utf-8'));

    const totalFights = eventsData.events.reduce((sum, e) => sum + (e.fights?.length || 0), 0);

    return {
      events: eventsData.events.length,
      athletes: athletesData.athletes.length,
      fights: totalFights,
    };
  } catch (error) {
    log(`Warning: Could not read scraped data stats: ${error.message}`);
    return {};
  }
}

/**
 * Main execution
 */
async function main() {
  log('='.repeat(80));
  log('UFC Data Scraper - Cron Wrapper');
  log('='.repeat(80));

  const success = await runScraper();

  log('='.repeat(80));
  log(success ? 'Job completed successfully' : 'Job failed');
  log(`Log file: ${logFile}`);
  if (!success) {
    log(`Error log: ${errorFile}`);
  }
  log('='.repeat(80));

  process.exit(success ? 0 : 1);
}

// Run
main().catch(error => {
  log(`Fatal error: ${error.message}`, true);
  process.exit(1);
});
