import { Request, Response } from 'express';
import { NotificationService } from '@/services/notificationService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, CreateNotificationRequest, PaginationParams } from '@/types';
import { UserRole, NotificationType, NotificationStatus } from '@prisma/client';
import { logger } from '@/utils/logger';

export class NotificationController {
  /**
   * Create notification (Admin/Manager only)
   */
  static createNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const notificationData: CreateNotificationRequest = req.body;
    const creatorRole = req.user?.role;

    if (!creatorRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const notification = await NotificationService.createNotification(notificationData, creatorRole);

    const response: ApiResponse = {
      success: true,
      data: { notification },
      message: 'Notification created successfully'
    };

    logger.info('Notification created', { notificationId: notification.id });

    res.status(201).json(response);
  });

  /**
   * Get user notifications
   */
  static getUserNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const filters = {
      status: req.query.status as NotificationStatus,
      type: req.query.type as NotificationType,
      category: req.query.category as string
    };

    const result = await NotificationService.getUserNotifications(userId, pagination, filters);

    const response: ApiResponse = {
      success: true,
      data: {
        notifications: result.notifications,
        unreadCount: result.unreadCount
      },
      pagination: result.pagination,
      message: 'Notifications retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get unread notifications count
   */
  static getUnreadCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await NotificationService.getUserNotifications(userId, { page: 1, limit: 1 });

    const response: ApiResponse = {
      success: true,
      data: {
        unreadCount: result.unreadCount
      },
      message: 'Unread count retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Mark notification as read
   */
  static markAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { notificationId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await NotificationService.markAsRead(userId, notificationId);

    const response: ApiResponse = {
      success: true,
      message: 'Notification marked as read'
    };

    res.status(200).json(response);
  });

  /**
   * Mark all notifications as read
   */
  static markAllAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await NotificationService.markAllAsRead(userId);

    const response: ApiResponse = {
      success: true,
      message: 'All notifications marked as read'
    };

    logger.info('All notifications marked as read', { userId });

    res.status(200).json(response);
  });

  /**
   * Archive notification
   */
  static archiveNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { notificationId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await NotificationService.archiveNotification(userId, notificationId);

    const response: ApiResponse = {
      success: true,
      message: 'Notification archived'
    };

    res.status(200).json(response);
  });

  /**
   * Delete notification (Admin only)
   */
  static deleteNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { notificationId } = req.params;
    const userRole = req.user?.role;

    if (!userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await NotificationService.deleteNotification(notificationId, userRole);

    const response: ApiResponse = {
      success: true,
      message: 'Notification deleted successfully'
    };

    logger.info('Notification deleted', { notificationId });

    res.status(200).json(response);
  });

  /**
   * Send system notification (Admin/Manager only)
   */
  static sendSystemNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, title, message, type, data } = req.body;
    const userRole = req.user?.role;

    if (!userRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Manager role required.' }
      });
      return;
    }

    await NotificationService.sendSystemNotification(userId, title, message, type, data);

    const response: ApiResponse = {
      success: true,
      message: 'System notification sent successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Send bulk notification (Admin/Manager only)
   */
  static sendBulkNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userIds, title, message, type, data } = req.body;
    const userRole = req.user?.role;

    if (!userRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Manager role required.' }
      });
      return;
    }

    await NotificationService.sendBulkNotification(userIds, title, message, type, data);

    const response: ApiResponse = {
      success: true,
      message: 'Bulk notification sent successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get notification statistics (Admin/Senior Manager only)
   */
  static getNotificationStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userRole = req.user?.role;

    if (!userRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER].includes(userRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Senior Manager or Admin role required.' }
      });
      return;
    }

    const stats = await NotificationService.getNotificationStats(userRole);

    const response: ApiResponse = {
      success: true,
      data: { stats },
      message: 'Notification statistics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for notification service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'notification',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Notification service is healthy'
    };

    res.status(200).json(response);
  });
}
