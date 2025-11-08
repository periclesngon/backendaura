const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

class CourseProgressService {
  /**
   * Enroll user in a course
   */
  static async enrollInCourse(userId, courseId) {
    try {
      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: { lessons: true }
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findFirst({
        where: { userId, courseId }
      });

      if (existingEnrollment) {
        throw new ValidationError('User already enrolled in this course');
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: 'ACTIVE',
          enrolledAt: new Date(),
          progress: 0
        }
      });

      // Create lesson progress entries
      if (course.lessons && course.lessons.length > 0) {
        const lessonProgressData = course.lessons.map(lesson => ({
          userId,
          lessonId: lesson.id,
          status: 'NOT_STARTED',
          progress: 0
        }));

        await prisma.lessonProgress.createMany({
          data: lessonProgressData
        });
      }

      logger.info('User enrolled in course', { userId, courseId, enrollmentId: enrollment.id });

      return {
        enrollmentId: enrollment.id,
        courseId,
        status: 'ACTIVE',
        progress: 0,
        enrolledAt: enrollment.enrolledAt
      };
    } catch (error) {
      logger.error('Failed to enroll user in course', { userId, courseId, error });
      throw error;
    }
  }

  /**
   * Update lesson progress
   */
  static async updateLessonProgress(userId, lessonId, progressData) {
    try {
      const { status, progress, timeSpent, completedAt } = progressData;

      // Validate lesson exists and user is enrolled
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: true }
      });

      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }

      const enrollment = await prisma.enrollment.findFirst({
        where: { userId, courseId: lesson.courseId, status: 'ACTIVE' }
      });

      if (!enrollment) {
        throw new NotFoundError('User not enrolled in this course');
      }

      // Update lesson progress
      const lessonProgress = await prisma.lessonProgress.upsert({
        where: {
          userId_lessonId: { userId, lessonId }
        },
        update: {
          status,
          progress: Math.min(100, Math.max(0, progress)),
          timeSpent: (timeSpent || 0),
          completedAt: status === 'COMPLETED' ? (completedAt || new Date()) : null,
          updatedAt: new Date()
        },
        create: {
          userId,
          lessonId,
          status,
          progress: Math.min(100, Math.max(0, progress)),
          timeSpent: (timeSpent || 0),
          completedAt: status === 'COMPLETED' ? (completedAt || new Date()) : null
        }
      });

      // Recalculate course progress
      await this.updateCourseProgress(userId, lesson.courseId);

      logger.info('Lesson progress updated', { 
        userId, 
        lessonId, 
        status, 
        progress: lessonProgress.progress 
      });

      return lessonProgress;
    } catch (error) {
      logger.error('Failed to update lesson progress', { userId, lessonId, progressData, error });
      throw error;
    }
  }

  /**
   * Update overall course progress
   */
  static async updateCourseProgress(userId, courseId) {
    try {
      // Get all lessons in the course
      const lessons = await prisma.lesson.findMany({
        where: { courseId },
        include: {
          progress: {
            where: { userId }
          }
        }
      });

      if (lessons.length === 0) {
        return;
      }

      // Calculate overall progress
      let totalProgress = 0;
      let completedLessons = 0;

      lessons.forEach(lesson => {
        const progress = lesson.progress[0];
        if (progress) {
          totalProgress += progress.progress;
          if (progress.status === 'COMPLETED') {
            completedLessons++;
          }
        }
      });

      const overallProgress = Math.round(totalProgress / lessons.length);
      const isCompleted = completedLessons === lessons.length;

      // Update enrollment
      const enrollment = await prisma.enrollment.update({
        where: {
          userId_courseId: { userId, courseId }
        },
        data: {
          progress: overallProgress,
          status: isCompleted ? 'COMPLETED' : 'ACTIVE',
          completedAt: isCompleted ? new Date() : null
        }
      });

      // If course completed, trigger completion events
      if (isCompleted && enrollment.status !== 'COMPLETED') {
        await this.handleCourseCompletion(userId, courseId);
      }

      logger.info('Course progress updated', { 
        userId, 
        courseId, 
        progress: overallProgress,
        completed: isCompleted
      });

      return {
        progress: overallProgress,
        completedLessons,
        totalLessons: lessons.length,
        isCompleted
      };
    } catch (error) {
      logger.error('Failed to update course progress', { userId, courseId, error });
      throw error;
    }
  }

  /**
   * Get user's course progress
   */
  static async getCourseProgress(userId, courseId) {
    try {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId, courseId },
        include: {
          course: {
            include: {
              lessons: {
                include: {
                  progress: {
                    where: { userId }
                  }
                },
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      });

      if (!enrollment) {
        throw new NotFoundError('User not enrolled in this course');
      }

      // Calculate detailed progress
      const lessonsProgress = enrollment.course.lessons.map(lesson => {
        const progress = lesson.progress[0] || {
          status: 'NOT_STARTED',
          progress: 0,
          timeSpent: 0
        };

        return {
          lessonId: lesson.id,
          title: lesson.title,
          order: lesson.order,
          status: progress.status,
          progress: progress.progress,
          timeSpent: progress.timeSpent,
          completedAt: progress.completedAt
        };
      });

      const totalTimeSpent = lessonsProgress.reduce((sum, lesson) => sum + (lesson.timeSpent || 0), 0);
      const completedLessons = lessonsProgress.filter(lesson => lesson.status === 'COMPLETED').length;

      return {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
        status: enrollment.status,
        overallProgress: enrollment.progress,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        lessonsProgress,
        statistics: {
          totalLessons: lessonsProgress.length,
          completedLessons,
          totalTimeSpent,
          averageProgress: enrollment.progress
        }
      };
    } catch (error) {
      logger.error('Failed to get course progress', { userId, courseId, error });
      throw error;
    }
  }

  /**
   * Get all user's course enrollments and progress
   */
  static async getUserProgress(userId) {
    try {
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              level: true,
              duration: true,
              imageUrl: true
            }
          }
        },
        orderBy: { enrolledAt: 'desc' }
      });

      const progressData = enrollments.map(enrollment => ({
        enrollmentId: enrollment.id,
        course: enrollment.course,
        status: enrollment.status,
        progress: enrollment.progress,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt
      }));

      // Calculate overall statistics
      const totalCourses = enrollments.length;
      const completedCourses = enrollments.filter(e => e.status === 'COMPLETED').length;
      const activeCourses = enrollments.filter(e => e.status === 'ACTIVE').length;
      const averageProgress = totalCourses > 0 
        ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / totalCourses)
        : 0;

      return {
        enrollments: progressData,
        statistics: {
          totalCourses,
          completedCourses,
          activeCourses,
          averageProgress
        }
      };
    } catch (error) {
      logger.error('Failed to get user progress', { userId, error });
      throw error;
    }
  }

  /**
   * Get learning analytics for user
   */
  static async getLearningAnalytics(userId, timeframe = '30d') {
    try {
      const timeframeDays = parseInt(timeframe.replace('d', ''));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeframeDays);

      // Get lesson progress in timeframe
      const lessonProgress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          updatedAt: { gte: startDate }
        },
        include: {
          lesson: {
            select: {
              title: true,
              course: {
                select: { title: true, level: true }
              }
            }
          }
        },
        orderBy: { updatedAt: 'asc' }
      });

      // Calculate daily activity
      const dailyActivity = {};
      lessonProgress.forEach(progress => {
        const date = progress.updatedAt.toISOString().split('T')[0];
        if (!dailyActivity[date]) {
          dailyActivity[date] = {
            lessonsStudied: 0,
            timeSpent: 0,
            progressMade: 0
          };
        }
        dailyActivity[date].lessonsStudied++;
        dailyActivity[date].timeSpent += progress.timeSpent || 0;
        dailyActivity[date].progressMade += progress.progress || 0;
      });

      // Get course completion data
      const completedCourses = await prisma.enrollment.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          completedAt: { gte: startDate }
        },
        include: {
          course: {
            select: { title: true, level: true }
          }
        }
      });

      // Calculate learning streaks
      const streak = this.calculateLearningStreak(Object.keys(dailyActivity).sort());

      return {
        timeframe,
        dailyActivity,
        completedCourses: completedCourses.map(e => ({
          courseTitle: e.course.title,
          level: e.course.level,
          completedAt: e.completedAt
        })),
        statistics: {
          totalStudyDays: Object.keys(dailyActivity).length,
          totalTimeSpent: Object.values(dailyActivity).reduce((sum, day) => sum + day.timeSpent, 0),
          totalLessonsStudied: Object.values(dailyActivity).reduce((sum, day) => sum + day.lessonsStudied, 0),
          currentStreak: streak.current,
          longestStreak: streak.longest,
          averageDailyTime: Object.keys(dailyActivity).length > 0 
            ? Math.round(Object.values(dailyActivity).reduce((sum, day) => sum + day.timeSpent, 0) / Object.keys(dailyActivity).length)
            : 0
        }
      };
    } catch (error) {
      logger.error('Failed to get learning analytics', { userId, timeframe, error });
      throw error;
    }
  }

  /**
   * Handle course completion
   */
  static async handleCourseCompletion(userId, courseId) {
    try {
      // Get user and course info
      const [user, course] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.course.findUnique({ where: { id: courseId } })
      ]);

      if (!user || !course) {
        return;
      }

      // Send completion email
      const EventEmailService = require('./eventEmailService');
      await EventEmailService.handleCourseEnrollment({
        userId,
        courseId,
        email: user.email,
        firstName: user.firstName,
        courseName: course.title,
        instructorName: 'Équipe pédagogique'
      });

      // Generate certificate if applicable
      const CertificateService = require('./certificateService');
      await CertificateService.generateCertificate({
        userId,
        type: 'COURSE_COMPLETION',
        title: `Certificat de Réussite - ${course.title}`,
        description: `Félicitations! Vous avez terminé avec succès le cours "${course.title}".`,
        level: course.level,
        courseName: course.title,
        validityPeriod: 24 // 2 years
      });

      logger.info('Course completion handled', { userId, courseId });
    } catch (error) {
      logger.error('Failed to handle course completion', { userId, courseId, error });
    }
  }

  /**
   * Calculate learning streak
   */
  static calculateLearningStreak(studyDates) {
    if (studyDates.length === 0) {
      return { current: 0, longest: 0 };
    }

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Check if streak is still active (studied today or yesterday)
    const isStreakActive = studyDates.includes(today) || studyDates.includes(yesterdayStr);

    for (let i = 1; i < studyDates.length; i++) {
      const currentDate = new Date(studyDates[i]);
      const previousDate = new Date(studyDates[i - 1]);
      const dayDifference = (currentDate - previousDate) / (1000 * 60 * 60 * 24);

      if (dayDifference === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    
    if (isStreakActive) {
      // Calculate current streak from the end
      currentStreak = 1;
      for (let i = studyDates.length - 2; i >= 0; i--) {
        const currentDate = new Date(studyDates[i + 1]);
        const previousDate = new Date(studyDates[i]);
        const dayDifference = (currentDate - previousDate) / (1000 * 60 * 60 * 24);

        if (dayDifference === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    return { current: currentStreak, longest: longestStreak };
  }

  /**
   * Get course recommendations for user
   */
  static async getCourseRecommendations(userId) {
    try {
      // Get user's completed courses and current level
      const userProgress = await this.getUserProgress(userId);
      const completedCourses = userProgress.enrollments
        .filter(e => e.status === 'COMPLETED')
        .map(e => e.course.id);

      // Get user's preferred level (most common level in completed courses)
      const levelCounts = {};
      userProgress.enrollments.forEach(enrollment => {
        const level = enrollment.course.level;
        levelCounts[level] = (levelCounts[level] || 0) + 1;
      });

      const preferredLevel = Object.keys(levelCounts).reduce((a, b) => 
        levelCounts[a] > levelCounts[b] ? a : b, 'B1'
      );

      // Get recommended courses
      const recommendations = await prisma.course.findMany({
        where: {
          status: 'PUBLISHED',
          id: { notIn: completedCourses },
          OR: [
            { level: preferredLevel },
            { level: this.getNextLevel(preferredLevel) }
          ]
        },
        take: 6,
        orderBy: { createdAt: 'desc' }
      });

      return {
        preferredLevel,
        recommendations: recommendations.map(course => ({
          id: course.id,
          title: course.title,
          description: course.description,
          level: course.level,
          duration: course.duration,
          imageUrl: course.imageUrl,
          reason: course.level === preferredLevel ? 'Correspond à votre niveau' : 'Niveau suivant recommandé'
        }))
      };
    } catch (error) {
      logger.error('Failed to get course recommendations', { userId, error });
      throw error;
    }
  }

  /**
   * Helper method to get next level
   */
  static getNextLevel(currentLevel) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = levels.indexOf(currentLevel);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : currentLevel;
  }
}

module.exports = CourseProgressService;
