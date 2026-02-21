#!/usr/bin/env node
/**
 * Beta Tester Recruitment Email Script
 *
 * Sends branded invitation emails to active fightingtomatoes.com legacy users.
 * Targets users with >10 fight ratings in the last 12 months.
 *
 * Usage:
 *   node scripts/send-beta-invite.js --test              # Send to avocadomike@hotmail.com only
 *   node scripts/send-beta-invite.js --wave 1 --dry-run  # Preview wave 1 recipients
 *   node scripts/send-beta-invite.js --wave 1             # Send wave 1 (top 100)
 *   node scripts/send-beta-invite.js --wave 2             # Send wave 2 (next 100)
 *   node scripts/send-beta-invite.js --status             # View send log summary
 */

const { Client } = require('pg')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

// Load .env from backend directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// --- Send log (deduplication tracker) ---
const LOG_FILE = path.join(__dirname, 'beta-invite-log.json')

// --- Config ---
const WAVE_SIZE = 100
const MIN_RATINGS = 10
const SEND_DELAY_MS = 500
const TEST_EMAIL = 'avocadomike@hotmail.com'
const APP_STORE_URL = 'https://apps.apple.com/us/app/good-fights/id6757172609'
const LOGO_URL = `${process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'}/images/logo-v2.png`

// Disposable/suspicious email domains to filter out
const BLOCKED_DOMAINS = new Set([
  'ttirv.org',
  'dropmail.me',
  'cwmxc.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.de',
  'tempmail.com',
  'throwaway.email',
  'mailinator.com',
  'yopmail.com',
  'trashmail.com',
  'tempail.com',
  'fakeinbox.com',
  'dispostable.com',
  'maildrop.cc',
  'temp-mail.org',
  'getnada.com',
  'mohmal.com',
  'emailondeck.com',
  'mintemail.com',
])

// --- Send log helpers ---
function loadSendLog() {
  try {
    const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'))
    return data
  } catch {
    return { sends: [] }
  }
}

function saveSendLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2))
}

function getSentEmails(log) {
  return new Set(log.sends.map(s => s.email.toLowerCase()))
}

function appendToLog(log, entry) {
  log.sends.push(entry)
  saveSendLog(log)
}

// --- Parse CLI args ---
const args = process.argv.slice(2)
const isTest = args.includes('--test')
const isDryRun = args.includes('--dry-run')
const isStatus = args.includes('--status')
const waveIndex = args.indexOf('--wave')
const waveNum = waveIndex !== -1 ? parseInt(args[waveIndex + 1], 10) : null

// --status: print send log summary and exit (no DB needed)
if (isStatus) {
  const log = loadSendLog()
  if (log.sends.length === 0) {
    console.log('No emails sent yet.')
    process.exit(0)
  }
  // Group by wave
  const byWave = {}
  for (const s of log.sends) {
    const w = s.wave || '?'
    if (!byWave[w]) byWave[w] = []
    byWave[w].push(s)
  }
  console.log(`=== Beta Invite Send Log ===`)
  console.log(`Total sent: ${log.sends.length}`)
  console.log(`Log file: ${LOG_FILE}\n`)
  for (const [wave, sends] of Object.entries(byWave).sort((a, b) => a[0] - b[0])) {
    const first = sends[0].sentAt
    const last = sends[sends.length - 1].sentAt
    console.log(`Wave ${wave}: ${sends.length} emails (${first.split('T')[0]} to ${last.split('T')[0]})`)
    sends.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.email} — ${s.ratingCount} ratings — ${new Date(s.sentAt).toLocaleString()}`)
    })
    console.log()
  }
  process.exit(0)
}

if (!isTest && waveNum == null) {
  console.error('Usage: node scripts/send-beta-invite.js --test | --wave N [--dry-run] | --status')
  process.exit(1)
}
if (waveNum != null && (isNaN(waveNum) || waveNum < 1)) {
  console.error('Error: --wave must be a positive integer')
  process.exit(1)
}

// --- SMTP transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: parseInt(process.env.SMTP_PORT || '587') === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// --- Build email HTML ---
function buildEmailHtml(displayName, ratingCount) {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi there,'

  return `
<div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <div style="display: inline-block; background-color: #181818; border-radius: 12px; padding: 20px 30px;">
      <img src="${LOGO_URL}" alt="Good Fights" style="max-height: 150px; width: auto;" />
    </div>
  </div>

  <h1 style="color: #202020; text-align: center; margin-bottom: 20px;">Your Ratings Live On</h1>

  <p style="color: #000000;">${greeting}</p>

  <p style="color: #000000;">You rated <strong>${ratingCount} fights</strong> on fightingtomatoes.com — and every single one of them has been preserved in <strong>Good Fights</strong>, the new app built by the same team.</p>

  <p style="color: #000000;">Good Fights is now live on the App Store and we're looking for beta testers from our most active community members. That's you.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${APP_STORE_URL}"
       style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
      Download on the App Store
    </a>
  </div>

  <p style="color: #000000;"><strong>What's new in Good Fights:</strong></p>
  <ul style="color: #000000; line-height: 1.8;">
    <li><strong>Hype ratings</strong> — rate how excited you are for upcoming fights</li>
    <li><strong>Live event tracking</strong> — follow fight cards in real time</li>
    <li><strong>Multi-org coverage</strong> — UFC, ONE, PFL, BKFC, Bellator, and more</li>
    <li><strong>Fight awards</strong> — tag Fight of the Night, Fight of the Year, and more</li>
    <li><strong>All your old ratings</strong> — already in the app, linked to your account</li>
  </ul>

  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="color: #166534; margin: 0;"><strong>On Android?</strong> Reply to this email to join the Android beta — we'll add you right away.</p>
  </div>

  <p style="color: #000000;">To log in, use the email address you signed up with on fightingtomatoes.com and tap "Forgot Password" to set a new password. Your account and all your ratings are already there.</p>

  <p style="color: #000000;">We'd love your feedback as we shape the app. Thanks for being part of the community from the beginning.</p>

  <p style="color: #000000; font-weight: bold;">The Good Fights Team</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
  <p style="color: #6b7280; font-size: 12px;">You're receiving this because you have an account on fightingtomatoes.com. If you'd prefer not to hear from us, simply reply with "unsubscribe".</p>
</div>`
}

// --- Main ---
async function main() {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()
  console.log('[DB] Connected to database')

  try {
    // Query active users: >10 ratings in the last 12 months, ordered by count DESC
    const cutoffDate = new Date()
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1)

    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u."displayName",
        COUNT(fr.id)::int AS rating_count
      FROM users u
      JOIN fight_ratings fr ON fr."userId" = u.id
      WHERE fr."createdAt" >= $1
      GROUP BY u.id, u.email, u."displayName"
      HAVING COUNT(fr.id) > $2
      ORDER BY rating_count DESC
    `, [cutoffDate.toISOString(), MIN_RATINGS])

    // Filter out blocked email domains
    const allUsers = result.rows.filter(row => {
      const domain = row.email.split('@')[1]?.toLowerCase()
      return domain && !BLOCKED_DOMAINS.has(domain)
    })

    console.log(`[Query] Found ${result.rows.length} users with >${MIN_RATINGS} ratings in last 12 months`)
    console.log(`[Filter] ${allUsers.length} users after filtering disposable domains (removed ${result.rows.length - allUsers.length})`)

    // Load send log for deduplication
    const sendLog = loadSendLog()
    const alreadySent = getSentEmails(sendLog)
    if (alreadySent.size > 0) {
      console.log(`[Log] ${alreadySent.size} emails already sent in previous runs`)
    }

    // --- Test mode ---
    if (isTest) {
      // Find the test user's real data, or use placeholder
      const testUser = allUsers.find(u => u.email === TEST_EMAIL)
      const displayName = testUser?.displayName || 'TestUser'
      const ratingCount = testUser?.rating_count || 42

      console.log(`\n[Test] Sending test email to ${TEST_EMAIL}`)
      console.log(`[Test] Using: displayName="${displayName}", ratingCount=${ratingCount}`)

      if (isDryRun) {
        console.log('[Dry Run] Would send to:', TEST_EMAIL)
        console.log('[Dry Run] Subject: Your fightingtomatoes.com ratings live on — try Good Fights')
        return
      }

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@goodfights.app',
          to: TEST_EMAIL,
          subject: 'Your fightingtomatoes.com ratings live on — try Good Fights',
          html: buildEmailHtml(displayName, ratingCount),
        })
        console.log(`[OK] Test email sent to ${TEST_EMAIL}`)
        // Don't log test sends — test mode is repeatable
      } catch (err) {
        console.error(`[FAIL] Failed to send test email:`, err.message)
      }
      return
    }

    // --- Wave mode ---
    const waveStart = (waveNum - 1) * WAVE_SIZE
    const waveEnd = waveNum * WAVE_SIZE
    const waveUsers = allUsers.slice(waveStart, waveEnd)

    // Filter out already-sent users
    const newUsers = waveUsers.filter(u => !alreadySent.has(u.email.toLowerCase()))
    const skipped = waveUsers.length - newUsers.length

    console.log(`\n[Wave ${waveNum}] Users ${waveStart + 1}–${Math.min(waveEnd, allUsers.length)} of ${allUsers.length} total`)
    console.log(`[Wave ${waveNum}] ${waveUsers.length} in wave, ${skipped} already sent, ${newUsers.length} to send`)

    if (newUsers.length === 0) {
      console.log(`[Wave ${waveNum}] All users in this wave already emailed. Done.`)
      return
    }

    // --- Dry run: print recipients ---
    if (isDryRun) {
      console.log(`\n--- Wave ${waveNum} Recipients (dry run) ---`)
      newUsers.forEach((user, i) => {
        console.log(`  ${i + 1}. ${user.email} — ${user.rating_count} ratings — ${user.displayName || '(no name)'}`)
      })
      if (skipped > 0) {
        console.log(`\n  (${skipped} users skipped — already emailed in previous runs)`)
      }
      console.log(`\nTotal: ${newUsers.length} emails would be sent.`)
      return
    }

    // --- Send emails ---
    let sent = 0
    let failed = 0
    const failures = []

    for (let i = 0; i < newUsers.length; i++) {
      const user = newUsers[i]

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@goodfights.app',
          to: user.email,
          subject: 'Your fightingtomatoes.com ratings live on — try Good Fights',
          html: buildEmailHtml(user.displayName, user.rating_count),
        })
        sent++
        console.log(`  [${sent}/${newUsers.length}] OK — ${user.email} (${user.rating_count} ratings)`)

        // Log successful send
        appendToLog(sendLog, {
          email: user.email,
          displayName: user.displayName || null,
          ratingCount: user.rating_count,
          wave: waveNum,
          sentAt: new Date().toISOString(),
        })
      } catch (err) {
        failed++
        failures.push({ email: user.email, error: err.message })
        console.error(`  [FAIL] ${user.email}: ${err.message}`)
      }

      // Rate limit delay (skip after last email)
      if (i < newUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS))
      }
    }

    // --- Summary ---
    console.log(`\n--- Wave ${waveNum} Summary ---`)
    console.log(`  Sent: ${sent}`)
    console.log(`  Failed: ${failed}`)
    console.log(`  Skipped (already sent): ${skipped}`)
    console.log(`  Total sent all-time: ${sendLog.sends.length}`)
    if (failures.length > 0) {
      console.log(`  Failures:`)
      failures.forEach(f => console.log(`    - ${f.email}: ${f.error}`))
    }
    console.log(`  Send log: ${LOG_FILE}`)

  } finally {
    await db.end()
    console.log('\n[DB] Disconnected')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
