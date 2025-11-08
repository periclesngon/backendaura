import { Router } from 'express';
import { AnalyticsService } from '@/services/analyticsService';
import { authenticate, requireManager, requireAdmin } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';

const router = Router();

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard analytics (Admin/Manager only)
 * @access  Private (Manager+)
 */
router.get('/dashboard', authenticate, requireManager, asyncHandler(async (req, res) => {
  const userRole = req.user?.role;

  if (!userRole) {
    res.status(401).json({
      success: false,
      error: { message: 'Authentication required' }
    });
    return;
  }

  const analytics = await AnalyticsService.getDashboardAnalytics(userRole);

  const response: ApiResponse = {
    success: true,
    data: { analytics },
    message: 'Dashboard analytics retrieved successfully'
  };

  res.status(200).json(response);
}));

/**
 * @route   GET /api/analytics/user-activity
 * @desc    Get user activity analytics
 * @access  Private
 */
router.get('/user-activity', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.userId;
  const days = parseInt(req.query.days as string) || 30;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { message: 'Authentication required' }
    });
    return;
  }

  const analytics = await AnalyticsService.getUserActivityAnalytics(userId, days);

  const response: ApiResponse = {
    success: true,
    data: { analytics },
    message: 'User activity analytics retrieved successfully'
  };

  res.status(200).json(response);
}));

/**
 * @route   GET /api/analytics/system-metrics
 * @desc    Get system performance metrics (Admin only)
 * @access  Private (Admin)
 */
router.get('/system-metrics', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const userRole = req.user?.role;

  if (!userRole) {
    res.status(401).json({
      success: false,
      error: { message: 'Authentication required' }
    });
    return;
  }

  const metrics = await AnalyticsService.getSystemMetrics(userRole);

  const response: ApiResponse = {
    success: true,
    data: { metrics },
    message: 'System metrics retrieved successfully'
  };

  res.status(200).json(response);
}));

/**
 * @route   POST /api/analytics/track
 * @desc    Track analytics event
 * @access  Public
 */
router.post('/track', asyncHandler(async (req, res) => {
  const { eventType, eventData } = req.body;
  const userId = req.user?.userId;
  const sessionId = req.headers['x-session-id'] as string;
  const userAgent = req.headers['user-agent'];
  const ipAddress = req.ip;

  await AnalyticsService.trackEvent(
    eventType,
    eventData,
    userId,
    sessionId,
    userAgent,
    ipAddress
  );

  const response: ApiResponse = {
    success: true,
    message: 'Event tracked successfully'
  };

  res.status(200).json(response);
}));

/**
 * @route   GET /api/analytics/health
 * @desc    Analytics service health check
 * @access  Public
 */
router.get('/health', (req, res) => {
  const response: ApiResponse = {
    success: true,
    data: {
      service: 'analytics',
      status: 'healthy',
      timestamp: new Date().toISOString()
    },
    message: 'Analytics service is healthy'
  };
  res.status(200).json(response);
});

export { router as analyticsRoutes };
