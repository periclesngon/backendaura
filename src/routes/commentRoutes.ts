import { Router } from 'express';
import { CommentController, SocialController } from '../controllers/commentController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createCommentSchema = {
  body: Joi.object({
    content: Joi.string().min(1).max(2000).required().messages({
      'string.min': 'Comment content cannot be empty',
      'string.max': 'Comment content must not exceed 2000 characters',
      'any.required': 'Comment content is required'
    }),
    parentId: Joi.string().uuid().optional().messages({
      'string.uuid': 'Parent ID must be a valid UUID'
    })
  })
};

const updateCommentSchema = {
  body: Joi.object({
    content: Joi.string().min(1).max(2000).required().messages({
      'string.min': 'Comment content cannot be empty',
      'string.max': 'Comment content must not exceed 2000 characters',
      'any.required': 'Comment content is required'
    })
  })
};

const sharePostSchema = {
  body: Joi.object({
    platform: Joi.string().valid('internal', 'facebook', 'twitter', 'linkedin', 'whatsapp').optional()
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
 * /api/posts/{postId}/comments:
 *   get:
 *     summary: Get comments for a post
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Post ID
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
 *         description: Number of comments per page
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
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
 *                     comments:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                 message:
 *                   type: string
 *       404:
 *         description: Post not found
 */
router.get('/posts/:postId/comments', validate(paginationSchema as any), CommentController.getPostComments);

/**
 * @swagger
 * /api/posts/{postId}/comments:
 *   post:
 *     summary: Create a comment on a post
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Post ID
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
 *                 description: Comment content
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 description: Parent comment ID for replies
 *     responses:
 *       201:
 *         description: Comment created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Post not found
 */
router.post('/posts/:postId/comments', authenticate, validate(createCommentSchema as any), CommentController.createComment);

/**
 * @swagger
 * /api/comments/{commentId}:
 *   get:
 *     summary: Get comment by ID
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment retrieved successfully
 *       404:
 *         description: Comment not found
 */
router.get('/comments/:commentId', CommentController.getCommentById);

/**
 * @swagger
 * /api/comments/{commentId}:
 *   put:
 *     summary: Update a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Comment ID
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
 *                 description: Updated comment content
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to update this comment
 *       404:
 *         description: Comment not found
 */
router.put('/comments/:commentId', authenticate, validate(updateCommentSchema as any), CommentController.updateComment);

/**
 * @swagger
 * /api/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to delete this comment
 *       404:
 *         description: Comment not found
 */
router.delete('/comments/:commentId', authenticate, CommentController.deleteComment);

/**
 * @swagger
 * /api/comments/{commentId}/like:
 *   post:
 *     summary: Toggle like on a comment
 *     tags: [Social Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment like toggled successfully
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
 *                     isLiked:
 *                       type: boolean
 *                     likeCount:
 *                       type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Comment not found
 */
router.post('/comments/:commentId/like', authenticate, CommentController.toggleCommentLike);

/**
 * @swagger
 * /api/posts/{postId}/like:
 *   post:
 *     summary: Toggle like on a post
 *     tags: [Social Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post like toggled successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Post not found
 */
router.post('/posts/:postId/like', authenticate, SocialController.togglePostLike);

/**
 * @swagger
 * /api/posts/{postId}/share:
 *   post:
 *     summary: Share a post
 *     tags: [Social Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Post ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [internal, facebook, twitter, linkedin, whatsapp]
 *                 description: Platform where the post is shared
 *     responses:
 *       200:
 *         description: Post shared successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Post not found
 */
router.post('/posts/:postId/share', authenticate, validate(sharePostSchema as any), SocialController.sharePost);

/**
 * @swagger
 * /api/posts/{postId}/engagement:
 *   get:
 *     summary: Get post engagement statistics
 *     tags: [Social Interactions]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post engagement retrieved successfully
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
 *                     engagement:
 *                       type: object
 *                       properties:
 *                         likeCount:
 *                           type: integer
 *                         commentCount:
 *                           type: integer
 *                         shareCount:
 *                           type: integer
 *                         isLiked:
 *                           type: boolean
 *                         hasShared:
 *                           type: boolean
 *                 message:
 *                   type: string
 */
router.get('/posts/:postId/engagement', SocialController.getPostEngagement);

export default router;
