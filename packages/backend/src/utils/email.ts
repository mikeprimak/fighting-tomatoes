// packages/backend/src/utils/email.ts
import nodemailer from 'nodemailer'
import crypto from 'crypto'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export class EmailService {
  static generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  static async sendVerificationEmail(email: string, token: string, firstName?: string) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`
    const logoUrl = `${process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'}/images/logo-v2.png`

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@fightcrewapp.com',
      to: email,
      subject: 'Verify Your Good Fights Account',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; background-color: #181818; border-radius: 12px; padding: 20px 30px;">
              <img src="${logoUrl}" alt="Good Fights" style="width: 120px; height: auto;" />
            </div>
          </div>

          <h1 style="color: #202020; text-align: center; margin-bottom: 20px;">Welcome to Good Fights!</h1>

          <p style="color: #000000;">Hi ${firstName || 'there'},</p>

          <p style="color: #000000;">Thanks for joining Good Fights - the premier platform for hyping and rating combat sports fights!</p>

          <p style="color: #000000;">To complete your registration and start interacting, please verify your email address:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}"
               style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email Address
            </a>
          </div>

          <p style="color: #000000;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #4A90D9; font-size: 12px;">${verificationUrl}</p>

          <p style="color: #000000; font-size: 14px;">This link will expire in 24 hours for security.</p>

          <p style="color: #000000;">Once verified, you can:</p>
          <ul style="color: #000000;">
            <li>Hype upcoming fights and rate completed ones from 1-10</li>
            <li>See which upcoming fights are most hyped by the community</li>
            <li>Write reviews and get upvotes from the community</li>
            <li>Tag fights with awards like Fight of the Night and Fight of the Year</li>
            <li>Browse events from UFC, ONE, PFL, BKFC, and more</li>
          </ul>

          <p style="color: #000000; font-size: 14px;">If you didn't create this account, you can safely ignore this email.</p>

          <p style="color: #000000;">Welcome to the community!</p>
          <p style="color: #000000; font-weight: bold;">The Good Fights Team</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
  }

  static async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    const logoUrl = `${process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'}/images/logo-v2.png`

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@goodfights.app',
      to: email,
      subject: 'Reset Your Good Fights Password',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; background-color: #181818; border-radius: 12px; padding: 20px 30px;">
              <img src="${logoUrl}" alt="Good Fights" style="width: 120px; height: auto;" />
            </div>
          </div>

          <h1 style="color: #202020; text-align: center; margin-bottom: 20px;">Password Reset Request</h1>

          <p style="color: #000000;">You requested a password reset for your Good Fights account.</p>

          <p style="color: #000000;">Click the button below to reset your password:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>

          <p style="color: #000000;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #4A90D9; font-size: 12px;">${resetUrl}</p>

          <p style="color: #000000; font-size: 14px;">This link will expire in 1 hour for security.</p>

          <p style="color: #000000; font-size: 14px;">If you didn't request this reset, you can safely ignore this email.</p>

          <p style="color: #000000; font-weight: bold;">The Good Fights Team</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
  }

  static async sendAccountClaimEmail(email: string, token: string, displayName?: string) {
    // Use same reset-password URL as password reset - the screen handles both cases
    const claimUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    const logoUrl = `${process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'}/images/logo-v2.png`

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@goodfights.app',
      to: email,
      subject: 'Welcome Back! Set Up Your Good Fights Account',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; background-color: #181818; border-radius: 12px; padding: 20px 30px;">
              <img src="${logoUrl}" alt="Good Fights" style="width: 120px; height: auto;" />
            </div>
          </div>

          <h1 style="color: #202020; text-align: center; margin-bottom: 20px;">Welcome Back${displayName ? `, ${displayName}` : ''}!</h1>

          <p style="color: #000000;">Great news! Your account from <strong>fightingtomatoes.com</strong> has been transferred to our new <strong>Good Fights</strong> app.</p>

          <p style="color: #000000;">All your ratings, reviews, and history have been preserved. To access your account, you just need to set a new password:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${claimUrl}"
               style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Set Up My Account
            </a>
          </div>

          <p style="color: #000000;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #4A90D9; font-size: 12px;">${claimUrl}</p>

          <p style="color: #000000; font-size: 14px;">This link will expire in 24 hours for security.</p>

          <p style="color: #000000;"><strong>What's new in Good Fights?</strong></p>
          <ul style="color: #000000;">
            <li>Native iOS and Android apps</li>
            <li>Pre-fight hype ratings - see which fights are most anticipated</li>
            <li>Coverage of UFC, ONE, PFL, BKFC, and more</li>
            <li>Improved performance and design</li>
          </ul>

          <p style="color: #000000; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>

          <p style="color: #000000; font-weight: bold;">The Good Fights Team</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
  }

  /**
   * Send admin alert when a scraper fails
   */
  static async sendScraperFailureAlert(org: string, errorMessage: string) {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL
    if (!adminEmail) {
      console.log('[Email] ADMIN_ALERT_EMAIL not configured, skipping scraper failure alert')
      return
    }

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
    const adminUrl = process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@goodfights.app',
      to: adminEmail,
      subject: `⚠️ [Good Fights] Scraper Failed: ${org}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
          <h1 style="color: #ef4444; margin-bottom: 20px;">⚠️ Scraper Failure Alert</h1>

          <p style="color: #000000;">The <strong>${org}</strong> scraper failed at <strong>${timestamp} ET</strong>.</p>

          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="color: #991b1b; margin: 0; font-weight: 600;">Error:</p>
            <pre style="color: #991b1b; margin: 10px 0 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px;">${errorMessage}</pre>
          </div>

          <p style="color: #000000;">
            <a href="${adminUrl}/admin.html" style="color: #3b82f6;">View Admin Dashboard →</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">This is an automated alert from Good Fights.</p>
        </div>
      `
    }

    try {
      await transporter.sendMail(mailOptions)
      console.log(`[Email] Scraper failure alert sent for ${org}`)
    } catch (error) {
      console.error('[Email] Failed to send scraper failure alert:', error)
    }
  }

  /**
   * Send admin notification when new user feedback is submitted
   */
  static async sendFeedbackNotification(feedbackId: string, userEmail: string | null, content: string, platform?: string, appVersion?: string) {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL
    if (!adminEmail) {
      console.log('[Email] ADMIN_ALERT_EMAIL not configured, skipping feedback notification')
      return
    }

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
    const adminUrl = process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com'

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@goodfights.app',
      to: adminEmail,
      subject: `📬 [Good Fights] New Feedback from ${userEmail || 'Anonymous'}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff; padding: 30px; border-radius: 10px;">
          <h1 style="color: #202020; margin-bottom: 20px;">📬 New User Feedback</h1>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; width: 100px;">From:</td>
              <td style="padding: 8px 0; color: #000000;">${userEmail || 'Anonymous'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Platform:</td>
              <td style="padding: 8px 0; color: #000000;">${platform || 'Unknown'} ${appVersion ? `v${appVersion}` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Time:</td>
              <td style="padding: 8px 0; color: #000000;">${timestamp} ET</td>
            </tr>
          </table>

          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="color: #000000; margin: 0; white-space: pre-wrap; line-height: 1.6;">${content}</p>
          </div>

          <p style="color: #000000;">
            <a href="${adminUrl}/admin.html" style="color: #3b82f6;">View in Admin Dashboard →</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">Feedback ID: ${feedbackId}</p>
        </div>
      `
    }

    try {
      await transporter.sendMail(mailOptions)
      console.log(`[Email] Feedback notification sent for feedback ${feedbackId}`)
    } catch (error) {
      console.error('[Email] Failed to send feedback notification:', error)
    }
  }
}
