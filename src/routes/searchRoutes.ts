import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const searchQuerySchema = {
  query: Joi.object({
    q: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Search query must be at least 2 characters long',
      'string.max': 'Search query must not exceed 100 characters',
      'any.required': 'Search query is required'
    }),
    contentType: Joi.string().valid('ALL', 'COURSES', 'POSTS', 'TESTS', 'USERS').optional(),
    category: Joi.string().max(50).optional(),
    level: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').optional(),
    author: Joi.string().uuid().optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
    tags: Joi.string().optional(),
    page: Joi.number().integer().min(1).max(1000).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('relevance', 'date', 'popularity', 'title').default('relevance'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  })
};

const suggestionQuerySchema = {
  query: Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    limit: Joi.number().integer().min(1).max(20).default(5)
  })
};

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Global search across all content types
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Search query
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *           enum: [ALL, COURSES, POSTS, TESTS, USERS]
 *         description: Filter by content type
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
 *         description: Filter by difficulty level
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by author ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by creation date from
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by creation date to
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags
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
 *         description: Number of results per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [relevance, date, popularity, title]
 *           default: relevance
 *         description: Sort results by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
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
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                     filters:
 *                       type: object
 *                     suggestions:
 *                       type: array
 *                     facets:
 *                       type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid search query
 *       500:
 *         description: Search failed
 */
router.get('/', validate(searchQuerySchema as any), SearchController.globalSearch);

/**
 * @swagger
 * /api/search/courses:
 *   get:
 *     summary: Search courses
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Course search results
 */
router.get('/courses', validate(searchQuerySchema as any), SearchController.searchCourses);

/**
 * @swagger
 * /api/search/posts:
 *   get:
 *     summary: Search posts
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Post search results
 */
router.get('/posts', validate(searchQuerySchema as any), SearchController.searchPosts);

/**
 * @swagger
 * /api/search/tests:
 *   get:
 *     summary: Search tests
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Test search results
 */
router.get('/tests', validate(searchQuerySchema as any), SearchController.searchTests);

/**
 * @swagger
 * /api/search/users:
 *   get:
 *     summary: Search users
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: User search results
 *       401:
 *         description: Authentication required
 */
router.get('/users', authenticate, validate(searchQuerySchema as any), SearchController.searchUsers);

/**
 * @swagger
 * /api/search/suggestions:
 *   get:
 *     summary: Get search suggestions
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Partial search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Number of suggestions
 *     responses:
 *       200:
 *         description: Search suggestions retrieved successfully
 */
router.get('/suggestions', validate(suggestionQuerySchema as any), SearchController.getSearchSuggestions);

/**
 * @swagger
 * /api/search/facets:
 *   get:
 *     summary: Get search facets for filtering
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Search facets retrieved successfully
 */
router.get('/facets', validate(searchQuerySchema as any), SearchController.getSearchFacets);

export default router;
