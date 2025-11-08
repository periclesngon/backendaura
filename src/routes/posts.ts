import { Router } from 'express';
import { PostController } from '@/controllers/postController';
import { validate, validateParams, commonSchemas } from '@/middleware/validation';
import { authenticate, requireManager } from '@/middleware/auth';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createPostSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  content: Joi.string().min(1).required(),
  excerpt: Joi.string().max(500).optional(),
  media: Joi.string().uri().optional(),
  visibility: Joi.string().valid('PUBLIC', 'SUBSCRIBERS_ONLY', 'PRIVATE').default('PUBLIC'),
  status: Joi.string().valid('DRAFT', 'PUBLISHED', 'SCHEDULED').default('DRAFT'),
  category: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  objectives: Joi.array().items(Joi.string()).optional(),
  keyPoints: Joi.array().items(Joi.string()).optional(),
  level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
  targetTier: Joi.string().valid('FREE', 'ESSENTIAL', 'PREMIUM', 'PRO').default('FREE'),
  scheduledAt: Joi.date().optional()
});

const updatePostSchema = Joi.object({
  title: Joi.string().min(1).max(200).optional(),
  content: Joi.string().min(1).optional(),
  excerpt: Joi.string().max(500).optional(),
  media: Joi.string().uri().optional(),
  visibility: Joi.string().valid('PUBLIC', 'SUBSCRIBERS_ONLY', 'PRIVATE').optional(),
  status: Joi.string().valid('DRAFT', 'PUBLISHED', 'ARCHIVED', 'SCHEDULED').optional(),
  category: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  objectives: Joi.array().items(Joi.string()).optional(),
  keyPoints: Joi.array().items(Joi.string()).optional(),
  level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional(),
  targetTier: Joi.string().valid('FREE', 'ESSENTIAL', 'PREMIUM', 'PRO').optional(),
  scheduledAt: Joi.date().optional()
});

const commentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
  parentId: Joi.string().optional()
});

const shareSchema = Joi.object({
  platform: Joi.string().optional()
});

/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: Get all posts
 *     tags: [Posts]
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
 *         description: Number of posts per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *         description: Filter by level
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, content, and excerpt
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', PostController.getAllPosts);

/**
 * @swagger
 * /api/posts/trending:
 *   get:
 *     summary: Get trending posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of trending posts
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1d, 7d, 30d]
 *           default: 7d
 *         description: Timeframe for trending calculation
 *     responses:
 *       200:
 *         description: Trending posts retrieved successfully
 */
router.get('/trending', PostController.getTrendingPosts);

/**
 * @swagger
 * /api/posts/search:
 *   get:
 *     summary: Search posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: Search query
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *       400:
 *         description: Search query is required
 */
router.get('/search', PostController.searchPosts);

/**
 * @swagger
 * /api/posts/my:
 *   get:
 *     summary: Get current user's posts
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PUBLISHED, ARCHIVED, SCHEDULED]
 *     responses:
 *       200:
 *         description: User posts retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/my', authenticate, PostController.getUserPosts);

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               content:
 *                 type: string
 *                 minLength: 1
 *               excerpt:
 *                 type: string
 *                 maxLength: 500
 *               visibility:
 *                 type: string
 *                 enum: [PUBLIC, SUBSCRIBERS_ONLY, PRIVATE]
 *                 default: PUBLIC
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PUBLISHED, SCHEDULED]
 *                 default: DRAFT
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               level:
 *                 type: string
 *                 enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *     responses:
 *       201:
 *         description: Post created successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', authenticate, requireManager, validate(createPostSchema), PostController.createPost);

/**
 * @swagger
 * /api/posts/{postId}:
 *   get:
 *     summary: Get post by ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:postId',
  validateParams({ postId: commonSchemas.id }),
  PostController.getPostById
);

/**
 * @swagger
 * /api/posts/{postId}:
 *   put:
 *     summary: Update post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PUBLISHED, ARCHIVED, SCHEDULED]
 *     responses:
 *       200:
 *         description: Post updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:postId',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  validate(updatePostSchema),
  PostController.updatePost
);

/**
 * @swagger
 * /api/posts/{postId}:
 *   delete:
 *     summary: Delete post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:postId',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  PostController.deletePost
);

/**
 * @swagger
 * /api/posts/{postId}/like:
 *   post:
 *     summary: Like/unlike post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post like toggled successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:postId/like',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  PostController.toggleLike
);

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   get:
 *     summary: Get post comments
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:postId/comments',
  validateParams({ postId: commonSchemas.id }),
  PostController.getComments
);

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   post:
 *     summary: Add comment to post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *               parentId:
 *                 type: string
 *                 description: ID of parent comment for replies
 *     responses:
 *       201:
 *         description: Comment added successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:postId/comments',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  validate(commentSchema),
  PostController.addComment
);

/**
 * @swagger
 * /api/posts/{postId}/share:
 *   post:
 *     summary: Share post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *                 description: Social media platform
 *     responses:
 *       201:
 *         description: Post shared successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:postId/share',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  validate(shareSchema),
  PostController.sharePost
);

/**
 * @swagger
 * /api/posts/{postId}/analytics:
 *   get:
 *     summary: Get post analytics
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post analytics retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:postId/analytics',
  authenticate,
  validateParams({ postId: commonSchemas.id }),
  PostController.getPostAnalytics
);

export { router as postRoutes };
