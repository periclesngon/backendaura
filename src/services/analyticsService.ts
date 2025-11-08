import { prisma } from '@/database/connection';
import { 
  AuthorizationError 
} from '@/middleware/errorHandler';
import { 
  AnalyticsData
} from '@/types';
import { UserRole, SubscriptionTier } from '@prisma/client';
import { logger } from '@/utils/logger';

export class AnalyticsService {
  /**
   * Get dashboard analytics (Admin/Manager only)
   */
  static async getDashboardAnalytics(userRole: UserRole): Promise<AnalyticsData> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      const [
        totalUsers,
        activeUsers,
        totalCourses,
        totalTests,
        totalLiveSessions,
        subscriptionDistribution,
        userGrowthData,
        courseCompletions,
        testScores,
        revenueData
      ] = await Promise.all([
        // Total users
        prisma.user.count(),

        // Active users (logged in within last 30 days)
        prisma.user.count({
          where: {
            lastLoginAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        }),

        // Total courses
        prisma.course.count(),

        // Total tests
        prisma.test.count(),

        // Total live sessions
        prisma.liveSession.count(),

        // Subscription distribution
        prisma.user.groupBy({
          by: ['subscriptionTier'],
          _count: { subscriptionTier: true }
        }),

        // User growth (last 12 months)
        this.getUserGrowthData(),

        // Course completions
        this.getCourseCompletionData(),

        // Test scores
        this.getTestScoreData(),

        // Revenue data (last 12 months)
        this.getRevenueData()
      ]);

      // Transform subscription distribution
      const subscriptionDist = subscriptionDistribution.reduce((acc, item) => {
        acc[item.subscriptionTier] = item._count.subscriptionTier;
        return acc;
      }, {} as Record<SubscriptionTier, number>);

      const analytics: AnalyticsData = {
        totalUsers,
        activeUsers,
        totalCourses,
        totalTests,
        totalLiveSessions,
        subscriptionDistribution: subscriptionDist,
        userGrowth: userGrowthData,
        courseCompletions,
        testScores,
        revenueData
      };

      logger.info('Dashboard analytics retrieved', { userRole });

      return analytics;
    } catch (error) {
      logger.error('Failed to get dashboard analytics', { userRole, error });
      throw error;
    }
  }

  /**
   * Track analytics event
   */
  static async trackEvent(
    eventType: string,
    eventData: any,
    userId?: string,
    sessionId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType,
          eventData,
          sessionId,
          userAgent,
          ipAddress
        }
      });

      logger.debug('Analytics event tracked', { eventType, userId });
    } catch (error) {
      logger.error('Failed to track analytics event', { eventType, userId, error });
      // Don't throw error for analytics tracking failures
    }
  }

  /**
   * Get user growth data for the last 12 months
   */
  private static async getUserGrowthData(): Promise<Array<{ date: string; count: number }>> {
    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const userGrowth = await prisma.user.groupBy({
        by: ['createdAt'],
        where: {
          createdAt: {
            gte: twelveMonthsAgo
          }
        },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      });

      // Group by month
      const monthlyData = new Map<string, number>();
      
      userGrowth.forEach(item => {
        const monthKey = item.createdAt.toISOString().substring(0, 7); // YYYY-MM
        monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + item._count.id);
      });

      // Convert to array format
      return Array.from(monthlyData.entries()).map(([date, count]) => ({
        date,
        count
      }));
    } catch (error) {
      logger.error('Failed to get user growth data', { error });
      return [];
    }
  }

  /**
   * Get course completion data
   */
  private static async getCourseCompletionData(): Promise<Array<{ courseId: string; title: string; completions: number }>> {
    try {
      const completions = await prisma.courseEnrollment.groupBy({
        by: ['courseId'],
        where: {
          completedAt: { not: null }
        },
        _count: { courseId: true },
        orderBy: { _count: { courseId: 'desc' } },
        take: 10
      });

      // Get course titles
      const courseIds = completions.map(c => c.courseId);
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true }
      });

      const courseMap = new Map(courses.map(c => [c.id, c.title]));

      return completions.map(completion => ({
        courseId: completion.courseId,
        title: courseMap.get(completion.courseId) || 'Unknown Course',
        completions: completion._count.courseId
      }));
    } catch (error) {
      logger.error('Failed to get course completion data', { error });
      return [];
    }
  }

  /**
   * Get test score data
   */
  private static async getTestScoreData(): Promise<Array<{ testId: string; title: string; averageScore: number }>> {
    try {
      const testScores = await prisma.testAttempt.groupBy({
        by: ['testId'],
        where: {
          status: 'COMPLETED',
          score: { not: null }
        },
        _avg: { score: true },
        _count: { testId: true },
        having: {
          testId: { _count: { gte: 5 } } // Only tests with at least 5 attempts
        },
        orderBy: { _avg: { score: 'desc' } },
        take: 10
      });

      // Get test titles
      const testIds = testScores.map(t => t.testId);
      const tests = await prisma.test.findMany({
        where: { id: { in: testIds } },
        select: { id: true, title: true }
      });

      const testMap = new Map(tests.map(t => [t.id, t.title]));

      return testScores.map(score => ({
        testId: score.testId,
        title: testMap.get(score.testId) || 'Unknown Test',
        averageScore: score._avg.score || 0
      }));
    } catch (error) {
      logger.error('Failed to get test score data', { error });
      return [];
    }
  }

  /**
   * Get revenue data for the last 12 months
   */
  private static async getRevenueData(): Promise<Array<{ date: string; amount: number }>> {
    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const payments = await prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          processedAt: {
            gte: twelveMonthsAgo
          }
        },
        select: {
          amount: true,
          processedAt: true
        },
        orderBy: { processedAt: 'asc' }
      });

      // Group by month
      const monthlyRevenue = new Map<string, number>();
      
      payments.forEach(payment => {
        if (payment.processedAt) {
          const monthKey = payment.processedAt.toISOString().substring(0, 7); // YYYY-MM
          monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + payment.amount);
        }
      });

      // Convert to array format
      return Array.from(monthlyRevenue.entries()).map(([date, amount]) => ({
        date,
        amount
      }));
    } catch (error) {
      logger.error('Failed to get revenue data', { error });
      return [];
    }
  }

  /**
   * Get user activity analytics
   */
  static async getUserActivityAnalytics(
    userId: string,
    days: number = 30
  ): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        courseProgress,
        testAttempts,
        liveSessionParticipation,
        totalTimeSpent
      ] = await Promise.all([
        // Course progress
        prisma.userProgress.findMany({
          where: {
            userId,
            lastAccessAt: { gte: startDate },
            contentType: 'COURSE'
          },
          include: {
            course: {
              select: { title: true }
            }
          },
          orderBy: { lastAccessAt: 'desc' }
        }),

        // Test attempts
        prisma.testAttempt.findMany({
          where: {
            userId,
            createdAt: { gte: startDate }
          },
          include: {
            test: {
              select: { title: true, type: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        // Live session participation
        prisma.liveSessionParticipant.findMany({
          where: {
            userId,
            joinedAt: { gte: startDate }
          },
          include: {
            liveSession: {
              select: { title: true, date: true }
            }
          },
          orderBy: { joinedAt: 'desc' }
        }),

        // Total time spent
        prisma.userProgress.aggregate({
          where: {
            userId,
            lastAccessAt: { gte: startDate }
          },
          _sum: { timeSpent: true }
        })
      ]);

      return {
        courseProgress,
        testAttempts,
        liveSessionParticipation,
        totalTimeSpent: totalTimeSpent._sum.timeSpent || 0,
        period: `${days} days`
      };
    } catch (error) {
      logger.error('Failed to get user activity analytics', { userId, error });
      throw error;
    }
  }

  /**
   * Get system performance metrics (Admin only)
   */
  static async getSystemMetrics(userRole: UserRole): Promise<any> {
    try {
      // Check authorization
      if (userRole !== UserRole.ADMIN) {
        throw new AuthorizationError('Access denied. Admin role required.');
      }

      const [
        databaseSize,
        activeConnections,
        recentErrors,
        systemLoad
      ] = await Promise.all([
        // Database size (approximate)
        prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size`,

        // Active connections (approximate)
        prisma.$queryRaw`SELECT count(*) as connections FROM pg_stat_activity WHERE state = 'active'`,

        // Recent errors from logs (last 24 hours)
        prisma.analyticsEvent.count({
          where: {
            eventType: 'error',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }),

        // System load metrics
        {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      ]);

      return {
        database: {
          size: databaseSize,
          activeConnections
        },
        errors: {
          last24Hours: recentErrors
        },
        system: systemLoad
      };
    } catch (error) {
      logger.error('Failed to get system metrics', { userRole, error });
      throw error;
    }
  }
}
