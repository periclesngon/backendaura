import { Request, Response } from 'express';
import { UserService } from '@/services/userService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, UpdateUserProfileRequest, PaginationParams, FilterParams } from '@/types';
import { UserRole, UserStatus } from '@prisma/client';
import { logger } from '@/utils/logger';

export class UserController {
  /**
   * Get current user profile
   */
  static getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const user = await UserService.getUserById(userId);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'Profile retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get user by ID (Admin/Manager only)
   */
  static getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const requestingUserRole = req.user?.role;

    if (!requestingUserRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(requestingUserRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Manager role required.' }
      });
      return;
    }

    const user = await UserService.getUserById(userId);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'User retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Update user profile
   */
  static updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const updateData: UpdateUserProfileRequest = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const user = await UserService.updateUserProfile(userId, updateData);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'Profile updated successfully'
    };

    logger.info('User profile updated', { userId });

    res.status(200).json(response);
  });

  /**
   * Change password
   */
  static changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await UserService.changePassword(userId, currentPassword, newPassword);

    const response: ApiResponse = {
      success: true,
      message: 'Password changed successfully'
    };

    logger.info('User password changed', { userId });

    res.status(200).json(response);
  });

  /**
   * Get all users (Admin/Manager only)
   */
  static getAllUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestingUserRole = req.user?.role;

    if (!requestingUserRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(requestingUserRole as any)) {
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
      status: req.query.status as string,
      tier: req.query.tier as string,
      type: req.query.role as string
    };

    const result = await UserService.getAllUsers(pagination, filters, requestingUserRole);

    const response: ApiResponse = {
      success: true,
      data: result.users,
      pagination: result.pagination,
      message: 'Users retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Update user role (Admin only)
   */
  static updateUserRole = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { role } = req.body;
    const requestingUserRole = req.user?.role;

    if (!requestingUserRole || requestingUserRole !== UserRole.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Admin role required.' }
      });
      return;
    }

    const user = await UserService.updateUserRole(userId, role, requestingUserRole);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'User role updated successfully'
    };

    logger.info('User role updated', { userId, newRole: role });

    res.status(200).json(response);
  });

  /**
   * Update user status (Admin/Senior Manager only)
   */
  static updateUserStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { status } = req.body;
    const requestingUserRole = req.user?.role;

    if (!requestingUserRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER].includes(requestingUserRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Senior Manager or Admin role required.' }
      });
      return;
    }

    const user = await UserService.updateUserStatus(userId, status, requestingUserRole);

    const response: ApiResponse = {
      success: true,
      data: { user },
      message: 'User status updated successfully'
    };

    logger.info('User status updated', { userId, newStatus: status });

    res.status(200).json(response);
  });

  /**
   * Delete user (Admin only)
   */
  static deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const requestingUserRole = req.user?.role;

    if (!requestingUserRole || requestingUserRole !== UserRole.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Admin role required.' }
      });
      return;
    }

    await UserService.deleteUser(userId, requestingUserRole);

    const response: ApiResponse = {
      success: true,
      message: 'User deleted successfully'
    };

    logger.info('User deleted', { userId });

    res.status(200).json(response);
  });

  /**
   * Get user dashboard stats
   */
  static getDashboardStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const user = await UserService.getUserById(userId);
    const achievements = await UserService.calculateUserAchievements(userId);

    const response: ApiResponse = {
      success: true,
      data: {
        stats: achievements,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          subscriptionTier: user.subscriptionTier,
          role: user.role
        },
        recentActivity: {
          courseEnrollments: user.courseEnrollments?.slice(0, 5) || [],
          testAttempts: achievements.recentTests || []
        },
        performanceMetrics: {
          weeklyProgress: achievements.weeklyPoints,
          monthlyProgress: achievements.totalPoints,
          accuracy: achievements.completionPercentage,
          consistency: Math.min(100, achievements.totalTests * 10)
        }
      },
      message: 'Dashboard stats retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for user service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'user',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'User service is healthy'
    };

    res.status(200).json(response);
  });
}
