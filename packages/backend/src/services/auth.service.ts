import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { prisma } from '../app';
import { ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES } from '../utils/jwt';

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET!;
  // Use centralized token expiry constants (15 min access, 90 days refresh)
  private readonly JWT_EXPIRES_IN = ACCESS_TOKEN_EXPIRES;
  private readonly REFRESH_TOKEN_EXPIRES_IN = REFRESH_TOKEN_EXPIRES;

  async generateTokens(userId: string, req: Request) {
    // Generate access token
    const accessToken = jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90 days from now (sliding expiration on refresh)

    await prisma.session.create({
      data: {
        userId,
        refreshToken,
        deviceInfo: req.get('User-Agent') || 'Unknown',
        ipAddress: req.ip || req.connection.remoteAddress,
        expiresAt,
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.JWT_EXPIRES_IN,
    };
  }

  async refreshTokens(refreshToken: string, req: Request) {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as any;
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Check if session exists and is not revoked
    const session = await prisma.session.findFirst({
      where: {
        refreshToken,
        isRevoked: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }

    // Revoke old refresh token
    await prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true }
    });

    // Generate new tokens
    return this.generateTokens(decoded.userId, req);
  }

  verifyAccessToken(token: string) {
    return jwt.verify(token, this.JWT_SECRET) as { userId: string };
  }
}