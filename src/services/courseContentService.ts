import { CourseLevel, CourseCategory } from '@prisma/client';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { CourseWithDetails } from '../types';

export interface CreateCourseData {
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  duration?: number;
  price?: number;
  tags?: string[];
  thumbnail?: string;
}

export interface UpdateCourseData {
  title?: string;
  description?: string;
  level?: CourseLevel;
  category?: CourseCategory;
  duration?: number;
  price?: number;
  tags?: string[];
  thumbnail?: string;
  isPublished?: boolean;
}

export interface CreateLessonData {
  title: string;
  content: string;
  videoUrl?: string;
  duration?: number;
  order: number;
  resources?: string[];
}

export interface UpdateLessonData {
  title?: string;
  content?: string;
  videoUrl?: string;
  duration?: number;
  order?: number;
  resources?: string[];
}

// Import CourseWithDetails from types instead of defining it here

export class CourseContentService {
  /**
   * Create a new course
   */
  static async createCourse(
    data: CreateCourseData,
    createdById: string
  ): Promise<CourseWithDetails> {
    try {
      // Validate required fields
      if (!data.title || data.title.trim().length === 0) {
        throw new ValidationError('Course title is required');
      }

      if (!data.description || data.description.trim().length === 0) {
        throw new ValidationError('Course description is required');
      }

      if (data.title.length > 200) {
        throw new ValidationError('Course title must not exceed 200 characters');
      }

      if (data.description.length > 2000) {
        throw new ValidationError('Course description must not exceed 2000 characters');
      }

      if (data.price && data.price < 0) {
        throw new ValidationError('Course price cannot be negative');
      }

      // Create course
      const course = await prisma.course.create({
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          level: data.level,
          category: data.category,
          duration: data.duration,
          price: data.price,
          tags: data.tags || [],
          thumbnail: data.thumbnail,
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
        }
      });

      logger.info('Course created', { 
        courseId: course.id, 
        title: course.title,
        createdById 
      });

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        category: course.category,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        duration: course.duration,
        price: course.price,
        tags: course.tags,
        thumbnail: course.thumbnail,
        createdBy: {
          id: course.createdById,
          firstName: 'Unknown',
          lastName: 'User',
          role: 'ADMIN'
        },
        lessons: [], // Will be populated separately
        _count: {
          lesson_items: course._count.lessons_data,
          enrollments: course._count.enrollments,
          lessons: course._count.lessons_data // For backward compatibility
        },
        isEnrolled: false,
        progress: {
          completedLessons: 0,
          totalLessons: course._count.lessons_data,
          percentage: 0
        }
      };
    } catch (error) {
      logger.error('Failed to create course', { data, createdById, error });
      throw error;
    }
  }

  /**
   * Update a course
   */
  static async updateCourse(
    courseId: string,
    data: UpdateCourseData,
    userId: string
  ): Promise<CourseWithDetails> {
    try {
      // Find course and verify ownership
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, createdById: true, title: true }
      });

      if (!existingCourse) {
        throw new NotFoundError('Course not found');
      }

      if (existingCourse.createdById !== userId) {
        throw new ForbiddenError('You can only update your own courses');
      }

      // Validate fields if provided
      if (data.title !== undefined) {
        if (!data.title || data.title.trim().length === 0) {
          throw new ValidationError('Course title cannot be empty');
        }
        if (data.title.length > 200) {
          throw new ValidationError('Course title must not exceed 200 characters');
        }
      }

      if (data.description !== undefined) {
        if (!data.description || data.description.trim().length === 0) {
          throw new ValidationError('Course description cannot be empty');
        }
        if (data.description.length > 2000) {
          throw new ValidationError('Course description must not exceed 2000 characters');
        }
      }

      if (data.price !== undefined && data.price < 0) {
        throw new ValidationError('Course price cannot be negative');
      }

      // Update course
      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: {
          ...(data.title && { title: data.title.trim() }),
          ...(data.description && { description: data.description.trim() }),
          ...(data.level && { level: data.level }),
          ...(data.category && { category: data.category }),
          ...(data.duration !== undefined && { duration: data.duration }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.tags && { tags: data.tags }),
          ...(data.thumbnail && { thumbnail: data.thumbnail }),
          ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
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
        }
      });

      logger.info('Course updated', { 
        courseId, 
        title: updatedCourse.title,
        userId 
      });

      return {
        id: updatedCourse.id,
        title: updatedCourse.title,
        description: updatedCourse.description,
        level: updatedCourse.level,
        category: updatedCourse.category,
        isPublished: updatedCourse.isPublished,
        createdAt: updatedCourse.createdAt,
        updatedAt: updatedCourse.updatedAt,
        duration: updatedCourse.duration,
        price: updatedCourse.price,
        tags: updatedCourse.tags,
        thumbnail: updatedCourse.thumbnail,
        createdBy: {
          id: updatedCourse.createdById,
          firstName: 'Unknown',
          lastName: 'User',
          role: 'ADMIN'
        },
        lessons: [], // Will be populated separately
        _count: {
          lesson_items: updatedCourse._count.lessons_data,
          enrollments: updatedCourse._count.enrollments,
          lessons: updatedCourse._count.lessons_data // For backward compatibility
        }
      };
    } catch (error) {
      logger.error('Failed to update course', { courseId, data, userId, error });
      throw error;
    }
  }

  /**
   * Get course by ID with user-specific data
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
        }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      // Check if user is enrolled and get progress
      let isEnrolled = false;
      let progress = {
        completedLessons: 0,
        totalLessons: course._count.lessons_data,
        percentage: 0
      };

      if (userId) {
        const enrollment = await prisma.courseEnrollment.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId
            }
          },
          // Remove include for now - will implement lesson completion tracking separately
        });

        if (enrollment) {
          isEnrolled = true;
          progress.completedLessons = 0; // Will be calculated separately
          progress.percentage = enrollment.progress; // Use the progress from enrollment
        }
      }

      // Calculate real duration from lesson durations
      const realDuration = course.lessons_data.reduce((total, lesson) => total + (lesson.duration || 0), 0);

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        category: course.category,
        duration: realDuration, // Use calculated duration instead of stored duration
        price: course.price,
        tags: course.tags,
        thumbnail: course.thumbnail,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        createdBy: {
          id: course.createdById,
          firstName: 'Unknown',
          lastName: 'User',
          role: 'ADMIN'
        },
        lessons: [], // Will be populated separately
        _count: {
          lesson_items: course._count.lessons_data,
          enrollments: course._count.enrollments,
          lessons: course._count.lessons_data // For backward compatibility
        },
        isEnrolled,
        progress
      };
    } catch (error) {
      logger.error('Failed to get course by ID', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Get courses with filtering and pagination
   */
  static async getCourses(
    filters: {
      level?: CourseLevel;
      category?: CourseCategory;
      isPublished?: boolean;
      createdBy?: string;
      search?: string;
    } = {},
    options: {
      page?: number;
      limit?: number;
      sortBy?: 'title' | 'createdAt' | 'enrollments';
      sortOrder?: 'asc' | 'desc';
    } = {},
    userId?: string
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
      const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause: any = {};

      if (filters.level) whereClause.level = filters.level;
      if (filters.category) whereClause.category = filters.category;
      if (filters.isPublished !== undefined) whereClause.isPublished = filters.isPublished;
      if (filters.createdBy) whereClause.createdById = filters.createdBy;

      if (filters.search) {
        whereClause.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { tags: { hasSome: filters.search.split(' ') } }
        ];
      }

      // Build order by clause
      let orderBy: any = { createdAt: sortOrder };
      switch (sortBy) {
        case 'title':
          orderBy = { title: sortOrder };
          break;
        case 'enrollments':
          orderBy = { enrollments: { _count: sortOrder } };
          break;
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
              }
            },
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
          }
        }),
        prisma.course.count({ where: whereClause })
      ]);

      // Get user enrollments if authenticated
      let userEnrollments: string[] = [];
      if (userId) {
        const enrollments = await prisma.courseEnrollment.findMany({
          where: { userId },
          select: { courseId: true }
        });
        userEnrollments = enrollments.map(e => e.courseId);
      }

      const formattedCourses: CourseWithDetails[] = courses.map(course => ({
        id: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        category: course.category,
        duration: course.duration,
        price: course.price,
        tags: course.tags,
        thumbnail: course.thumbnail,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        createdBy: {
          id: course.createdBy?.id || course.createdById,
          firstName: course.createdBy?.firstName || 'Unknown',
          lastName: course.createdBy?.lastName || 'User',
          role: course.createdBy?.role || 'ADMIN'
        },
        lessons: [], // Will be populated separately
        _count: {
          lesson_items: course._count.lessons_data,
          enrollments: course._count.enrollments,
          lessons: course._count.lessons_data // For backward compatibility
        },
        isEnrolled: userEnrollments.includes(course.id),
        progress: {
          completedLessons: 0,
          totalLessons: course._count.lessons_data,
          percentage: 0
        }
      }));

      return {
        courses: formattedCourses,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get courses', { filters, options, userId, error });
      throw error;
    }
  }

  /**
   * Delete a course
   */
  static async deleteCourse(courseId: string, userId: string): Promise<void> {
    try {
      // Find course and verify ownership
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { 
          id: true, 
          createdById: true, 
          title: true,
          _count: { 
            select: { enrollments: true } 
          } 
        }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (course.createdById !== userId) {
        throw new ForbiddenError('You can only delete your own courses');
      }

      if (course._count.enrollments > 0) {
        throw new ForbiddenError('Cannot delete course with active enrollments');
      }

      // Delete course (this will cascade delete lessons due to foreign key constraints)
      await prisma.course.delete({
        where: { id: courseId }
      });

      logger.info('Course deleted', { courseId, title: course.title, userId });
    } catch (error) {
      logger.error('Failed to delete course', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Enroll user in a course
   */
  static async enrollInCourse(courseId: string, userId: string): Promise<{
    enrollment: {
      id: string;
      enrolledAt: Date;
      progress: {
        completedLessons: number;
        totalLessons: number;
        percentage: number;
      };
    };
  }> {
    try {
      // Verify course exists and is published
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          isPublished: true,
          _count: { select: { lessons_data: true } }
        }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (!course.isPublished) {
        throw new ForbiddenError('Cannot enroll in unpublished course');
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
        throw new ValidationError('User is already enrolled in this course');
      }

      // Create enrollment
      const enrollment = await prisma.courseEnrollment.create({
        data: {
          userId,
          courseId,
          enrolledAt: new Date()
        }
      });

      logger.info('User enrolled in course', {
        courseId,
        userId,
        courseTitle: course.title
      });

      return {
        enrollment: {
          id: enrollment.id,
          enrolledAt: enrollment.enrolledAt,
          progress: {
            completedLessons: 0,
            totalLessons: course._count.lessons_data,
            percentage: 0
          }
        }
      };
    } catch (error) {
      logger.error('Failed to enroll in course', { courseId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's enrolled courses
   */
  static async getUserEnrolledCourses(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    courses: Array<CourseWithDetails & {
      enrollment: {
        id: string;
        enrolledAt: Date;
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const skip = (page - 1) * limit;

      const [enrollments, total] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { enrolledAt: 'desc' },
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
                _count: {
                  select: {
                    enrollments: true,
                    lessons_data: true
                  }
                }
              }
            }
          }
        }),
        prisma.courseEnrollment.count({ where: { userId } })
      ]);

      const courses = enrollments.map(enrollment => {
        const completedLessons = 0; // Will be calculated separately
        const totalLessons = enrollment.course._count.lessons_data;
        const percentage = enrollment.progress; // Use enrollment progress

        return {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          level: enrollment.course.level,
          category: enrollment.course.category,
          duration: enrollment.course.duration,
          price: enrollment.course.price,
          tags: enrollment.course.tags,
          thumbnail: enrollment.course.thumbnail,
          isPublished: enrollment.course.isPublished,
          createdAt: enrollment.course.createdAt,
          updatedAt: enrollment.course.updatedAt,
          createdBy: {
            id: enrollment.course.createdBy?.id || enrollment.course.createdById,
            firstName: enrollment.course.createdBy?.firstName || 'Unknown',
            lastName: enrollment.course.createdBy?.lastName || 'User',
            role: enrollment.course.createdBy?.role || 'ADMIN'
          },
          lessons: [], // Will be populated separately
          _count: {
            lesson_items: enrollment.course._count.lessons_data,
            enrollments: enrollment.course._count.enrollments,
            lessons: enrollment.course._count.lessons_data // For backward compatibility
          },
          isEnrolled: true,
          progress: {
            completedLessons,
            totalLessons,
            percentage
          },
          enrollment: {
            id: enrollment.id,
            enrolledAt: enrollment.enrolledAt
          }
        };
      });

      return {
        courses,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user enrolled courses', { userId, error });
      throw error;
    }
  }
}

export class LessonService {
  /**
   * Create a lesson for a course
   */
  static async createLesson(
    courseId: string,
    data: CreateLessonData,
    userId: string
  ): Promise<{
    id: string;
    title: string;
    content: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    resources: string[];
  }> {
    try {
      // Verify course exists and user owns it
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, createdById: true, title: true }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (course.createdById !== userId) {
        throw new ForbiddenError('You can only add lessons to your own courses');
      }

      // Validate lesson data
      if (!data.title || data.title.trim().length === 0) {
        throw new ValidationError('Lesson title is required');
      }

      if (!data.content || data.content.trim().length === 0) {
        throw new ValidationError('Lesson content is required');
      }

      if (data.title.length > 200) {
        throw new ValidationError('Lesson title must not exceed 200 characters');
      }

      if (data.order < 1) {
        throw new ValidationError('Lesson order must be at least 1');
      }

      // Check if order already exists
      const existingLesson = await prisma.lesson.findFirst({
        where: { courseId, order: data.order }
      });

      if (existingLesson) {
        throw new ValidationError(`A lesson with order ${data.order} already exists`);
      }

      // Create lesson
      const lesson = await prisma.lesson.create({
        data: {
          title: data.title.trim(),
          content: data.content.trim(),
          videoUrl: data.videoUrl,
          duration: data.duration,
          order: data.order,
          resources: data.resources || [],
          courseId
        }
      });

      logger.info('Lesson created', {
        lessonId: lesson.id,
        courseId,
        title: lesson.title,
        userId
      });

      return {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content,
        videoUrl: lesson.videoUrl,
        duration: lesson.duration,
        order: lesson.order,
        resources: lesson.resources
      };
    } catch (error) {
      logger.error('Failed to create lesson', { courseId, data, userId, error });
      throw error;
    }
  }

  /**
   * Mark lesson as completed
   */
  static async markLessonCompleted(
    lessonId: string,
    userId: string
  ): Promise<{
    completed: boolean;
    progress: {
      completedLessons: number;
      totalLessons: number;
      percentage: number;
    };
  }> {
    try {
      // Verify lesson exists and user is enrolled in the course
      const lesson = await prisma.courseLesson.findUnique({
        where: { id: lessonId },
        include: {
          course: {
            select: {
              id: true,
              _count: { select: { lessons_data: true } }
            }
          }
        }
      });

      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }

      // Check if user is enrolled in the course
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: lesson.courseId
          }
        }
      });

      if (!enrollment) {
        throw new ForbiddenError('You must be enrolled in the course to mark lessons as completed');
      }

      // Check if lesson is already completed
      const existingCompletion = await prisma.lessonCompletion.findUnique({
        where: {
          userId_lessonId: {
            userId,
            lessonId
          }
        }
      });

      if (existingCompletion) {
        throw new ValidationError('Lesson is already marked as completed');
      }

      // Mark lesson as completed
      await prisma.lessonCompletion.create({
        data: {
          userId,
          lessonId,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Get updated progress
      // Get all lessons for this course to count completions
      const courseLessons = await prisma.courseLesson.findMany({
        where: { courseId: lesson.courseId },
        select: { id: true }
      });
      
      const completedLessons = await prisma.lessonCompletion.count({
        where: {
          userId,
          lessonId: { in: courseLessons.map(l => l.id) }
        }
      });

      const totalLessons = lesson.course._count.lessons_data;
      const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      logger.info('Lesson marked as completed', {
        lessonId,
        userId,
        courseId: lesson.courseId,
        progress: { completedLessons, totalLessons, percentage }
      });

      return {
        completed: true,
        progress: {
          completedLessons,
          totalLessons,
          percentage
        }
      };
    } catch (error) {
      logger.error('Failed to mark lesson as completed', { lessonId, userId, error });
      throw error;
    }
  }

  /**
   * Get lessons for a course
   */
  static async getCourseLessons(courseId: string) {
    try {
      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      // Get lessons
      const lessons = await prisma.lesson.findMany({
        where: { courseId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          content: true,
          videoUrl: true,
          duration: true,
          order: true,
          resources: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return lessons;
    } catch (error) {
      logger.error('Failed to get course lessons', { courseId, error });
      throw error;
    }
  }
}
