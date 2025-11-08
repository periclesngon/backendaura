import { Router } from 'express';
import { FavoriteController } from '@/controllers/favoriteController';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate } from '@/middleware/auth';
import Joi from 'joi';

const router = Router();

// Validation schemas
const addFavoriteSchema = Joi.object({
  contentId: Joi.string().required(),
  contentType: Joi.string().valid('COURSE', 'TEST', 'LIVE_SESSION', 'POST', 'DOCUMENT', 'VIDEO', 'AUDIO').required(),
  folder: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  notes: Joi.string().max(1000).optional()
});

const updateFavoriteSchema = Joi.object({
  folder: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  notes: Joi.string().max(1000).optional()
});

const createFolderSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional()
});

const updateFolderSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional()
});

const bulkOperationSchema = Joi.object({
  operation: Joi.string().valid('move', 'delete', 'removeFolder').required(),
  favoriteIds: Joi.array().items(Joi.string()).min(1).required(),
  targetFolder: Joi.string().optional()
});

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get user's favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of favorites per page
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *           enum: [COURSE, TEST, LIVE_SESSION, POST, DOCUMENT, VIDEO, AUDIO]
 *         description: Filter by content type
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *         description: Filter by folder
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in notes and tags
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticate, FavoriteController.getFavorites);

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Add item to favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contentId
 *               - contentType
 *             properties:
 *               contentId:
 *                 type: string
 *                 description: ID of the content to favorite
 *               contentType:
 *                 type: string
 *                 enum: [COURSE, TEST, LIVE_SESSION, POST, DOCUMENT, VIDEO, AUDIO]
 *                 description: Type of content
 *               folder:
 *                 type: string
 *                 description: Folder to organize the favorite
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags for the favorite
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Personal notes about the favorite
 *     responses:
 *       201:
 *         description: Item added to favorites successfully
 *       400:
 *         description: Item is already in favorites or validation error
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Content not found
 */
router.post('/', authenticate, validate(addFavoriteSchema), FavoriteController.addToFavorites);

/**
 * @swagger
 * /api/favorites/check:
 *   get:
 *     summary: Check if item is favorited
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: contentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID to check
 *       - in: query
 *         name: contentType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [COURSE, TEST, LIVE_SESSION, POST, DOCUMENT, VIDEO, AUDIO]
 *         description: Content type to check
 *     responses:
 *       200:
 *         description: Favorite status checked successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         description: Missing required parameters
 */
router.get('/check', authenticate, FavoriteController.checkFavorite);

/**
 * @swagger
 * /api/favorites/stats:
 *   get:
 *     summary: Get favorite statistics
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorite statistics retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/stats', authenticate, FavoriteController.getFavoriteStats);

/**
 * @swagger
 * /api/favorites/folders:
 *   get:
 *     summary: Get favorite folders
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorite folders retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/folders', authenticate, FavoriteController.getFolders);

/**
 * @swagger
 * /api/favorites/folders:
 *   post:
 *     summary: Create favorite folder
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-F]{6}$'
 *                 description: Hex color code
 *     responses:
 *       201:
 *         description: Favorite folder created successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/folders', authenticate, validate(createFolderSchema), FavoriteController.createFolder);

/**
 * @swagger
 * /api/favorites/bulk:
 *   post:
 *     summary: Bulk operations on favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operation
 *               - favoriteIds
 *             properties:
 *               operation:
 *                 type: string
 *                 enum: [move, delete, removeFolder]
 *                 description: Bulk operation to perform
 *               favoriteIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: Array of favorite IDs
 *               targetFolder:
 *                 type: string
 *                 description: Target folder for move operation
 *     responses:
 *       200:
 *         description: Bulk operation completed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/bulk', authenticate, validate(bulkOperationSchema), FavoriteController.bulkOperation);

/**
 * @swagger
 * /api/favorites/{favoriteId}:
 *   put:
 *     summary: Update favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: favoriteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Favorite ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folder:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Favorite updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:favoriteId',
  authenticate,
  validateParams({ favoriteId: commonSchemas.id }),
  validate(updateFavoriteSchema),
  FavoriteController.updateFavorite
);

/**
 * @swagger
 * /api/favorites/{favoriteId}:
 *   delete:
 *     summary: Remove from favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: favoriteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Favorite ID
 *     responses:
 *       200:
 *         description: Item removed from favorites successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:favoriteId',
  authenticate,
  validateParams({ favoriteId: commonSchemas.id }),
  FavoriteController.removeFromFavorites
);

/**
 * @swagger
 * /api/favorites/folders/{folderId}:
 *   put:
 *     summary: Update favorite folder
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-F]{6}$'
 *     responses:
 *       200:
 *         description: Favorite folder updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/folders/:folderId',
  authenticate,
  validateParams({ folderId: commonSchemas.id }),
  validate(updateFolderSchema),
  FavoriteController.updateFolder
);

/**
 * @swagger
 * /api/favorites/folders/{folderId}:
 *   delete:
 *     summary: Delete favorite folder
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID
 *     responses:
 *       200:
 *         description: Favorite folder deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/folders/:folderId',
  authenticate,
  validateParams({ folderId: commonSchemas.id }),
  FavoriteController.deleteFolder
);

export { router as favoriteRoutes };
