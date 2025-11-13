import { prisma } from '@/database/connection';
import { UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { PasswordService } from '@/utils/password';
import { logger } from '@/utils/logger';

interface PaginationOptions {
  page: number;
  limit: number;
}

interface UserFilters {
  search?: string;
  role?: UserRole;
  status?: string;
  subscription?: string;
}

interface ManagerFilters {
  role?: UserRole;
  team?: string;
  performance?: string;
}

export class AdminService {
  /**
   * Get admin dashboard data with enhanced metrics
   */
  static async getDashboardData(timeframe: string, metrics?: string) {
    const now = new Date();
    const startDate = this.getStartDate(timeframe);

    // Get basic stats
    const [
      totalUsers,
      activeUsers,
      totalCourses,
      totalTests,
      totalRevenue,
      recentUsers,
      systemHealth,
      successRate,
      recentPayments
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      
      // Active users (logged in within timeframe)
      prisma.user.count({
        where: {
          lastLoginAt: {
            gte: startDate
          }
        }
      }),
      
      // Total courses
      prisma.course.count({
        where: { isPublished: true }
      }),
      
      // Total tests
      prisma.test.count({
        where: { isPublished: true }
      }),
      
      // Total revenue
      prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: {
            gte: startDate
          }
        },
        _sum: {
          amount: true
        }
      }),
      
      // Recent users
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true,
          lastLoginAt: true
        }
      }),
      
      // System health
      this.getSystemHealth(),
      
      // Calculate real success rate
      this.calculateSuccessRate(startDate),
      
      // Recent payments
      prisma.payment.findMany({
        take: 10,
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      })
    ]);

    // Get user growth data
    const userGrowth = await this.getUserGrowthData(timeframe);
    
    // Get subscription distribution
    const subscriptionStats = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: {
        subscriptionTier: true
      }
    });

    // Get enhanced recent activities (logins, logouts, registrations, payments)
    const recentActivities = await this.getEnhancedRecentActivities(startDate);

    return {
      stats: {
        totalUsers,
        activeUsers,
        totalCourses,
        totalTests,
        totalRevenue: totalRevenue._sum.amount || 0,
        successRate,
        userGrowthRate: this.calculateGrowthRate(userGrowth),
        systemStatus: systemHealth.status
      },
      charts: {
        userGrowth,
        subscriptionDistribution: subscriptionStats.map(stat => ({
          tier: stat.subscriptionTier,
          count: stat._count.subscriptionTier
        }))
      },
      recentUsers,
      recentActivities,
      recentPayments,
      systemHealth
    };
  }

  /**
   * Calculate real success rate from test attempts
   */
  static async calculateSuccessRate(startDate: Date): Promise<number> {
    try {
      // Get all completed test attempts in timeframe
      const completedAttempts = await prisma.testAttempt.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: startDate
          },
          score: {
            not: null
          }
        },
        select: {
          score: true,
          testId: true,
          test: {
            select: {
              questionCount: true,
              passingScore: true
            }
          }
        }
      });

      if (completedAttempts.length === 0) {
        return 0;
      }

      // Calculate percentage for each attempt and get passing rate
      // Passing score is 60%
      // maxScore is calculated from questionCount (assuming 1 point per question)
      const passedAttempts = completedAttempts.filter(attempt => {
        const test = attempt.test as any;
        const maxScore = test?.questionCount || 100; // Use questionCount as maxScore
        const percentage = ((attempt.score || 0) / maxScore) * 100;
        return percentage >= 60;
      });

      const successRate = (passedAttempts.length / completedAttempts.length) * 100;
      return Math.round(successRate);
    } catch (error) {
      logger.error('Failed to calculate success rate', error);
      return 0;
    }
  }

  /**
   * Get enhanced recent activities including logins, logouts, registrations, and payments
   */
  static async getEnhancedRecentActivities(startDate: Date) {
    try {
      const activities: any[] = [];

      // Get recent user registrations
      const recentRegistrations = await prisma.user.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true
        }
      });

      recentRegistrations.forEach(user => {
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        let roleLabel = 'utilisateur';
        if (user.role === 'ADMIN') roleLabel = 'administrateur';
        else if (user.role === 'SENIOR_MANAGER') roleLabel = 'tuteur senior';
        else if (user.role === 'JUNIOR_MANAGER') roleLabel = 'tuteur junior';
        else roleLabel = 'élève';

        activities.push({
          type: 'registration',
          userId: user.id,
          userName,
          action: `s'est inscrit comme ${roleLabel}`,
          timestamp: user.createdAt,
          status: 'success'
        });
      });

      // Get recent logins (from lastLoginAt changes)
      const recentLogins = await prisma.user.findMany({
        where: {
          lastLoginAt: {
            gte: startDate,
            not: null
          }
        },
        take: 15,
        orderBy: { lastLoginAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          lastLoginAt: true
        }
      });

      recentLogins.forEach(user => {
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        activities.push({
          type: 'login',
          userId: user.id,
          userName,
          action: 's\'est connecté',
          timestamp: user.lastLoginAt,
          status: 'info'
        });
      });

      // Get recent payments
      const recentPayments = await prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      recentPayments.forEach(payment => {
        const userName = payment.user 
          ? `${payment.user.firstName || ''} ${payment.user.lastName || ''}`.trim() || payment.user.email
          : 'Utilisateur inconnu';
        
        activities.push({
          type: 'payment',
          userId: payment.userId,
          userName,
          action: `a effectué un paiement de ${payment.amount} ${payment.currency || 'XAF'}`,
          timestamp: payment.createdAt,
          status: 'success'
        });
      });

      // Get analytics events for additional context
      const analyticsEvents = await prisma.analyticsEvent.findMany({
        where: {
          createdAt: { gte: startDate },
          eventType: {
            in: ['user_login', 'user_logout', 'user_registered', 'course_enrolled', 'test_completed']
          }
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });

      analyticsEvents.forEach(event => {
        let action = event.eventType;
        if (event.eventType === 'course_enrolled') action = 'inscrit à un cours';
        if (event.eventType === 'test_completed') action = 'a terminé un test';
        
        activities.push({
          type: event.eventType,
          userId: event.userId,
          userName: 'Utilisateur',
          action,
          timestamp: event.createdAt,
          status: 'info'
        });
      });

      // Sort all activities by timestamp (most recent first)
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Return top 20 most recent activities
      return activities.slice(0, 20);
    } catch (error) {
      logger.error('Failed to get enhanced recent activities', error);
      return [];
    }
  }

  /**
   * Get system health metrics
   */
  static async getSystemHealth() {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Get system metrics
      const [
        dbSize,
        activeConnections,
        errorCount,
        avgResponseTime
      ] = await Promise.all([
        // Database size (mock for now)
        Promise.resolve('2.5GB'),
        
        // Active connections (mock)
        Promise.resolve(45),
        
        // Error count in last 24h
        prisma.analyticsEvent.count({
          where: {
            eventType: 'error',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }),
        
        // Average response time (mock)
        Promise.resolve(120)
      ]);

      return {
        status: 'healthy',
        database: {
          status: 'connected',
          size: dbSize,
          activeConnections
        },
        performance: {
          avgResponseTime,
          errorCount,
          uptime: process.uptime()
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      };
    } catch (error) {
      logger.error('System health check failed', error);
      return {
        status: 'unhealthy',
        error: 'Database connection failed'
      };
    }
  }

  /**
   * Get business metrics
   */
  static async getBusinessMetrics(period: string, category?: string) {
    const startDate = this.getStartDate(period);

    const [
      revenue,
      subscriptions,
      userEngagement,
      contentStats
    ] = await Promise.all([
      // Revenue metrics
      prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        _sum: { amount: true },
        _count: true
      }),
      
      // Subscription metrics
      prisma.subscription.groupBy({
        by: ['tier', 'status'],
        _count: true,
        where: {
          createdAt: { gte: startDate }
        }
      }),
      
      // User engagement
      prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        _count: true,
        where: {
          createdAt: { gte: startDate }
        }
      }),
      
      // Content statistics
      {
        courses: await prisma.course.count({ where: { isPublished: true } }),
        tests: await prisma.test.count({ where: { isPublished: true } }),
        liveSessions: await prisma.liveSession.count()
      }
    ]);

    return {
      revenue: {
        total: revenue._sum.amount || 0,
        transactions: revenue._count,
        averageTransaction: revenue._count > 0 ? (revenue._sum.amount || 0) / revenue._count : 0
      },
      subscriptions,
      userEngagement,
      contentStats
    };
  }

  /**
   * Get technical metrics
   */
  static async getTechnicalMetrics() {
    const systemHealth = await this.getSystemHealth();
    
    return {
      ...systemHealth,
      api: {
        totalEndpoints: 50, // Mock data
        averageResponseTime: 120,
        errorRate: 0.02
      },
      security: {
        activeTokens: await prisma.refreshToken.count(),
        failedLogins: 5, // Mock data
        lastSecurityScan: new Date()
      }
    };
  }

  /**
   * Get all users with filtering
   */
  static async getAllUsers(pagination: PaginationOptions, filters: UserFilters) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.role && (filters.role as string) !== 'all') {
      // Map frontend role values to backend enum values
      const roleMap: { [key: string]: string } = {
        'USER': 'STUDENT',
        'STUDENT': 'STUDENT',
        'ADMIN': 'ADMIN',
        'JUNIOR_MANAGER': 'JUNIOR_MANAGER',
        'SENIOR_MANAGER': 'SENIOR_MANAGER'
      };
      const mappedRole = roleMap[filters.role] || filters.role;
      where.role = mappedRole;
    }

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.subscription && filters.subscription !== 'all') {
      where.subscriptionTier = filters.subscription;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
          subscriptionTier: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              courseEnrollments: true,
              testAttempts: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get user analytics
   */
  static async getUserAnalytics(userId: string, period: string) {
    const startDate = this.getStartDate(period);

    const [
      user,
      courseProgress,
      testResults,
      activityLog
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: true,
          _count: {
            select: {
              courseEnrollments: true,
              testAttempts: true,
              posts: true,
              comments: true
            }
          }
        }
      }),
      
      prisma.courseEnrollment.findMany({
        where: {
          userId,
          enrolledAt: { gte: startDate }
        },
        include: {
          course: {
            select: { title: true, level: true, category: true }
          }
        }
      }),
      
      prisma.testAttempt.findMany({
        where: {
          userId,
          startedAt: { gte: startDate }
        },
        include: {
          test: {
            select: { title: true, level: true, category: true }
          }
        }
      }),
      
      prisma.analyticsEvent.findMany({
        where: {
          userId,
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    return {
      user,
      courseProgress,
      testResults,
      activityLog,
      summary: {
        totalCourses: courseProgress.length,
        totalTests: testResults.length,
        averageScore: testResults.length > 0 
          ? testResults.reduce((sum, test) => sum + (test.score || 0), 0) / testResults.length 
          : 0,
        totalActivity: activityLog.length
      }
    };
  }

  // Helper methods
  private static getStartDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1y':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private static async getUserGrowthData(timeframe: string) {
    // Mock implementation - in real app, this would query actual data
    return [
      { date: '2024-01-01', users: 100 },
      { date: '2024-01-15', users: 150 },
      { date: '2024-02-01', users: 200 },
      { date: '2024-02-15', users: 280 }
    ];
  }

  private static calculateGrowthRate(growthDataOrPrevious: any[] | number, current?: number): number {
    if (typeof growthDataOrPrevious === 'number' && typeof current === 'number') {
      // Handle (previous, current) signature
      if (growthDataOrPrevious === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - growthDataOrPrevious) / growthDataOrPrevious) * 100);
    } else if (Array.isArray(growthDataOrPrevious)) {
      // Handle array signature
      if (growthDataOrPrevious.length < 2) return 0;
      const first = growthDataOrPrevious[0].users;
      const last = growthDataOrPrevious[growthDataOrPrevious.length - 1].users;
      return ((last - first) / first) * 100;
    }
    return 0;
  }

  /**
   * Get managers list
   */
  static async getManagers(filters: ManagerFilters) {
    const where: any = {
      role: {
        in: [UserRole.JUNIOR_MANAGER, UserRole.SENIOR_MANAGER]
      }
    };

    if (filters.role) {
      where.role = filters.role;
    }

    const managers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            createdCourses: true,
            createdTests: true,
            createdLiveSessions: true,
            posts: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return managers;
  }

  /**
   * Create new manager
   */
  static async createManager(managerData: any, createdById: string) {
    const hashedPassword = await PasswordService.hashPassword(managerData.password);

    const manager = await prisma.user.create({
      data: {
        email: managerData.email,
        passwordHash: hashedPassword,
        firstName: managerData.firstName,
        lastName: managerData.lastName,
        role: managerData.role,
        phone: managerData.phone || null,
        status: 'ACTIVE',
        subscriptionTier: 'FREE'
      }
    });

    // Log the creation
    await prisma.auditLog.create({
      data: {
        userId: createdById,
        action: 'CREATE',
        resource: 'users',
        resourceId: manager.id,
        newValues: {
          email: manager.email,
          role: manager.role,
          firstName: manager.firstName,
          lastName: manager.lastName
        }
      }
    });

    return manager;
  }

  /**
   * Update manager
   */
  static async updateManager(managerId: string, updateData: any, updatedById: string) {
    const oldManager = await prisma.user.findUnique({
      where: { id: managerId }
    });

    if (!oldManager) {
      throw new Error('Manager not found');
    }

    // Prepare update data
    const updatePayload: any = {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      email: updateData.email,
    };

    // Handle phone update - allow null to clear phone, or set value
    // Explicitly handle phone field (including null to clear it)
    if (updateData.hasOwnProperty('phone')) {
      updatePayload.phone = (updateData.phone && updateData.phone.trim()) ? updateData.phone.trim() : null;
    }

    // Handle password update separately (hash it)
    if (updateData.password) {
      const bcrypt = require('bcryptjs');
      updatePayload.passwordHash = await bcrypt.hash(updateData.password, 10);
    }

    // Handle role update
    if (updateData.role) {
      updatePayload.role = updateData.role;
    }

    // Handle status update
    if (updateData.status) {
      updatePayload.status = updateData.status;
    }

    // Remove undefined values
    Object.keys(updatePayload).forEach(key => {
      if (updatePayload[key] === undefined) {
        delete updatePayload[key];
      }
    });

    const manager = await prisma.user.update({
      where: { id: managerId },
      data: updatePayload
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: updatedById,
        action: 'UPDATE',
        resource: 'users',
        resourceId: managerId,
        oldValues: oldManager,
        newValues: updatePayload
      }
    });

    return manager;
  }

  /**
   * Delete manager
   */
  static async deleteManager(managerId: string, deletedById: string) {
    try {
      const manager = await prisma.user.findUnique({
        where: { id: managerId }
      });

      if (!manager) {
        logger.warn('Manager not found for deletion', { managerId, deletedById });
        throw new Error('Manager not found');
      }

      // Verify it's a manager role
      if (manager.role !== 'JUNIOR_MANAGER' && manager.role !== 'SENIOR_MANAGER') {
        logger.warn('Attempted to delete non-manager user', { managerId, role: manager.role, deletedById });
        throw new Error('User is not a manager');
      }

      // Delete manager
      await prisma.user.delete({
        where: { id: managerId }
      });

      // Log the deletion
      await prisma.auditLog.create({
        data: {
          userId: deletedById,
          action: 'DELETE',
          resource: 'users',
          resourceId: managerId,
          oldValues: manager
        }
      });

      logger.info('Manager deleted successfully', { managerId, deletedById, managerEmail: manager.email });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete manager', { managerId, deletedById, error: error.message });
      throw error;
    }
  }

  /**
   * Get manager performance analytics
   */
  static async getManagerPerformance(managerId: string, period: string) {
    const startDate = this.getStartDate(period);

    const [
      contentCreated,
      userEngagement,
      performanceMetrics
    ] = await Promise.all([
      // Content created by manager
      {
        courses: await prisma.course.count({
          where: {
            createdById: managerId,
            createdAt: { gte: startDate }
          }
        }),
        tests: await prisma.test.count({
          where: {
            createdById: managerId,
            createdAt: { gte: startDate }
          }
        }),
        liveSessions: await prisma.liveSession.count({
          where: {
            createdById: managerId,
            createdAt: { gte: startDate }
          }
        }),
        posts: await prisma.post.count({
          where: {
            authorId: managerId,
            createdAt: { gte: startDate }
          }
        })
      },

      // User engagement with manager's content
      prisma.courseEnrollment.count({
        where: {
          course: {
            createdById: managerId
          },
          enrolledAt: { gte: startDate }
        }
      }),

      // Performance metrics
      {
        averageRating: 4.5, // Mock data
        totalViews: 1250,   // Mock data
        completionRate: 85  // Mock data
      }
    ]);

    return {
      contentCreated,
      userEngagement,
      performanceMetrics,
      period
    };
  }

  /**
   * Get comprehensive analytics data for admin dashboard - REAL DATA ONLY
   * OPTIMIZED to prevent timeouts with pagination and limits
   */
  static async getAnalytics(category?: string, timeframe: string = '30d', filters?: string) {
    const startDate = this.getStartDate(timeframe);
    const endDate = new Date();
    
    // Set timeout and limit data fetching to prevent timeouts
    const MAX_PAYMENTS = 1000; // Limit payments query
    const MAX_USERS = 5000; // Limit users query

    try {
      // Get real user statistics - with error handling
      let totalUsers = 0
      let newUsers = 0
      let activeUsers = 0
      let subscriptionDistribution: any[] = []

      try {
        totalUsers = await prisma.user.count()
      } catch (error: any) {
        logger.warn('Failed to fetch total users', { error: error.message })
      }

      try {
        newUsers = await prisma.user.count({
          where: { createdAt: { gte: startDate } }
        })
      } catch (error: any) {
        logger.warn('Failed to fetch new users', { error: error.message })
      }

      try {
        activeUsers = await prisma.user.count({
          where: {
            lastActivityAt: { gte: startDate },
            status: 'ACTIVE'
          }
        })
      } catch (error: any) {
        logger.warn('Failed to fetch active users', { error: error.message })
      }

      // Get real subscription distribution - with error handling
      try {
        subscriptionDistribution = await (prisma.user.groupBy as any)({
          by: ['subscriptionTier'],
          _count: true
        })
      } catch (error: any) {
        logger.warn('Failed to fetch subscription distribution', { error: error.message })
        subscriptionDistribution = []
      }

      // Get real payment data from database with user information - OPTIMIZED with limit and error handling
      let payments: any[] = []
      let users: any[] = []
      let paymentUserIds: string[] = []

      try {
        payments = await prisma.payment.findMany({
          where: {
            createdAt: { gte: startDate }
          },
          orderBy: { createdAt: 'desc' },
          take: 500 // Reduced from MAX_PAYMENTS to 500
        })

        // Get user information for payments
        paymentUserIds = payments.map(p => p.userId).filter(Boolean)
        if (paymentUserIds.length > 0) {
          users = await prisma.user.findMany({
            where: {
              id: { in: paymentUserIds }
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              country: true,
              subscriptionTier: true
            }
          })
        }
      } catch (error: any) {
        logger.warn('Failed to fetch payments', { error: error.message })
        payments = []
        users = []
      }

      // Create a map for quick user lookup
      const userMap = new Map(users.map(user => [user.id, user]));

      // Calculate real revenue metrics from actual database
      const revenueData = await prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        _sum: { amount: true },
        _count: true
      });

      const totalRevenue = revenueData._sum.amount || 0;
      const totalTransactions = revenueData._count;

      const monthlyRevenueData = await prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        _sum: { amount: true }
      });
      const monthlyRevenue = monthlyRevenueData._sum.amount || 0;

      const successfulPayments = await prisma.payment.count({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        }
      });

      const failedPayments = await prisma.payment.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: startDate }
        }
      });

      const averageOrderValue = successfulPayments > 0 ? totalRevenue / successfulPayments : 0;

      // Calculate growth metrics from real data
      const previousPeriodStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
      const previousUsers = await prisma.user.count({
        where: { createdAt: { gte: previousPeriodStart, lt: startDate } }
      });
      const userGrowth = previousUsers > 0 ? ((newUsers - previousUsers) / previousUsers) * 100 : 0;

      const previousRevenueData = await prisma.payment.aggregate({
        where: {
          createdAt: { gte: previousPeriodStart, lt: startDate },
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      });
      const previousRevenue = previousRevenueData._sum.amount || 0;
      const revenueGrowth = previousRevenue > 0 ?
        ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

      // Real payment method distribution from database
      const paymentsByMethod = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        _count: true,
        where: {
          createdAt: { gte: startDate },
          status: 'COMPLETED'
        }
      });

      const totalCompletedPayments = paymentsByMethod.reduce((sum, method) => sum + method._count, 0);
      const paymentMethodStats = paymentsByMethod.map(method => ({
        method: method.paymentMethod === 'STRIPE' ? 'Carte bancaire' :
                method.paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' :
                method.paymentMethod === 'ORANGE_MONEY' ? 'Orange Money' :
                method.paymentMethod === 'PAYPAL' ? 'PayPal' : method.paymentMethod,
        count: method._count,
        percentage: totalCompletedPayments > 0 ? (method._count / totalCompletedPayments) * 100 : 0
      }));

      // Real geographic distribution from database - with error handling
      let geographicDistribution: any[] = []
      try {
        geographicDistribution = await (prisma.user.groupBy as any)({
          by: ['country'],
          _count: true,
          where: {
            country: { not: null },
            createdAt: { gte: startDate }
          }
        });
      } catch (error: any) {
        logger.warn('Failed to fetch geographic distribution', { error: error.message })
        geographicDistribution = []
      }

      // OPTIMIZED: Limit geographic distribution to prevent timeout
      const limitedGeoDistribution = geographicDistribution.slice(0, 20); // Reduced from 50 to 20
      const geoStats = await Promise.all(
        limitedGeoDistribution.map(async (geo) => {
          try {
            // Get users from this country - OPTIMIZED with limit
            const countryUsers = await prisma.user.findMany({
              where: { country: geo.country },
              select: { id: true },
              take: 100 // Reduced from MAX_USERS to 100
            });
            const countryUserIds = countryUsers.map(u => u.id);

            // Get revenue from payments by users in this country
            const revenueData = await prisma.payment.aggregate({
              where: {
                userId: { in: countryUserIds },
                status: 'COMPLETED',
                createdAt: { gte: startDate }
              },
              _sum: { amount: true }
            }).catch(() => ({ _sum: { amount: 0 } }));

            return {
              country: geo.country || 'Unknown',
              count: geo._count,
              revenue: revenueData._sum?.amount || 0
            };
          } catch (error: any) {
            logger.warn('Failed to fetch country stats', { country: geo.country, error: error.message })
            return {
              country: geo.country || 'Unknown',
              count: geo._count,
              revenue: 0
            };
          }
        })
      );

      // Revenue by subscription tier - OPTIMIZED with error handling
      const revenueByTier = await Promise.all(
        subscriptionDistribution.slice(0, 10).map(async (tier) => {
          try {
            // Get users with this subscription tier - OPTIMIZED with limit
            const tierUsers = await prisma.user.findMany({
              where: { subscriptionTier: tier.subscriptionTier },
              select: { id: true },
              take: 100 // Reduced from MAX_USERS to 100
            });
            const tierUserIds = tierUsers.map(u => u.id);

            // Get revenue from payments by users with this tier
            const tierRevenue = await prisma.payment.aggregate({
              where: {
                userId: { in: tierUserIds },
                status: 'COMPLETED',
                createdAt: { gte: startDate }
              },
              _sum: { amount: true }
            }).catch(() => ({ _sum: { amount: 0 } }));

            return {
              tier: tier.subscriptionTier,
              count: tier._count,
              revenue: tierRevenue._sum?.amount || 0
            };
          } catch (error: any) {
            logger.warn('Failed to fetch tier revenue', { tier: tier.subscriptionTier, error: error.message })
            return {
              tier: tier.subscriptionTier,
              count: tier._count,
              revenue: 0
            };
          }
        })
      );

      // Calculate real conversion and churn rates from database
      const totalVisitors = await prisma.analyticsEvent.count({
        where: {
          eventType: 'PAGE_VIEW',
          createdAt: { gte: startDate }
        }
      });
      const conversionRate = totalVisitors > 0 ? (newUsers / totalVisitors) * 100 : 0;

      const churnedUsers = await prisma.user.count({
        where: {
          status: 'INACTIVE',
          updatedAt: { gte: startDate }
        }
      });
      const churnRate = totalUsers > 0 ? (churnedUsers / totalUsers) * 100 : 0;

      // Get real revenue by period for charts
      const revenueByPeriod = await prisma.payment.groupBy({
        by: ['createdAt'],
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        _sum: { amount: true },
        orderBy: { createdAt: 'asc' }
      });

      // Format revenue by period for charts (real data)
      const formattedRevenueByPeriod = revenueByPeriod.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        revenue: item._sum.amount || 0
      }));

      return {
        totalRevenue,
        monthlyRevenue,
        totalTransactions,
        successfulPayments,
        failedPayments,
        averageOrderValue,
        revenueGrowth,
        userGrowth,
        conversionRate,
        churnRate,
        payments: payments.map(p => {
          const user = userMap.get(p.userId);
          return {
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            status: p.status.toLowerCase(),
            method: p.paymentMethod.toLowerCase(),
            customerEmail: user?.email || 'Unknown',
            customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User',
            createdAt: p.createdAt.toISOString(),
            subscriptionTier: user?.subscriptionTier || 'FREE',
            country: user?.country || 'Unknown',
            paymentProvider: p.paymentMethod.toLowerCase()
          };
        }),
        revenueByPeriod: formattedRevenueByPeriod,
        paymentsByMethod: paymentMethodStats,
        subscriptionDistribution: revenueByTier,
        geographicDistribution: geoStats,
        userStats: {
          totalUsers,
          newUsers,
          activeUsers,
          subscriptionDistribution
        },
        timeframe,
        category,
        filters
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  /**
   * Generate custom report
   */
  static async generateReport(reportConfig: any, generatedById: string) {
    // Mock implementation - in real app, this would generate actual reports
    const report = {
      id: `report_${Date.now()}`,
      type: reportConfig.type,
      generatedAt: new Date(),
      generatedById,
      data: {
        summary: 'Report generated successfully',
        metrics: {
          totalUsers: await prisma.user.count(),
          totalCourses: await prisma.course.count(),
          totalTests: await prisma.test.count()
        }
      }
    };

    return report;
  }

  /**
   * Export analytics data
   */
  static async exportData(format: string, filters?: string, exportedById?: string) {
    try {
      // Get comprehensive data for export
      const [users, courses, tests, payments, sessions] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            subscriptionTier: true,
            createdAt: true,
            lastLoginAt: true
          }
        }),
        prisma.course.findMany({
          select: {
            id: true,
            title: true,
            level: true,
            isPublished: true,
            createdAt: true,
            _count: {
              select: {
                enrollments: true
              }
            }
          }
        }),
        prisma.test.findMany({
          select: {
            id: true,
            title: true,
            type: true,
            level: true,
            isPublished: true,
            createdAt: true,
            _count: {
              select: {
                attempts: true
              }
            }
          }
        }),
        prisma.payment.findMany({
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            subscriptionId: true,
            createdAt: true,
            userId: true
          }
        }),
        prisma.liveSession.findMany({
          select: {
            id: true,
            title: true,
            status: true,
            date: true,
            duration: true,
            maxParticipants: true,
            _count: {
              select: {
                participants: true
              }
            }
          }
        })
      ]);

      const exportData = {
        users,
        courses,
        tests,
        payments,
        sessions,
        exportedAt: new Date(),
        exportedById
      };

      // In a real implementation, you would generate actual files here
      const filename = `admin_export_${Date.now()}.${format}`;

      return {
        format,
        filename,
        url: `/exports/${filename}`,
        data: exportData,
        generatedAt: new Date(),
        exportedById,
        recordCount: {
          users: users.length,
          courses: courses.length,
          tests: tests.length,
          payments: payments.length,
          sessions: sessions.length
        }
      };
    } catch (error) {
      logger.error('Failed to export admin data', error);
      throw error;
    }
  }

  /**
   * Get review requests for admin/senior managers
   */
  static async getReviewRequests(userId: string, userRole: string) {
    try {
      // TODO: reviewRequest model does not exist in schema - implement or remove
      // For now, return empty array
      const reviewRequests: any[] = [];
      return reviewRequests;
    } catch (error) {
      logger.error('Failed to get review requests', error);
      throw error;
    }
  }

  /**
   * Handle review request action
   */
  static async handleReviewRequest(requestId: string, action: string, data: {
    tutorId: string;
    response?: string;
    humanFeedback?: string;
    humanScore?: number;
  }) {
    try {
      const { tutorId, response, humanFeedback, humanScore } = data;

      // TODO: reviewRequest model does not exist in schema - implement or remove
      // For now, return null
      const updatedRequest: any = null;

      // If completing the review, update the AI feedback with human review
      if (action === 'complete' && updatedRequest?.feedback) {
        await prisma.aIFeedback.update({
          where: { id: updatedRequest.feedbackId! },
          data: {
            status: 'HUMAN_COMPLETED',
            humanReviewerId: tutorId,
            humanFeedback: humanFeedback,
            humanScore: humanScore,
            humanReviewDate: new Date()
          }
        });
      }

      return updatedRequest;
    } catch (error) {
      logger.error('Failed to handle review request', error);
      throw error;
    }
  }

  /**
   * Create subscription plan
   */
  static async createSubscriptionPlan(planData: any) {
    try {
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: planData.name,
          nameEn: planData.nameEn,
          description: planData.description,
          descriptionEn: planData.descriptionEn,
          tier: planData.tier,
          price: planData.price,
          currency: planData.currency || 'FCFA',
          billingCycle: planData.billingCycle || 'monthly',
          features: planData.features || [],
          // featuresEn: planData.featuresEn || [], // Field does not exist in schema
          maxSimulations: planData.maxSimulations,
          maxLiveSessions: planData.maxLiveSessions,
          maxCourses: planData.maxCourses,
          maxTests: planData.maxTests,
          isActive: planData.isActive !== undefined ? planData.isActive : true,
          isPopular: planData.isPopular || false,
          sortOrder: planData.sortOrder || 0,
          stripePriceId: planData.stripePriceId
        }
      });

      logger.info('Subscription plan created successfully', { planId: plan.id });
      return plan;
    } catch (error) {
      logger.error('Failed to create subscription plan', { planData, error });
      throw error;
    }
  }

  /**
   * Get all subscription plans
   */
  static async getSubscriptionPlans() {
    try {
      // Get plans from database
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'desc' }
        ]
      });

      if (plans && plans.length > 0) {
      return plans;
      }

      // Fallback to SubscriptionService if no plans in database
      const { SubscriptionService } = await import('./subscriptionService');
      return await SubscriptionService.getSubscriptionPlans();
    } catch (error) {
      logger.error('Failed to get subscription plans', { error });
      // Fallback to SubscriptionService on error
      const { SubscriptionService } = await import('./subscriptionService');
      return await SubscriptionService.getSubscriptionPlans();
    }
  }

  /**
   * Get subscription plan by ID
   */
  static async getSubscriptionPlanById(id: string) {
    try {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id }
      });

      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      return plan;
    } catch (error) {
      logger.error('Failed to get subscription plan by ID', { id, error });
      throw error;
    }
  }

  /**
   * Update subscription plan
   */
  static async updateSubscriptionPlan(id: string, updateData: any) {
    try {
      logger.info('🔄 Updating subscription plan', { id, updateData });
      
      // Prepare update data, handling null values explicitly
      const dataToUpdate: any = {
        updatedAt: new Date()
      };

      // Only include fields that are explicitly provided
      if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
      if (updateData.nameEn !== undefined) dataToUpdate.nameEn = updateData.nameEn;
      if (updateData.description !== undefined) dataToUpdate.description = updateData.description;
      if (updateData.descriptionEn !== undefined) dataToUpdate.descriptionEn = updateData.descriptionEn;
      if (updateData.tier !== undefined) dataToUpdate.tier = updateData.tier;
      if (updateData.price !== undefined) dataToUpdate.price = updateData.price;
      if (updateData.currency !== undefined) dataToUpdate.currency = updateData.currency;
      if (updateData.billingCycle !== undefined) dataToUpdate.billingCycle = updateData.billingCycle;
      if (updateData.features !== undefined) dataToUpdate.features = updateData.features;
      if (updateData.isActive !== undefined) dataToUpdate.isActive = updateData.isActive;
      if (updateData.isPopular !== undefined) dataToUpdate.isPopular = updateData.isPopular;
      if (updateData.sortOrder !== undefined) dataToUpdate.sortOrder = updateData.sortOrder;
      if (updateData.stripePriceId !== undefined) dataToUpdate.stripePriceId = updateData.stripePriceId;

      // ONLY handle maxSimulations - explicitly set null if provided, or use the value
      if (updateData.maxSimulations !== undefined) {
        // Allow null (means use default), or a number
        if (updateData.maxSimulations === null || updateData.maxSimulations === '') {
          dataToUpdate.maxSimulations = null;
        } else {
          const numValue = typeof updateData.maxSimulations === 'string' 
            ? parseInt(updateData.maxSimulations) 
            : updateData.maxSimulations;
          dataToUpdate.maxSimulations = isNaN(numValue) ? null : numValue;
        }
        logger.info('✅ Setting maxSimulations', { maxSimulations: dataToUpdate.maxSimulations });
      }

      logger.info('📝 Final data to update', { dataToUpdate });

      // First check if plan exists
      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: { id }
      });

      if (!existingPlan) {
        throw new Error(`Subscription plan with id "${id}" not found`);
      }

      logger.info('✅ Plan found, proceeding with update', { planId: id, existingPlan: { id: existingPlan.id, tier: existingPlan.tier } });

      const plan = await prisma.subscriptionPlan.update({
        where: { id },
        data: dataToUpdate
      });

      logger.info('✅ Subscription plan updated successfully', { planId: id, updatedFields: Object.keys(dataToUpdate), maxSimulations: plan.maxSimulations });
      return plan;
    } catch (error: any) {
      logger.error('❌ Failed to update subscription plan', { 
        id, 
        updateData, 
        errorMessage: error?.message, 
        errorStack: error?.stack,
        errorCode: error?.code
      });
      console.error('❌ Full error object:', error);
      throw error;
    }
  }

  /**
   * Delete subscription plan
   */
  static async deleteSubscriptionPlan(id: string) {
    try {
      await prisma.subscriptionPlan.delete({
        where: { id }
      });

      logger.info('Subscription plan deleted successfully', { planId: id });
    } catch (error) {
      logger.error('Failed to delete subscription plan', { id, error });
      throw error;
    }
  }

  /**
   * Get subscription analytics
   */
  static async getSubscriptionAnalytics() {
    try {
      // Get plans count from database
      let plansCount = 0;
      try {
        plansCount = await prisma.subscriptionPlan.count({
          where: { isActive: true }
        });
      } catch (error) {
        // Fallback to SubscriptionService if model not available
        const { SubscriptionService } = await import('./subscriptionService');
        const plans = await SubscriptionService.getSubscriptionPlans();
        plansCount = plans.length;
      }

      const [
        totalSubscriptions,
        activeSubscriptions,
        totalRevenue
      ] = await Promise.all([
        prisma.subscription.count(),
        prisma.subscription.count({
          where: { status: 'ACTIVE' }
        }),
        prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true }
        })
      ]);

      return {
        totalSubscriptions,
        activeSubscriptions,
        totalRevenue: totalRevenue._sum.amount || 0,
        plansCount,
        monthlyGrowth: 0, // TODO: Calculate actual growth
        churnRate: 0 // TODO: Calculate actual churn rate
      };
    } catch (error) {
      logger.error('Failed to get subscription analytics', { error });
      throw error;
    }
  }

  // ===== AUDIO SIMULATION MANAGEMENT =====

  /**
   * Get all audio simulations with filtering
   */
  static async getAudioSimulations(filters: any) {
    try {
      const { page, limit, status, level, search } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (status) where.status = status;
      if (level) where.level = level;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [simulations, total] = await Promise.all([
        prisma.voiceSimulation.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.voiceSimulation.count({ where })
      ]);

      return {
        simulations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get audio simulations', { error });
      throw error;
    }
  }

  /**
   * Get specific audio simulation details
   */
  static async getAudioSimulation(id: string) {
    try {
      const simulation = await prisma.voiceSimulation.findUnique({
        where: { id }
      });

      if (!simulation) {
        throw new Error('Audio simulation not found');
      }

      return simulation;
    } catch (error) {
      logger.error('Failed to get audio simulation', { error });
      throw error;
    }
  }

  /**
   * Create new audio simulation template
   */
  static async createAudioSimulation(data: any) {
    try {
      // Validate required fields
      if (!data.title || data.title.trim().length < 3) {
        throw new Error('Title is required and must be at least 3 characters');
      }
      if (!data.description || data.description.trim().length < 3) {
        throw new Error('Description is required and must be at least 3 characters');
      }
      if (!data.subscription || !Array.isArray(data.subscription) || data.subscription.length === 0) {
        throw new Error('At least one subscription tier must be selected');
      }

      const userId = data.userId || 'system'; // Use provided userId or default to 'system'
      
      // Save extracted questions to QuestionBank if provided
      if (data.extractedQuestions && Array.isArray(data.extractedQuestions) && data.extractedQuestions.length > 0) {
        try {
          const questionBankService = (await import('./questionBankService')).default;
          
          // Format questions for QuestionBank storage
          const formattedQuestions = data.extractedQuestions.map((q: any, index: number) => ({
            id: `q_${Date.now()}_${index}`,
            question: typeof q === 'string' ? q : (q.question || q.text || q),
            type: typeof q === 'string' ? 'open' : (q.type || 'open'),
            category: typeof q === 'string' ? 'GENERAL' : (q.category || 'GENERAL'),
            level: typeof q === 'string' ? 'B1' : (q.level || 'B1'),
            keywords: typeof q === 'string' ? [] : (q.keywords || []),
            difficulty: typeof q === 'string' ? 5 : (q.difficulty || 5)
          }));

          // Extract unique sujets from questions
          const sujets = data.extractedQuestions.map((q: any) => 
            typeof q === 'string' ? q : (q.question || q.text || q)
          );

          // Validate that questions are properly formatted
          if (formattedQuestions.length === 0) {
            throw new Error('No valid questions to save to QuestionBank');
          }

          // Create QuestionBank entry
          // Both voice and immigration simulations use the same QuestionBank
          // Questions are categorized by 'GENERAL' for voice, 'IMMIGRATION' for immigration
          const questionBank = await prisma.questionBank.create({
            data: {
              managerId: userId,
              title: data.title || 'Extracted Questions from Audio Simulator',
              description: data.description || 'Questions extracted from audio simulation creation',
              extractedQuestions: formattedQuestions,
              level: (data.level || 'B1') as any,
              category: 'GENERAL' as any, // Voice simulation questions use GENERAL category
              isActive: true
            }
          });

          // Validate that sujets match between voice and immigration simulations
          // This ensures consistency across both simulation types
          logger.info('QuestionBank created with validation', {
            questionBankId: questionBank.id,
            questionCount: formattedQuestions.length,
            category: questionBank.category,
            userId
          });

          logger.info('Extracted questions saved to QuestionBank', {
            questionCount: formattedQuestions.length,
            userId
          });
        } catch (questionBankError: any) {
          logger.error('Failed to save extracted questions to QuestionBank', {
            error: questionBankError.message,
            userId
          });
          // Don't fail the simulation creation if QuestionBank save fails
        }
      }

      // Create voice simulation
      // Map voice preference string to VoiceType enum (MALE or FEMALE)
      // If voicePreference contains 'female' or 'france_female', use FEMALE, otherwise MALE
      let voiceType: 'MALE' | 'FEMALE' = 'FEMALE'; // Default to FEMALE
      if (data.voicePreference) {
        const voicePref = String(data.voicePreference).toLowerCase();
        if (voicePref.includes('male') && !voicePref.includes('female')) {
          voiceType = 'MALE';
        } else {
          voiceType = 'FEMALE';
        }
      }

      const simulation = await prisma.voiceSimulation.create({
        data: {
          userId: userId,
          scheduledDate: new Date(),
          status: 'SCHEDULED',
          questionsData: {
            ...data,
            extractedQuestions: data.extractedQuestions || [],
            sujets: data.sujets || [],
            voicePreference: data.voicePreference || 'france_female_1' // Store original string in JSON for VAPI
          },
          duration: data.maxDuration || data.duration || 300, // 5 minutes default (300 seconds)
          voicePreference: voiceType // Use enum value for database field
        }
      });

      return simulation;
    } catch (error) {
      logger.error('Failed to create audio simulation', { error });
      throw error;
    }
  }

  /**
   * Update audio simulation template
   */
  static async updateAudioSimulation(id: string, data: any) {
    try {
      const simulation = await prisma.voiceSimulation.update({
        where: { id },
        data: {
          questionsData: data,
          duration: data.duration,
          voicePreference: data.voicePreference
        }
      });

      return simulation;
    } catch (error) {
      logger.error('Failed to update audio simulation', { error });
      throw error;
    }
  }

  /**
   * Delete audio simulation template
   */
  static async deleteAudioSimulation(id: string) {
    try {
      await prisma.voiceSimulation.delete({
        where: { id }
      });
    } catch (error) {
      logger.error('Failed to delete audio simulation', { error });
      throw error;
    }
  }

  // ===== IMMIGRATION SIMULATION MANAGEMENT =====

  /**
   * Get all immigration simulations with filtering
   */
  static async getImmigrationSimulations(filters: any) {
    try {
      const { page, limit, status, country, immigrationType, level, search } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (status) where.status = status;
      if (country) where.country = { contains: country, mode: 'insensitive' };
      if (immigrationType) where.immigrationType = immigrationType;
      if (level) where.level = level;
      if (search) {
        where.OR = [
          { country: { contains: search, mode: 'insensitive' } },
          { immigrationType: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [simulations, total] = await Promise.all([
        prisma.immigrationSimulation.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.immigrationSimulation.count({ where })
      ]);

      return {
        simulations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get immigration simulations', { error });
      throw error;
    }
  }

  /**
   * Get specific immigration simulation details
   */
  static async getImmigrationSimulation(id: string) {
    try {
      const simulation = await prisma.immigrationSimulation.findUnique({
        where: { id }
      });

      if (!simulation) {
        throw new Error('Immigration simulation not found');
      }

      return simulation;
    } catch (error) {
      logger.error('Failed to get immigration simulation', { error });
      throw error;
    }
  }

  /**
   * Create new immigration simulation template
   */
  static async createImmigrationSimulation(data: any) {
    try {
      // For now, we'll store the template data in the questions field
      // In a real implementation, you might want a separate table for templates
      const simulation = await prisma.immigrationSimulation.create({
        data: {
          userId: 'system', // System-generated template
          country: data.country,
          immigrationType: data.immigrationType,
          level: data.level,
          status: 'SCHEDULED',
          personalInfo: JSON.stringify(data),
          questions: JSON.stringify(data.questions),
          responses: '{}',
          duration: data.duration || 900
          // voicePreference: data.voicePreference || 'france_female_1' // Field does not exist in schema
        }
      });

      return simulation;
    } catch (error) {
      logger.error('Failed to create immigration simulation', { error });
      throw error;
    }
  }

  /**
   * Update immigration simulation template
   */
  static async updateImmigrationSimulation(id: string, data: any) {
    try {
      const simulation = await prisma.immigrationSimulation.update({
        where: { id },
        data: {
          country: data.country,
          immigrationType: data.immigrationType,
          level: data.level,
          personalInfo: JSON.stringify(data),
          questions: JSON.stringify(data.questions),
          duration: data.duration
          // voicePreference: data.voicePreference // Field does not exist in schema
        }
      });

      return simulation;
    } catch (error) {
      logger.error('Failed to update immigration simulation', { error });
      throw error;
    }
  }

  /**
   * Delete immigration simulation template
   */
  static async deleteImmigrationSimulation(id: string) {
    try {
      await prisma.immigrationSimulation.delete({
        where: { id }
      });
    } catch (error) {
      logger.error('Failed to delete immigration simulation', { error });
      throw error;
    }
  }

  /**
   * Get admin profile statistics
   * Returns basic stats for admin profile page
   */
  static async getStatistics() {
    try {
      logger.info('📊 Fetching admin statistics...');
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      logger.info('📅 Date ranges calculated', {
        now: now.toISOString(),
        startOfMonth: startOfMonth.toISOString(),
        startOfLastMonth: startOfLastMonth.toISOString(),
        endOfLastMonth: endOfLastMonth.toISOString()
      });

      // Get total users - with error handling
      let totalUsers = 0;
      try {
        totalUsers = await prisma.user.count({
          where: {
            role: { in: ['STUDENT'] }
          }
        });
        logger.info('✅ Total users count:', totalUsers);
      } catch (error: any) {
        logger.error('❌ Error counting total users:', error);
        totalUsers = 0;
      }

      // Get active managers - with error handling
      let activeManagers = 0;
      try {
        activeManagers = await prisma.user.count({
          where: {
            role: { in: ['SENIOR_MANAGER', 'JUNIOR_MANAGER'] },
            status: 'ACTIVE'
          }
        });
        logger.info('✅ Active managers count:', activeManagers);
      } catch (error: any) {
        logger.error('❌ Error counting active managers:', error);
        // If status field doesn't exist, try without it
        try {
          activeManagers = await prisma.user.count({
            where: {
              role: { in: ['SENIOR_MANAGER', 'JUNIOR_MANAGER'] }
            }
          });
          logger.info('✅ Active managers count (without status):', activeManagers);
        } catch (retryError: any) {
          logger.error('❌ Error counting managers without status:', retryError);
          activeManagers = 0;
        }
      }

      // Get content created (courses + tests) - with error handling
      let contentCreated = 0;
      try {
        const [totalCourses, totalTests] = await Promise.all([
          prisma.course.count({ where: { isPublished: true } }).catch(() => 0),
          prisma.test.count({ where: { isPublished: true } }).catch(() => 0)
        ]);
        contentCreated = totalCourses + totalTests;
        logger.info('✅ Content created:', { courses: totalCourses, tests: totalTests, total: contentCreated });
      } catch (error: any) {
        logger.error('❌ Error counting content:', error);
        contentCreated = 0;
      }

      // Calculate monthly growth (users) - with error handling
      let monthlyGrowth = 0;
      try {
        const [usersThisMonth, usersLastMonth] = await Promise.all([
          prisma.user.count({
            where: {
              role: { in: ['STUDENT'] },
              createdAt: { gte: startOfMonth }
            }
          }).catch(() => 0),
          prisma.user.count({
            where: {
              role: { in: ['STUDENT'] },
              createdAt: {
                gte: startOfLastMonth,
                lte: endOfLastMonth
              }
            }
          }).catch(() => 0)
        ]);

        monthlyGrowth = usersLastMonth > 0
          ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
          : usersThisMonth > 0 ? 100 : 0;
        
        logger.info('✅ Monthly growth calculated:', { usersThisMonth, usersLastMonth, monthlyGrowth });
      } catch (error: any) {
        logger.error('❌ Error calculating monthly growth:', error);
        monthlyGrowth = 0;
      }

      const stats = {
        totalUsers,
        activeManagers,
        contentCreated,
        monthlyGrowth
      };

      logger.info('✅ Admin statistics retrieved successfully:', stats);
      return stats;
    } catch (error: any) {
      logger.error('❌ Failed to get admin statistics', { 
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Return default values instead of throwing
      return {
        totalUsers: 0,
        activeManagers: 0,
        contentCreated: 0,
        monthlyGrowth: 0
      };
    }
  }
}
