import { Router } from 'express';
import { CourseContentController, LessonController } from '../controllers/courseContentController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createCourseSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Course title cannot be empty',
      'string.max': 'Course title must not exceed 200 characters',
      'any.required': 'Course title is required'
    }),
    description: Joi.string().min(1).max(2000).required().messages({
      'string.min': 'Course description cannot be empty',
      'string.max': 'Course description must not exceed 2000 characters',
      'any.required': 'Course description is required'
    }),
    level: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').required().messages({
      'any.only': 'Level must be BEGINNER, INTERMEDIATE, or ADVANCED',
      'any.required': 'Course level is required'
    }),
    category: Joi.string().valid('GRAMMAR', 'VOCABULARY', 'LISTENING', 'READING', 'WRITING', 'SPEAKING', 'CULTURE', 'BUSINESS', 'EXAM_PREP').required().messages({
      'any.only': 'Category must be a valid course category',
      'any.required': 'Course category is required'
    }),
    duration: Joi.number().integer().min(1).optional(),
    price: Joi.number().min(0).optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),
    thumbnail: Joi.string().uri().optional()
  })
};

const updateCourseSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(200).optional(),
    description: Joi.string().min(1).max(2000).optional(),
    level: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').optional(),
    category: Joi.string().valid('GRAMMAR', 'VOCABULARY', 'LISTENING', 'READING', 'WRITING', 'SPEAKING', 'CULTURE', 'BUSINESS', 'EXAM_PREP').optional(),
    duration: Joi.number().integer().min(1).optional(),
    price: Joi.number().min(0).optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),
    thumbnail: Joi.string().uri().optional(),
    isPublished: Joi.boolean().optional()
  })
};

const createLessonSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Lesson title cannot be empty',
      'string.max': 'Lesson title must not exceed 200 characters',
      'any.required': 'Lesson title is required'
    }),
    content: Joi.string().min(1).required().messages({
      'string.min': 'Lesson content cannot be empty',
      'any.required': 'Lesson content is required'
    }),
    videoUrl: Joi.string().uri().optional(),
    duration: Joi.number().integer().min(1).optional(),
    order: Joi.number().integer().min(1).required().messages({
      'number.min': 'Lesson order must be at least 1',
      'any.required': 'Lesson order is required'
    }),
    resources: Joi.array().items(Joi.string().uri()).optional()
  })
};

const courseQuerySchema = {
  query: Joi.object({
    level: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').optional(),
    category: Joi.string().valid('GRAMMAR', 'VOCABULARY', 'LISTENING', 'READING', 'WRITING', 'SPEAKING', 'CULTURE', 'BUSINESS', 'EXAM_PREP').optional(),
    isPublished: Joi.boolean().optional(),
    createdBy: Joi.string().uuid().optional(),
    search: Joi.string().max(100).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('title', 'createdAt', 'enrollments').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  })
};

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Get all courses with filtering and pagination
 *     tags: [Courses]
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *         description: Filter by course level
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [GRAMMAR, VOCABULARY, LISTENING, READING, WRITING, SPEAKING, CULTURE, BUSINESS, EXAM_PREP]
 *         description: Filter by course category
 *       - in: query
 *         name: isPublished
 *         schema:
 *           type: boolean
 *         description: Filter by published status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, description, and tags
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
 *         description: Number of courses per page
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 */
router.get('/', validate(courseQuerySchema as any), CourseContentController.getCourses);

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
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
 *               - description
 *               - level
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               level:
 *                 type: string
 *                 enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *               category:
 *                 type: string
 *                 enum: [GRAMMAR, VOCABULARY, LISTENING, READING, WRITING, SPEAKING, CULTURE, BUSINESS, EXAM_PREP]
 *               duration:
 *                 type: integer
 *                 minimum: 1
 *               price:
 *                 type: number
 *                 minimum: 0
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               thumbnail:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Manager role required
 */
router.post('/', authenticate, validate(createCourseSchema as any), CourseContentController.createCourse);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   get:
 *     summary: Get course by ID
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course retrieved successfully
 *       404:
 *         description: Course not found
 */
router.get('/:courseId', CourseContentController.getCourseById);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   put:
 *     summary: Update a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               level:
 *                 type: string
 *                 enum: [BEGINNER, INTERMEDIATE, ADVANCED]
 *               category:
 *                 type: string
 *                 enum: [GRAMMAR, VOCABULARY, LISTENING, READING, WRITING, SPEAKING, CULTURE, BUSINESS, EXAM_PREP]
 *               isPublished:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to update this course
 *       404:
 *         description: Course not found
 */
router.put('/:courseId', authenticate, validate(updateCourseSchema as any), CourseContentController.updateCourse);

/**
 * @swagger
 * /api/courses/{courseId}:
 *   delete:
 *     summary: Delete a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to delete this course
 *       404:
 *         description: Course not found
 */
router.delete('/:courseId', authenticate, CourseContentController.deleteCourse);

/**
 * @swagger
 * /api/courses/{courseId}/enroll:
 *   post:
 *     summary: Enroll in a course
 *     tags: [Course Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     responses:
 *       201:
 *         description: Successfully enrolled in course
 *       400:
 *         description: Already enrolled or invalid request
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Cannot enroll in unpublished course
 *       404:
 *         description: Course not found
 */
router.post('/:courseId/enroll', authenticate, CourseContentController.enrollInCourse);

/**
 * @swagger
 * /api/courses/{courseId}/lessons:
 *   post:
 *     summary: Create a lesson for a course
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - order
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               content:
 *                 type: string
 *               videoUrl:
 *                 type: string
 *                 format: uri
 *               duration:
 *                 type: integer
 *                 minimum: 1
 *               order:
 *                 type: integer
 *                 minimum: 1
 *               resources:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *     responses:
 *       201:
 *         description: Lesson created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to add lessons to this course
 *       404:
 *         description: Course not found
 */
router.post('/:courseId/lessons', authenticate, validate(createLessonSchema as any), LessonController.createLesson);

/**
 * @swagger
 * /api/courses/{courseId}/lessons:
 *   get:
 *     summary: Get lessons for a course
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Lessons retrieved successfully
 *       404:
 *         description: Course not found
 */
router.get('/:courseId/lessons', LessonController.getCourseLessons);

// Course content upload route will be implemented later
// router.post('/:courseId/content/upload', authenticate, CourseContentController.uploadCourseContent);

/**
 * @swagger
 * /api/lessons/{lessonId}/complete:
 *   post:
 *     summary: Mark lesson as completed
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Lesson ID
 *     responses:
 *       200:
 *         description: Lesson marked as completed
 *       400:
 *         description: Lesson already completed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Must be enrolled in course
 *       404:
 *         description: Lesson not found
 */
router.post('/lessons/:lessonId/complete', authenticate, LessonController.markLessonCompleted);

/**
 * @swagger
 * /api/courses/enrolled:
 *   get:
 *     summary: Get user's enrolled courses
 *     tags: [Course Enrollment]
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
 *         description: Number of courses per page
 *     responses:
 *       200:
 *         description: Enrolled courses retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/enrolled', authenticate, CourseContentController.getUserEnrolledCourses);

export default router;
