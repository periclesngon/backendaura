import { Router } from 'express';
import { NotificationController } from '@/controllers/notificationController';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate, requireManager, requireSeniorManager } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import Joi from 'joi';

const router = Router();
const prisma = new PrismaClient();

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_FROM,
    pass: process.env.SMTP_PASS
  }
});

// Helper function to send email notifications
const sendEmailNotification = async (to: string, subject: string, html: string) => {
  try {
    if (!process.env.SMTP_PASS) {
      console.log('SMTP not configured, skipping email notification');
      return;
    }

    await transporter.sendMail({
      from: `${process.env.EMAIL_FROM_NAME || 'AURA.CA'} <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html
    });
    console.log(`Email notification sent to ${to}`);
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
};

// Validation schemas
const createNotificationSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  titleEn: Joi.string().min(3).max(200).optional(),
  message: Joi.string().min(10).max(1000).required(),
  messageEn: Joi.string().min(10).max(1000).optional(),
  type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR', 'REMINDER').required(),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  category: Joi.string().max(50).optional(),
  actionUrl: Joi.string().uri().optional(),
  imageUrl: Joi.string().uri().optional(),
  data: Joi.object().optional(),
  scheduledAt: Joi.date().optional(),
  expiresAt: Joi.date().optional(),
  userIds: Joi.array().items(commonSchemas.id).optional(),
  roles: Joi.array().items(commonSchemas.role).optional(),
  subscriptionTiers: Joi.array().items(commonSchemas.subscriptionTier).optional()
});

const systemNotificationSchema = Joi.object({
  userId: commonSchemas.id.required(),
  title: Joi.string().min(3).max(200).required(),
  message: Joi.string().min(10).max(1000).required(),
  type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR', 'REMINDER').default('INFO'),
  data: Joi.object().optional()
});

const bulkNotificationSchema = Joi.object({
  userIds: Joi.array().items(commonSchemas.id).min(1).required(),
  title: Joi.string().min(3).max(200).required(),
  message: Joi.string().min(10).max(1000).required(),
  type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR', 'REMINDER').default('INFO'),
  data: Joi.object().optional()
});

/**
 * @route   GET /api/notifications/health
 * @desc    Notification service health check
 * @access  Public
 */
router.get('/health', NotificationController.healthCheck);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notifications count
 * @access  Private
 */
router.get('/unread-count', authenticate, NotificationController.getUnreadCount);

/**
 * @route   PUT /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/mark-all-read', authenticate, NotificationController.markAllAsRead);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics (Admin/Senior Manager only)
 * @access  Private (Senior Manager+)
 */
router.get('/stats', authenticate, requireSeniorManager, NotificationController.getNotificationStats);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', authenticate, NotificationController.getUserNotifications);

/**
 * @route   POST /api/notifications
 * @desc    Create notification (Admin/Manager only)
 * @access  Private (Manager+)
 */
router.post('/', authenticate, requireManager, validate(createNotificationSchema), NotificationController.createNotification);

/**
 * @route   POST /api/notifications/system
 * @desc    Send system notification (Admin/Manager only)
 * @access  Private (Manager+)
 */
router.post('/system', authenticate, requireManager, validate(systemNotificationSchema), NotificationController.sendSystemNotification);

/**
 * @route   POST /api/notifications/bulk
 * @desc    Send bulk notification (Admin/Manager only)
 * @access  Private (Manager+)
 */
router.post('/bulk', authenticate, requireManager, validate(bulkNotificationSchema), NotificationController.sendBulkNotification);

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:notificationId/read',
  authenticate,
  validateParams({ notificationId: commonSchemas.id }),
  NotificationController.markAsRead
);

/**
 * @route   PUT /api/notifications/:notificationId/archive
 * @desc    Archive notification
 * @access  Private
 */
router.put('/:notificationId/archive',
  authenticate,
  validateParams({ notificationId: commonSchemas.id }),
  NotificationController.archiveNotification
);

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete notification (Admin only)
 * @access  Private (Admin)
 */
router.delete('/:notificationId',
  authenticate,
  validateParams({ notificationId: commonSchemas.id }),
  NotificationController.deleteNotification
);

export { router as notificationRoutes };
