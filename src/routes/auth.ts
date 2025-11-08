import { Router } from 'express';
import { AuthController } from '@/controllers/authController';
import { validate, authSchemas } from '@/middleware/validation';
import { authenticate } from '@/middleware/auth';
import TemporaryTokenService from '@/services/temporaryTokenService';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validate(authSchemas.register), AuthController.register);

/**
 * @route   POST /api/auth/register-admin
 * @desc    Register new admin user (for testing/setup)
 * @access  Public (should be restricted in production)
 */
router.post('/register-admin', validate(authSchemas.register), AuthController.registerAdmin);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validate(authSchemas.login), AuthController.login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', validate(authSchemas.refreshToken), AuthController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Public
 */
router.post('/logout', AuthController.logout);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authenticate, AuthController.logoutAll);

/**
 * @route   POST /api/auth/social/google
 * @desc    Google OAuth authentication
 * @access  Public
 */
router.post('/social/google', validate(authSchemas.googleAuth), AuthController.googleAuth);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticate, AuthController.getProfile);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if token is valid
 * @access  Private
 */
router.get('/verify', authenticate, AuthController.verifyToken);

/**
 * @route   POST /api/auth/activity
 * @desc    Update user activity timestamp
 * @access  Private
 */
router.post('/activity', authenticate, AuthController.updateActivity);

/**
 * @route   POST /api/auth/social/google
 * @desc    Google OAuth authentication
 * @access  Public
 */
router.post('/social/google', validate(authSchemas.socialAuth), AuthController.googleAuth);

/**
 * @route   POST /api/auth/social/apple
 * @desc    Apple OAuth authentication
 * @access  Public
 */
router.post('/social/apple', validate(authSchemas.socialAuth), AuthController.appleAuth);

/**
 * @route   POST /api/auth/social/facebook
 * @desc    Facebook OAuth authentication
 * @access  Public
 */
router.post('/social/facebook', validate(authSchemas.socialAuth), AuthController.facebookAuth);

/**
 * @route   POST /api/auth/generate-temporary-token
 * @desc    Generate temporary token for email links
 * @access  Private
 */
router.post('/generate-temporary-token', authenticate, async (req, res) => {
  try {
    const { userId, simulationId, purpose } = req.body;

    // Determine simulation type from purpose
    let simulationType: 'voice' | 'immigration';
    if (purpose === 'voice_simulation_access') {
      simulationType = 'voice';
    } else if (purpose === 'immigration_simulation_access') {
      simulationType = 'immigration';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid purpose. Must be voice_simulation_access or immigration_simulation_access'
      });
    }

    // Generate temporary token
    const token = await TemporaryTokenService.generateToken(
      userId,
      simulationId,
      simulationType,
      2 // 2 hours expiration
    );

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    res.json({
      success: true,
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        purpose,
        simulationType
      }
    });
  } catch (error: any) {
    console.error('Error generating temporary token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate temporary token'
    });
  }
});

/**
 * @route   GET /api/auth/health
 * @desc    Auth service health check
 * @access  Public
 */
router.get('/health', AuthController.healthCheck);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset code via email or SMS
 * @access  Public
 */
router.post('/forgot-password', validate(authSchemas.forgotPassword), AuthController.forgotPassword);

/**
 * @route   POST /api/auth/verify-reset-code
 * @desc    Verify password reset code
 * @access  Public
 */
router.post('/verify-reset-code', validate(authSchemas.verifyResetCode), AuthController.verifyResetCode);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using verified code
 * @access  Public
 */
router.post('/reset-password', validate(authSchemas.resetPassword), AuthController.resetPassword);

/**
 * @route   POST /api/auth/resend-reset-code
 * @desc    Resend password reset code
 * @access  Public
 */
router.post('/resend-reset-code', validate(authSchemas.resendResetCode), AuthController.resendResetCode);

export { router as authRoutes };
