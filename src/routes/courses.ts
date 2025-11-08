import { Router } from 'express';
import { CourseController } from '@/controllers/courseController';
import { validate, validateParams, courseSchemas, commonSchemas } from '@/middleware/validation';
import { authenticate, requireManager, optionalAuthenticate } from '@/middleware/auth';

const router = Router();

/**
 * @route   GET /api/courses
 * @desc    Get all courses with pagination and filtering
 * @access  Public (with optional authentication for personalized data)
 */
router.get('/', optionalAuthenticate, CourseController.getAllCourses);

/**
 * @route   POST /api/courses
 * @desc    Create a new course (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.post('/', authenticate, requireManager, validate(courseSchemas.create), CourseController.createCourse);

/**
 * @route   GET /api/courses/enrolled
 * @desc    Get user's enrolled courses
 * @access  Private
 */
router.get('/enrolled', authenticate, CourseController.getUserEnrolledCourses);

/**
 * @route   GET /api/courses/created
 * @desc    Get courses created by user (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.get('/created', authenticate, requireManager, CourseController.getUserCreatedCourses);

/**
 * @route   GET /api/courses/statistics
 * @desc    Get course statistics for user (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.get('/statistics', authenticate, requireManager, CourseController.getCourseStatistics);

/**
 * @route   GET /api/courses/:courseId
 * @desc    Get course by ID
 * @access  Public (with optional authentication for personalized data)
 */
router.get('/:courseId',
  optionalAuthenticate,
  validateParams({ courseId: commonSchemas.id }),
  CourseController.getCourseById
);

/**
 * @route   PUT /api/courses/:courseId
 * @desc    Update course (Creator/Admin only)
 * @access  Private (Creator/Admin)
 */
router.put('/:courseId',
  authenticate,
  validateParams({ courseId: commonSchemas.id }),
  validate(courseSchemas.update),
  CourseController.updateCourse
);

/**
 * @route   DELETE /api/courses/:courseId
 * @desc    Delete course (Creator/Admin only)
 * @access  Private (Creator/Admin)
 */
router.delete('/:courseId',
  authenticate,
  validateParams({ courseId: commonSchemas.id }),
  CourseController.deleteCourse
);

/**
 * @route   POST /api/courses/:courseId/enroll
 * @desc    Enroll in course
 * @access  Private
 */
router.post('/:courseId/enroll',
  authenticate,
  validateParams({ courseId: commonSchemas.id }),
  CourseController.enrollInCourse
);

/**
 * @route   DELETE /api/courses/:courseId/enroll
 * @desc    Unenroll from course
 * @access  Private
 */
router.delete('/:courseId/enroll',
  authenticate,
  validateParams({ courseId: commonSchemas.id }),
  CourseController.unenrollFromCourse
);

/**
 * @route   GET /api/courses/health
 * @desc    Course service health check
 * @access  Public
 */
router.get('/health', CourseController.healthCheck);

export { router as courseRoutes };
