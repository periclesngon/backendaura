import { Request, Response } from 'express';
import { CourseContentService, LessonService } from '../services/courseContentService';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { CourseLevel, CourseCategory } from '@prisma/client';

export class CourseContentController {
  /**
   * Create a new course
   */
  static async createCourse(req: Request, res: Response): Promise<void> {
    try {
      const { title, description, level, category, duration, price, tags, thumbnail } = req.body;
      const userId = req.user!.userId;

      if (!title || !description || !level || !category) {
        throw new ValidationError('Title, description, level, and category are required');
      }

      const course = await CourseContentService.createCourse(
        { title, description, level, category, duration, price, tags, thumbnail },
        userId
      );

      res.status(201).json({
        success: true,
        data: { course },
        message: 'Course created successfully'
      });
    } catch (error) {
      logger.error('Failed to create course', { 
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create course',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COURSE_CREATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get all courses with filtering
   */
  static async getCourses(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        level: req.query.level as CourseLevel,
        category: req.query.category as CourseCategory,
        isPublished: req.query.isPublished ? req.query.isPublished === 'true' : undefined,
        createdBy: req.query.createdBy as string,
        search: req.query.search as string
      };

      const options = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as 'title' | 'createdAt' | 'enrollments' || 'createdAt',
        sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
      };

      if (options.limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      const result = await CourseContentService.getCourses(filters, options, req.user?.userId);

      res.json({
        success: true,
        data: result,
        message: `Retrieved ${result.courses.length} courses`
      });
    } catch (error) {
      logger.error('Failed to get courses', { 
        query: req.query,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get courses',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COURSES_FETCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get course by ID
   */
  static async getCourseById(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const userId = req.user?.userId;

      const course = await CourseContentService.getCourseById(courseId, userId);

      res.json({
        success: true,
        data: { course },
        message: 'Course retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get course by ID', { 
        courseId: req.params.courseId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get course',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COURSE_FETCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Update a course
   */
  static async updateCourse(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { title, description, level, category, duration, price, tags, thumbnail, isPublished } = req.body;
      const userId = req.user!.userId;

      const course = await CourseContentService.updateCourse(
        courseId,
        { title, description, level, category, duration, price, tags, thumbnail, isPublished },
        userId
      );

      res.json({
        success: true,
        data: { course },
        message: 'Course updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update course', { 
        courseId: req.params.courseId,
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to update course',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COURSE_UPDATE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Delete a course
   */
  static async deleteCourse(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const userId = req.user!.userId;

      await CourseContentService.deleteCourse(courseId, userId);

      res.json({
        success: true,
        message: 'Course deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete course', { 
        courseId: req.params.courseId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to delete course',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COURSE_DELETE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Enroll in a course
   */
  static async enrollInCourse(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const userId = req.user!.userId;

      const result = await CourseContentService.enrollInCourse(courseId, userId);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Successfully enrolled in course'
      });
    } catch (error) {
      logger.error('Failed to enroll in course', { 
        courseId: req.params.courseId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to enroll in course',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'ENROLLMENT_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get user's enrolled courses
   */
  static async getUserEnrolledCourses(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      const result = await CourseContentService.getUserEnrolledCourses(userId, page, limit);

      res.json({
        success: true,
        data: result,
        message: `Retrieved ${result.courses.length} enrolled courses`
      });
    } catch (error) {
      logger.error('Failed to get user enrolled courses', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get enrolled courses',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'ENROLLED_COURSES_FETCH_ERROR'
          }
        });
      }
    }
  }
}

export class LessonController {
  /**
   * Create a lesson for a course
   */
  static async createLesson(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { title, content, videoUrl, duration, order, resources } = req.body;
      const userId = req.user!.userId;

      if (!title || !content || !order) {
        throw new ValidationError('Title, content, and order are required');
      }

      const lesson = await LessonService.createLesson(
        courseId,
        { title, content, videoUrl, duration, order, resources },
        userId
      );

      res.status(201).json({
        success: true,
        data: { lesson },
        message: 'Lesson created successfully'
      });
    } catch (error) {
      logger.error('Failed to create lesson', { 
        courseId: req.params.courseId,
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create lesson',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'LESSON_CREATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Mark lesson as completed
   */
  static async markLessonCompleted(req: Request, res: Response): Promise<void> {
    try {
      const { lessonId } = req.params;
      const userId = req.user!.userId;

      const result = await LessonService.markLessonCompleted(lessonId, userId);

      res.json({
        success: true,
        data: result,
        message: 'Lesson marked as completed'
      });
    } catch (error) {
      logger.error('Failed to mark lesson as completed', { 
        lessonId: req.params.lessonId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'LESSON_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to mark lesson as completed',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'LESSON_COMPLETION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get lessons for a course
   */
  static async getCourseLessons(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      const lessons = await LessonService.getCourseLessons(courseId);

      res.json({
        success: true,
        data: { lessons },
        message: 'Course lessons retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get course lessons', {
        courseId: req.params.courseId,
        error
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COURSE_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get course lessons',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'LESSONS_RETRIEVAL_ERROR'
          }
        });
      }
    }
  }

  /**
   * Upload course content materials
   */
  static async uploadCourseContent(req: Request, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const userId = req.user!.userId;

      // This would handle file upload for course materials
      // For now, return a placeholder response
      res.status(201).json({
        success: true,
        data: { message: 'Course content upload functionality will be implemented' },
        message: 'Course content upload endpoint ready'
      });
    } catch (error) {
      logger.error('Failed to upload course content', {
        courseId: req.params.courseId,
        error,
        userId: req.user?.userId
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to upload course content',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'CONTENT_UPLOAD_ERROR'
        }
      });
    }
  }
}
