import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ManagerController } from '@/controllers/managerController';
import { SettingsService } from '@/services/settingsService';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate, requireManager } from '@/middleware/auth';
import Joi from 'joi';

const prisma = new PrismaClient();

const router = Router();

// Validation schemas
const messageSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  message: Joi.string().min(1).max(2000).required(),
  type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR').default('INFO')
});

const contentSchema = Joi.object({
  type: Joi.string().valid('post', 'course', 'test').required(),
  title: Joi.string().min(1).max(200).required(),
  content: Joi.string().min(1).required(),
  excerpt: Joi.string().max(500).optional(),
  category: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
  targetTier: Joi.string().valid('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE').default('FREE')
});

const updateContentSchema = Joi.object({
  type: Joi.string().valid('post', 'course', 'test').required(),
  title: Joi.string().min(1).max(200).optional(),
  content: Joi.string().min(1).optional(),
  excerpt: Joi.string().max(500).optional(),
  category: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
  targetTier: Joi.string().valid('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE').optional()
});

const reportConfigSchema = Joi.object({
  type: Joi.string().valid('content', 'users', 'engagement', 'performance').required(),
  timeframe: Joi.string().valid('7d', '30d', '90d', '1y').default('30d'),
  filters: Joi.object().optional(),
  format: Joi.string().valid('pdf', 'csv', 'excel').default('pdf')
});

/**
 * @route   GET /api/manager/dashboard
 * @desc    Get manager dashboard data
 * @access  Private (Manager+)
 */
router.get('/dashboard', authenticate, requireManager, ManagerController.getDashboard);

/**
 * @route   GET /api/manager/metrics
 * @desc    Get manager performance metrics
 * @access  Private (Manager+)
 */
router.get('/metrics', authenticate, requireManager, ManagerController.getMetrics);

/**
 * @route   GET /api/manager/activity
 * @desc    Get recent manager activity
 * @access  Private (Manager+)
 */
router.get('/activity', authenticate, requireManager, ManagerController.getActivity);

/**
 * @route   GET /api/manager/analytics
 * @desc    Get manager analytics
 * @access  Private (Manager+)
 */
router.get('/analytics', authenticate, requireManager, ManagerController.getAnalytics);

/**
 * @route   POST /api/manager/analytics/reports
 * @desc    Generate manager report
 * @access  Private (Manager+)
 */
router.post('/analytics/reports',
  authenticate,
  requireManager,
  validate(reportConfigSchema),
  ManagerController.generateReport
);

/**
 * @route   GET /api/manager/analytics/export
 * @desc    Export manager data
 * @access  Private (Manager+)
 */
router.get('/analytics/export', authenticate, requireManager, ManagerController.exportData);

/**
 * @route   GET /api/manager/students
 * @desc    Get students managed by this manager
 * @access  Private (Manager+)
 */
router.get('/students', authenticate, requireManager, ManagerController.getManagedUsers);

/**
 * @route   GET /api/manager/users
 * @desc    Get users managed by this manager
 * @access  Private (Manager+)
 */
router.get('/users', authenticate, requireManager, ManagerController.getManagedUsers);

/**
 * @route   GET /api/manager/users/:userId/analytics
 * @desc    Get user analytics for managed users
 * @access  Private (Manager+)
 */
router.get('/users/:userId/analytics',
  authenticate,
  requireManager,
  validateParams({ userId: commonSchemas.id }),
  ManagerController.getUserAnalytics
);

/**
 * @route   POST /api/manager/users/:userId/message
 * @desc    Send message to user
 * @access  Private (Manager+)
 */
router.post('/users/:userId/message',
  authenticate,
  requireManager,
  validateParams({ userId: commonSchemas.id }),
  validate(messageSchema),
  ManagerController.sendMessageToUser
);

/**
 * @route   GET /api/manager/content
 * @desc    Get content library for manager
 * @access  Private (Manager+)
 */
router.get('/content', authenticate, requireManager, ManagerController.getContentLibrary);

/**
 * @route   POST /api/manager/content
 * @desc    Create new content
 * @access  Private (Manager+)
 */
router.post('/content',
  authenticate,
  requireManager,
  validate(contentSchema),
  ManagerController.createContent
);

/**
 * @route   PUT /api/manager/content/:contentId
 * @desc    Update content
 * @access  Private (Manager+)
 */
router.put('/content/:contentId',
  authenticate,
  requireManager,
  validateParams({ contentId: commonSchemas.id }),
  validate(updateContentSchema),
  ManagerController.updateContent
);

/**
 * @route   POST /api/manager/content/:contentId/publish
 * @desc    Publish content
 * @access  Private (Manager+)
 */
router.post('/content/:contentId/publish',
  authenticate,
  requireManager,
  validateParams({ contentId: commonSchemas.id }),
  ManagerController.publishContent
);

/**
 * @route   GET /api/manager/content/:contentId/analytics
 * @desc    Get content analytics
 * @access  Private (Manager+)
 */
router.get('/content/:contentId/analytics',
  authenticate,
  requireManager,
  validateParams({ contentId: commonSchemas.id }),
  ManagerController.getContentAnalytics
);

/**
 * @route   GET /api/manager/health
 * @desc    Manager service health check
 * @access  Public
 */
router.get('/health', ManagerController.healthCheck);

/**
 * @route   GET /api/manager/settings
 * @desc    Get manager settings
 * @access  Private (Manager+)
 */
router.get('/settings', authenticate, requireManager, async (req, res, next) => {
  try {
    const settings = await SettingsService.getManagerSettings(req.user!.userId);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/manager/settings
 * @desc    Update manager settings
 * @access  Private (Manager+)
 */
router.put('/settings', authenticate, requireManager, async (req, res, next) => {
  try {
    const settings = await SettingsService.updateManagerSettings(req.user!.userId, req.body);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/manager/marketplace/profile
 * @desc Get marketplace profile for manager
 * @access Private (Manager+)
 */
router.get('/marketplace/profile', authenticate, requireManager, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    console.log('📋 Manager marketplace profile GET request for userId:', userId);

    // Use MarketplaceService to get the complete profile with all saved data
    const { MarketplaceService } = await import('../services/marketplaceService');
    const result = await MarketplaceService.getTutorProfile(userId);

    if (!result.success) {
      console.error('❌ Failed to get tutor profile:', result.error);
      return res.status(result.error?.statusCode || 500).json(result);
    }

    console.log('✅ Manager marketplace profile loaded successfully:', {
      userId,
      hasProfile: !!result.data,
      bio: result.data?.bio?.substring(0, 50),
      location: result.data?.location,
      title: result.data?.title,
      phone: result.data?.phone,
      website: result.data?.website
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Error in manager marketplace profile GET:', error);
    next(error);
  }
});

/**
 * @route POST /api/manager/marketplace/activate
 * @desc Activate/deactivate marketplace profile for manager
 * @access Private (Manager+)
 */
router.post('/marketplace/activate', authenticate, requireManager, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { isActive } = req.body;

    console.log('🔧 Manager marketplace activation request:', { userId, isActive });

    // Use the MarketplaceService to properly activate/deactivate the profile
    const { MarketplaceService } = await import('../services/marketplaceService');
    const result = await MarketplaceService.activateTutorProfile(userId, isActive);

    if (!result.success) {
      return res.status(result.error?.statusCode || 500).json(result);
    }

    console.log('✅ Manager marketplace profile activation successful:', result);

    res.json(result);
  } catch (error) {
    console.error('❌ Error in manager marketplace activation:', error);
    next(error);
  }
});

/**
 * @route GET /api/manager/marketplace/requests
 * @desc Get all pending review requests for manager
 * @access Private (Manager+)
 * @deprecated This route is deprecated - use /api/manager/marketplace/requests from marketplaceRoutes.ts instead
 */
// DISABLED: This route conflicts with marketplaceRoutes.ts which properly handles marketplace requests
// The marketplaceRoutes.ts handler uses the MarketplaceRequest model correctly
// router.get('/marketplace/requests', authenticate, requireManager, async (req, res, next) => {
//   try {
//     const userId = req.user!.userId;
//
//     // Get all pending review requests
//     const pendingRequests = await prisma.aIFeedback.findMany({
//       where: {
//         status: 'PENDING_HUMAN'
//       },
//       include: {
//         user: {
//           select: {
//             id: true,
//             firstName: true,
//             lastName: true,
//             email: true,
//             subscriptionTier: true
//           }
//         },
//         simulationResult: {
//           include: {
//             testAttempt: {
//               include: {
//                 test: {
//                   select: {
//                     title: true,
//                     type: true
//                   }
//                 }
//               }
//             }
//           }
//         }
//       },
//       orderBy: { createdAt: 'desc' }
//     });
//
//     const requests = pendingRequests.map(request => ({
//       id: request.id,
//       studentId: request.userId,
//       studentName: `${request.user.firstName} ${request.user.lastName}`,
//       studentEmail: request.user.email,
//       subscriptionPlan: request.user.subscriptionTier || 'FREE',
//       simulationTitle: request.simulationResult?.testAttempt?.test?.title || 'Unknown',
//       simulationType: request.simulationResult?.testAttempt?.test?.type || 'Unknown',
//       submissionType: request.submissionType,
//       submissionContent: request.submissionContent,
//       submissionFileUrl: request.submissionFileUrl,
//       aiScore: request.aiScore,
//       aiConfidence: request.aiConfidence,
//       overallFeedback: request.overallFeedback,
//       strengths: request.strengths,
//       weaknesses: request.weaknesses,
//       recommendations: request.recommendations,
//       submissionDate: request.createdAt,
//       priority: 'normal'
//     }));
//
//     res.json({
//       success: true,
//       data: requests
//     });
//   } catch (error) {
//     next(error);
//   }
// });

export { router as managerRoutes };
