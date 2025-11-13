import { prisma } from '@/database/connection';
import { 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  AuthorizationError 
} from '@/middleware/errorHandler';
import { 
  CourseWithDetails,
  CreateCourseRequest,
  UpdateCourseRequest,
  PaginationParams,
  FilterParams
} from '@/types';
import { UserRole, SubscriptionTier, CourseLevel, CourseCategory } from '@prisma/client';
import { logger } from '@/utils/logger';

export class CourseService {
  /**
   * Create a new course (Manager/Admin only)
   */
  static async createCourse(
    courseData: CreateCourseRequest,
    createdById: string,
    creatorRole: UserRole
  ): Promise<CourseWithDetails> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(creatorRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      // Create course
      const course = await prisma.course.create({
        data: {
          ...courseData,
          createdById,
          isPublished: false
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          enrollments: true,
          lessons_data: true,
          _count: {
            select: {
              enrollments: true,
              lessons_data: true
            }
          }
        }
      });

      logger.info('Course created successfully', { 
        courseId: course.id, 
        title: course.title,
        createdById 
      });

      return course as CourseWithDetails;
    } catch (error) {
      logger.error('Failed to create course', { courseData, createdById, error });
      throw error;
    }
  }

  /**
   * Get course by ID
   */
  static async getCourseById(
    courseId: string, 
    userId?: string
  ): Promise<CourseWithDetails> {
    try {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          enrollments: userId ? {
            where: { userId },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          } : {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          lessons_data: {
            orderBy: { order: 'asc' }
          },
          progress: userId ? {
            where: { userId }
          } : undefined,
          _count: {
            select: {
              enrollments: true,
              lessons_data: true
            }
          }
        }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      // Check if user has access to this course
      if (course.requiredTier !== SubscriptionTier.FREE && userId) {
        // Course creators have automatic access to their own courses
        if (course.createdById === userId) {
          // Creator has full access to their own course
        } else {
          // Check subscription tier for non-creators
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { subscriptionTier: true }
          });

          if (user && !this.hasAccessToTier(user.subscriptionTier, course.requiredTier)) {
            throw new AuthorizationError('Subscription upgrade required to access this course');
          }
        }
      }

      // Add computed fields
      const courseWithDetails: CourseWithDetails = {
        ...course,
        userProgress: course.progress?.[0],
        isFavorited: false, // Will be calculated separately if needed
        isEnrolled: userId ? (
          course.enrollments.some(e => e.userId === userId) || 
          course.createdById === userId // Course creators are automatically enrolled
        ) : false,
        progress: course.progress?.[0] ? {
          completedLessons: 0, // This would need to be calculated based on actual progress
          totalLessons: course._count.lessons_data,
          percentage: course.progress[0].progressPercentage
        } : undefined
      } as CourseWithDetails;

      return courseWithDetails;
    } catch (error) {
      logger.error('Failed to get course by ID', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Get all courses with pagination and filtering
   */
  static async getAllCourses(
    pagination: PaginationParams,
    filters: FilterParams,
    userId?: string,
    userRole?: UserRole
  ): Promise<{
    courses: CourseWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
      const { search, level, category, tier } = filters;

      // Build where clause
      const where: any = {};

      // Only show published courses to regular users, but admins can see all
      if (!userRole || ![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
        where.isPublished = true;
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { titleEn: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } }
        ];
      }

      if (level) {
        where.level = level;
      }

      if (category) {
        where.category = category;
      }

      if (tier) {
        where.requiredTier = tier;
      }

      // Get all courses first (we'll filter and deduplicate in code)
      const allCourses = await prisma.course.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          enrollments: userId ? {
            where: { userId }
          } : {
            take: 0
          },
          progress: userId ? {
            where: { userId }
          } : undefined,
          lessons_data: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              title: true,
              content: true,
              videoUrl: true,
              duration: true,
              order: true,
              resources: true
            }
          },
          _count: {
            select: {
              enrollments: true,
              lessons_data: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder }
      });

      // Get user's subscription tier for access control
      let userSubscriptionTier: SubscriptionTier = SubscriptionTier.FREE;
      logger.info('🔍 Getting user subscription tier', { userId, hasUserId: !!userId });
      
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true, email: true }
        });
        
        if (user) {
          if (user.subscriptionTier) {
            userSubscriptionTier = user.subscriptionTier;
            logger.info('✅ User subscription tier fetched', { 
              userId, 
              email: user.email,
              subscriptionTier: userSubscriptionTier 
            });
          } else {
            logger.warn('⚠️ User found but no subscription tier', { userId, email: user.email });
          }
        } else {
          logger.warn('⚠️ User not found in database', { userId });
        }
      } else {
        logger.warn('⚠️ No userId provided, defaulting to FREE tier - THIS IS THE PROBLEM!');
      }

      // Process all courses (don't filter out - show all with access flags)
      // Deduplicate by title and check subscription access
      const courseMap = new Map<string, any>();
      
      for (const course of allCourses) {
        // Parse availableSubscriptions from JSON field
        let availableSubs: SubscriptionTier[] = [];
        const subsField = (course as any).availableSubscriptions;
        
        // Handle null, undefined, or empty values
        if (subsField != null && subsField !== 'null' && subsField !== '') {
          try {
            // Handle JSON field - could be string, array, or already parsed
            if (typeof subsField === 'string') {
              // Check if it's a JSON string
              if (subsField.trim().startsWith('[') || subsField.trim().startsWith('{')) {
                availableSubs = JSON.parse(subsField);
              } else {
                // Single value as string
                availableSubs = [subsField as SubscriptionTier];
              }
            } else if (Array.isArray(subsField)) {
              availableSubs = subsField;
            } else if (typeof subsField === 'object') {
              // Handle Prisma JsonNull or other object types
              availableSubs = [];
            }
          } catch (e) {
            // If parsing fails, fall back to requiredTier
            availableSubs = [];
          }
        }
        
        // If no availableSubscriptions, use requiredTier (this handles null/undefined cases)
        if (availableSubs.length === 0) {
          availableSubs = [course.requiredTier];
        }
        
        // IMPORTANT: If course is FREE (requiredTier = FREE or FREE is in availableSubscriptions), everyone has access
        const isFreeCourse = course.requiredTier === SubscriptionTier.FREE || availableSubs.includes(SubscriptionTier.FREE);
        
        let hasAccess = false;
        let requiredTierForAccess: SubscriptionTier = course.requiredTier;
        
        if (isFreeCourse) {
          // FREE courses are accessible to everyone - no restrictions
          hasAccess = true;
          requiredTierForAccess = SubscriptionTier.FREE;
          logger.debug('FREE course - granting access', { courseId: course.id, title: course.title });
        } else {
          // For paid courses, check access using hierarchy: user can access if their tier >= any required tier
          // PRO can access all, PREMIUM can access PREMIUM/ESSENTIAL, etc.
          logger.debug('Checking paid course access', {
            courseId: course.id,
            title: course.title,
            userSubscriptionTier,
            availableSubs,
            requiredTier: course.requiredTier
          });
          
          for (const tier of availableSubs) {
            const canAccess = this.hasAccessToTier(userSubscriptionTier, tier);
            logger.debug('Access check', {
              userTier: userSubscriptionTier,
              courseTier: tier,
              canAccess,
              courseTitle: course.title
            });
            
            if (canAccess) {
              hasAccess = true;
              requiredTierForAccess = tier;
              break;
            }
          }
          
          // If user doesn't have access to any tier, find the minimum required tier
          if (!hasAccess) {
            // Find the lowest tier in availableSubs that user needs
            const tierHierarchy = {
              [SubscriptionTier.FREE]: 0,
              [SubscriptionTier.ESSENTIAL]: 1,
              [SubscriptionTier.PREMIUM]: 2,
              [SubscriptionTier.PRO]: 3
            };
            
            const userTierLevel = tierHierarchy[userSubscriptionTier];
            const requiredTiers = availableSubs.map(t => ({
              tier: t,
              level: tierHierarchy[t]
            })).filter(t => t.level > userTierLevel);
            
            if (requiredTiers.length > 0) {
              requiredTierForAccess = requiredTiers.sort((a, b) => a.level - b.level)[0].tier;
            } else {
              requiredTierForAccess = availableSubs[0] || course.requiredTier;
            }
          }
        }
        
        // Add access information to course
        (course as any).hasAccess = hasAccess;
        (course as any).requiredTierForAccess = requiredTierForAccess;
        
        // Deduplicate by title - normalize title (trim, lowercase) to catch all duplicates
        const normalizedTitle = course.title.trim().toLowerCase();
        
        // Keep only the first course with this title (prefer one with more lessons or more recent)
        if (!courseMap.has(normalizedTitle)) {
          courseMap.set(normalizedTitle, course);
        } else {
          // If duplicate found, keep the one with more lessons or more recent
          const existing = courseMap.get(normalizedTitle);
          const existingLessons = existing?.lessons_data?.length || 0;
          const currentLessons = course.lessons_data?.length || 0;
          
          // Prefer course with more lessons, or if equal, keep the more recent one
          if (currentLessons > existingLessons || 
              (currentLessons === existingLessons && course.createdAt > existing.createdAt)) {
            courseMap.set(normalizedTitle, course);
          }
        }
      }

      const uniqueCourses = Array.from(courseMap.values());
      
      // Apply pagination after deduplication
      const total = uniqueCourses.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedCourses = uniqueCourses.slice((page - 1) * limit, page * limit);

      // Add computed fields
      const coursesWithDetails: CourseWithDetails[] = paginatedCourses.map(course => {
        // ALWAYS calculate real duration from lesson durations - NEVER use stored course.duration
        // Sum all lesson durations to get actual course duration
        const realDuration = course.lessons_data && course.lessons_data.length > 0
          ? course.lessons_data.reduce((total, lesson) => {
              const lessonDuration = lesson.duration || 0
              return total + lessonDuration
            }, 0)
          : 0; // If no lessons, duration is 0
        
        // Parse availableLevels from JSON if needed
        let availableLevels: CourseLevel[] = [];
        if ((course as any).availableLevels) {
          try {
            const levels = (course as any).availableLevels;
            if (typeof levels === 'string') {
              availableLevels = JSON.parse(levels);
            } else if (Array.isArray(levels)) {
              availableLevels = levels;
            }
          } catch (e) {
            availableLevels = [course.level];
          }
        }
        if (availableLevels.length === 0) {
          availableLevels = [course.level];
        }
        
        // Parse availableSubscriptions from JSON if needed
        let availableSubscriptions: SubscriptionTier[] = [];
        if ((course as any).availableSubscriptions) {
          try {
            const subs = (course as any).availableSubscriptions;
            if (typeof subs === 'string') {
              availableSubscriptions = JSON.parse(subs);
            } else if (Array.isArray(subs)) {
              availableSubscriptions = subs;
            }
          } catch (e) {
            availableSubscriptions = [course.requiredTier];
          }
        }
        if (availableSubscriptions.length === 0) {
          availableSubscriptions = [course.requiredTier];
        }
        
        return {
          ...course,
          duration: realDuration, // Use calculated duration in minutes (from lessons_data only)
          lessons_data: course.lessons_data, // Explicitly include lessons_data
          availableLevels: availableLevels, // Include availableLevels for filtering
          availableSubscriptions: availableSubscriptions, // Include availableSubscriptions
          thumbnail: course.thumbnail, // Include thumbnail for video thumbnails
          userProgress: course.progress?.[0],
          isFavorited: false, // Will be calculated separately if needed
          isEnrolled: course.enrollments.length > 0,
          hasAccess: (course as any).hasAccess ?? true, // Access flag for frontend
          requiredTierForAccess: (course as any).requiredTierForAccess ?? course.requiredTier, // Minimum tier needed
          progress: course.progress?.[0] ? {
            completedLessons: 0, // This would need to be calculated based on actual progress
            totalLessons: course._count.lessons_data,
            percentage: course.progress[0].progressPercentage
          } : undefined
        } as CourseWithDetails;
      });

      return {
        courses: coursesWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get all courses', { error });
      throw error;
    }
  }

  /**
   * Update course (Creator/Admin only)
   */
  static async updateCourse(
    courseId: string,
    updateData: UpdateCourseRequest,
    userId: string,
    userRole: UserRole
  ): Promise<CourseWithDetails> {
    try {
      // Get existing course
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!existingCourse) {
        throw new NotFoundError('Course not found');
      }

      // Check authorization
      if (userRole !== UserRole.ADMIN && existingCourse.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only edit your own courses.');
      }

      // Update course
      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          enrollments: true,
          lessons_data: {
            orderBy: { order: 'asc' }
          },
          _count: {
            select: {
              enrollments: true,
              lessons_data: true
            }
          }
        }
      });

      logger.info('Course updated successfully', { 
        courseId, 
        title: updatedCourse.title,
        updatedBy: userId 
      });

      return updatedCourse as CourseWithDetails;
    } catch (error) {
      logger.error('Failed to update course', { courseId, updateData, userId, error });
      throw error;
    }
  }

  /**
   * Delete course (Creator/Admin only)
   */
  static async deleteCourse(
    courseId: string,
    userId: string,
    userRole: UserRole
  ): Promise<void> {
    try {
      // Get existing course
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!existingCourse) {
        throw new NotFoundError('Course not found');
      }

      // Check authorization
      if (userRole !== UserRole.ADMIN && existingCourse.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only delete your own courses.');
      }

      // Delete course (cascade will handle related records)
      await prisma.course.delete({
        where: { id: courseId }
      });

      logger.info('Course deleted successfully', { courseId, deletedBy: userId });
    } catch (error) {
      logger.error('Failed to delete course', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Enroll user in course
   */
  static async enrollInCourse(courseId: string, userId: string): Promise<void> {
    try {
      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (!course.isPublished) {
        throw new ValidationError('Course is not published');
      }

      // Course creators don't need to enroll in their own courses
      if (course.createdById === userId) {
        throw new ValidationError('Course creators have automatic access to their own courses');
      }

      // Check user subscription tier for non-creators
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!this.hasAccessToTier(user.subscriptionTier, course.requiredTier)) {
        throw new AuthorizationError('Subscription upgrade required to enroll in this course');
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId
          }
        }
      });

      if (existingEnrollment) {
        throw new ConflictError('Already enrolled in this course');
      }

      // Create enrollment
      await prisma.courseEnrollment.create({
        data: {
          userId,
          courseId,
          enrolledAt: new Date()
        }
      });

      // Update course enrolled count
      await prisma.course.update({
        where: { id: courseId },
        data: {
          enrolledCount: {
            increment: 1
          }
        }
      });

      logger.info('User enrolled in course successfully', { courseId, userId });
    } catch (error) {
      logger.error('Failed to enroll in course', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Unenroll user from course
   */
  static async unenrollFromCourse(courseId: string, userId: string): Promise<void> {
    try {
      // Check if enrollment exists
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId
          }
        }
      });

      if (!enrollment) {
        throw new NotFoundError('Not enrolled in this course');
      }

      // Delete enrollment
      await prisma.courseEnrollment.delete({
        where: {
          userId_courseId: {
            userId,
            courseId
          }
        }
      });

      // Update course enrolled count
      await prisma.course.update({
        where: { id: courseId },
        data: {
          enrolledCount: {
            decrement: 1
          }
        }
      });

      logger.info('User unenrolled from course successfully', { courseId, userId });
    } catch (error) {
      logger.error('Failed to unenroll from course', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's enrolled courses
   */
  static async getUserEnrolledCourses(
    userId: string,
    pagination: PaginationParams
  ): Promise<{
    courses: CourseWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'enrolledAt', sortOrder = 'desc' } = pagination;

      // Get total count
      const total = await prisma.courseEnrollment.count({
        where: { userId }
      });

      // Get enrolled courses
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { userId },
        include: {
          course: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true
                }
              },
              progress: {
                where: { userId }
              },
              _count: {
                select: {
                  enrollments: true,
                  lessons_data: true
                }
              }
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      // Transform to CourseWithDetails
      const courses: CourseWithDetails[] = enrollments.map(enrollment => ({
        ...enrollment.course,
        userProgress: enrollment.course.progress[0],
        isFavorited: false, // Will be calculated separately if needed
        isEnrolled: true,
        progress: enrollment.course.progress[0] ? {
          completedLessons: 0, // This would need to be calculated based on actual progress
          totalLessons: enrollment.course._count.lessons_data,
          percentage: enrollment.course.progress[0].progressPercentage
        } : undefined
      } as CourseWithDetails));

      return {
        courses,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get user enrolled courses', { userId, error });
      throw error;
    }
  }

  /**
   * Get course statistics for a user
   */
  static async getCourseStatistics(userId: string, userRole: UserRole): Promise<{
    totalCourses: number;
    publishedCourses: number;
    totalEnrollments: number;
    averageRating: number;
  }> {
    try {
      const whereClause: any = { createdById: userId };

      // Get basic statistics
      const [
        totalCourses,
        publishedCourses,
        totalEnrollments,
        averageRating
      ] = await Promise.all([
        // Total courses created by user
        prisma.course.count({ where: whereClause }),
        
        // Published courses
        prisma.course.count({ 
          where: { ...whereClause, isPublished: true } 
        }),
        
        // Total enrollments across all user's courses
        prisma.courseEnrollment.count({
          where: {
            course: whereClause
          }
        }),
        
        // Average rating (placeholder - would need rating system)
        Promise.resolve(4.5) // Mock average rating
      ]);

      return {
        totalCourses,
        publishedCourses,
        totalEnrollments,
        averageRating
      };
    } catch (error) {
      logger.error('Failed to get course statistics', { userId, error });
      throw error;
    }
  }

  /**
   * Check if user has access to subscription tier
   */
  private static hasAccessToTier(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
    const tierHierarchy = {
      [SubscriptionTier.FREE]: 0,
      [SubscriptionTier.ESSENTIAL]: 1,
      [SubscriptionTier.PREMIUM]: 2,
      [SubscriptionTier.PRO]: 3
    };

    return tierHierarchy[userTier] >= tierHierarchy[requiredTier];
  }
}
