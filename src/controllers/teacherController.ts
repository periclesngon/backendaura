import { Request, Response } from 'express';
import { TeacherService } from '@/services/teacherService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import { logger } from '@/utils/logger';

export class TeacherController {
  /**
   * Get available teachers for Pro+ users
   */
  static getTeachers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const filters = {
      search: req.query.search as string,
      specialties: req.query.specialties as string,
      availability: req.query.availability as string,
      rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
      sortBy: req.query.sortBy as string || 'rating'
    };

    const teachers = await TeacherService.getAvailableTeachers(userId, filters);

    const response: ApiResponse = {
      success: true,
      data: teachers,
      message: 'Teachers retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get specific teacher profile
   */
  static getTeacherProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { teacherId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const teacher = await TeacherService.getTeacherProfile(teacherId, userId);

    const response: ApiResponse = {
      success: true,
      data: teacher,
      message: 'Teacher profile retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get teacher availability
   */
  static getTeacherAvailability = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { teacherId } = req.params;
    const date = req.query.date as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const availability = await TeacherService.getTeacherAvailability(teacherId, date);

    const response: ApiResponse = {
      success: true,
      data: availability,
      message: 'Teacher availability retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Book a session with teacher
   */
  static bookSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { teacherId } = req.params;
    const bookingData = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const booking = await TeacherService.bookSession(teacherId, userId, bookingData);

    const response: ApiResponse = {
      success: true,
      data: booking,
      message: 'Session booked successfully'
    };

    res.status(201).json(response);
  });
}
