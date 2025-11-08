import { Router } from 'express';
import { AdminController } from '@/controllers/adminController';
import { SettingsService } from '@/services/settingsService';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate, requireAdmin, requireSeniorManager } from '@/middleware/auth';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createManagerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('JUNIOR_MANAGER', 'SENIOR_MANAGER').required(),
  phone: Joi.string().optional(),
  specialties: Joi.array().items(Joi.string()).optional()
});

const updateManagerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  password: Joi.string().min(8).optional(),
  role: Joi.string().valid('JUNIOR_MANAGER', 'SENIOR_MANAGER').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional()
});

const reportConfigSchema = Joi.object({
  type: Joi.string().valid('users', 'courses', 'tests', 'revenue', 'engagement').required(),
  timeframe: Joi.string().valid('7d', '30d', '90d', '1y').default('30d'),
  filters: Joi.object().optional(),
  format: Joi.string().valid('pdf', 'csv', 'excel').default('pdf')
});

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard data
 * @access  Private (Admin)
 */
router.get('/dashboard', authenticate, requireAdmin, AdminController.getDashboard);

/**
 * @route   GET /api/admin/system/health
 * @desc    Get system health metrics
 * @access  Private (Admin)
 */
router.get('/system/health', authenticate, requireAdmin, AdminController.getSystemHealth);

/**
 * @route   GET /api/admin/metrics/business
 * @desc    Get business metrics
 * @access  Private (Admin)
 */
router.get('/metrics/business', authenticate, requireAdmin, AdminController.getBusinessMetrics);

/**
 * @route   GET /api/admin/metrics/technical
 * @desc    Get technical metrics
 * @access  Private (Admin)
 */
router.get('/metrics/technical', authenticate, requireAdmin, AdminController.getTechnicalMetrics);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with advanced filtering
 * @access  Private (Admin)
 */
router.get('/users', authenticate, requireAdmin, AdminController.getAllUsers);

/**
 * @route   GET /api/admin/users/:userId/analytics
 * @desc    Get user analytics
 * @access  Private (Admin)
 */
router.get('/users/:userId/analytics',
  authenticate,
  requireAdmin,
  validateParams({ userId: commonSchemas.id }),
  AdminController.getUserAnalytics
);

/**
 * @route   GET /api/admin/managers
 * @desc    Get managers list
 * @access  Private (Admin)
 */
router.get('/managers', authenticate, requireAdmin, AdminController.getManagers);

/**
 * @route   POST /api/admin/managers
 * @desc    Create new manager
 * @access  Private (Admin)
 */
router.post('/managers',
  authenticate,
  requireAdmin,
  validate(createManagerSchema),
  AdminController.createManager
);

/**
 * @route   PUT /api/admin/managers/:managerId
 * @desc    Update manager
 * @access  Private (Admin)
 */
router.put('/managers/:managerId',
  authenticate,
  requireAdmin,
  validateParams({ managerId: commonSchemas.id }),
  validate(updateManagerSchema),
  AdminController.updateManager
);

/**
 * @route   GET /api/admin/managers/:managerId/performance
 * @desc    Get manager performance analytics
 * @access  Private (Admin)
 */
router.get('/managers/:managerId/performance',
  authenticate,
  requireAdmin,
  validateParams({ managerId: commonSchemas.id }),
  AdminController.getManagerPerformance
);

/**
 * @route   DELETE /api/admin/managers/:managerId
 * @desc    Delete manager
 * @access  Private (Admin)
 */
router.delete('/managers/:managerId',
  authenticate,
  requireAdmin,
  validateParams({ managerId: commonSchemas.id }),
  AdminController.deleteManager
);

/**
 * @route   GET /api/admin/statistics
 * @desc    Get admin profile statistics
 * @access  Private (Admin)
 */
router.get('/statistics', authenticate, requireAdmin, AdminController.getStatistics);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get analytics data
 * @access  Private (Admin)
 */
router.get('/analytics', authenticate, requireAdmin, AdminController.getAnalytics);

/**
 * @route   POST /api/admin/analytics/reports
 * @desc    Generate custom report
 * @access  Private (Admin)
 */
router.post('/analytics/reports',
  authenticate,
  requireAdmin,
  validate(reportConfigSchema),
  AdminController.generateReport
);

/**
 * @route   GET /api/admin/analytics/export
 * @desc    Export analytics data
 * @access  Private (Admin)
 */
router.get('/analytics/export', authenticate, requireAdmin, AdminController.exportData);

/**
 * @route   GET /api/admin/health
 * @desc    Admin service health check
 * @access  Public
 */
router.get('/health', AdminController.healthCheck);

/**
 * @route   GET /api/admin/settings
 * @desc    Get admin settings
 * @access  Admin only
 */
router.get('/settings', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const settings = await SettingsService.getAdminSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/settings
 * @desc    Update admin settings
 * @access  Admin only
 */
router.put('/settings', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const settings = await SettingsService.updateAdminSettings(req.body);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/review-requests
 * @desc    Get all review requests for admin/senior managers
 * @access  Private (Admin/Senior Manager only)
 */
router.get('/review-requests', authenticate, requireSeniorManager, AdminController.getReviewRequests);

/**
 * @route   POST /api/admin/review-requests/:id/action
 * @desc    Handle review request (accept/reject/complete)
 * @access  Private (Admin/Senior Manager only)
 */
router.post('/review-requests/:id/action',
  authenticate,
  requireSeniorManager,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    }),
    body: Joi.object({
      action: Joi.string().valid('accept', 'reject', 'complete').required(),
      response: Joi.string().optional(),
      humanFeedback: Joi.string().optional(),
      humanScore: Joi.number().min(0).max(100).optional()
    })
  }),
  AdminController.handleReviewRequest
);

/**
 * @route   POST /api/admin/subscription-plans
 * @desc    Create a new subscription plan
 * @access  Private (Admin only)
 */
router.post('/subscription-plans',
  authenticate,
  requireAdmin,
  validate({
    body: Joi.object({
      name: Joi.string().required(),
      nameEn: Joi.string().optional(),
      description: Joi.string().required(),
      descriptionEn: Joi.string().optional(),
      tier: Joi.string().valid('FREE', 'ESSENTIAL', 'PREMIUM', 'PRO').required(),
      price: Joi.number().min(0).required(),
      currency: Joi.string().default('FCFA'),
      billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').default('monthly'),
      features: Joi.array().items(Joi.string()).default([]),
      featuresEn: Joi.array().items(Joi.string()).default([]),
      maxSimulations: Joi.number().min(0).optional(),
      maxLiveSessions: Joi.number().min(0).optional(),
      maxCourses: Joi.number().min(0).optional(),
      maxTests: Joi.number().min(0).optional(),
      isActive: Joi.boolean().default(true),
      isPopular: Joi.boolean().default(false),
      sortOrder: Joi.number().default(0),
      stripePriceId: Joi.string().optional()
    })
  }),
  AdminController.createSubscriptionPlan
);

/**
 * @route   GET /api/admin/subscription-plans
 * @desc    Get all subscription plans
 * @access  Private (Admin only)
 */
router.get('/subscription-plans',
  authenticate,
  requireAdmin,
  AdminController.getSubscriptionPlans
);

/**
 * @route   GET /api/admin/subscription-plans/:id
 * @desc    Get subscription plan by ID
 * @access  Private (Admin only)
 */
router.get('/subscription-plans/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.getSubscriptionPlanById
);

/**
 * @route   PUT /api/admin/subscription-plans/:id
 * @desc    Update subscription plan
 * @access  Private (Admin only)
 */
router.put('/subscription-plans/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    }),
    body: Joi.object({
      name: Joi.string().optional(),
      nameEn: Joi.string().optional(),
      description: Joi.string().optional(),
      descriptionEn: Joi.string().optional(),
      tier: Joi.string().valid('FREE', 'ESSENTIAL', 'PREMIUM', 'PRO').optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().optional(),
      billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').optional(),
      features: Joi.array().items(Joi.string()).optional(),
      featuresEn: Joi.array().items(Joi.string()).optional(),
      maxSimulations: Joi.number().min(-1).allow(null).optional(),
      maxLiveSessions: Joi.number().min(-1).allow(null).optional(),
      maxCourses: Joi.number().min(-1).allow(null).optional(),
      maxTests: Joi.number().min(-1).allow(null).optional(),
      isActive: Joi.boolean().optional(),
      isPopular: Joi.boolean().optional(),
      sortOrder: Joi.number().optional(),
      stripePriceId: Joi.string().optional()
    })
  }),
  AdminController.updateSubscriptionPlan
);

/**
 * @route   DELETE /api/admin/subscription-plans/:id
 * @desc    Delete subscription plan
 * @access  Private (Admin only)
 */
router.delete('/subscription-plans/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.deleteSubscriptionPlan
);

/**
 * @route   GET /api/admin/subscription-analytics
 * @desc    Get subscription analytics
 * @access  Private (Admin only)
 */
router.get('/subscription-analytics',
  authenticate,
  requireAdmin,
  AdminController.getSubscriptionAnalytics
);

// ===== AUDIO SIMULATION MANAGEMENT =====

/**
 * @route   GET /api/admin/audio-simulations
 * @desc    Get all audio simulations with filtering
 * @access  Private (Admin only)
 */
router.get('/audio-simulations',
  authenticate,
  requireAdmin,
  validate({
    query: Joi.object({
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
      status: Joi.string().valid('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED').optional(),
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
      search: Joi.string().optional()
    })
  }),
  AdminController.getAudioSimulations
);

/**
 * @route   GET /api/admin/audio-simulations/:id
 * @desc    Get specific audio simulation details
 * @access  Private (Admin only)
 */
router.get('/audio-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.getAudioSimulation
);

/**
 * @route   POST /api/admin/audio-simulations
 * @desc    Create new audio simulation template
 * @access  Private (Admin only)
 */
router.post('/audio-simulations',
  authenticate,
  requireAdmin,
  validate({
    body: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      description: Joi.string().min(1).max(2000).allow('').required(), // Allow empty string but still require field
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional().default('B1'),
      category: Joi.string().valid('GRAMMAR', 'LISTENING', 'READING', 'VOCABULARY', 'WRITING', 'ORAL', 'TCF_TEF', 'GENERAL').optional().default('GENERAL'),
      subscription: Joi.array().items(Joi.string()).optional().default([]),
      duration: Joi.number().min(60).max(1800).optional().default(420),
      maxDuration: Joi.number().min(60).max(1800).optional(),
      instructions: Joi.string().allow('').optional(), // Allow empty string
      sujets: Joi.array().items(Joi.string()).optional().default([]),
      extractedQuestions: Joi.array().items(Joi.any()).optional().default([]),
      questions: Joi.array().items(Joi.object({
        question: Joi.string().required(),
        type: Joi.string().valid('multiple-choice', 'open-ended', 'scenario').required(),
        options: Joi.array().items(Joi.string()).optional(),
        correctAnswer: Joi.string().optional(),
        points: Joi.number().min(1).max(10).required()
      })).optional(),
      voicePreference: Joi.string().optional().default('france_female_1'),
      isActive: Joi.boolean().optional().default(true)
    })
  }),
  AdminController.createAudioSimulation
);

/**
 * @route   PUT /api/admin/audio-simulations/:id
 * @desc    Update audio simulation template
 * @access  Private (Admin only)
 */
router.put('/audio-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    }),
    body: Joi.object({
      title: Joi.string().min(3).max(200).optional(),
      description: Joi.string().min(10).max(1000).optional(),
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
      category: Joi.string().valid('GRAMMAR', 'LISTENING', 'READING', 'VOCABULARY', 'WRITING', 'ORAL', 'TCF_TEF').optional(),
      questions: Joi.array().items(Joi.object({
        question: Joi.string().required(),
        type: Joi.string().valid('multiple-choice', 'open-ended', 'scenario').required(),
        options: Joi.array().items(Joi.string()).optional(),
        correctAnswer: Joi.string().optional(),
        points: Joi.number().min(1).max(10).required()
      })).min(1).optional(),
      duration: Joi.number().min(60).max(1800).optional(),
      voicePreference: Joi.string().optional(),
      isActive: Joi.boolean().optional()
    })
  }),
  AdminController.updateAudioSimulation
);

/**
 * @route   DELETE /api/admin/audio-simulations/:id
 * @desc    Delete audio simulation template
 * @access  Private (Admin only)
 */
router.delete('/audio-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.deleteAudioSimulation
);

// ===== IMMIGRATION SIMULATION MANAGEMENT =====

/**
 * @route   GET /api/admin/immigration-simulations
 * @desc    Get all immigration simulations with filtering
 * @access  Private (Admin only)
 */
router.get('/immigration-simulations',
  authenticate,
  requireAdmin,
  validate({
    query: Joi.object({
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
      status: Joi.string().optional(),
      country: Joi.string().optional(),
      immigrationType: Joi.string().optional(),
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
      search: Joi.string().optional()
    })
  }),
  AdminController.getImmigrationSimulations
);

/**
 * @route   GET /api/admin/immigration-simulations/:id
 * @desc    Get specific immigration simulation details
 * @access  Private (Admin only)
 */
router.get('/immigration-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.getImmigrationSimulation
);

/**
 * @route   POST /api/admin/immigration-simulations
 * @desc    Create new immigration simulation template
 * @access  Private (Admin only)
 */
router.post('/immigration-simulations',
  authenticate,
  requireAdmin,
  validate({
    body: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      description: Joi.string().min(10).max(1000).required(),
      country: Joi.string().min(2).max(100).required(),
      immigrationType: Joi.string().valid('work', 'study', 'family', 'refugee', 'business').required(),
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required(),
      questions: Joi.array().items(Joi.object({
        question: Joi.string().required(),
        type: Joi.string().valid('personal', 'scenario', 'document').required(),
        category: Joi.string().valid('personal_info', 'work_experience', 'education', 'family', 'documents').required(),
        points: Joi.number().min(1).max(10).required()
      })).min(1).required(),
      duration: Joi.number().min(300).max(1800).default(900),
      voicePreference: Joi.string().default('france_female_1'),
      isActive: Joi.boolean().default(true)
    })
  }),
  AdminController.createImmigrationSimulation
);

/**
 * @route   PUT /api/admin/immigration-simulations/:id
 * @desc    Update immigration simulation template
 * @access  Private (Admin only)
 */
router.put('/immigration-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    }),
    body: Joi.object({
      title: Joi.string().min(3).max(200).optional(),
      description: Joi.string().min(10).max(1000).optional(),
      country: Joi.string().min(2).max(100).optional(),
      immigrationType: Joi.string().valid('work', 'study', 'family', 'refugee', 'business').optional(),
      level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
      questions: Joi.array().items(Joi.object({
        question: Joi.string().required(),
        type: Joi.string().valid('personal', 'scenario', 'document').required(),
        category: Joi.string().valid('personal_info', 'work_experience', 'education', 'family', 'documents').required(),
        points: Joi.number().min(1).max(10).required()
      })).min(1).optional(),
      duration: Joi.number().min(300).max(1800).optional(),
      voicePreference: Joi.string().optional(),
      isActive: Joi.boolean().optional()
    })
  }),
  AdminController.updateImmigrationSimulation
);

/**
 * @route   DELETE /api/admin/immigration-simulations/:id
 * @desc    Delete immigration simulation template
 * @access  Private (Admin only)
 */
router.delete('/immigration-simulations/:id',
  authenticate,
  requireAdmin,
  validate({
    params: Joi.object({
      id: commonSchemas.id
    })
  }),
  AdminController.deleteImmigrationSimulation
);

export { router as adminRoutes };
