import { prisma } from '@/database/connection';
import { UserRole } from '@prisma/client';
import { NotificationService } from '@/services/notificationService';
import { logger } from '@/utils/logger';

interface PaginationOptions {
  page: number;
  limit: number;
}

interface UserFilters {
  search?: string;
  filters?: string;
}

interface ContentFilters {
  type?: string;
  status?: string;
  author?: string;
  date?: string;
}

export class ManagerService {
  /**
   * Get manager dashboard data
   */
  static async getDashboardData(managerId: string, timeframe: string, team?: string) {
    const startDate = this.getStartDate(timeframe);

    const [
      contentStats,
      userStats,
      performanceMetrics,
      recentActivity
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

      // User engagement stats
      {
        totalEnrollments: await prisma.courseEnrollment.count({
          where: {
            course: {
              createdById: managerId
            },
            enrolledAt: { gte: startDate }
          }
        }),
        totalTestAttempts: await prisma.testAttempt.count({
          where: {
            test: {
              createdById: managerId
            },
            startedAt: { gte: startDate }
          }
        }),
        averageScore: await this.getAverageScore(managerId, startDate)
      },

      // Performance metrics
      {
        contentViews: 1250, // Mock data
        userSatisfaction: 4.7,
        completionRate: 85
      },

      // Recent activity
      await this.getRecentActivity(managerId, 10)
    ]);

    return {
      stats: {
        ...contentStats,
        ...userStats,
        ...performanceMetrics
      },
      recentActivity,
      timeframe
    };
  }

  /**
   * Get manager metrics
   */
  static async getMetrics(managerId: string, period: string, category?: string) {
    const startDate = this.getStartDate(period);

    const metrics = await Promise.all([
      // Content performance
      prisma.course.findMany({
        where: {
          createdById: managerId,
          createdAt: { gte: startDate }
        },
        include: {
          _count: {
            select: {
              enrollments: true
            }
          }
        }
      }),

      // Test performance
      prisma.test.findMany({
        where: {
          createdById: managerId,
          createdAt: { gte: startDate }
        },
        include: {
          _count: {
            select: {
              attempts: true
            }
          }
        }
      }),

      // User engagement
      prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        _count: true,
        where: {
          createdAt: { gte: startDate }
        }
      })
    ]);

    return {
      contentPerformance: metrics[0],
      testPerformance: metrics[1],
      userEngagement: metrics[2],
      period,
      category
    };
  }

  /**
   * Get recent activity
   */
  static async getActivity(managerId: string, limit: number, type?: string) {
    const activities = await prisma.analyticsEvent.findMany({
      where: {
        userId: managerId,
        ...(type && { eventType: type })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return activities;
  }

  /**
   * Get manager analytics
   */
  static async getAnalytics(managerId: string, timeframe: string, category?: string, filters?: string) {
    const startDate = this.getStartDate(timeframe);

    const analytics = await prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      _count: true,
      where: {
        userId: managerId,
        createdAt: { gte: startDate }
      }
    });

    return {
      analytics,
      timeframe,
      category,
      filters
    };
  }

  /**
   * Generate manager report
   */
  static async generateReport(managerId: string, reportConfig: any) {
    // Mock implementation
    const report = {
      id: `manager_report_${Date.now()}`,
      type: reportConfig.type,
      managerId,
      generatedAt: new Date(),
      data: {
        summary: 'Manager report generated successfully',
        metrics: await this.getMetrics(managerId, reportConfig.timeframe || '30d')
      }
    };

    return report;
  }

  /**
   * Export manager data
   */
  static async exportData(managerId: string, format: string, filters?: string) {
    return {
      format,
      url: `/exports/manager_${managerId}_${Date.now()}.${format}`,
      generatedAt: new Date(),
      managerId
    };
  }

  /**
   * Get users managed by this manager
   */
  static async getManagedUsers(
    managerId: string,
    managerRole: UserRole,
    pagination: PaginationOptions,
    filters: UserFilters
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Determine which users this manager can see based on role
    const where: any = {};

    if (managerRole === UserRole.JUNIOR_MANAGER) {
      // Junior managers can only see students
      where.role = UserRole.STUDENT;
    } else if (managerRole === UserRole.SENIOR_MANAGER) {
      // Senior managers can see students and junior managers
      where.role = {
        in: [UserRole.STUDENT, UserRole.JUNIOR_MANAGER]
      };
    }

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ];
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
   * Get user analytics for managed users
   */
  static async getUserAnalytics(userId: string, managerId: string, managerRole: UserRole) {
    // Verify manager has permission to view this user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions
    if (managerRole === UserRole.JUNIOR_MANAGER && user.role !== UserRole.STUDENT) {
      throw new Error('Access denied');
    }

    const startDate = this.getStartDate('30d');

    const [
      courseProgress,
      testResults,
      activityLog
    ] = await Promise.all([
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
        take: 20
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
          : 0
      }
    };
  }

  /**
   * Send message to user
   */
  static async sendMessageToUser(
    userId: string,
    managerId: string,
    title: string,
    message: string,
    type: string = 'INFO'
  ) {
    await NotificationService.sendSystemNotification(
      userId,
      title,
      message,
      type as any,
      { fromManager: managerId }
    );
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

  private static async getAverageScore(managerId: string, startDate: Date): Promise<number> {
    const result = await prisma.testAttempt.aggregate({
      where: {
        test: {
          createdById: managerId
        },
        startedAt: { gte: startDate },
        score: { not: null }
      },
      _avg: {
        score: true
      }
    });

    return result._avg.score || 0;
  }

  private static async getRecentActivity(managerId: string, limit: number) {
    return await prisma.analyticsEvent.findMany({
      where: {
        userId: managerId
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Get content library for manager
   */
  static async getContentLibrary(managerId: string, filters: ContentFilters) {
    try {
    const where: any = {};

    if (filters.type) {
      // Filter by content type
      if (filters.type === 'courses') {
          try {
        const courses = await prisma.course.findMany({
          where: {
            createdById: managerId,
            ...(filters.status && { isPublished: filters.status === 'published' })
          },
              orderBy: { createdAt: 'desc' },
              take: 50
        });
        return { type: 'courses', content: courses };
          } catch (error: any) {
            logger.warn('Failed to fetch courses', { managerId, error: error.message });
            return { type: 'courses', content: [] };
          }
      } else if (filters.type === 'tests') {
          try {
        const tests = await prisma.test.findMany({
          where: {
            createdById: managerId,
            ...(filters.status && { isPublished: filters.status === 'published' })
          },
              orderBy: { createdAt: 'desc' },
              take: 50
        });
        return { type: 'tests', content: tests };
          } catch (error: any) {
            logger.warn('Failed to fetch tests', { managerId, error: error.message });
            return { type: 'tests', content: [] };
          }
      } else if (filters.type === 'posts') {
          try {
        const posts = await prisma.post.findMany({
          where: {
            authorId: managerId,
            ...(filters.status && { status: filters.status.toUpperCase() as any })
          },
              orderBy: { createdAt: 'desc' },
              take: 50
        });
        return { type: 'posts', content: posts };
          } catch (error: any) {
            logger.warn('Failed to fetch posts', { managerId, error: error.message });
            return { type: 'posts', content: [] };
          }
      }
    }

      // Return all content types with error handling
    const [courses, tests, posts, liveSessions] = await Promise.all([
      prisma.course.findMany({
        where: { createdById: managerId },
        orderBy: { createdAt: 'desc' },
        take: 10
        }).catch((error: any) => {
          logger.warn('Failed to fetch courses', { managerId, error: error.message });
          return [];
      }),
      prisma.test.findMany({
        where: { createdById: managerId },
        orderBy: { createdAt: 'desc' },
        take: 10
        }).catch((error: any) => {
          logger.warn('Failed to fetch tests', { managerId, error: error.message });
          return [];
      }),
      prisma.post.findMany({
        where: { authorId: managerId },
        orderBy: { createdAt: 'desc' },
        take: 10
        }).catch((error: any) => {
          logger.warn('Failed to fetch posts', { managerId, error: error.message });
          return [];
      }),
      prisma.liveSession.findMany({
        where: { createdById: managerId },
        orderBy: { createdAt: 'desc' },
        take: 10
        }).catch((error: any) => {
          logger.warn('Failed to fetch liveSessions (table may not exist)', { managerId, error: error.message });
          return [];
      })
    ]);

    return {
      courses,
      tests,
      posts,
        liveSessions: liveSessions || []
      };
    } catch (error: any) {
      logger.error('Failed to get content library', { managerId, error: error.message });
      // Return empty structure instead of throwing
      return {
        courses: [],
        tests: [],
        posts: [],
        liveSessions: []
    };
    }
  }

  /**
   * Create content (generic content creation)
   */
  static async createContent(managerId: string, contentData: any) {
    const { type, ...data } = contentData;

    switch (type) {
      case 'post':
        return await prisma.post.create({
          data: {
            ...data,
            authorId: managerId,
            status: 'DRAFT'
          }
        });
      case 'course':
        return await prisma.course.create({
          data: {
            ...data,
            createdById: managerId,
            isPublished: false
          }
        });
      case 'test':
        return await prisma.test.create({
          data: {
            ...data,
            createdById: managerId,
            isPublished: false
          }
        });
      default:
        throw new Error('Invalid content type');
    }
  }

  /**
   * Update content
   */
  static async updateContent(contentId: string, managerId: string, updateData: any) {
    const { type, ...data } = updateData;

    // Verify ownership
    let content;
    switch (type) {
      case 'post':
        content = await prisma.post.findFirst({
          where: { id: contentId, authorId: managerId }
        });
        if (!content) throw new Error('Post not found or access denied');
        return await prisma.post.update({
          where: { id: contentId },
          data
        });
      case 'course':
        content = await prisma.course.findFirst({
          where: { id: contentId, createdById: managerId }
        });
        if (!content) throw new Error('Course not found or access denied');
        return await prisma.course.update({
          where: { id: contentId },
          data
        });
      case 'test':
        content = await prisma.test.findFirst({
          where: { id: contentId, createdById: managerId }
        });
        if (!content) throw new Error('Test not found or access denied');
        return await prisma.test.update({
          where: { id: contentId },
          data
        });
      default:
        throw new Error('Invalid content type');
    }
  }

  /**
   * Publish content
   */
  static async publishContent(contentId: string, managerId: string) {
    // Try to find the content in different tables
    const [post, course, test] = await Promise.all([
      prisma.post.findFirst({
        where: { id: contentId, authorId: managerId }
      }),
      prisma.course.findFirst({
        where: { id: contentId, createdById: managerId }
      }),
      prisma.test.findFirst({
        where: { id: contentId, createdById: managerId }
      })
    ]);

    if (post) {
      return await prisma.post.update({
        where: { id: contentId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date()
        }
      });
    } else if (course) {
      return await prisma.course.update({
        where: { id: contentId },
        data: { isPublished: true }
      });
    } else if (test) {
      return await prisma.test.update({
        where: { id: contentId },
        data: { isPublished: true }
      });
    } else {
      throw new Error('Content not found or access denied');
    }
  }

  /**
   * Get content analytics
   */
  static async getContentAnalytics(contentId: string, managerId: string) {
    try {
      // Get actual analytics data
      const [courseAnalytics, testAnalytics, sessionAnalytics] = await Promise.all([
        // Course analytics
        prisma.course.findFirst({
          where: {
            id: contentId,
            createdById: managerId
          },
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                enrollments: true,
                lessons_data: true
              }
            },
            enrollments: {
              select: {
                progress: true,
                completedAt: true,
                user: {
                  select: {
                    id: true
                  }
                }
              }
            }
          }
        }),

        // Test analytics
        prisma.test.findFirst({
          where: {
            id: contentId,
            createdById: managerId
          },
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                attempts: true
              }
            },
            attempts: {
              select: {
                score: true,
                completedAt: true,
                user: {
                  select: {
                    id: true
                  }
                }
              }
            }
          }
        }),

        // Live session analytics
        prisma.liveSession.findFirst({
          where: {
            id: contentId,
            createdById: managerId
          },
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                participants: true
              }
            },
            participants: {
              select: {
                attended: true,
                engagementScore: true,
                user: {
                  select: {
                    id: true
                  }
                }
              }
            }
          }
        })
      ]);

      // Process course analytics
      if (courseAnalytics) {
        const completions = courseAnalytics.enrollments.filter(e => e.completedAt).length;
        const averageProgress = courseAnalytics.enrollments.reduce((sum, e) => sum + e.progress, 0) / courseAnalytics.enrollments.length || 0;

        return {
          contentId,
          type: 'course',
          title: courseAnalytics.title,
          enrollments: courseAnalytics._count.enrollments,
          completions,
          completionRate: courseAnalytics._count.enrollments > 0 ? (completions / courseAnalytics._count.enrollments) * 100 : 0,
          averageProgress: Math.round(averageProgress),
          totalLessons: courseAnalytics._count.lessons_data
        };
      }

      // Process test analytics
      if (testAnalytics) {
        const averageScore = testAnalytics.attempts.reduce((sum, a) => sum + (a.score || 0), 0) / testAnalytics.attempts.length || 0;
        const completions = testAnalytics.attempts.filter(a => a.completedAt).length;

        return {
          contentId,
          type: 'test',
          title: testAnalytics.title,
          attempts: testAnalytics._count.attempts,
          completions,
          completionRate: testAnalytics._count.attempts > 0 ? (completions / testAnalytics._count.attempts) * 100 : 0,
          averageScore: Math.round(averageScore)
        };
      }

      // Process live session analytics
      if (sessionAnalytics) {
        const attendanceRate = sessionAnalytics.participants.filter(p => p.attended).length / sessionAnalytics._count.participants || 0;
        const averageEngagement = sessionAnalytics.participants.reduce((sum, p) => sum + p.engagementScore, 0) / sessionAnalytics.participants.length || 0;

        return {
          contentId,
          type: 'session',
          title: sessionAnalytics.title,
          participants: sessionAnalytics._count.participants,
          attendanceRate: Math.round(attendanceRate * 100),
          averageEngagement: Math.round(averageEngagement)
        };
      }

      return {
        contentId,
        error: 'Content not found or access denied'
      };
    } catch (error) {
      logger.error('Failed to get content analytics', error);
      throw error;
    }
  }

}
