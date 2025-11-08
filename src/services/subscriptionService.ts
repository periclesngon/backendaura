import { prisma } from '@/database/connection';
import { 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  AuthorizationError 
} from '@/middleware/errorHandler';
import { 
  SubscriptionPlan,
  CreateSubscriptionRequest,
  PaginationParams
} from '@/types';
import { SubscriptionTier, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { logger } from '@/utils/logger';

export class SubscriptionService {
  /**
   * Get all subscription plans
   */
  static async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      // Try to get plans from database first
      try {
        const dbPlans = await prisma.subscriptionPlan.findMany({
          where: { isActive: true },
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'desc' }
          ]
        });

        if (dbPlans && dbPlans.length > 0) {
          // Filter out FREE plan and map to SubscriptionPlan format
          return dbPlans
            .filter((plan) => plan.tier !== 'FREE')
            .map((plan) => ({
              id: plan.id,
              name: plan.name,
              nameEn: plan.nameEn || plan.name,
              description: plan.description || '',
              descriptionEn: plan.descriptionEn || plan.description || '',
              tier: plan.tier,
              price: plan.price,
              currency: plan.currency,
              billingCycle: plan.billingCycle,
              features: plan.features,
              limitations: plan.limitations || [],
              isPopular: plan.isPopular
            }));
        }
      } catch (dbError: any) {
        // Model might not be fully synced, fall through to hardcoded plans
        logger.debug('Using hardcoded plans', { error: dbError?.message });
      }

      // Return hardcoded plans (FREE plan removed - not needed on subscription page)
      const plans: SubscriptionPlan[] = [
        {
          id: 'essential',
          name: 'Essentiel',
          nameEn: 'Essential',
          description: 'Base pour démarrer (A1-B1)',
          descriptionEn: 'Basics to get started (A1-B1)',
          tier: SubscriptionTier.ESSENTIAL,
          price: 4500,
          currency: 'FCFA',
          billingCycle: 'monthly',
          features: [
            'Cours fondamentaux (A1–B1)',
            '5 tests blancs par mois',
            '2 sessions live par mois',
            'Aperçu du fil social',
            'Support par email'
          ],
          limitations: [
            'Pas d\'accès aux cours B2-C2',
            'Sessions live limitées à B1'
          ]
        },
        {
          id: 'premium',
          name: 'Premium',
          nameEn: 'Premium',
          description: 'Tout inclus pour réussir (A1-C2)',
          descriptionEn: 'All‑inclusive for success (A1-C2)',
          tier: SubscriptionTier.PREMIUM,
          price: 9500,
          currency: 'FCFA',
          billingCycle: 'monthly',
          features: [
            'Cours complets (A1–C2)',
            'Tests blancs illimités',
            'Sessions live illimitées',
            'Coach IA et feedback détaillé',
            'Analyses avancées',
            'Certificats de réussite',
            'Support prioritaire'
          ],
          isPopular: true
        },
        {
          id: 'pro',
          name: 'Pro+',
          nameEn: 'Pro+',
          description: 'Pour objectifs intensifs',
          descriptionEn: 'For intensive goals',
          tier: SubscriptionTier.PRO,
          price: 14500,
          currency: 'FCFA',
          billingCycle: 'monthly',
          features: [
            'Parcours personnalisés',
            'Sessions 1-on-1 avec managers',
            'Correction prioritaire',
            'Rapports détaillés',
            'Accès anticipé aux nouveautés',
            'Garantie de réussite',
            'Support téléphonique'
          ]
        }
      ];

      return plans;
    } catch (error) {
      logger.error('Failed to get subscription plans', { error });
      throw error;
    }
  }

  /**
   * Create subscription for user
   */
  static async createSubscription(
    userId: string,
    subscriptionData: CreateSubscriptionRequest
  ): Promise<any> {
    try {
      const { tier, billingCycle, paymentMethodId } = subscriptionData;

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Check if user already has an active subscription of the same tier
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          tier,
          status: SubscriptionStatus.ACTIVE
        }
      });

      if (existingSubscription) {
        throw new ConflictError('User already has an active subscription of this tier');
      }

      // Get subscription plan details
      const plans = await this.getSubscriptionPlans();
      const plan = plans.find(p => p.tier === tier);

      if (!plan) {
        throw new NotFoundError('Subscription plan not found');
      }

      // Calculate dates
      const startDate = new Date();
      const endDate = new Date();
      
      switch (billingCycle) {
        case 'monthly':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case 'quarterly':
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case 'yearly':
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
        default:
          endDate.setMonth(endDate.getMonth() + 1);
      }

      // Create subscription
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          tier,
          status: tier === SubscriptionTier.FREE ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PENDING,
          startDate,
          endDate,
          billingCycle,
          paymentMethod: paymentMethodId || 'free'
        }
      });

      // If it's a paid subscription, create payment record
      if (tier !== SubscriptionTier.FREE && plan.price > 0) {
        await prisma.payment.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            amount: plan.price,
            currency: plan.currency,
            status: PaymentStatus.PENDING,
            paymentMethod: paymentMethodId || 'unknown',
            paymentGateway: 'stripe' // Default gateway
          }
        });
      }

      // Update user subscription tier if subscription is active
      if (subscription.status === SubscriptionStatus.ACTIVE) {
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: tier }
        });
      }

      logger.info('Subscription created successfully', { 
        subscriptionId: subscription.id, 
        userId, 
        tier 
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { userId, subscriptionData, error });
      throw error;
    }
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(
    userId: string,
    pagination: PaginationParams
  ): Promise<{
    subscriptions: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;

      // Get total count
      const total = await prisma.subscription.count({
        where: { userId }
      });

      // Get subscriptions
      const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      return {
        subscriptions,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get user subscriptions', { userId, error });
      throw error;
    }
  }

  /**
   * Get active subscription for user
   */
  static async getActiveSubscription(userId: string): Promise<any | null> {
    try {
      // First, try to find an active subscription in the subscriptions table
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          endDate: {
            gte: new Date()
          }
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // If no active subscription found, fall back to user's subscriptionTier
      if (!subscription) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            subscriptionTier: true
          }
        });

        if (user) {
          // Return a subscription-like object with the user's tier
          return {
            id: `user-tier-${user.id}`,
            tier: user.subscriptionTier,
            status: 'ACTIVE',
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 1 month from now (30 days)
            user: {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email
            }
          };
        }
      }

      return subscription || null;
    } catch (error) {
      logger.error('Failed to get active subscription', { userId, error });
      // Return null instead of throwing to handle gracefully
      return null;
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(userId: string, subscriptionId: string): Promise<void> {
    try {
      // Get subscription
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId }
      });

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (subscription.userId !== userId) {
        throw new AuthorizationError('Access denied');
      }

      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new ValidationError('Subscription is not active');
      }

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.CANCELLED,
          autoRenew: false
        }
      });

      // Update user subscription tier to FREE
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: SubscriptionTier.FREE }
      });

      logger.info('Subscription cancelled successfully', { subscriptionId, userId });
    } catch (error) {
      logger.error('Failed to cancel subscription', { userId, subscriptionId, error });
      throw error;
    }
  }

  /**
   * Upgrade/Downgrade subscription
   */
  static async changeSubscription(
    userId: string,
    newTier: SubscriptionTier,
    billingCycle: string = 'monthly'
  ): Promise<any> {
    try {
      // Get current active subscription
      const currentSubscription = await this.getActiveSubscription(userId);

      if (currentSubscription && currentSubscription.tier === newTier) {
        throw new ValidationError('User already has this subscription tier');
      }

      // Cancel current subscription if exists
      if (currentSubscription) {
        await this.cancelSubscription(userId, currentSubscription.id);
      }

      // Create new subscription
      const newSubscription = await this.createSubscription(userId, {
        tier: newTier,
        billingCycle
      });

      logger.info('Subscription changed successfully', { 
        userId, 
        oldTier: currentSubscription?.tier, 
        newTier 
      });

      return newSubscription;
    } catch (error) {
      logger.error('Failed to change subscription', { userId, newTier, error });
      throw error;
    }
  }

  /**
   * Process payment (webhook handler)
   */
  static async processPayment(
    paymentId: string,
    status: PaymentStatus,
    transactionId?: string,
    metadata?: any
  ): Promise<void> {
    try {
      // Get payment
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId }
      });

      if (!payment) {
        throw new NotFoundError('Payment not found');
      }

      // Update payment status
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status,
          transactionId,
          metadata,
          processedAt: new Date()
        }
      });

      // If payment is successful, activate subscription
      if (status === PaymentStatus.COMPLETED && payment.subscriptionId) {
        // Get the subscription to access its tier
        const subscription = await prisma.subscription.findUnique({
          where: { id: payment.subscriptionId }
        });

        if (subscription) {
          await prisma.subscription.update({
            where: { id: payment.subscriptionId },
            data: { status: SubscriptionStatus.ACTIVE }
          });

          // Update user subscription tier
          await prisma.user.update({
            where: { id: payment.userId },
            data: { subscriptionTier: subscription.tier }
          });

          logger.info('Payment processed and subscription activated', {
            paymentId,
            subscriptionId: payment.subscriptionId,
            userId: payment.userId
          });
        }
      }

      // If payment failed, handle accordingly
      if (status === PaymentStatus.FAILED && payment.subscriptionId) {
        await prisma.subscription.update({
          where: { id: payment.subscriptionId },
          data: { status: SubscriptionStatus.CANCELLED }
        });

        logger.warn('Payment failed, subscription cancelled', {
          paymentId,
          subscriptionId: payment.subscriptionId
        });
      }
    } catch (error) {
      logger.error('Failed to process payment', { paymentId, status, error });
      throw error;
    }
  }

  /**
   * Check and update expired subscriptions
   */
  static async updateExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          endDate: {
            lt: new Date()
          }
        }
      });

      for (const subscription of expiredSubscriptions) {
        // Update subscription status
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.EXPIRED }
        });

        // Update user subscription tier to FREE
        await prisma.user.update({
          where: { id: subscription.userId },
          data: { subscriptionTier: SubscriptionTier.FREE }
        });

        logger.info('Subscription expired and user downgraded', { 
          subscriptionId: subscription.id,
          userId: subscription.userId 
        });
      }

      logger.info(`Updated ${expiredSubscriptions.length} expired subscriptions`);
    } catch (error) {
      logger.error('Failed to update expired subscriptions', { error });
      throw error;
    }
  }
}
