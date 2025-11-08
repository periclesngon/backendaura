import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';
import express from 'express';

const router = Router();

// Validation schemas
const createCoursePaymentSchema = {
  body: Joi.object({
    courseId: Joi.string().required().messages({
      'any.required': 'Course ID is required'
    }),
    currency: Joi.string().valid('usd', 'eur', 'gbp').default('usd'),
    metadata: Joi.object().optional()
  })
};

const createSubscriptionPaymentSchema = {
  body: Joi.object({
    tier: Joi.string().valid('ESSENTIAL', 'PREMIUM', 'PRO').required().messages({
      'any.only': 'Subscription tier must be one of: ESSENTIAL, PREMIUM, PRO',
      'any.required': 'Subscription tier is required'
    }),
    billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').required().messages({
      'any.only': 'Billing cycle must be one of: monthly, quarterly, yearly',
      'any.required': 'Billing cycle is required'
    })
  })
};

const confirmPaymentSchema = {
  body: Joi.object({
    paymentIntentId: Joi.string().required().messages({
      'any.required': 'Payment intent ID is required'
    })
  })
};

const paginationSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

/**
 * @swagger
 * /api/payments/config:
 *   get:
 *     summary: Get Stripe configuration
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Stripe configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     publishableKey:
 *                       type: string
 *                     currency:
 *                       type: string
 *                 message:
 *                   type: string
 */
router.get('/config', PaymentController.getStripeConfig);

/**
 * @swagger
 * /api/payments/plans:
 *   get:
 *     summary: Get subscription plans
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Subscription plans retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     plans:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           price:
 *                             type: number
 *                           currency:
 *                             type: string
 *                           interval:
 *                             type: string
 *                           features:
 *                             type: array
 *                             items:
 *                               type: string
 *                 message:
 *                   type: string
 */
router.get('/plans', PaymentController.getSubscriptionPlans);

/**
 * @swagger
 * /api/payments/course/create-intent:
 *   post:
 *     summary: Create payment intent for course purchase
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the course to purchase
 *               currency:
 *                 type: string
 *                 enum: [usd, eur, gbp]
 *                 default: usd
 *                 description: Payment currency
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the payment
 *     responses:
 *       201:
 *         description: Payment intent created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentIntent:
 *                       type: object
 *                       properties:
 *                         clientSecret:
 *                           type: string
 *                         paymentIntentId:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         course:
 *                           type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Course not found
 *       403:
 *         description: Course not available for purchase
 */
router.post('/course/create-intent', authenticate, validate(createCoursePaymentSchema), PaymentController.createCoursePaymentIntent);

// Compatibility route for frontend
router.post('/create-payment-intent', authenticate, validate(createCoursePaymentSchema), PaymentController.createCoursePaymentIntent);

/**
 * @swagger
 * /api/payments/subscription/create-intent:
 *   post:
 *     summary: Create payment intent for subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [basic, premium, annual]
 *                 description: Subscription plan ID
 *     responses:
 *       201:
 *         description: Subscription payment intent created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Plan not found
 */
router.post('/subscription/create-intent', authenticate, validate(createSubscriptionPaymentSchema), PaymentController.createSubscriptionPaymentIntent);

/**
 * @swagger
 * /api/payments/course/confirm:
 *   post:
 *     summary: Confirm course payment and enroll user
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 description: Stripe payment intent ID
 *     responses:
 *       200:
 *         description: Payment confirmed and course access granted
 *       400:
 *         description: Invalid payment intent or payment not completed
 *       401:
 *         description: Authentication required
 */
router.post('/course/confirm', authenticate, validate(confirmPaymentSchema), PaymentController.confirmCoursePayment);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get user's payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of payments per page
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 */
router.get('/history', authenticate, validate(paginationSchema), PaymentController.getPaymentHistory);

/**
 * @swagger
 * /api/payments/subscription/{subscriptionId}/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe subscription ID
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Subscription not found
 */
router.post('/subscription/:subscriptionId/cancel', authenticate, PaymentController.cancelSubscription);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Handle Stripe webhooks
 *     tags: [Payments]
 *     description: Endpoint for Stripe webhook events (raw body required)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 *       500:
 *         description: Webhook processing failed
 */
// Webhook endpoint needs raw body, so we use express.raw() middleware
router.post('/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);

export default router;
