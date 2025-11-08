import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { ContentManagementService } from '../services/contentManagementService';
import { authenticate, requireAdmin, requireSeniorManager } from '../middleware/auth';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/content/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB limit for large files and poor internet connections
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4',
      'video/avi',
      'video/mov',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Invalid file type'));
    }
  }
});

/**
 * @route POST /api/content/upload
 * @desc Upload and process content with AI analysis
 * @access Private (Admin, Senior Manager, Junior Manager)
 */
router.post('/upload',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        title,
        description,
        level,
        category,
        subscriptionTier,
        availableLevels, // ✅ NEW: Multiple levels support
        availableTiers, // ✅ NEW: Multiple tiers support
        language,
        contentType,
        tags,
        duration,
        maxScore,
        passingScore
      } = req.body;

      // Validate required fields
      if (!title || !description || !level || !category || !subscriptionTier || !contentType) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      const uploadData = {
        title,
        description,
        level,
        category,
        subscriptionTier,
        availableLevels: availableLevels ? JSON.parse(availableLevels) : undefined, // ✅ NEW: Parse multiple levels
        availableTiers: availableTiers ? JSON.parse(availableTiers) : undefined, // ✅ NEW: Parse multiple tiers
        language: language || 'fr',
        contentType,
        file: req.file,
        tags: tags ? JSON.parse(tags) : [],
        duration: duration ? parseInt(duration) : undefined,
        maxScore: maxScore ? parseInt(maxScore) : undefined,
        passingScore: passingScore ? parseInt(passingScore) : undefined
      };

      const result = await ContentManagementService.uploadContent(
        uploadData,
        req.user!.id,
        req.user!.role
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/content-management/test-cloudinary
 * @desc Test Cloudinary configuration
 * @access Private (Admin, Senior Manager)
 */
router.get('/test-cloudinary',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { CloudinaryService } = await import('../services/cloudinaryService');
      
      // Check if Cloudinary is configured
      if (!CloudinaryService.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.',
            code: 'CLOUDINARY_NOT_CONFIGURED'
          }
        });
      }

      // Test connection
      const connectionTest = await CloudinaryService.testConnection();
      
      if (connectionTest) {
        return res.json({
          success: true,
          message: 'Cloudinary connection test successful',
          data: {
            cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'parsed from CLOUDINARY_URL',
            configured: true,
            connectionTest: true
          }
        });
      } else {
        return res.status(500).json({
          success: false,
          error: {
            message: 'Cloudinary connection test failed. Please check your credentials.',
            code: 'CLOUDINARY_CONNECTION_FAILED'
          }
        });
      }
    } catch (error) {
      logger.error('Cloudinary test failed:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Cloudinary test failed',
          code: 'CLOUDINARY_TEST_ERROR'
        }
      });
    }
  }
);

/**
 * @route GET /api/content/courses
 * @desc Get content for student course pages
 * @access Public
 */
router.get('/courses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      level,
      category,
      subscriptionTier,
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const result = await ContentManagementService.getContentForCourses(
      level as any,
      category as any,
      subscriptionTier as any,
      search as string,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/content/tests
 * @desc Get content for student test pages
 * @access Public
 */
router.get('/tests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      level,
      type,
      category,
      subscriptionTier,
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const result = await ContentManagementService.getContentForTests(
      level as any,
      category as string,
      subscriptionTier as any,
      search as string,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/content/simulations
 * @desc Get simulations for student simulation pages
 * @access Public
 */
router.get('/simulations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      level,
      type,
      subscriptionTier,
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const result = await ContentManagementService.getContentForTests(
      level as any,
      'SIMULATION',
      subscriptionTier as any,
      search as string,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/content/management
 * @desc Get content for admin/manager content pages
 * @access Private (Admin, Senior Manager, Junior Manager)
 */
router.get('/management',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('🔍 Content Management Request:', {
        userRole: req.user!.role,
        userId: req.user!.id,
        query: req.query
      });

      const {
        contentType,
        page = '1',
        limit = '20'
      } = req.query;

      const result = await ContentManagementService.getContentForManagement(
        req.user!.role,
        req.user!.id,
        contentType as string,
        parseInt(page as string),
        parseInt(limit as string)
      );

      console.log('✅ Content Management Response:', {
        contentCount: result.content.length,
        total: result.total
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ Content Management Error:', error);
      next(error);
    }
  }
);

/**
 * @route PUT /api/content/:id/publish
 * @desc Publish content
 * @access Private (Admin, Senior Manager)
 */
router.put('/:id/publish',
  authenticate,
  requireSeniorManager,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { contentType } = req.body;

      if (!contentType) {
        return res.status(400).json({
          success: false,
          message: 'Content type is required'
        });
      }

      const result = await ContentManagementService.publishContent(
        id,
        contentType,
        req.user!.id,
        req.user!.role
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/content/:id
 * @desc Delete content
 * @access Private (Admin, Senior Manager, Junior Manager - own content only)
 */
router.delete('/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { contentType } = req.body;

      if (!contentType) {
        return res.status(400).json({
          success: false,
          message: 'Content type is required'
        });
      }

      await ContentManagementService.deleteContent(
        id,
        contentType,
        req.user!.id,
        req.user!.role
      );

      res.json({
        success: true,
        message: 'Content deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/content/corriger-tcf
 * @desc Get TCF correction content for student corriger pages
 * @access Public
 */
router.get('/corriger-tcf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      level,
      subscriptionTier,
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const result = await ContentManagementService.getContentForTests(
      level as any,
      'CORRIGER_TCF',
      subscriptionTier as any,
      search as string,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/content/:id/levels-subscriptions
 * @desc Update course levels and subscriptions
 * @access Private (Admin, Senior Manager, Junior Manager)
 */
router.put('/:id/levels-subscriptions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { levels, subscriptions } = req.body;

      if (!levels || !subscriptions || !Array.isArray(levels) || !Array.isArray(subscriptions)) {
        return res.status(400).json({
          success: false,
          message: 'Levels and subscriptions must be arrays'
        });
      }

      const result = await ContentManagementService.updateCourseLevelsAndSubscriptions(
        id,
        levels,
        subscriptions,
        req.user!.id,
        req.user!.role
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
