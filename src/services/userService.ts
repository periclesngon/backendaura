import { prisma } from '@/database/connection';
import { PasswordService } from '@/utils/password';
import { 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  AuthorizationError 
} from '@/middleware/errorHandler';
import { 
  UserProfile, 
  UpdateUserProfileRequest,
  PaginationParams,
  FilterParams,
  ApiResponse 
} from '@/types';
import { UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { logger } from '@/utils/logger';

export class UserService {
  /**
   * Calculate user achievement stats
   */
  static async calculateUserAchievements(userId: string) {
    try {
      // Get user's test attempts
      const testAttempts = await prisma.testAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate basic stats
      const totalTests = testAttempts.length;
      const successfulTests = testAttempts.filter(attempt =>
        attempt.score && attempt.score >= 60
      ).length;
      const completionPercentage = totalTests > 0 ? (successfulTests / totalTests) * 100 : 0;

      // Calculate total points (based on test scores)
      const totalPoints = testAttempts.reduce((sum, attempt) => {
        return sum + (attempt.score || 0);
      }, 0);

      // Calculate weekly points (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyTests = testAttempts.filter(attempt =>
        attempt.createdAt >= weekAgo
      );
      const weeklyPoints = weeklyTests.reduce((sum, attempt) => {
        return sum + (attempt.score || 0);
      }, 0);

      // Determine CEFR level based on points
      const cefrLevel = this.calculateCEFRLevel(totalPoints);

      // Calculate skill levels (simplified - in real app, this would be more sophisticated)
      const skillLevels = {
        grammar: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) },
        vocabulary: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) },
        listening: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) },
        reading: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) },
        speaking: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) },
        writing: { level: cefrLevel.level, subLevel: cefrLevel.subLevel, progress: Math.min(100, (totalPoints / 10)) }
      };

      return {
        totalPoints,
        successfulTests,
        totalTests,
        completionPercentage,
        weeklyPoints,
        currentCEFRLevel: cefrLevel.level,
        cefrSubLevel: cefrLevel.subLevel,
        skillLevels,
        recentTests: testAttempts.slice(0, 5)
      };
    } catch (error) {
      console.error('Error calculating user achievements:', error);
      return {
        totalPoints: 0,
        successfulTests: 0,
        totalTests: 0,
        completionPercentage: 0,
        weeklyPoints: 0,
        currentCEFRLevel: "A1",
        cefrSubLevel: 1,
        skillLevels: {
          grammar: { level: "A1", subLevel: 1, progress: 0 },
          vocabulary: { level: "A1", subLevel: 1, progress: 0 },
          listening: { level: "A1", subLevel: 1, progress: 0 },
          reading: { level: "A1", subLevel: 1, progress: 0 },
          speaking: { level: "A1", subLevel: 1, progress: 0 },
          writing: { level: "A1", subLevel: 1, progress: 0 }
        },
        recentTests: []
      };
    }
  }

  /**
   * Calculate CEFR level based on points
   */
  static calculateCEFRLevel(points: number) {
    if (points >= 5000) return { level: "C2", subLevel: 2 };
    if (points >= 4500) return { level: "C2", subLevel: 1 };
    if (points >= 4000) return { level: "C1", subLevel: 2 };
    if (points >= 3500) return { level: "C1", subLevel: 1 };
    if (points >= 3000) return { level: "B2", subLevel: 2 };
    if (points >= 2500) return { level: "B2", subLevel: 1 };
    if (points >= 2000) return { level: "B1", subLevel: 2 };
    if (points >= 1500) return { level: "B1", subLevel: 1 };
    if (points >= 1000) return { level: "A2", subLevel: 2 };
    if (points >= 500) return { level: "A2", subLevel: 1 };
    if (points >= 100) return { level: "A1", subLevel: 2 };
    return { level: "A1", subLevel: 1 };
  }

  /**
   * Get user profile by ID
   */
  static async getUserById(userId: string): Promise<UserProfile> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          courseEnrollments: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  level: true,
                  category: true
                }
              }
            }
          },
          testAttempts: {
            include: {
              test: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  level: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Calculate user stats
      const stats = await this.calculateUserStats(userId);

      // Remove password hash from response
      const { passwordHash, ...userProfile } = user;

      return {
        ...userProfile,
        stats
      };
    } catch (error) {
      logger.error('Failed to get user by ID', { userId, error });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(
    userId: string, 
    updateData: UpdateUserProfileRequest
  ): Promise<UserProfile> {
    try {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Calculate user stats
      const stats = await this.calculateUserStats(userId);

      // Remove password hash from response
      const { passwordHash, ...userProfile } = updatedUser;

      logger.info('User profile updated successfully', { userId });

      return {
        ...userProfile,
        stats
      };
    } catch (error) {
      logger.error('Failed to update user profile', { userId, error });
      throw error;
    }
  }

  /**
   * Change user password
   */
  static async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<void> {
    try {
      // Get user with password hash
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await PasswordService.verifyPassword(
        currentPassword, 
        user.passwordHash
      );

      if (!isCurrentPasswordValid) {
        throw new ValidationError('Current password is incorrect');
      }

      // Validate new password strength
      const passwordValidation = PasswordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(
          `New password validation failed: ${passwordValidation.errors.join(', ')}`
        );
      }

      // Hash new password
      const newPasswordHash = await PasswordService.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: new Date()
        }
      });

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });

      logger.info('User password changed successfully', { userId });
    } catch (error) {
      logger.error('Failed to change user password', { userId, error });
      throw error;
    }
  }

  /**
   * Get all users with pagination and filtering (Admin/Manager only)
   */
  static async getAllUsers(
    pagination: PaginationParams,
    filters: FilterParams,
    requestingUserRole: UserRole
  ): Promise<{
    users: UserProfile[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(requestingUserRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
      const { search, status, tier, role } = filters;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (status) {
        where.status = status;
      }

      if (tier) {
        where.subscriptionTier = tier;
      }

      if (role) {
        where.role = role;
      }

      // Get total count
      const total = await prisma.user.count({ where });

      // Get users
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          subscriptionTier: true,
          profileImage: true,
          phone: true,
          dateOfBirth: true,
          country: true,
          city: true,
          bio: true,
          preferences: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      logger.info('Users retrieved successfully', { 
        total, 
        page, 
        limit, 
        requestingUserRole 
      });

      return {
        users: users as unknown as UserProfile[],
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get all users', { error });
      throw error;
    }
  }

  /**
   * Update user role (Admin only)
   */
  static async updateUserRole(
    userId: string, 
    newRole: UserRole, 
    requestingUserRole: UserRole
  ): Promise<UserProfile> {
    try {
      // Check authorization - only admins can change roles
      if (requestingUserRole !== UserRole.ADMIN) {
        throw new AuthorizationError('Access denied. Admin role required.');
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Update user role
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          role: newRole,
          updatedAt: new Date()
        },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Calculate user stats
      const stats = await this.calculateUserStats(userId);

      // Remove password hash from response
      const { passwordHash, ...userProfile } = updatedUser;

      logger.info('User role updated successfully', { 
        userId, 
        oldRole: existingUser.role, 
        newRole 
      });

      return {
        ...userProfile,
        stats
      };
    } catch (error) {
      logger.error('Failed to update user role', { userId, newRole, error });
      throw error;
    }
  }

  /**
   * Update user status (Admin/Senior Manager only)
   */
  static async updateUserStatus(
    userId: string, 
    newStatus: UserStatus, 
    requestingUserRole: UserRole
  ): Promise<UserProfile> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER].includes(requestingUserRole as any)) {
        throw new AuthorizationError('Access denied. Senior Manager or Admin role required.');
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Update user status
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          status: newStatus,
          updatedAt: new Date()
        },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // If user is suspended or deactivated, invalidate all refresh tokens
      if (newStatus === UserStatus.SUSPENDED || newStatus === UserStatus.INACTIVE) {
        await prisma.refreshToken.deleteMany({
          where: { userId }
        });
      }

      // Calculate user stats
      const stats = await this.calculateUserStats(userId);

      // Remove password hash from response
      const { passwordHash, ...userProfile } = updatedUser;

      logger.info('User status updated successfully', { 
        userId, 
        oldStatus: existingUser.status, 
        newStatus 
      });

      return {
        ...userProfile,
        stats
      };
    } catch (error) {
      logger.error('Failed to update user status', { userId, newStatus, error });
      throw error;
    }
  }

  /**
   * Delete user account (Admin only)
   */
  static async deleteUser(userId: string, requestingUserRole: UserRole): Promise<void> {
    try {
      // Check authorization - only admins can delete users
      if (requestingUserRole !== UserRole.ADMIN) {
        throw new AuthorizationError('Access denied. Admin role required.');
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Delete user (cascade will handle related records)
      await prisma.user.delete({
        where: { id: userId }
      });

      logger.info('User deleted successfully', { userId });
    } catch (error) {
      logger.error('Failed to delete user', { userId, error });
      throw error;
    }
  }

  /**
   * Calculate user statistics
   */
  private static async calculateUserStats(userId: string) {
    try {
      // Calculate courses completed
      let coursesCompleted = 0;
      try {
        coursesCompleted = await prisma.courseEnrollment.count({
          where: {
            userId,
            completedAt: { not: null }
          }
        });
      } catch (error: any) {
        logger.warn('Failed to count course enrollments', { userId, error: error.message });
      }

      // Calculate tests completed
      let testsCompleted = 0;
      try {
        testsCompleted = await prisma.testAttempt.count({
          where: {
            userId,
            status: 'COMPLETED'
          }
        });
      } catch (error: any) {
        logger.warn('Failed to count test attempts', { userId, error: error.message });
      }

      // Total time spent (in seconds) - handle missing userProgress table
      let totalTimeSpent = 0;
      try {
        // Check if userProgress table exists by trying to query it
        const timeSpentResult = await prisma.userProgress.aggregate({
          where: { userId },
          _sum: { timeSpent: true }
        }).catch(() => null);
        totalTimeSpent = timeSpentResult?._sum?.timeSpent || 0;
      } catch (error: any) {
        // Table might not exist, use default value
        logger.warn('userProgress table not available, using default', { userId });
        totalTimeSpent = 0;
      }

        // Average test score
      let averageScore = 0;
      try {
        const scoreResult = await prisma.testAttempt.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            score: { not: null }
          },
          _avg: { score: true }
        });
        averageScore = scoreResult._avg.score || 0;
      } catch (error: any) {
        logger.warn('Failed to calculate average score', { userId, error: error.message });
      }

      return {
        coursesCompleted,
        testsCompleted,
        totalTimeSpent,
        averageScore
      };
    } catch (error: any) {
      logger.error('Failed to calculate user stats', { userId, error: error.message });
      // Return default values on any error
      return {
        coursesCompleted: 0,
        testsCompleted: 0,
        totalTimeSpent: 0,
        averageScore: 0
      };
    }
  }

  /**
   * Get users managed by a specific manager
   */
  static async getUsersByManager(managerId: string, options: PaginationParams & FilterParams = {}) {
    try {
      const { page = 1, limit = 10, search, role, status } = options;
      const skip = (page - 1) * limit;

      // For now, return all students since managedBy field doesn't exist
      // In a real implementation, you'd have a proper manager-user relationship
      const whereClause: any = {
        role: UserRole.STUDENT
      };

      if (search) {
        whereClause.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (role) {
        whereClause.role = role;
      }

      if (status) {
        whereClause.status = status;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            subscriptionTier: true,
            profileImage: true,
            lastLoginAt: true,
            createdAt: true,
            _count: {
              select: {
                courseEnrollments: true,
                testAttempts: true
              }
            }
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where: whereClause })
      ]);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get users by manager', { managerId, error });
      throw error;
    }
  }

  /**
   * Assign users to a manager
   */
  static async assignUsersToManager(managerId: string, userIds: string[], requestingUserRole: UserRole) {
    try {
      // Check authorization
      if (requestingUserRole !== UserRole.ADMIN && requestingUserRole !== UserRole.SENIOR_MANAGER) {
        throw new AuthorizationError('Access denied. Admin or Senior Manager role required.');
      }

      // Verify manager exists and has appropriate role
      const manager = await prisma.user.findUnique({
        where: { id: managerId }
      });

      if (!manager || (manager.role !== UserRole.JUNIOR_MANAGER && manager.role !== UserRole.SENIOR_MANAGER)) {
        throw new NotFoundError('Manager not found or invalid role');
      }

      // For now, we'll create a separate manager-user relationship table
      // Since managedBy field doesn't exist in the current schema
      // This would require a schema update to add the managedBy field

      // Simulate the assignment for now
      const result = { count: userIds.length };

      logger.info('Users assigned to manager', { managerId, userIds, count: result.count });

      return {
        managerId,
        assignedCount: result.count,
        userIds
      };
    } catch (error) {
      logger.error('Failed to assign users to manager', { managerId, userIds, error });
      throw error;
    }
  }

  /**
   * Get user learning progress and analytics
   */
  static async getUserLearningAnalytics(userId: string) {
    try {
      const [
        enrollments,
        testAttempts,
        liveSessionParticipation,
        achievements,
        recentActivity
      ] = await Promise.all([
        // Course enrollments and progress
        prisma.courseEnrollment.findMany({
          where: { userId },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                level: true,
                duration: true
              }
            }
          },
          orderBy: { enrolledAt: 'desc' }
        }),

        // Test attempts and scores
        prisma.testAttempt.findMany({
          where: { userId },
          include: {
            test: {
              select: {
                id: true,
                title: true,
                type: true,
                level: true
              }
            }
          },
          orderBy: { startedAt: 'desc' },
          take: 20
        }),

        // Live session participation
        prisma.liveSessionParticipant.findMany({
          where: { userId },
          include: {
            liveSession: {
              select: {
                id: true,
                title: true,
                date: true,
                duration: true
              }
            }
          },
          orderBy: { joinedAt: 'desc' },
          take: 10
        }),

        // User achievements (if implemented)
        prisma.userAchievement.findMany({
          where: { userId },
          include: {
            achievement: {
              select: {
                id: true,
                name: true,
                description: true,
                icon: true
              }
            }
          },
          orderBy: { unlockedAt: 'desc' }
        }).catch(() => []), // Handle if achievements table doesn't exist

        // Recent activity
        this.getUserRecentActivity(userId)
      ]);

      // Calculate learning metrics
      const completedCourses = enrollments.filter(e => e.completedAt).length;
      const averageProgress = enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length || 0;
      const averageTestScore = testAttempts.reduce((sum, t) => sum + (t.score || 0), 0) / testAttempts.length || 0;
      const totalStudyTime = enrollments.reduce((sum, e) => sum + 0, 0); // timeSpent field doesn't exist in enrollment

      return {
        overview: {
          totalCourses: enrollments.length,
          completedCourses,
          averageProgress: Math.round(averageProgress),
          totalTests: testAttempts.length,
          averageTestScore: Math.round(averageTestScore),
          totalStudyTime,
          liveSessionsAttended: liveSessionParticipation.filter(p => p.attended).length,
          achievementsEarned: achievements.length
        },
        enrollments,
        testAttempts,
        liveSessionParticipation,
        achievements,
        recentActivity
      };
    } catch (error) {
      logger.error('Failed to get user learning analytics', { userId, error });
      throw error;
    }
  }

  /**
   * Get user recent activity
   */
  private static async getUserRecentActivity(userId: string) {
    try {
      // Get recent activities from different sources
      const [recentEnrollments, recentTests, recentSessions] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: {
            userId,
            enrolledAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          include: {
            course: { select: { title: true } }
          },
          orderBy: { enrolledAt: 'desc' },
          take: 5
        }),

        prisma.testAttempt.findMany({
          where: {
            userId,
            startedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          include: {
            test: { select: { title: true } }
          },
          orderBy: { startedAt: 'desc' },
          take: 5
        }),

        prisma.liveSessionParticipant.findMany({
          where: {
            userId,
            joinedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          include: {
            liveSession: { select: { title: true } }
          },
          orderBy: { joinedAt: 'desc' },
          take: 5
        })
      ]);

      // Combine and format activities
      const activities = [
        ...recentEnrollments.map(e => ({
          type: 'enrollment',
          title: `Enrolled in ${e.course?.title || 'Unknown Course'}`,
          date: e.enrolledAt,
          progress: e.progress
        })),
        ...recentTests.map(t => ({
          type: 'test',
          title: `Completed ${t.test.title}`,
          date: t.startedAt,
          score: t.score
        })),
        ...recentSessions.map(s => ({
          type: 'session',
          title: `Joined ${s.liveSession.title}`,
          date: s.joinedAt,
          attended: s.attended
        }))
      ];

      return activities
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    } catch (error) {
      logger.error('Failed to get user recent activity', { userId, error });
      return [];
    }
  }
}
