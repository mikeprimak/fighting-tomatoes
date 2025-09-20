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
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@fightingtomatoes.com',
      to: email,
      subject: 'Verify Your Fighting Tomatoes Account',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #d32f2f;">Welcome to Fighting Tomatoes!</h1>
          
          <p>Hi ${firstName || 'there'},</p>
          
          <p>Thanks for joining Fighting Tomatoes - the premier platform for rating combat sports fights!</p>
          
          <p>To complete your registration and start rating fights, please verify your email address:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          
          <p>This link will expire in 24 hours for security.</p>
          
          <p>Once verified, you can:</p>
          <ul>
            <li>Rate fights from 1-10</li>
            <li>Write reviews and get upvotes</li>
            <li>Follow your favorite fighters</li>
            <li>Get notifications for upcoming fights</li>
            <li>Predict fight outcomes and earn points</li>
          </ul>
          
          <p>If you didn't create this account, you can safely ignore this email.</p>
          
          <p>Welcome to the community!</p>
          <p>The Fighting Tomatoes Team</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
  }

  static async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@fightingtomatoes.com',
      to: email,
      subject: 'Reset Your Fighting Tomatoes Password',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #d32f2f;">Password Reset Request</h1>
          
          <p>You requested a password reset for your Fighting Tomatoes account.</p>
          
          <p>Click the button below to reset your password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          
          <p>This link will expire in 1 hour for security.</p>
          
          <p>If you didn't request this reset, you can safely ignore this email.</p>
          
          <p>The Fighting Tomatoes Team</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)
  }
}
