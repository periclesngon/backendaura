import { Request, Response } from 'express';
import { CourseService } from '@/services/courseService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, CreateCourseRequest, UpdateCourseRequest, PaginationParams, FilterParams } from '@/types';
import { UserRole } from '@prisma/client';
import { logger } from '@/utils/logger';

export class CourseController {
  /**
   * Create a new course (Manager/Admin only)
   */
  static createCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const courseData: CreateCourseRequest = req.body;
    const createdById = req.user?.userId;
    const creatorRole = req.user?.role;

    if (!createdById || !creatorRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const course = await CourseService.createCourse(courseData, createdById, creatorRole);

    const response: ApiResponse = {
      success: true,
      data: { course },
      message: 'Course created successfully'
    };

    logger.info('Course created', { courseId: course.id, createdById });

    res.status(201).json(response);
  });

  /**
   * Get course by ID
   */
  static getCourseById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.user?.userId;

    const course = await CourseService.getCourseById(courseId, userId);

    const response: ApiResponse = {
      success: true,
      data: { course },
      message: 'Course retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get all courses with pagination and filtering
   */
  static getAllCourses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Use userId or id (for compatibility)
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const filters: FilterParams = {
      search: req.query.search as string,
      level: req.query.level as string,
      category: req.query.category as string,
      tier: req.query.tier as string
    };

    const result = await CourseService.getAllCourses(pagination, filters, userId, userRole);

    const response: ApiResponse = {
      success: true,
      data: result.courses,
      pagination: result.pagination,
      message: 'Courses retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Update course (Creator/Admin only)
   */
  static updateCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const updateData: UpdateCourseRequest = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const course = await CourseService.updateCourse(courseId, updateData, userId, userRole);

    const response: ApiResponse = {
      success: true,
      data: { course },
      message: 'Course updated successfully'
    };

    logger.info('Course updated', { courseId, updatedBy: userId });

    res.status(200).json(response);
  });

  /**
   * Delete course (Creator/Admin only)
   */
  static deleteCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await CourseService.deleteCourse(courseId, userId, userRole);

    const response: ApiResponse = {
      success: true,
      message: 'Course deleted successfully'
    };

    logger.info('Course deleted', { courseId, deletedBy: userId });

    res.status(200).json(response);
  });

  /**
   * Enroll in course
   */
  static enrollInCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await CourseService.enrollInCourse(courseId, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Enrolled in course successfully'
    };

    logger.info('User enrolled in course', { courseId, userId });

    res.status(200).json(response);
  });

  /**
   * Unenroll from course
   */
  static unenrollFromCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await CourseService.unenrollFromCourse(courseId, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Unenrolled from course successfully'
    };

    logger.info('User unenrolled from course', { courseId, userId });

    res.status(200).json(response);
  });

  /**
   * Get user's enrolled courses
   */
  static getUserEnrolledCourses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'enrolledAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await CourseService.getUserEnrolledCourses(userId, pagination);

    const response: ApiResponse = {
      success: true,
      data: result.courses,
      pagination: result.pagination,
      message: 'Enrolled courses retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get courses created by user (Manager/Admin only)
   */
  static getUserCreatedCourses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Manager role required.' }
      });
      return;
    }

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const filters: FilterParams = {
      search: req.query.search as string,
      level: req.query.level as string,
      category: req.query.category as string,
      tier: req.query.tier as string
    };

    // Add creator filter
    const extendedFilters = {
      ...filters,
      createdById: userId
    };

    const result = await CourseService.getAllCourses(pagination, extendedFilters, userId, req.user?.role);

    const response: ApiResponse = {
      success: true,
      data: result.courses,
      pagination: result.pagination,
      message: 'Created courses retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get course statistics
   */
  static getCourseStatistics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    try {
      const statistics = await CourseService.getCourseStatistics(userId, userRole);

      const response: ApiResponse = {
        success: true,
        data: statistics,
        message: 'Course statistics retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Failed to get course statistics', { userId, error });
      res.status(500).json({
        success: false,
        error: { message: 'Failed to retrieve course statistics' }
      });
    }
  });

  /**
   * Health check for course service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'course',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Course service is healthy'
    };

    res.status(200).json(response);
  });
}
