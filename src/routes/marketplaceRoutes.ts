import { Router } from 'express';
import { MarketplaceService } from '../services/marketplaceService';
import { authenticate, requireManager } from '../middleware/auth';
import { UserRole, PrismaClient } from '@prisma/client';
import { FileUploadController } from '../controllers/fileUploadController';
import { FileUploadService } from '../services/fileUploadService';

const prisma = new PrismaClient();

const router = Router();

// Configure multer for profile image upload
const profileImageUpload = FileUploadService.configureMulter({
  category: 'PROFILE_IMAGE',
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
});

// Manager/Admin marketplace routes
router.get('/manager/marketplace/profile',
  authenticate,
  requireManager,
  async (req, res) => {
    console.log('🔍 Route handler called for /manager/marketplace/profile');
    try {
      // Get userId from req.user - check both id and userId properties
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      console.log('🔍 User ID extracted for profile:', userId);
      
      if (!userId) {
        console.error('❌ User ID not found in request:', {
          user: req.user,
          hasUser: !!req.user,
          userId: (req.user as any)?.userId,
          id: (req.user as any)?.id
        });
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      console.log('📋 Fetching tutor profile for userId:', userId);
      const result = await MarketplaceService.getTutorProfile(userId);
      
      if (!result.success) {
        console.error('❌ Failed to get tutor profile:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      console.log('✅ Tutor profile retrieved successfully:', {
        userId,
        hasProfile: !!result.data,
        isActive: result.data?.isActive
      });
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ Unhandled error in marketplace profile route:', {
        error: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack?.substring(0, 1000),
        userId: (req.user as any)?.userId || (req.user as any)?.id,
        errorType: error.constructor?.name,
        errorKeys: Object.keys(error)
      });
      res.status(500).json({
        success: false,
        error: { 
          message: error.message || 'Internal server error', 
          statusCode: 500,
          details: process.env.NODE_ENV === 'development' ? {
            code: error.code,
            meta: error.meta
          } : undefined
        }
      });
    }
  }
);

router.get('/manager/marketplace/requests',
  authenticate,
  requireManager,
  async (req, res) => {
    console.log('🔍 Route handler called for /manager/marketplace/requests');
    try {
      // Get userId from req.user - check both id and userId properties
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      console.log('🔍 User ID extracted:', userId);
      
      if (!userId) {
        console.error('❌ User ID not found in request:', {
          user: req.user,
          hasUser: !!req.user,
          userId: (req.user as any)?.userId,
          id: (req.user as any)?.id
        });
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const { status, requestType } = req.query;
      console.log('📋 Fetching student requests for tutor:', userId, 'status:', status, 'requestType:', requestType);
      
      // Type-safe status parsing
      let statusStr: string | undefined;
      if (typeof status === 'string') {
        statusStr = status;
      } else if (Array.isArray(status) && status.length > 0 && typeof status[0] === 'string') {
        statusStr = status[0];
      }

      // Type-safe requestType parsing
      let requestTypeStr: string | undefined;
      if (typeof requestType === 'string') {
        requestTypeStr = requestType;
      } else if (Array.isArray(requestType) && requestType.length > 0 && typeof requestType[0] === 'string') {
        requestTypeStr = requestType[0];
      }
      
      const result = await MarketplaceService.getStudentRequests(
        userId,
        statusStr ? statusStr.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED' : undefined,
        requestTypeStr ? requestTypeStr.toUpperCase() as 'SESSION' | 'MESSAGE' | 'EXPERTISE' : undefined
      );
      
      // If service returns success: false, it's a handled error
      if (!result.success) {
        console.error('❌ Failed to get student requests:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      // Success case
      console.log('✅ Student requests retrieved successfully:', {
        count: Array.isArray(result.data) ? result.data.length : 0,
        userId,
        status
      });
      
      res.json(result);
    } catch (error: any) {
      // Unhandled error - log full details
      console.error('❌ Unhandled error in marketplace requests route:', {
        error: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack?.substring(0, 1000),
        userId: (req.user as any)?.userId || (req.user as any)?.id,
        user: req.user,
        errorType: error.constructor?.name,
        errorKeys: Object.keys(error)
      });
      
      res.status(500).json({
        success: false,
        error: { 
          message: error.message || 'Internal server error', 
          statusCode: 500,
          details: process.env.NODE_ENV === 'development' ? {
            code: error.code,
            meta: error.meta
          } : undefined
        }
      });
    }
  }
);

router.put('/manager/marketplace/profile',
  authenticate,
  requireManager,
  async (req, res) => {
    try {
      // Get userId from req.user - check both id and userId properties
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const result = await MarketplaceService.updateTutorProfile(userId, req.body);
      
      if (!result.success) {
        return res.status(result.error?.statusCode || 500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in marketplace profile update route:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Missing marketplace endpoints
router.post('/manager/marketplace/activate',
  authenticate,
  requireManager,
  async (req, res) => {
    try {
      // Get userId from req.user - check both id and userId properties
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const { isActive } = req.body;
      const result = await MarketplaceService.activateTutorProfile(userId, isActive);

      if (!result.success) {
        return res.status(result.error?.statusCode || 500).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in marketplace activation route:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Delete marketplace request - MUST come before POST route with same pattern
router.delete('/manager/marketplace/requests/:id',
  authenticate,
  requireManager,
  async (req, res) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      // Check if request exists and user has permission
      const request = await (prisma as any).marketplaceRequest.findUnique({
        where: { id: requestId }
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: { message: 'Request not found', statusCode: 404 }
        });
      }

      // Verify tutor ownership or admin
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (request.tutorId !== userId && user?.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: { message: 'Unauthorized: You can only delete requests assigned to you', statusCode: 403 }
        });
      }

      // Delete the request
      await (prisma as any).marketplaceRequest.delete({
        where: { id: requestId }
      });

      res.json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error: any) {
      console.error('❌ Error deleting marketplace request:', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Internal server error', statusCode: 500 }
      });
    }
  }
);

router.post('/manager/marketplace/requests/:id/action',
  authenticate,
  requireManager,
  async (req, res) => {
    try {
      // Get userId from req.user - check both id and userId properties
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const { action, response } = req.body;
      
      if (!action || !['accept', 'decline', 'complete'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid action. Use "accept", "decline", or "complete"', statusCode: 400 }
        });
      }

      const result = await MarketplaceService.handleStudentRequest(requestId, action, userId, response);

      if (!result.success) {
        return res.status(result.error?.statusCode || 500).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('❌ Error in marketplace request action route:', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Student routes for creating requests
router.post('/marketplace/requests',
  authenticate,
  async (req, res) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const { tutorId, requestType, subject, description, urgency, requestedDate, feedbackId, metadata } = req.body;

      // Validate required fields
      if (!tutorId || !requestType || !subject || !description) {
        return res.status(400).json({
          success: false,
          error: { message: 'Missing required fields: tutorId, requestType, subject, description', statusCode: 400 }
        });
      }

      // Validate requestType
      if (!['SESSION', 'MESSAGE', 'EXPERTISE'].includes(requestType.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid requestType. Use SESSION, MESSAGE, or EXPERTISE', statusCode: 400 }
        });
      }

      const result = await MarketplaceService.createStudentRequest(userId, tutorId, {
        requestType: requestType.toUpperCase() as 'SESSION' | 'MESSAGE' | 'EXPERTISE',
        subject,
        description,
        urgency: urgency?.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
        requestedDate: requestedDate ? new Date(requestedDate) : undefined,
        feedbackId,
        metadata
      });

      if (!result.success) {
        return res.status(result.error?.statusCode || 500).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('❌ Error creating marketplace request:', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Get student's own requests
router.get('/marketplace/my-requests',
  authenticate,
  async (req, res) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      const { status } = req.query;
      
      // Type-safe status parsing
      let statusStr: string | undefined;
      if (typeof status === 'string') {
        statusStr = status;
      } else if (Array.isArray(status) && status.length > 0 && typeof status[0] === 'string') {
        statusStr = status[0];
      }
      
      const result = await MarketplaceService.getStudentOwnRequests(
        userId,
        statusStr ? statusStr.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED' : undefined
      );

      if (!result.success) {
        return res.status(result.error?.statusCode || 500).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('❌ Error getting student own requests:', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Student marketplace routes
router.get('/marketplace/tutors',
  authenticate,
  async (req, res) => {
    try {
      console.log('🔍 GET /marketplace/tutors - Route handler called');
      console.log('🔍 User ID:', (req.user as any)?.userId || (req.user as any)?.id);
      
      const result = await MarketplaceService.getAllTutors();
      
      console.log('📋 MarketplaceService.getAllTutors result:', {
        success: result.success,
        dataLength: result.success ? (Array.isArray(result.data) ? result.data.length : 0) : 0,
        error: result.error?.message
      });
      
      if (!result.success) {
        console.error('❌ getAllTutors failed:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      console.log('✅ Sending response with', result.data?.length || 0, 'tutors');
      res.json(result);
    } catch (error: any) {
      console.error('❌ Error in marketplace tutors route:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error', statusCode: 500 }
      });
    }
  }
);

// Get all unique specialties from tutors
// Public route - accessible without authentication for the dropdown to work
router.get('/marketplace/specialties',
  async (req, res, next) => {
    try {
      console.log('🔍 GET /marketplace/specialties - Route handler called');
      console.log('📋 Request details:', {
        method: req.method,
        path: req.path,
        url: req.url,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl
      });
      
      const result = await MarketplaceService.getAllSpecialties();
      
      if (!result.success) {
        console.error('❌ getAllSpecialties failed:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      console.log('✅ Sending response with', result.data?.length || 0, 'specialties');
      res.json(result);
    } catch (error: any) {
      console.error('❌ Error in marketplace specialties route:', error.message);
      console.error('Stack:', error.stack);
      next(error);
    }
  }
);

// Get all unique subjects from tutors
router.get('/marketplace/subjects',
  async (req, res, next) => {
    try {
      console.log('🔍 GET /marketplace/subjects - Route handler called');
      const result = await MarketplaceService.getAllSubjects();
      
      if (!result.success) {
        console.error('❌ getAllSubjects failed:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      console.log('✅ Sending response with', result.data?.length || 0, 'subjects');
      res.json(result);
    } catch (error: any) {
      console.error('❌ Error in marketplace subjects route:', error.message);
      next(error);
    }
  }
);

// Get all unique availability options from tutors
router.get('/marketplace/availability-options',
  async (req, res, next) => {
    try {
      console.log('🔍 GET /marketplace/availability-options - Route handler called');
      const result = await MarketplaceService.getAllAvailabilityOptions();
      
      if (!result.success) {
        console.error('❌ getAllAvailabilityOptions failed:', result.error);
        return res.status(result.error?.statusCode || 500).json(result);
      }

      console.log('✅ Sending response with', result.data?.length || 0, 'availability options');
      res.json(result);
    } catch (error: any) {
      console.error('❌ Error in marketplace availability options route:', error.message);
      next(error);
    }
  }
);

// Upload profile image for marketplace
router.post('/manager/marketplace/upload-image',
  authenticate,
  requireManager,
  profileImageUpload.single('file'),
  async (req, res, next) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', statusCode: 401 }
        });
      }

      // Use the existing FileUploadController
      await FileUploadController.uploadProfileImage(req, res);
    } catch (error: any) {
      console.error('❌ Error in marketplace image upload route:', error.message);
      next(error);
    }
  }
);

export default router;
