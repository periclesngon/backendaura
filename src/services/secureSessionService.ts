import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export class SecureSessionService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
  private static readonly TOKEN_EXPIRY_HOURS = 1.5; // 1.5 hours (90 minutes)

  /**
   * Generate a secure token for one-on-one session access
   */
  static generateSecureToken(sessionId: string, studentId: string): string {
    const payload = {
      sessionId,
      studentId,
      type: 'one-on-one-session',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.TOKEN_EXPIRY_HOURS * 60 * 60)
    };

    return jwt.sign(payload, this.JWT_SECRET);
  }

  /**
   * Validate a secure token and return session details
   */
  static validateSecureToken(token: string): { 
    valid: boolean; 
    sessionId?: string; 
    studentId?: string; 
    error?: string 
  } {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      
      if (decoded.type !== 'one-on-one-session') {
        return { valid: false, error: 'Invalid token type' };
      }

      return {
        valid: true,
        sessionId: decoded.sessionId,
        studentId: decoded.studentId
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token has expired' };
      } else if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      } else {
        return { valid: false, error: 'Token validation failed' };
      }
    }
  }

  /**
   * Generate a secure session link
   */
  static generateSecureLink(sessionId: string, studentId: string, baseUrl: string): string {
    const token = this.generateSecureToken(sessionId, studentId);
    return `${baseUrl}/session/${token}`;
  }

  /**
   * Generate a random session code (alternative approach)
   */
  static generateSessionCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
  }
}
