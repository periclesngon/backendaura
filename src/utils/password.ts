import bcrypt from 'bcryptjs';
import { logger } from '@/utils/logger';

export class PasswordService {
  private static readonly ADMIN_SALT_ROUNDS = 8; // Faster hashing for admin accounts
  private static readonly STUDENT_SALT_ROUNDS = 10; // Standard hashing for students

  /**
   * Get salt rounds based on user role for performance optimization
   */
  private static getSaltRounds(role?: string): number {
    switch (role) {
      case 'ADMIN':
      case 'SENIOR_MANAGER':
      case 'JUNIOR_MANAGER':
        return this.ADMIN_SALT_ROUNDS; // Faster for admin/manager accounts
      case 'STUDENT':
      case 'USER':
      default:
        return this.STUDENT_SALT_ROUNDS; // Standard for students
    }
  }

  /**
   * Hash a password with role-based optimization
   */
  static async hashPassword(password: string, role?: string): Promise<string> {
    try {
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const saltRounds = this.getSaltRounds(role);
      const salt = await bcrypt.genSalt(saltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      logger.info(`Password hashed with ${saltRounds} salt rounds for role: ${role || 'default'}`);
      return hashedPassword;
    } catch (error) {
      logger.error('Error hashing password', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      if (!password || !hashedPassword) {
        return false;
      }

      const isValid = await bcrypt.compare(password, hashedPassword);
      return isValid;
    } catch (error) {
      logger.error('Error verifying password', error);
      return false;
    }
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];
    let score = 0;

    // Check minimum length
    if (password.length < 6) {
      errors.push('Password must be at least 6 characters long');
    } else if (password.length >= 8) {
      score += 1;
    }

    // Check for lowercase letters
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    // Check for uppercase letters
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    // Check for numbers
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    // Check for special characters
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    // Check for common patterns
    const commonPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /abc123/i,
      /admin/i
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns and is not secure');
        score = Math.max(0, score - 2);
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.min(5, score)
    };
  }

  /**
   * Generate a random password
   */
  static generateRandomPassword(length: number = 12): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + numbers + symbols;
    let password = '';

    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Generate a temporary password for password reset
   */
  static generateTemporaryPassword(): string {
    return this.generateRandomPassword(8);
  }
}
