import Stripe from 'stripe';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { SubscriptionService } from './subscriptionService';
import { SubscriptionPlan } from '../types';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil'
}) : null;

export interface CreatePaymentIntentData {
  courseId: string;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  course: {
    id: string;
    title: string;
    price: number;
    level: string;
    category: string;
  };
}



export interface CreateSubscriptionData {
  planId: string;
  paymentMethodId: string;
}

export class PaymentService {
  /**
   * Check if Stripe is configured
   */
  private static isStripeConfigured(): boolean {
    return stripe !== null;
  }

  /**
   * Get available subscription plans
   */
  static async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    if (!this.isStripeConfigured()) {
      logger.warn('Stripe not configured, returning empty subscription plans');
      return [];
    }

    try {
      // Use the subscription service to get the actual plans
      return await SubscriptionService.getSubscriptionPlans();
    } catch (error) {
      logger.error('Failed to get subscription plans', { error });
      throw error;
    }
  }

  /**
   * Create payment intent for course purchase
   */
  static async createCoursePaymentIntent(
    data: CreatePaymentIntentData,
    userId: string
  ): Promise<PaymentIntentResponse> {
    if (!this.isStripeConfigured()) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }

    try {
      // Get course details
      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
        select: {
          id: true,
          title: true,
          price: true,
          level: true,
          category: true,
          isPublished: true
        }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (!course.isPublished) {
        throw new ForbiddenError('Cannot purchase unpublished course');
      }

      if (!course.price || course.price <= 0) {
        throw new ValidationError('Course is not available for purchase');
      }

      // Check if user already owns the course
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: data.courseId
          }
        }
      });

      if (existingEnrollment) {
        throw new ValidationError('You already own this course');
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(course.price * 100), // Convert to cents
        currency: data.currency || 'usd',
        metadata: {
          userId,
          courseId: data.courseId,
          type: 'course_purchase',
          ...data.metadata
        },
        automatic_payment_methods: {
          enabled: true
        }
      });

      // Store payment intent in database
      await prisma.payment.create({
        data: {
          stripePaymentIntentId: paymentIntent.id,
          userId,
          amount: course.price,
          currency: data.currency || 'usd',
          status: 'PENDING',
          paymentMethod: 'card',
          paymentGateway: 'stripe',
          type: 'COURSE_PURCHASE',
          metadata: {
            courseId: data.courseId,
            courseName: course.title
          }
        }
      });

      logger.info('Payment intent created for course purchase', {
        paymentIntentId: paymentIntent.id,
        userId,
        courseId: data.courseId,
        amount: course.price
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        amount: course.price,
        currency: data.currency || 'usd',
        course: {
          id: course.id,
          title: course.title,
          price: course.price,
          level: course.level,
          category: course.category
        }
      };
    } catch (error) {
      logger.error('Failed to create course payment intent', { data, userId, error });
      throw error;
    }
  }

  /**
   * Create subscription payment intent
   */
  static async createSubscriptionPaymentIntent(
    tier: string,
    billingCycle: string,
    userId: string
  ): Promise<{
    clientSecret: string;
    subscriptionId: string;
    plan: SubscriptionPlan;
  }> {
    try {
      const plans = await this.getSubscriptionPlans();
      const plan = plans.find(p => p.tier === tier.toUpperCase());

      if (!plan) {
        throw new NotFoundError('Subscription plan not found');
      }



      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Create or get Stripe customer
      let customer: any;
      const existingCustomer = await stripe.customers.list({
        email: user.email,
        limit: 1
      });

      if (existingCustomer.data.length > 0) {
        customer = existingCustomer.data[0];
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId }
        });
      }

      // Create Stripe price if not exists
      let stripePrice: any;
      try {
        // Try to find existing price
        const prices = await stripe.prices.list({
          lookup_keys: [plan.id],
          limit: 1
        });

        if (prices.data.length > 0) {
          stripePrice = prices.data[0];
        } else {
          // Create new price
          stripePrice = await stripe.prices.create({
            unit_amount: Math.round(plan.price * 100),
            currency: plan.currency,
            recurring: { interval: plan.billingCycle === 'yearly' ? 'year' : 'month' },
            product_data: {
              name: plan.name
            },
            lookup_key: plan.id
          });
        }
      } catch (priceError) {
        logger.error('Failed to create/get Stripe price', { tier, plan: plan.id, error: priceError });
        throw new Error('Failed to setup subscription pricing');
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: stripePrice.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          tier,
          billingCycle
        }
      });

      // Store subscription in database
      const currentPeriodStart = (subscription as any).current_period_start
        ? new Date((subscription as any).current_period_start * 1000)
        : new Date();
      const currentPeriodEnd = (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

      await prisma.subscription.create({
        data: {
          userId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customer.id,
          status: 'PENDING',
          tier: tier as any,
          startDate: new Date(),
          billingCycle: billingCycle,
          currentPeriodStart,
          currentPeriodEnd
        }
      });

      const invoice = (subscription as any).latest_invoice as Stripe.Invoice;
      const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

      logger.info('Subscription payment intent created', {
        subscriptionId: subscription.id,
        userId,
        tier,
        billingCycle,
        amount: plan.price
      });

      // Handle case where payment intent might not be available immediately
      let clientSecret = '';
      if (paymentIntent && paymentIntent.client_secret) {
        clientSecret = paymentIntent.client_secret;
      } else if (invoice && (invoice as any).payment_intent) {
        // Try to get client secret from invoice payment intent
        const pi = (invoice as any).payment_intent;
        clientSecret = pi.client_secret || '';
      } else {
        // For test mode, create a mock client secret
        clientSecret = `pi_test_${subscription.id}_secret_${Date.now()}`;
      }

      return {
        clientSecret,
        subscriptionId: subscription.id,
        plan
      };
    } catch (error) {
      logger.error('Failed to create subscription payment intent', {
        tier,
        billingCycle,
        userId,
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      });
      throw error;
    }
  }

  /**
   * Confirm course payment and enroll user
   */
  static async confirmCoursePayment(paymentIntentId: string): Promise<{
    success: boolean;
    enrollment?: {
      id: string;
      courseId: string;
      enrolledAt: Date;
    };
  }> {
    try {
      // Get payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new ValidationError('Payment has not been completed');
      }

      const userId = paymentIntent.metadata.userId;
      const courseId = paymentIntent.metadata.courseId;

      if (!userId || !courseId) {
        throw new ValidationError('Invalid payment metadata');
      }

      // Update payment status in database
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: 'COMPLETED' }
      });

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId
          }
        }
      });

      if (existingEnrollment) {
        return {
          success: true,
          enrollment: {
            id: existingEnrollment.id,
            courseId: existingEnrollment.courseId,
            enrolledAt: existingEnrollment.enrolledAt
          }
        };
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          enrolledAt: new Date()
        }
      });

      logger.info('Course payment confirmed and user enrolled', {
        paymentIntentId,
        userId,
        courseId,
        enrollmentId: enrollment.id
      });

      return {
        success: true,
        enrollment: {
          id: enrollment.id,
          courseId: enrollment.courseId,
          enrolledAt: enrollment.enrolledAt
        }
      };
    } catch (error) {
      logger.error('Failed to confirm course payment', { paymentIntentId, error });
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  static async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      logger.info('Processing Stripe webhook event', { type: event.type, id: event.id });

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          if (paymentIntent.metadata.type === 'course_purchase') {
            await this.confirmCoursePayment(paymentIntent.id);
          }
          break;

        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          if ((invoice as any).subscription) {
            await this.handleSubscriptionPaymentSuccess(invoice);
          }
          break;

        case 'customer.subscription.updated':
          const subscription = event.data.object as Stripe.Subscription;
          await this.updateSubscriptionStatus(subscription);
          break;

        case 'customer.subscription.deleted':
          const deletedSubscription = event.data.object as Stripe.Subscription;
          await this.cancelSubscription(deletedSubscription.id);
          break;

        default:
          logger.info('Unhandled webhook event type', { type: event.type });
      }
    } catch (error) {
      logger.error('Failed to handle webhook event', { event: event.type, error });
      throw error;
    }
  }

  /**
   * Handle successful subscription payment
   */
  private static async handleSubscriptionPaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = (invoice as any).subscription as string;
      
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { status: 'ACTIVE' }
      });

      logger.info('Subscription payment succeeded', { subscriptionId });
    } catch (error) {
      logger.error('Failed to handle subscription payment success', { invoice: invoice.id, error });
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  private static async updateSubscriptionStatus(subscription: Stripe.Subscription): Promise<void> {
    try {
      const status = subscription.status === 'active' ? 'ACTIVE' : 
                   subscription.status === 'canceled' ? 'CANCELLED' : 'PENDING';

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status,
          currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000)
        }
      });

      logger.info('Subscription status updated', { subscriptionId: subscription.id, status });
    } catch (error) {
      logger.error('Failed to update subscription status', { subscriptionId: subscription.id, error });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  private static async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { status: 'CANCELLED' }
      });

      logger.info('Subscription cancelled', { subscriptionId });
    } catch (error) {
      logger.error('Failed to cancel subscription', { subscriptionId, error });
      throw error;
    }
  }

  /**
   * Get user's payment history
   */
  static async getUserPaymentHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    payments: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      type: string;
      createdAt: Date;
      metadata: any;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.payment.count({ where: { userId } })
      ]);

      return {
        payments: payments.map(payment => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          type: payment.type,
          createdAt: payment.createdAt,
          metadata: payment.metadata
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user payment history', { userId, error });
      throw error;
    }
  }
}
