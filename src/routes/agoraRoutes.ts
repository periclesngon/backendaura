import { Router } from 'express';
import { AgoraController } from '../controllers/agoraController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const rtcTokenSchema = {
  body: Joi.object({
    channelName: Joi.string().required().min(1).max(64).messages({
      'string.empty': 'Channel name cannot be empty',
      'string.min': 'Channel name must be at least 1 character',
      'string.max': 'Channel name cannot exceed 64 characters',
      'any.required': 'Channel name is required'
    }),
    uid: Joi.alternatives().try(
      Joi.string().required(),
      Joi.number().integer().min(0).max(4294967295).required()
    ).messages({
      'any.required': 'UID is required',
      'number.min': 'UID must be a positive integer',
      'number.max': 'UID must be within valid range'
    }),
    role: Joi.string().valid('publisher', 'subscriber').required().messages({
      'any.only': 'Role must be either "publisher" or "subscriber"',
      'any.required': 'Role is required'
    }),
    expiry: Joi.number().integer().min(60).max(86400).optional().messages({
      'number.min': 'Expiry must be at least 60 seconds',
      'number.max': 'Expiry cannot exceed 24 hours (86400 seconds)'
    })
  })
};

const rtmTokenSchema = {
  body: Joi.object({
    uid: Joi.string().required().min(1).max(64).messages({
      'string.empty': 'UID cannot be empty',
      'string.min': 'UID must be at least 1 character',
      'string.max': 'UID cannot exceed 64 characters',
      'any.required': 'UID is required'
    }),
    expiry: Joi.number().integer().min(60).max(86400).optional().messages({
      'number.min': 'Expiry must be at least 60 seconds',
      'number.max': 'Expiry cannot exceed 24 hours (86400 seconds)'
    })
  })
};

const startRecordingSchema = {
  body: Joi.object({
    channelName: Joi.string().required().min(1).max(64),
    uid: Joi.string().required().min(1).max(64),
    recordingConfig: Joi.object({
      maxIdleTime: Joi.number().integer().min(5).max(2592000).optional(),
      streamTypes: Joi.number().integer().valid(0, 1, 2).optional(),
      audioProfile: Joi.number().integer().valid(0, 1, 2).optional(),
      channelType: Joi.number().integer().valid(0, 1).optional(),
      videoStreamType: Joi.number().integer().valid(0, 1).optional(),
      subscribeVideoUids: Joi.array().items(Joi.string()).optional(),
      subscribeAudioUids: Joi.array().items(Joi.string()).optional()
    }).optional(),
    storageConfig: Joi.object({
      vendor: Joi.number().integer().valid(0, 1, 2).optional(),
      region: Joi.number().integer().optional(),
      bucket: Joi.string().optional(),
      accessKey: Joi.string().optional(),
      secretKey: Joi.string().optional(),
      fileNamePrefix: Joi.array().items(Joi.string()).optional()
    }).optional()
  })
};

const stopRecordingSchema = {
  body: Joi.object({
    channelName: Joi.string().required(),
    uid: Joi.string().required(),
    resourceId: Joi.string().required(),
    sid: Joi.string().required()
  })
};

/**
 * @swagger
 * /api/agora/config:
 *   get:
 *     summary: Get Agora configuration for frontend
 *     tags: [Agora]
 *     responses:
 *       200:
 *         description: Agora configuration retrieved successfully
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
 *                     appId:
 *                       type: string
 *                     mode:
 *                       type: string
 *                     codec:
 *                       type: string
 *                     isConfigured:
 *                       type: boolean
 *                 message:
 *                   type: string
 */
router.get('/config', AgoraController.getConfig);

/**
 * @swagger
 * /api/agora/health:
 *   get:
 *     summary: Health check for Agora service
 *     tags: [Agora]
 *     responses:
 *       200:
 *         description: Agora service health status
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
 *                     service:
 *                       type: string
 *                     status:
 *                       type: string
 *                     features:
 *                       type: object
 *                     configuration:
 *                       type: object
 *                 message:
 *                   type: string
 */
router.get('/health', AgoraController.healthCheck);

/**
 * @swagger
 * /api/agora/rtc/token:
 *   post:
 *     summary: Generate RTC token for video/audio calls
 *     tags: [Agora]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - channelName
 *               - uid
 *               - role
 *             properties:
 *               channelName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 64
 *                 description: Channel name for the call
 *               uid:
 *                 oneOf:
 *                   - type: string
 *                   - type: integer
 *                 description: User ID (string or integer)
 *               role:
 *                 type: string
 *                 enum: [publisher, subscriber]
 *                 description: User role in the channel
 *               expiry:
 *                 type: integer
 *                 minimum: 60
 *                 maximum: 86400
 *                 description: Token expiry time in seconds (default 3600)
 *     responses:
 *       200:
 *         description: RTC token generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post('/rtc/token', authenticate, validate(rtcTokenSchema), AgoraController.generateRTCToken);

/**
 * @swagger
 * /api/agora/rtm/token:
 *   post:
 *     summary: Generate RTM token for messaging
 *     tags: [Agora]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uid
 *             properties:
 *               uid:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 64
 *                 description: User ID for messaging
 *               expiry:
 *                 type: integer
 *                 minimum: 60
 *                 maximum: 86400
 *                 description: Token expiry time in seconds (default 3600)
 *     responses:
 *       200:
 *         description: RTM token generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 */
router.post('/rtm/token', authenticate, validate(rtmTokenSchema), AgoraController.generateRTMToken);

/**
 * @swagger
 * /api/agora/recording/start:
 *   post:
 *     summary: Start cloud recording for a live session
 *     tags: [Agora]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - channelName
 *               - uid
 *             properties:
 *               channelName:
 *                 type: string
 *                 description: Channel name to record
 *               uid:
 *                 type: string
 *                 description: Recording bot UID
 *               recordingConfig:
 *                 type: object
 *                 description: Recording configuration options
 *               storageConfig:
 *                 type: object
 *                 description: Storage configuration for recordings
 *     responses:
 *       200:
 *         description: Cloud recording started successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Manager role required
 */
router.post('/recording/start', authenticate, requireRole(['SENIOR_MANAGER', 'JUNIOR_MANAGER', 'ADMIN']), validate(startRecordingSchema), AgoraController.startRecording);

/**
 * @swagger
 * /api/agora/recording/stop:
 *   post:
 *     summary: Stop cloud recording
 *     tags: [Agora]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - channelName
 *               - uid
 *               - resourceId
 *               - sid
 *             properties:
 *               channelName:
 *                 type: string
 *               uid:
 *                 type: string
 *               resourceId:
 *                 type: string
 *               sid:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cloud recording stopped successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Manager role required
 */
router.post('/recording/stop', authenticate, requireRole(['SENIOR_MANAGER', 'JUNIOR_MANAGER', 'ADMIN']), validate(stopRecordingSchema), AgoraController.stopRecording);

/**
 * @swagger
 * /api/agora/recording/{resourceId}/{sid}/status:
 *   get:
 *     summary: Get recording status
 *     tags: [Agora]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Recording resource ID
 *       - in: path
 *         name: sid
 *         required: true
 *         schema:
 *           type: string
 *         description: Recording session ID
 *     responses:
 *       200:
 *         description: Recording status retrieved successfully
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Manager role required
 */
router.get('/recording/:resourceId/:sid/status', authenticate, requireRole(['SENIOR_MANAGER', 'JUNIOR_MANAGER', 'ADMIN']), AgoraController.getRecordingStatus);

export default router;
