import { Router } from 'express';
import { SubscriptionController } from '@/controllers/subscriptionController';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate, requireAdmin } from '@/middleware/auth';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createSubscriptionSchema = Joi.object({
  tier: commonSchemas.subscriptionTier.required(),
  billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').default('monthly'),
  paymentMethodId: Joi.string().optional()
});

const changeSubscriptionSchema = Joi.object({
  tier: commonSchemas.subscriptionTier.required(),
  billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').default('monthly')
});

const paymentWebhookSchema = Joi.object({
  paymentId: commonSchemas.id.required(),
  status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED').required(),
  transactionId: Joi.string().optional(),
  metadata: Joi.object().optional()
});

/**
 * @route   GET /api/subscriptions/plans
 * @desc    Get all subscription plans
 * @access  Public
 */
router.get('/plans', SubscriptionController.getSubscriptionPlans);

/**
 * @route   POST /api/subscriptions
 * @desc    Create subscription for user
 * @access  Private
 */
router.post('/', authenticate, validate(createSubscriptionSchema), SubscriptionController.createSubscription);

/**
 * @route   GET /api/subscriptions
 * @desc    Get user's subscriptions
 * @access  Private
 */
router.get('/', authenticate, SubscriptionController.getUserSubscriptions);

/**
 * @route   GET /api/subscriptions/active
 * @desc    Get active subscription for user
 * @access  Private
 */
router.get('/active', authenticate, SubscriptionController.getActiveSubscription);

/**
 * @route   GET /api/subscriptions/history
 * @desc    Get user's subscription history
 * @access  Private
 */
router.get('/history', authenticate, SubscriptionController.getUserSubscriptions);

/**
 * @route   PUT /api/subscriptions/change
 * @desc    Upgrade/Downgrade subscription
 * @access  Private
 */
router.put('/change', authenticate, validate(changeSubscriptionSchema), SubscriptionController.changeSubscription);

/**
 * @route   DELETE /api/subscriptions/:subscriptionId
 * @desc    Cancel subscription
 * @access  Private
 */
router.delete('/:subscriptionId',
  authenticate,
  validateParams({ subscriptionId: commonSchemas.id }),
  SubscriptionController.cancelSubscription
);

/**
 * @route   POST /api/subscriptions/webhook/payment
 * @desc    Process payment webhook
 * @access  Public (webhook)
 */
router.post('/webhook/payment', validate(paymentWebhookSchema), SubscriptionController.processPaymentWebhook);

/**
 * @route   GET /api/subscriptions/analytics
 * @desc    Get subscription analytics (Admin only)
 * @access  Private (Admin)
 */
router.get('/analytics', authenticate, requireAdmin, SubscriptionController.getSubscriptionAnalytics);

/**
 * @route   GET /api/subscriptions/health
 * @desc    Subscription service health check
 * @access  Public
 */
router.get('/health', SubscriptionController.healthCheck);

export { router as subscriptionRoutes };
