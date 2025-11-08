import { Request, Response } from 'express';
import { ManagerService } from '@/services/managerService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import { logger } from '@/utils/logger';
import { UserRole } from '@prisma/client';

export class ManagerController {
  /**
   * Get manager dashboard data
   */
  static getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const timeframe = req.query.timeframe as string || '30d';
    const team = req.query.team as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const dashboardData = await ManagerService.getDashboardData(managerId, timeframe, team);

    const response: ApiResponse = {
      success: true,
      data: dashboardData,
      message: 'Manager dashboard data retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get manager metrics
   */
  static getMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const period = req.query.period as string || '30d';
    const category = req.query.category as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const metrics = await ManagerService.getMetrics(managerId, period, category);

    const response: ApiResponse = {
      success: true,
      data: metrics,
      message: 'Manager metrics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get recent activity
   */
  static getActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const activity = await ManagerService.getActivity(managerId, limit, type);

    const response: ApiResponse = {
      success: true,
      data: activity,
      message: 'Manager activity retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get manager analytics
   */
  static getAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const timeframe = req.query.timeframe as string || '30d';
    const category = req.query.category as string;
    const filters = req.query.filters as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const analytics = await ManagerService.getAnalytics(managerId, timeframe, category, filters);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'Manager analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Generate manager report
   */
  static generateReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const reportConfig = req.body;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const report = await ManagerService.generateReport(managerId, reportConfig);

    const response: ApiResponse = {
      success: true,
      data: { report },
      message: 'Report generated successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Export manager data
   */
  static exportData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const format = req.query.format as string || 'csv';
    const filters = req.query.filters as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const exportData = await ManagerService.exportData(managerId, format, filters);

    const response: ApiResponse = {
      success: true,
      data: exportData,
      message: 'Data exported successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get users managed by this manager
   */
  static getManagedUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const managerRole = req.user?.role;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const filters = req.query.filters as string;

    if (!managerId || !managerRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await ManagerService.getManagedUsers(
      managerId,
      managerRole,
      { page, limit },
      { search, filters }
    );

    const response: ApiResponse = {
      success: true,
      data: result.users,
      pagination: result.pagination,
      message: 'Managed users retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get user analytics for managed users
   */
  static getUserAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const managerId = req.user?.userId;
    const managerRole = req.user?.role;

    if (!managerId || !managerRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const analytics = await ManagerService.getUserAnalytics(userId, managerId, managerRole);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'User analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Send message to user
   */
  static sendMessageToUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const managerId = req.user?.userId;
    const { title, message, type } = req.body;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await ManagerService.sendMessageToUser(userId, managerId, title, message, type);

    const response: ApiResponse = {
      success: true,
      message: 'Message sent successfully'
    };

    logger.info('Manager sent message to user', { managerId, userId });

    res.status(200).json(response);
  });

  /**
   * Get content library for manager
   */
  static getContentLibrary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const type = req.query.type as string;
    const status = req.query.status as string;
    const author = req.query.author as string;
    const date = req.query.date as string;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const content = await ManagerService.getContentLibrary(managerId, {
      type,
      status,
      author,
      date
    });

    const response: ApiResponse = {
      success: true,
      data: content,
      message: 'Content library retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create content
   */
  static createContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.user?.userId;
    const contentData = req.body;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const content = await ManagerService.createContent(managerId, contentData);

    const response: ApiResponse = {
      success: true,
      data: { content },
      message: 'Content created successfully'
    };

    logger.info('Manager created content', { managerId, contentId: content.id });

    res.status(201).json(response);
  });

  /**
   * Update content
   */
  static updateContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contentId } = req.params;
    const managerId = req.user?.userId;
    const updateData = req.body;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const content = await ManagerService.updateContent(contentId, managerId, updateData);

    const response: ApiResponse = {
      success: true,
      data: { content },
      message: 'Content updated successfully'
    };

    logger.info('Manager updated content', { managerId, contentId });

    res.status(200).json(response);
  });

  /**
   * Publish content
   */
  static publishContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contentId } = req.params;
    const managerId = req.user?.userId;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const content = await ManagerService.publishContent(contentId, managerId);

    const response: ApiResponse = {
      success: true,
      data: { content },
      message: 'Content published successfully'
    };

    logger.info('Manager published content', { managerId, contentId });

    res.status(200).json(response);
  });

  /**
   * Get content analytics
   */
  static getContentAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contentId } = req.params;
    const managerId = req.user?.userId;

    if (!managerId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const analytics = await ManagerService.getContentAnalytics(contentId, managerId);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'Content analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for manager service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'manager',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Manager service is healthy'
    };

    res.status(200).json(response);
  });
}
