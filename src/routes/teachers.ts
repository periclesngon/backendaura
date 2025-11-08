import { Router } from 'express';
import { TeacherController } from '@/controllers/teacherController';
import { authenticate, authorize } from '@/middleware/auth';
import { UserRole } from '@prisma/client';
import { validate, commonSchemas } from '@/middleware/validation';
import Joi from 'joi';

const router = Router();

// Validation schemas
const teacherFiltersSchema = Joi.object({
  search: Joi.string().optional(),
  specialties: Joi.string().optional(),
  availability: Joi.string().optional(),
  rating: Joi.number().min(1).max(5).optional(),
  sortBy: Joi.string().valid('rating', 'experience', 'availability').default('rating')
});

/**
 * @route   GET /api/teachers
 * @desc    Get available teachers for Pro+ users
 * @access  Private (Pro+ users only)
 */
router.get('/', 
  authenticate, 
  authorize(UserRole.STUDENT), // Only students can access teachers
  validate(teacherFiltersSchema),
  TeacherController.getTeachers
);

/**
 * @route   GET /api/teachers/:teacherId
 * @desc    Get specific teacher profile
 * @access  Private (Pro+ users only)
 */
router.get('/:teacherId',
  authenticate,
  authorize(UserRole.STUDENT),
  validate({ params: Joi.object({ teacherId: commonSchemas.id }) }),
  TeacherController.getTeacherProfile
);

/**
 * @route   GET /api/teachers/:teacherId/availability
 * @desc    Get teacher availability
 * @access  Private (Pro+ users only)
 */
router.get('/:teacherId/availability',
  authenticate,
  authorize(UserRole.STUDENT),
  validate({ params: Joi.object({ teacherId: commonSchemas.id }) }),
  TeacherController.getTeacherAvailability
);

/**
 * @route   POST /api/teachers/:teacherId/book
 * @desc    Book a session with teacher
 * @access  Private (Pro+ users only)
 */
router.post('/:teacherId/book',
  authenticate,
  authorize(UserRole.STUDENT),
  validate({
    params: Joi.object({ teacherId: commonSchemas.id }),
    body: Joi.object({
    date: Joi.date().required(),
    time: Joi.string().required(),
    duration: Joi.number().min(30).max(120).default(60),
    subject: Joi.string().required(),
    level: Joi.string().valid('B1', 'B2', 'C1', 'C2').required(),
    notes: Joi.string().max(500).optional()
    })
  }),
  TeacherController.bookSession
);

export { router as teacherRoutes };
