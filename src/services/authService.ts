import { prisma } from '@/database/connection';
import { PasswordService } from '@/utils/password';
import { JWTService, TokenPayload } from '@/utils/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as admin from 'firebase-admin';
import path from 'path';
import { EmailService } from '@/services/emailService';
import TwilioService from '@/services/twilioService';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Option 1: Use environment variables (RECOMMENDED - no secrets in code)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        }),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      console.log('✅ Firebase Admin SDK initialized with environment variables');
    } 
    // Option 2: Use FIREBASE_SERVICE_ACCOUNT_JSON (base64 encoded JSON)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'base64').toString());
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        console.log('✅ Firebase Admin SDK initialized with base64 JSON');
      } catch (parseError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseError);
        throw parseError;
      }
    }
    // Option 3: Fallback to JSON file (for local development only)
    else {
  const serviceAccountPath = path.join(__dirname, '../../tcftef-68b4c-firebase-adminsdk-fbsvc-49c8267271.json');
      if (require('fs').existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    projectId: 'tcftef-68b4c'
  });
        console.log('✅ Firebase Admin SDK initialized with local JSON file');
      } else {
        console.warn('⚠️ Firebase credentials not found. Google authentication will not work.');
        console.warn('⚠️ Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables');
      }
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    console.warn('⚠️ Google authentication will not work.');
  }
}
const {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthenticationError
} = require('../utils/errors.js');
import { 
  LoginRequest, 
  RegisterRequest, 
  RefreshTokenRequest, 
  AuthTokens,
  UserProfile 
} from '@/types';
import { UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { logger } from '@/utils/logger';

export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: RegisterRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      if (existingUser) {
        logger.warn('Registration attempt with existing email', { email: data.email });
        throw new ConflictError(`User with email ${data.email} already exists`);
      }

      // Validate password strength
      const passwordValidation = PasswordService.validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }

      // Determine user role for optimized password hashing
      const userRole = data.role ? UserRole[data.role as keyof typeof UserRole] : UserRole.STUDENT;

      // Hash password with role-based optimization
      const passwordHash = await PasswordService.hashPassword(data.password, userRole);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          country: data.country,
          role: userRole,
          status: UserStatus.ACTIVE,
          subscriptionTier: SubscriptionTier.FREE
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          subscriptionTier: true,
          profileImage: true,
          phone: true,
          dateOfBirth: true,
          country: true,
          city: true,
          bio: true,
          preferences: true,
          lastLoginAt: true,
          lastActivityAt: true,
          emailVerifiedAt: true,
          socialAuthProvider: true,
          socialAuthId: true,
          profilePicture: true,
          currentLevel: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };

      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      logger.info('User registered successfully', { userId: user.id, email: user.email });

      return {
        user: {
          ...user,
          dateOfBirth: user.dateOfBirth || null,
          lastActivityAt: user.lastActivityAt || null,
          socialAuthProvider: user.socialAuthProvider || null,
          socialAuthId: user.socialAuthId || null,
          profilePicture: user.profilePicture || null,
          currentLevel: (user as any).currentLevel || 'A1'
        },
        tokens
      };
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  }

  /**
   * Register admin user
   */
  static async registerAdmin(data: RegisterRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Hash password with admin role optimization for faster login
      const passwordHash = await PasswordService.hashPassword(data.password, 'ADMIN');

      // Create admin user
      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          country: data.country,
          role: UserRole.ADMIN, // Set as admin
          status: UserStatus.ACTIVE,
          subscriptionTier: SubscriptionTier.PREMIUM // Give admin premium access
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          subscriptionTier: true,
          profileImage: true,
          phone: true,
          dateOfBirth: true,
          country: true,
          city: true,
          bio: true,
          preferences: true,
          lastLoginAt: true,
          lastActivityAt: true,
          emailVerifiedAt: true,
          socialAuthProvider: true,
          socialAuthId: true,
          profilePicture: true,
          currentLevel: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };

      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      logger.info('Admin user registered successfully', { userId: user.id, email: user.email });

      return {
        user: {
          ...user,
          dateOfBirth: user.dateOfBirth || null,
          lastActivityAt: user.lastActivityAt || null,
          socialAuthProvider: user.socialAuthProvider || null,
          socialAuthId: user.socialAuthId || null,
          profilePicture: user.profilePicture || null,
          currentLevel: (user as any).currentLevel || 'A1'
        },
        tokens
      };
    } catch (error) {
      logger.error('Admin registration failed', error);
      throw error;
    }
  }

  /**
   * Login user with performance monitoring
   */
  static async login(data: LoginRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const startTime = Date.now();
    try {
      logger.info('Login attempt started', { email: data.email });

      // Find user by email
      const dbQueryStart = Date.now();
      const user = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });
      const dbQueryTime = Date.now() - dbQueryStart;
      logger.info('Database query completed', { email: data.email, queryTime: `${dbQueryTime}ms` });

      if (!user) {
        logger.warn('Login attempt with non-existent email', { email: data.email });
        throw new AuthenticationError('Invalid email or password');
      }

      // Check user status
      if (user.status === UserStatus.SUSPENDED) {
        logger.warn('Login attempt with suspended account', { userId: user.id, email: user.email });
        throw new AuthenticationError('Account is suspended. Please contact support.');
      }

      if (user.status === UserStatus.INACTIVE) {
        logger.warn('Login attempt with inactive account', { userId: user.id, email: user.email });
        throw new AuthenticationError('Account is inactive. Please contact support.');
      }

      // Verify password with performance monitoring
      const passwordVerifyStart = Date.now();
      const isPasswordValid = await PasswordService.verifyPassword(data.password, user.passwordHash);
      const passwordVerifyTime = Date.now() - passwordVerifyStart;
      logger.info('Password verification completed', {
        email: data.email,
        role: user.role,
        verifyTime: `${passwordVerifyTime}ms`
      });
      if (!isPasswordValid) {
        logger.warn('Login attempt with invalid password', { userId: user.id, email: user.email });
        throw new AuthenticationError('Invalid email or password');
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };

      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Remove password hash from response
      const { passwordHash, ...userProfile } = user;

      const totalTime = Date.now() - startTime;
      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        role: user.role,
        totalLoginTime: `${totalTime}ms`
      });

      return { user: userProfile, tokens };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error('Login failed', {
        email: data.email,
        totalTime: `${totalTime}ms`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(data: RefreshTokenRequest): Promise<AuthTokens> {
    try {
      // Verify refresh token
      JWTService.verifyRefreshToken(data.refreshToken);

      // Find refresh token in database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: data.refreshToken },
        include: { user: true }
      });

      if (!storedToken) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        // Clean up expired token
        await prisma.refreshToken.delete({
          where: { id: storedToken.id }
        });
        throw new AuthenticationError('Refresh token expired');
      }

      // Check if user still exists and is active
      if (!storedToken.user || storedToken.user.status !== UserStatus.ACTIVE) {
        throw new AuthenticationError('User account is not active');
      }

      // Generate new tokens
      const tokenPayload: TokenPayload = {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
        subscriptionTier: storedToken.user.subscriptionTier
      };

      const tokens = JWTService.generateTokens(tokenPayload);

      // Update refresh token in database
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      logger.info('Token refreshed successfully', { userId: storedToken.user.id });

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw error;
    }
  }

  /**
   * Logout user (invalidate refresh token)
   */
  static async logout(refreshToken: string): Promise<void> {
    try {
      // Find and delete refresh token
      const deletedToken = await prisma.refreshToken.deleteMany({
        where: { token: refreshToken }
      });

      if (deletedToken.count === 0) {
        logger.warn('Attempted to logout with invalid refresh token');
      } else {
        logger.info('User logged out successfully');
      }
    } catch (error) {
      logger.error('Logout failed', error);
      throw error;
    }
  }

  /**
   * Logout from all devices (invalidate all refresh tokens for user)
   */
  static async logoutAll(userId: string): Promise<void> {
    try {
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });

      logger.info('User logged out from all devices', { userId });
    } catch (error) {
      logger.error('Logout all failed', error);
      throw error;
    }
  }

  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Remove password hash from response
      const { passwordHash, ...userProfile } = user;

      return userProfile;
    } catch (error) {
      logger.error('Failed to get user profile', error);
      throw error;
    }
  }

  /**
   * Update user activity timestamp
   */
  static async updateUserActivity(userId: string): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastActivityAt: new Date()
        }
      });

      logger.debug('User activity updated', { userId });
    } catch (error) {
      logger.error('Failed to update user activity', error);
      // Don't throw error - this is a non-critical operation
    }
  }

  /**
   * Clean up expired refresh tokens
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info(`Cleaned up ${result.count} expired refresh tokens`);
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', error);
    }
  }

  /**
   * Authenticate with Google OAuth
   */
  static async authenticateWithGoogle(idToken: string) {
    try {
      // In a real implementation, you would verify the Google ID token
      // For now, we'll simulate the verification process
      const googleUserInfo = await this.verifyGoogleToken(idToken);

      if (!googleUserInfo) {
        return {
          success: false,
          error: { message: 'Invalid Google token', code: 'INVALID_TOKEN' }
        };
      }

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { email: googleUserInfo.email }
      });

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: googleUserInfo.email,
            firstName: googleUserInfo.given_name || 'User',
            lastName: googleUserInfo.family_name || '',
            profileImage: googleUserInfo.picture,
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            subscriptionTier: SubscriptionTier.FREE,
            emailVerifiedAt: new Date(), // Google accounts are pre-verified
            passwordHash: null // Social auth users don't need password
          }
        });
      } else {
        // Update existing user with Google info if needed
        if (!user.profileImage && googleUserInfo.picture) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              profileImage: googleUserInfo.picture,
              // socialAuthProvider: 'GOOGLE' // Field doesn't exist in current schema
            }
          });
        }
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };
      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Remove password hash from response
      const { passwordHash, ...userResponse } = user;

      return {
        success: true,
        data: {
          user: userResponse,
          tokens
        }
      };
    } catch (error) {
      logger.error('Google authentication failed', error);
      return {
        success: false,
        error: { message: 'Google authentication failed', code: 'GOOGLE_AUTH_ERROR' }
      };
    }
  }

  /**
   * Authenticate with Apple OAuth
   */
  static async authenticateWithApple(idToken: string) {
    try {
      // In a real implementation, you would verify the Apple ID token
      const appleUserInfo = await this.verifyAppleToken(idToken);

      if (!appleUserInfo) {
        return {
          success: false,
          error: { message: 'Invalid Apple token', code: 'INVALID_TOKEN' }
        };
      }

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { email: appleUserInfo.email }
      });

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: appleUserInfo.email,
            firstName: appleUserInfo.name?.firstName || 'User',
            lastName: appleUserInfo.name?.lastName || '',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            subscriptionTier: SubscriptionTier.FREE,
            emailVerifiedAt: new Date(), // Apple accounts are pre-verified
            passwordHash: null // Social auth users don't need password
          }
        });
      } else {
        // Update existing user with Apple info if needed
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            // socialAuthProvider: 'APPLE' // Field doesn't exist in current schema
          }
        });
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };
      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Remove password hash from response
      const { passwordHash, ...userResponse } = user;

      return {
        success: true,
        data: {
          user: userResponse,
          tokens
        }
      };
    } catch (error) {
      logger.error('Apple authentication failed', error);
      return {
        success: false,
        error: { message: 'Apple authentication failed', code: 'APPLE_AUTH_ERROR' }
      };
    }
  }

  /**
   * Authenticate with Facebook OAuth
   */
  static async authenticateWithFacebook(idToken: string) {
    try {
      // In a real implementation, you would verify the Facebook access token
      const facebookUserInfo = await this.verifyFacebookToken(idToken);

      if (!facebookUserInfo) {
        return {
          success: false,
          error: { message: 'Invalid Facebook token', code: 'INVALID_TOKEN' }
        };
      }

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { email: facebookUserInfo.email }
      });

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: facebookUserInfo.email,
            firstName: facebookUserInfo.first_name || 'User',
            lastName: facebookUserInfo.last_name || '',
            profileImage: facebookUserInfo.picture?.data?.url,
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            subscriptionTier: SubscriptionTier.FREE,
            emailVerifiedAt: new Date(), // Facebook accounts are pre-verified
            passwordHash: null // Social auth users don't need password
          }
        });
      } else {
        // Update existing user with Facebook info if needed
        if (!user.profileImage && facebookUserInfo.picture?.data?.url) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              profileImage: facebookUserInfo.picture.data.url,
              // socialAuthProvider: 'FACEBOOK' // Field doesn't exist in current schema
            }
          });
        }
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };
      const tokens = JWTService.generateTokens(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });

      // Remove password hash from response
      const { passwordHash, ...userResponse } = user;

      return {
        success: true,
        data: {
          user: userResponse,
          tokens
        }
      };
    } catch (error) {
      logger.error('Facebook authentication failed', error);
      return {
        success: false,
        error: { message: 'Facebook authentication failed', code: 'FACEBOOK_AUTH_ERROR' }
      };
    }
  }



  /**
   * Verify Apple ID token (mock implementation)
   * In production, use Apple's token verification
   */
  private static async verifyAppleToken(idToken: string): Promise<any> {
    try {
      // Mock implementation - in production, verify Apple JWT token
      if (idToken.startsWith('mock_apple_')) {
        return {
          email: 'user@privaterelay.appleid.com',
          name: {
            firstName: 'John',
            lastName: 'Doe'
          }
        };
      }
      return null;
    } catch (error) {
      logger.error('Apple token verification failed', error);
      return null;
    }
  }

  /**
   * Verify Facebook access token (mock implementation)
   * In production, use Facebook Graph API
   */
  private static async verifyFacebookToken(accessToken: string): Promise<any> {
    try {
      // Mock implementation - in production, call Facebook Graph API:
      // const response = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email,picture`);
      // return await response.json();

      if (accessToken.startsWith('mock_facebook_')) {
        return {
          email: 'user@facebook.com',
          first_name: 'John',
          last_name: 'Doe',
          picture: {
            data: {
              url: 'https://example.com/avatar.jpg'
            }
          }
        };
      }
      return null;
    } catch (error) {
      logger.error('Facebook token verification failed', error);
      return null;
    }
  }

  /**
   * Google OAuth authentication
   */
  static async googleAuth(data: {
    idToken: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
  }): Promise<{
    success: boolean;
    user?: UserProfile;
    tokens?: AuthTokens;
    isNewUser?: boolean;
    error?: { message: string; code?: string };
  }> {
    try {
      // Verify Google ID token (simplified for now)
      const googleUser = await this.verifyGoogleToken(data.idToken);

      if (!googleUser || googleUser.email !== data.email) {
        logger.warn('Google token verification failed', { email: data.email });
        return {
          success: false,
          error: {
            message: 'Invalid Google token',
            code: 'INVALID_TOKEN'
          }
        };
      }

      // Check if user already exists
      let user = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      let isNewUser = false;

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: data.email.toLowerCase(),
            firstName: data.firstName,
            lastName: data.lastName,
            passwordHash: '', // No password for Google auth users
            role: UserRole.STUDENT, // Google auth is only for students
            status: UserStatus.ACTIVE,
            subscriptionTier: SubscriptionTier.FREE,
            profileImage: data.profileImage,
            emailVerifiedAt: new Date(), // Google accounts are pre-verified
            lastLoginAt: new Date()
          }
        });

        isNewUser = true;
        logger.info('User registered successfully with Google', {
          userId: user.id,
          email: user.email
        });
      } else {
        // Update existing user's last login and profile image if provided
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            ...(data.profileImage && { profileImage: data.profileImage })
          }
        });

        logger.info('User logged in successfully with Google', {
          userId: user.id,
          email: user.email
        });
      }

      // Ensure user is a student (Google auth is only for students)
      if (user.role !== UserRole.STUDENT) {
        logger.warn('Non-student attempted Google authentication', {
          userId: user.id,
          role: user.role
        });
        return {
          success: false,
          error: {
            message: 'Google authentication is only available for students',
            code: 'INVALID_ROLE'
          }
        };
      }

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier
      };

      const accessToken = JWTService.generateAccessToken(tokenPayload);
      const refreshToken = JWTService.generateRefreshToken(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      // Convert to UserProfile (exclude passwordHash)
      const { passwordHash, ...userProfile } = user as any;

      // Add missing fields that might be expected by UserProfile
      const completeUserProfile: UserProfile = {
        ...userProfile,
        dateOfBirth: userProfile.dateOfBirth || null,
        preferences: userProfile.preferences || null
      };

      return {
        success: true,
        user: completeUserProfile,
        tokens: { accessToken, refreshToken },
        isNewUser
      };

    } catch (error: any) {
      logger.error('Google authentication failed', error);
      return {
        success: false,
        error: {
          message: error.message || 'Google authentication failed',
          code: 'GOOGLE_AUTH_ERROR'
        }
      };
    }
  }

  /**
   * Verify Firebase ID token using Firebase Admin SDK
   */
  private static async verifyGoogleToken(idToken: string): Promise<any> {
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      if (!decodedToken) {
        logger.warn('Firebase token verification failed: No decoded token');
        return null;
      }

      logger.info('Firebase token verified successfully', {
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        uid: decodedToken.uid
      });

      return {
        email: decodedToken.email,
        email_verified: decodedToken.email_verified,
        given_name: decodedToken.name?.split(' ')[0] || '',
        family_name: decodedToken.name?.split(' ').slice(1).join(' ') || '',
        picture: decodedToken.picture,
        uid: decodedToken.uid
      };
    } catch (error) {
      logger.error('Firebase token verification failed', error);
      return null;
    }
  }

  /**
   * Generate a 6-digit password reset code
   */
  private static generateResetCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Request password reset - generates code and sends via email or SMS
   */
  static async requestPasswordReset(data: { email?: string; phone?: string; method: 'email' | 'phone'; lang?: 'fr' | 'en' }): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Find user by email or phone
      let user;
      if (data.method === 'email' && data.email) {
        user = await prisma.user.findUnique({
          where: { email: data.email.toLowerCase() }
        });
      } else if (data.method === 'phone' && data.phone) {
        // Normalize phone number (remove spaces, dashes, etc.)
        const normalizedPhone = data.phone.replace(/[\s\-\(\)]/g, '');
        user = await prisma.user.findFirst({
          where: {
            phone: {
              contains: normalizedPhone
            }
          }
        });
      }

      // Don't reveal if user exists or not (security best practice)
      if (!user) {
        // Still return success to prevent user enumeration
        logger.warn('Password reset requested for non-existent user', {
          method: data.method,
          identifier: data.method === 'email' ? data.email : data.phone
        });
        return {
          success: true,
          message: 'If an account exists with this information, a reset code has been sent.'
        };
      }

      // Check if user has password (social auth users might not have password)
      if (!user.passwordHash) {
        return {
          success: false,
          error: 'This account does not have a password set. Please use social login.'
        };
      }

      // Generate 6-digit code
      const code = this.generateResetCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes expiration

      // Invalidate any existing reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          used: false,
          expiresAt: {
            gt: new Date()
          }
        },
        data: {
          used: true
        }
      });

      // Create new reset token
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          code,
          email: data.method === 'email' ? data.email : null,
          phone: data.method === 'phone' ? data.phone : null,
          method: data.method,
          expiresAt
        }
      });

      // Send code via email or SMS
      if (data.method === 'email' && data.email) {
        const emailSent = await EmailService.sendPasswordResetCode({
          email: data.email,
          code,
          firstName: user.firstName,
          lang: data.lang || 'fr'
        });

        if (!emailSent) {
          logger.error('Failed to send password reset email', { userId: user.id, email: data.email });
          // Don't fail the request, but log the error
        }
      } else if (data.method === 'phone' && data.phone) {
        const isFrench = data.lang !== 'en';
        const smsResult = isFrench
          ? await TwilioService.sendPasswordResetCode(data.phone, code, user.firstName)
          : await TwilioService.sendPasswordResetCodeEn(data.phone, code, user.firstName);

        if (!smsResult.success) {
          logger.error('Failed to send password reset SMS', {
            userId: user.id,
            phone: data.phone,
            error: smsResult.error
          });
          // Don't fail the request, but log the error
        }
      }

      logger.info('Password reset code generated', {
        userId: user.id,
        method: data.method,
        expiresAt: resetToken.expiresAt
      });

      return {
        success: true,
        message: 'If an account exists with this information, a reset code has been sent.'
      };
    } catch (error: any) {
      logger.error('Failed to request password reset', {
        error: error.message,
        method: data.method
      });
      return {
        success: false,
        error: 'Failed to process password reset request'
      };
    }
  }

  /**
   * Verify password reset code
   */
  static async verifyPasswordResetCode(data: { code: string; email?: string; phone?: string; method: 'email' | 'phone' }): Promise<{ success: boolean; tokenId?: string; error?: string }> {
    try {
      // Find the reset token
      const whereClause: any = {
        code: data.code,
        used: false,
        expiresAt: {
          gt: new Date()
        },
        method: data.method
      };

      if (data.method === 'email' && data.email) {
        whereClause.email = data.email.toLowerCase();
      } else if (data.method === 'phone' && data.phone) {
        const normalizedPhone = data.phone.replace(/[\s\-\(\)]/g, '');
        whereClause.phone = {
          contains: normalizedPhone
        };
      }

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!resetToken) {
        // Increment attempts for security tracking
        await prisma.passwordResetToken.updateMany({
          where: {
            code: data.code,
            used: false
          },
          data: {
            attempts: {
              increment: 1
            }
          }
        });

        return {
          success: false,
          error: 'Invalid or expired reset code'
        };
      }

      // Check if too many attempts
      if (resetToken.attempts >= 5) {
        await prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true }
        });
        return {
          success: false,
          error: 'Too many failed attempts. Please request a new code.'
        };
      }

      logger.info('Password reset code verified', {
        tokenId: resetToken.id,
        userId: resetToken.userId
      });

      return {
        success: true,
        tokenId: resetToken.id
      };
    } catch (error: any) {
      logger.error('Failed to verify password reset code', {
        error: error.message
      });
      return {
        success: false,
        error: 'Failed to verify reset code'
      };
    }
  }

  /**
   * Reset password using verified code
   */
  static async resetPassword(data: { tokenId: string; newPassword: string }): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Find the reset token
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { id: data.tokenId },
        include: { user: true }
      });

      if (!resetToken) {
        return {
          success: false,
          error: 'Invalid reset token'
        };
      }

      if (resetToken.used) {
        return {
          success: false,
          error: 'This reset code has already been used'
        };
      }

      if (resetToken.expiresAt < new Date()) {
        return {
          success: false,
          error: 'Reset code has expired'
        };
      }

      // Validate new password
      const passwordValidation = PasswordService.validatePasswordStrength(data.newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: `Password validation failed: ${passwordValidation.errors.join(', ')}`
        };
      }

      // Hash new password
      const passwordHash = await PasswordService.hashPassword(data.newPassword, resetToken.user.role);

      // Update user password
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash }
      });

      // Mark reset token as used
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      });

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId: resetToken.userId }
      });

      logger.info('Password reset successfully', {
        userId: resetToken.userId
      });

      return {
        success: true,
        message: 'Password has been reset successfully'
      };
    } catch (error: any) {
      logger.error('Failed to reset password', {
        error: error.message
      });
      return {
        success: false,
        error: 'Failed to reset password'
      };
    }
  }

  /**
   * Resend password reset code
   */
  static async resendPasswordResetCode(data: { email?: string; phone?: string; method: 'email' | 'phone'; lang?: 'fr' | 'en' }): Promise<{ success: boolean; message?: string; error?: string }> {
    // Rate limiting: Check if user requested reset in last 60 seconds
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    let recentRequest;
    if (data.method === 'email' && data.email) {
      recentRequest = await prisma.passwordResetToken.findFirst({
        where: {
          email: data.email.toLowerCase(),
          createdAt: {
            gte: oneMinuteAgo
          }
        }
      });
    } else if (data.method === 'phone' && data.phone) {
      const normalizedPhone = data.phone.replace(/[\s\-\(\)]/g, '');
      recentRequest = await prisma.passwordResetToken.findFirst({
        where: {
          phone: {
            contains: normalizedPhone
          },
          createdAt: {
            gte: oneMinuteAgo
          }
        }
      });
    }

    if (recentRequest) {
      return {
        success: false,
        error: 'Please wait 60 seconds before requesting a new code'
      };
    }

    // Reuse the same logic as requestPasswordReset
    return this.requestPasswordReset(data);
  }
}
