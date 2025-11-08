import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { JWTPayload, AuthTokens } from '@/types';
import { UserRole, SubscriptionTier } from '@prisma/client';
import { logger } from '@/utils/logger';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
}

export class JWTService {
  /**
   * Generate access token
   */
  static generateAccessToken(payload: TokenPayload): string {
    try {
      return jwt.sign(
        {
          id: payload.userId, // Add id for compatibility
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          subscriptionTier: payload.subscriptionTier,
          type: 'access'
        },
        config.jwtSecret,
        {
          expiresIn: '24h',
          issuer: 'tcf-tef-api',
          audience: 'tcf-tef-app'
        }
      );
    } catch (error) {
      logger.error('Error generating access token', error);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(payload: TokenPayload): string {
    try {
      return jwt.sign(
        {
          userId: payload.userId,
          email: payload.email,
          type: 'refresh'
        },
        config.jwtRefreshSecret,
        {
          expiresIn: '7d',
          issuer: 'tcf-tef-api',
          audience: 'tcf-tef-app'
        }
      );
    } catch (error) {
      logger.error('Error generating refresh token', error);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Generate both access and refresh tokens
   */
  static generateTokens(payload: TokenPayload): AuthTokens {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload)
    };
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): JWTPayload {
    try {
      console.log('🔍 JWT DEBUG: Verifying token');
      console.log('🔍 JWT DEBUG: Token length:', token.length);
      console.log('🔍 JWT DEBUG: JWT Secret length:', config.jwtSecret.length);
      console.log('🔍 JWT DEBUG: JWT Secret preview:', config.jwtSecret.substring(0, 10) + '...');

      const decoded = jwt.verify(token, config.jwtSecret, {
        issuer: 'tcf-tef-api',
        audience: 'tcf-tef-app'
      }) as any;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      console.log('✅ JWT DEBUG: Token verified successfully');
      console.log('🔍 JWT DEBUG: User ID:', decoded.userId);

      return {
        id: decoded.id || decoded.userId, // Add id for compatibility
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        subscriptionTier: decoded.subscriptionTier,
        iat: decoded.iat,
        exp: decoded.exp
      };
    } catch (error) {
      console.log('❌ JWT DEBUG: Token verification failed');
      console.log('❌ JWT DEBUG: Error:', error instanceof Error ? error.message : error);
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else {
        logger.error('Error verifying access token', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): { userId: string; email: string } {
    try {
      const decoded = jwt.verify(token, config.jwtRefreshSecret, {
        issuer: 'tcf-tef-api',
        audience: 'tcf-tef-app'
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else {
        logger.error('Error verifying refresh token', error);
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Error decoding token', error);
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      logger.error('Error getting token expiration', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) return true;
    return expiration < new Date();
  }
}
