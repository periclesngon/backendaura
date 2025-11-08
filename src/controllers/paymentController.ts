import { Request, Response } from 'express';
import { PaymentService } from '../services/paymentService';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil'
}) : null;

export class PaymentController {
  /**
   * Get subscription plans
   */
  static async getSubscriptionPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await PaymentService.getSubscriptionPlans();

      res.json({
        success: true,
        data: { plans },
        message: 'Subscription plans retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get subscription plans', { error });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get subscription plans',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'PLANS_FETCH_ERROR'
        }
      });
    }
  }

  /**
   * Create payment intent for course purchase
   */
  static async createCoursePaymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const { courseId, currency, metadata } = req.body;
      const userId = req.user!.userId;

      if (!courseId) {
        throw new ValidationError('Course ID is required');
      }

      const paymentIntent = await PaymentService.createCoursePaymentIntent(
        { courseId, currency, metadata },
        userId
      );

      res.status(201).json({
        success: true,
        data: { paymentIntent },
        message: 'Payment intent created successfully'
      });
    } catch (error) {
      logger.error('Failed to create course payment intent', { 
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create payment intent',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'PAYMENT_INTENT_ERROR'
          }
        });
      }
    }
  }

  /**
   * Create subscription payment intent
   */
  static async createSubscriptionPaymentIntent(req: Request, res: Response): Promise<void> {
    try {
      const { tier, billingCycle } = req.body;
      const userId = req.user!.userId;

      if (!tier) {
        throw new ValidationError('Subscription tier is required');
      }

      if (!billingCycle) {
        throw new ValidationError('Billing cycle is required');
      }

      const subscription = await PaymentService.createSubscriptionPaymentIntent(tier, billingCycle, userId);

      res.status(201).json({
        success: true,
        data: { subscription },
        message: 'Subscription payment intent created successfully'
      });
    } catch (error) {
      logger.error('Failed to create subscription payment intent', { 
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'PLAN_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create subscription payment intent',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'SUBSCRIPTION_INTENT_ERROR'
          }
        });
      }
    }
  }

  /**
   * Confirm course payment
   */
  static async confirmCoursePayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        throw new ValidationError('Payment intent ID is required');
      }

      const result = await PaymentService.confirmCoursePayment(paymentIntentId);

      res.json({
        success: true,
        data: result,
        message: 'Payment confirmed and course access granted'
      });
    } catch (error) {
      logger.error('Failed to confirm course payment', { 
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to confirm payment',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'PAYMENT_CONFIRMATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get user's payment history
   */
  static async getPaymentHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      const result = await PaymentService.getUserPaymentHistory(userId, page, limit);

      res.json({
        success: true,
        data: result,
        message: `Retrieved ${result.payments.length} payment records`
      });
    } catch (error) {
      logger.error('Failed to get payment history', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get payment history',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'PAYMENT_HISTORY_ERROR'
          }
        });
      }
    }
  }

  /**
   * Handle Stripe webhooks
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error('Stripe webhook secret not configured');
      }

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        logger.error('Webhook signature verification failed', { error: err });
        res.status(400).json({
          success: false,
          error: {
            message: 'Webhook signature verification failed',
            code: 'WEBHOOK_SIGNATURE_ERROR'
          }
        });
        return;
      }

      await PaymentService.handleWebhookEvent(event);

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      logger.error('Failed to handle webhook', { error });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to process webhook',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'WEBHOOK_PROCESSING_ERROR'
        }
      });
    }
  }

  /**
   * Get Stripe publishable key
   */
  static async getStripeConfig(req: Request, res: Response): Promise<void> {
    try {
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

      if (!publishableKey) {
        throw new Error('Stripe publishable key not configured');
      }

      res.json({
        success: true,
        data: {
          publishableKey,
          currency: 'usd'
        },
        message: 'Stripe configuration retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get Stripe config', { error });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get payment configuration',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'STRIPE_CONFIG_ERROR'
        }
      });
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user!.userId;

      // Verify user owns the subscription
      const subscription = await prisma.subscription.findFirst({
        where: {
          stripeSubscriptionId: subscriptionId,
          userId
        }
      });

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Cancel in Stripe
      await stripe.subscriptions.cancel(subscriptionId);

      res.json({
        success: true,
        message: 'Subscription cancelled successfully'
      });
    } catch (error) {
      logger.error('Failed to cancel subscription', { 
        subscriptionId: req.params.subscriptionId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'SUBSCRIPTION_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to cancel subscription',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'SUBSCRIPTION_CANCEL_ERROR'
          }
        });
      }
    }
  }
}
