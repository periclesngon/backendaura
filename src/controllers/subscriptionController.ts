import { Request, Response } from 'express';
import { SubscriptionService } from '@/services/subscriptionService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, CreateSubscriptionRequest, PaginationParams } from '@/types';
import { SubscriptionTier, PaymentStatus } from '@prisma/client';
import { logger } from '@/utils/logger';

export class SubscriptionController {
  /**
   * Get all subscription plans
   */
  static getSubscriptionPlans = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const plans = await SubscriptionService.getSubscriptionPlans();

      const response: ApiResponse = {
        success: true,
        data: { plans },
        message: 'Subscription plans retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error getting subscription plans:', error);
      console.error('Error in getSubscriptionPlans:', {
        message: error?.message,
        stack: error?.stack
      });
      res.status(500).json({
        success: false,
        error: { 
          message: 'Failed to retrieve subscription plans',
          details: process.env.NODE_ENV === 'development' ? error?.message : undefined
        }
      });
    }
  });

  /**
   * Create subscription for user
   */
  static createSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id;
    const subscriptionData: CreateSubscriptionRequest = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const subscription = await SubscriptionService.createSubscription(userId, subscriptionData);

    const response: ApiResponse = {
      success: true,
      data: { subscription },
      message: 'Subscription created successfully'
    };

    logger.info('Subscription created', { subscriptionId: subscription.id, userId });

    res.status(201).json(response);
  });

  /**
   * Get user's subscriptions
   */
  static getUserSubscriptions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id;

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

    const result = await SubscriptionService.getUserSubscriptions(userId, pagination);

    const response: ApiResponse = {
      success: true,
      data: result.subscriptions,
      pagination: result.pagination,
      message: 'User subscriptions retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get active subscription for user
   */
  static getActiveSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId || req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required' }
        });
        return;
      }

      const subscription = await SubscriptionService.getActiveSubscription(userId);

      const response: ApiResponse = {
        success: true,
        data: subscription ? { subscription } : null,
        message: subscription ? 'Active subscription retrieved successfully' : 'No active subscription found'
      };

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error getting active subscription:', error);
      console.error('Error in getActiveSubscription:', {
        message: error?.message,
        stack: error?.stack,
        userId: req.user?.userId || req.user?.id
      });
      res.status(500).json({
        success: false,
        error: { 
          message: 'Failed to retrieve active subscription',
          details: process.env.NODE_ENV === 'development' ? error?.message : undefined
        }
      });
    }
  });

  /**
   * Cancel subscription
   */
  static cancelSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id;
    const { subscriptionId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await SubscriptionService.cancelSubscription(userId, subscriptionId);

    const response: ApiResponse = {
      success: true,
      message: 'Subscription cancelled successfully'
    };

    logger.info('Subscription cancelled', { subscriptionId, userId });

    res.status(200).json(response);
  });

  /**
   * Upgrade/Downgrade subscription
   */
  static changeSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id;
    const { tier, billingCycle } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const subscription = await SubscriptionService.changeSubscription(userId, tier, billingCycle);

    const response: ApiResponse = {
      success: true,
      data: { subscription },
      message: 'Subscription changed successfully'
    };

    logger.info('Subscription changed', { subscriptionId: subscription.id, userId, newTier: tier });

    res.status(200).json(response);
  });

  /**
   * Process payment webhook
   */
  static processPaymentWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { paymentId, status, transactionId, metadata } = req.body;

    // In a real implementation, you would verify the webhook signature here
    // For now, we'll just process the payment

    await SubscriptionService.processPayment(paymentId, status, transactionId, metadata);

    const response: ApiResponse = {
      success: true,
      message: 'Payment processed successfully'
    };

    logger.info('Payment webhook processed', { paymentId, status });

    res.status(200).json(response);
  });

  /**
   * Get subscription analytics (Admin only)
   */
  static getSubscriptionAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Admin role required.' }
      });
      return;
    }

    // Import prisma here since it's not imported at the top
    const { prisma } = await import('@/database/connection');

    // Get subscription statistics
    const [
      totalSubscriptions,
      activeSubscriptions,
      subscriptionsByTier,
      recentSubscriptions,
      totalRevenue
    ] = await Promise.all([
      prisma.subscription.count(),
      prisma.subscription.count({
        where: { status: 'ACTIVE' }
      }),
      prisma.subscription.groupBy({
        by: ['tier'],
        _count: { tier: true },
        where: { status: 'ACTIVE' }
      }),
      prisma.subscription.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      }),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true }
      })
    ]);

    const analytics = {
      totalSubscriptions,
      activeSubscriptions,
      subscriptionsByTier: subscriptionsByTier.reduce((acc, item) => {
        acc[item.tier] = item._count.tier;
        return acc;
      }, {} as Record<string, number>),
      recentSubscriptions,
      totalRevenue: totalRevenue._sum.amount || 0
    };

    const response: ApiResponse = {
      success: true,
      data: { analytics },
      message: 'Subscription analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for subscription service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'subscription',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Subscription service is healthy'
    };

    res.status(200).json(response);
  });
}
