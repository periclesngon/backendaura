import { prisma } from '@/database/connection';
import { 
  NotFoundError, 
  ValidationError, 
  AuthorizationError 
} from '@/middleware/errorHandler';
import { 
  NotificationWithStatus,
  CreateNotificationRequest,
  PaginationParams
} from '@/types';
import { UserRole, SubscriptionTier, NotificationType, NotificationStatus } from '@prisma/client';
import { logger } from '@/utils/logger';

export class NotificationService {
  /**
   * Create notification (Admin/Manager only)
   */
  static async createNotification(
    notificationData: CreateNotificationRequest,
    creatorRole: UserRole
  ): Promise<any> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(creatorRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      const {
        title,
        titleEn,
        message,
        messageEn,
        type,
        priority,
        category,
        actionUrl,
        imageUrl,
        data,
        scheduledAt,
        expiresAt,
        userIds,
        roles,
        subscriptionTiers
      } = notificationData;

      // Create notification
      const notification = await prisma.notification.create({
        data: {
          title,
          titleEn,
          message,
          messageEn,
          type,
          priority: priority || 'medium',
          category,
          actionUrl,
          imageUrl,
          data,
          scheduledAt,
          expiresAt
        }
      });

      // Determine target users
      let targetUserIds: string[] = [];

      if (userIds && userIds.length > 0) {
        // Send to specific users
        targetUserIds = userIds;
      } else {
        // Build query for target users
        const where: any = {};

        if (roles && roles.length > 0) {
          where.role = { in: roles };
        }

        if (subscriptionTiers && subscriptionTiers.length > 0) {
          where.subscriptionTier = { in: subscriptionTiers };
        }

        // Get target users
        const targetUsers = await prisma.user.findMany({
          where,
          select: { id: true }
        });

        targetUserIds = targetUsers.map(user => user.id);
      }

      // Create user notifications
      if (targetUserIds.length > 0) {
        const userNotifications = targetUserIds.map(userId => ({
          userId,
          notificationId: notification.id,
          status: NotificationStatus.UNREAD
        }));

        await prisma.userNotification.createMany({
          data: userNotifications
        });
      }

      logger.info('Notification created successfully', { 
        notificationId: notification.id, 
        targetUsersCount: targetUserIds.length,
        type,
        category 
      });

      return {
        ...notification,
        targetUsersCount: targetUserIds.length
      };
    } catch (error) {
      logger.error('Failed to create notification', { notificationData, error });
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(
    userId: string,
    pagination: PaginationParams,
    filters?: {
      status?: NotificationStatus;
      type?: NotificationType;
      category?: string;
    }
  ): Promise<{
    notifications: NotificationWithStatus[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    unreadCount: number;
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
      const { status, type, category } = filters || {};

      // Build where clause
      const where: any = {
        userId,
        notification: {
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: new Date() } }
          ]
        }
      };

      if (status) {
        where.status = status;
      }

      if (type) {
        where.notification = {
          ...where.notification,
          type
        };
      }

      if (category) {
        where.notification = {
          ...where.notification,
          category
        };
      }

      // Get total count with retry logic
      let total = 0;
      let unreadCount = 0;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          total = await prisma.userNotification.count({ where });
          
          unreadCount = await prisma.userNotification.count({
            where: {
              userId,
              status: NotificationStatus.UNREAD,
              notification: {
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gte: new Date() } }
                ]
              }
            }
          });
          break; // Success, exit retry loop
        } catch (dbError: any) {
          retryCount++;
          console.log(`Database connection attempt ${retryCount} failed for notifications:`, dbError.message);
          
          if (retryCount >= maxRetries) {
            // If all retries failed, return fallback counts
            console.log('All database retry attempts failed for notifications, returning fallback');
            return {
              notifications: [],
              pagination: {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 0
              },
              unreadCount: 0
            };
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }

      // Get notifications
      const userNotifications = await prisma.userNotification.findMany({
        where,
        include: {
          notification: true
        },
        orderBy: {
          notification: { [sortBy]: sortOrder }
        },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      // Transform to NotificationWithStatus
      const notifications: NotificationWithStatus[] = userNotifications.map(un => ({
        ...un.notification,
        userNotification: {
          id: un.id,
          userId: un.userId,
          notificationId: un.notificationId,
          status: un.status,
          readAt: un.readAt,
          createdAt: un.createdAt
        }
      }));

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        unreadCount
      };
    } catch (error) {
      logger.error('Failed to get user notifications', { userId, error });
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(userId: string, notificationId: string): Promise<void> {
    try {
      // Find user notification
      const userNotification = await prisma.userNotification.findUnique({
        where: {
          userId_notificationId: {
            userId,
            notificationId
          }
        }
      });

      if (!userNotification) {
        throw new NotFoundError('Notification not found');
      }

      if (userNotification.status === NotificationStatus.READ) {
        return; // Already read
      }

      // Update status
      await prisma.userNotification.update({
        where: {
          userId_notificationId: {
            userId,
            notificationId
          }
        },
        data: {
          status: NotificationStatus.READ,
          readAt: new Date()
        }
      });

      logger.info('Notification marked as read', { userId, notificationId });
    } catch (error) {
      logger.error('Failed to mark notification as read', { userId, notificationId, error });
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(userId: string): Promise<void> {
    try {
      await prisma.userNotification.updateMany({
        where: {
          userId,
          status: NotificationStatus.UNREAD
        },
        data: {
          status: NotificationStatus.READ,
          readAt: new Date()
        }
      });

      logger.info('All notifications marked as read', { userId });
    } catch (error) {
      logger.error('Failed to mark all notifications as read', { userId, error });
      throw error;
    }
  }

  /**
   * Archive notification
   */
  static async archiveNotification(userId: string, notificationId: string): Promise<void> {
    try {
      // Find user notification
      const userNotification = await prisma.userNotification.findUnique({
        where: {
          userId_notificationId: {
            userId,
            notificationId
          }
        }
      });

      if (!userNotification) {
        throw new NotFoundError('Notification not found');
      }

      // Update status
      await prisma.userNotification.update({
        where: {
          userId_notificationId: {
            userId,
            notificationId
          }
        },
        data: {
          status: NotificationStatus.ARCHIVED
        }
      });

      logger.info('Notification archived', { userId, notificationId });
    } catch (error) {
      logger.error('Failed to archive notification', { userId, notificationId, error });
      throw error;
    }
  }

  /**
   * Delete notification (Admin only)
   */
  static async deleteNotification(notificationId: string, userRole: UserRole): Promise<void> {
    try {
      // Check authorization
      if (userRole !== UserRole.ADMIN) {
        throw new AuthorizationError('Access denied. Admin role required.');
      }

      // Check if notification exists
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId }
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      // Delete notification (cascade will handle user notifications)
      await prisma.notification.delete({
        where: { id: notificationId }
      });

      logger.info('Notification deleted', { notificationId });
    } catch (error) {
      logger.error('Failed to delete notification', { notificationId, error });
      throw error;
    }
  }

  /**
   * Send system notification (for internal use)
   */
  static async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    data?: any
  ): Promise<void> {
    try {
      // Create notification
      const notification = await prisma.notification.create({
        data: {
          title,
          message,
          type,
          priority: 'medium',
          category: 'system',
          data
        }
      });

      // Create user notification
      await prisma.userNotification.create({
        data: {
          userId,
          notificationId: notification.id,
          status: NotificationStatus.UNREAD
        }
      });

      logger.info('System notification sent', { userId, notificationId: notification.id, type });
    } catch (error) {
      logger.error('Failed to send system notification', { userId, title, error });
      throw error;
    }
  }

  /**
   * Send bulk notification to multiple users
   */
  static async sendBulkNotification(
    userIds: string[],
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    data?: any
  ): Promise<void> {
    try {
      if (userIds.length === 0) {
        return;
      }

      // Create notification
      const notification = await prisma.notification.create({
        data: {
          title,
          message,
          type,
          priority: 'medium',
          category: 'bulk',
          data
        }
      });

      // Create user notifications
      const userNotifications = userIds.map(userId => ({
        userId,
        notificationId: notification.id,
        status: NotificationStatus.UNREAD
      }));

      await prisma.userNotification.createMany({
        data: userNotifications
      });

      logger.info('Bulk notification sent', { 
        notificationId: notification.id, 
        userCount: userIds.length,
        type 
      });
    } catch (error) {
      logger.error('Failed to send bulk notification', { userIds, title, error });
      throw error;
    }
  }

  /**
   * Clean up expired notifications
   */
  static async cleanupExpiredNotifications(): Promise<void> {
    try {
      const expiredNotifications = await prisma.notification.findMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        },
        select: { id: true }
      });

      if (expiredNotifications.length > 0) {
        const expiredIds = expiredNotifications.map(n => n.id);

        // Delete user notifications first
        await prisma.userNotification.deleteMany({
          where: {
            notificationId: { in: expiredIds }
          }
        });

        // Delete notifications
        await prisma.notification.deleteMany({
          where: {
            id: { in: expiredIds }
          }
        });

        logger.info(`Cleaned up ${expiredNotifications.length} expired notifications`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired notifications', { error });
    }
  }

  /**
   * Get notification statistics (Admin only)
   */
  static async getNotificationStats(userRole: UserRole): Promise<any> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER].includes(userRole as any)) {
        throw new AuthorizationError('Access denied. Senior Manager or Admin role required.');
      }

      const [
        totalNotifications,
        totalUserNotifications,
        unreadCount,
        notificationsByType,
        recentNotifications
      ] = await Promise.all([
        prisma.notification.count(),
        prisma.userNotification.count(),
        prisma.userNotification.count({
          where: { status: NotificationStatus.UNREAD }
        }),
        prisma.notification.groupBy({
          by: ['type'],
          _count: { type: true }
        }),
        prisma.notification.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                userNotifications: true
              }
            }
          }
        })
      ]);

      return {
        totalNotifications,
        totalUserNotifications,
        unreadCount,
        notificationsByType: notificationsByType.reduce((acc, item) => {
          acc[item.type] = item._count.type;
          return acc;
        }, {} as Record<string, number>),
        recentNotifications
      };
    } catch (error) {
      logger.error('Failed to get notification stats', { error });
      throw error;
    }
  }
}
