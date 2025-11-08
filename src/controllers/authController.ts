import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, LoginRequest, RegisterRequest, RefreshTokenRequest } from '@/types';
import { logger } from '@/utils/logger';
import '@/middleware/auth'; // Import to extend Request interface

export class AuthController {
  /**
   * Register a new user
   */
  static register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const registerData: RegisterRequest = req.body;

    const result = await AuthService.register(registerData);

    const response: ApiResponse = {
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens
      },
      message: 'User registered successfully'
    };

    logger.info('User registration successful', {
      userId: result.user.id,
      email: result.user.email
    });

    res.status(201).json(response);
  });

  /**
   * Register a new admin user
   */
  static registerAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const registerData: RegisterRequest = req.body;

    const result = await AuthService.registerAdmin(registerData);

    const response: ApiResponse = {
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens
      },
      message: 'Admin user registered successfully'
    };

    logger.info('Admin registration successful', {
      userId: result.user.id,
      email: result.user.email
    });

    res.status(201).json(response);
  });

  /**
   * Login user
   */
  static login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const loginData: LoginRequest = req.body;

    const result = await AuthService.login(loginData);

    const response: ApiResponse = {
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens
      },
      message: 'Login successful'
    };

    logger.info('User login successful', { 
      userId: result.user.id, 
      email: result.user.email 
    });

    res.status(200).json(response);
  });

  /**
   * Refresh access token
   */
  static refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshData: RefreshTokenRequest = req.body;

    const tokens = await AuthService.refreshToken(refreshData);

    const response: ApiResponse = {
      success: true,
      data: { tokens },
      message: 'Token refreshed successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Logout user
   */
  static logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Logout successful'
    };

    res.status(200).json(response);
  });

  /**
   * Logout from all devices
   */
  static logoutAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await AuthService.logoutAll(userId);

    const response: ApiResponse = {
      success: true,
      message: 'Logged out from all devices successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get current user profile
   */
  static getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const user = await AuthService.getUserProfile(userId);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'Profile retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Verify token (for frontend to check if token is still valid)
   */
  static verifyToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // If we reach here, the token is valid (middleware already verified it)
    const response: ApiResponse = {
      success: true,
      data: {
        user: req.user,
        isValid: true
      },
      message: 'Token is valid'
    };

    res.status(200).json(response);
  });

  /**
   * Update user activity timestamp
   */
  static updateActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await AuthService.updateUserActivity(userId);

    const response: ApiResponse = {
      success: true,
      data: { lastActivityAt: new Date() },
      message: 'Activity updated successfully'
    };

    res.status(200).json(response);
  });



  /**
   * Apple OAuth authentication
   */
  static appleAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { idToken } = req.body;

    const result = await AuthService.authenticateWithApple(idToken);

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        data: result.data,
        message: 'Apple authentication successful'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: result.error
      };
      res.status(400).json(response);
    }
  });

  /**
   * Facebook OAuth authentication
   */
  static facebookAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { idToken } = req.body;

    const result = await AuthService.authenticateWithFacebook(idToken);

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        data: result.data,
        message: 'Facebook authentication successful'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: result.error
      };
      res.status(400).json(response);
    }
  });

  /**
   * Google OAuth authentication
   */
  static googleAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { idToken, email, firstName, lastName, profileImage } = req.body;

    const result = await AuthService.googleAuth({
      idToken,
      email,
      firstName,
      lastName,
      profileImage
    });

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens
        },
        message: result.isNewUser ? 'User registered successfully with Google' : 'User logged in successfully with Google'
      };

      logger.info('Google authentication successful', {
        userId: result.user?.id,
        email: result.user?.email,
        isNewUser: result.isNewUser
      });

      res.status(result.isNewUser ? 201 : 200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: result.error
      };
      res.status(400).json(response);
    }
  });

  /**
   * Health check for auth service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'auth',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Auth service is healthy'
    };

    res.status(200).json(response);
  });

  /**
   * Request password reset
   */
  static forgotPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { method, email, phone, lang } = req.body;

    const result = await AuthService.requestPasswordReset({
      method,
      email,
      phone,
      lang: lang || 'fr'
    });

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        message: result.message || 'Password reset code sent successfully'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: { message: result.error || 'Failed to send password reset code' }
      };
      res.status(400).json(response);
    }
  });

  /**
   * Verify password reset code
   */
  static verifyResetCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, method, email, phone } = req.body;

    const result = await AuthService.verifyPasswordResetCode({
      code,
      method,
      email,
      phone
    });

    if (result.success && result.tokenId) {
      const response: ApiResponse = {
        success: true,
        data: {
          tokenId: result.tokenId
        },
        message: 'Reset code verified successfully'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: { message: result.error || 'Invalid or expired reset code' }
      };
      res.status(400).json(response);
    }
  });

  /**
   * Reset password
   */
  static resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tokenId, newPassword } = req.body;

    const result = await AuthService.resetPassword({
      tokenId,
      newPassword
    });

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        message: result.message || 'Password reset successfully'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: { message: result.error || 'Failed to reset password' }
      };
      res.status(400).json(response);
    }
  });

  /**
   * Resend password reset code
   */
  static resendResetCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { method, email, phone, lang } = req.body;

    const result = await AuthService.resendPasswordResetCode({
      method,
      email,
      phone,
      lang: lang || 'fr'
    });

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        message: result.message || 'Reset code resent successfully'
      };
      res.status(200).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        error: { message: result.error || 'Failed to resend reset code' }
      };
      res.status(400).json(response);
    }
  });
}
