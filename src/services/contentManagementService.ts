import { CourseLevel, CourseCategory, TestType, SubscriptionTier } from '@prisma/client';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { CloudinaryService } from './cloudinaryService';
import getVideoDuration from 'get-video-duration';
// import { QuestionBankService } from './questionBankService';

export interface ContentUploadData {
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory | 'TEST' | 'CORRIGER_TCF';
  subscriptionTier: SubscriptionTier;
  language: 'fr' | 'en';
  contentType: 'NOTE' | 'VIDEO' | 'TEST' | 'CORRIGER_TCF' | 'SIMULATION';
  file?: Express.Multer.File;
  tags?: string[];
  duration?: number;
  maxScore?: number;
  passingScore?: number;
}

export interface ContentAnalysisResult {
  extractedText: string;
  questionBankId: string;
  aiAnalysis: {
    topics: string[];
    difficulty: string;
    keyPoints: string[];
    suggestedQuestions: any[];
  };
}

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  level: CourseLevel | CourseLevel[];
  category: string;
  subscriptionTier: SubscriptionTier | SubscriptionTier[];
  requiredTier?: SubscriptionTier; // ✅ NEW: Support for requiredTier
  availableLevels?: CourseLevel[]; // ✅ NEW: Support for multiple levels
  availableTiers?: SubscriptionTier[]; // ✅ NEW: Support for multiple tiers
  contentType: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  tags: string[];
  isPublished: boolean;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lessons_data?: any[];
  // Unified fields
  levels?: CourseLevel[];
  subscriptions?: SubscriptionTier[];
  totalVariants?: number;
  totalVideoCount?: number;
}

export class ContentManagementService {
  /**
   * Upload and process content with AI analysis
   */
  static async uploadContent(
    uploadData: ContentUploadData,
    userId: string,
    userRole: string
  ): Promise<{ content: ContentItem; analysis?: ContentAnalysisResult }> {
    try {
      // Validate user permissions
      if (!['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(userRole)) {
        throw new ForbiddenError('Insufficient permissions to upload content');
      }

      // Validate junior manager restrictions
      if (userRole === 'JUNIOR_MANAGER') {
        if (!['A1', 'A2', 'B1'].includes(uploadData.level)) {
          throw new ForbiddenError('Junior managers can only create content for levels A1-B1');
        }
        if (uploadData.contentType === 'SIMULATION' && uploadData.category !== 'TEST') {
          throw new ForbiddenError('Junior managers cannot create audio simulations');
        }
      }

      let fileUrl: string | undefined;
      let thumbnailUrl: string | undefined;

      // Upload file to Cloudinary if provided
      let extractedDuration: number | undefined = undefined;
      if (uploadData.file) {
        // For videos, extract duration from file BEFORE upload (fallback if Cloudinary doesn't return it)
        if (uploadData.contentType === 'VIDEO') {
          try {
            const durationInSeconds = await getVideoDuration(uploadData.file.path);
            // Convert seconds to minutes (rounded to nearest minute)
            extractedDuration = Math.round(durationInSeconds / 60);
            logger.info('Video duration extracted from file', {
              filePath: uploadData.file.path,
              durationSeconds: durationInSeconds,
              durationMinutes: extractedDuration
            });
          } catch (error) {
            logger.warn('Failed to extract duration from video file, will try Cloudinary', {
              filePath: uploadData.file.path,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        const uploadResult = await CloudinaryService.uploadFile(uploadData.file.path, {
          folder: `tcf-tef-platform/content/${uploadData.contentType.toLowerCase()}`,
          resource_type: this.getResourceType(uploadData.file.mimetype),
          tags: [uploadData.contentType, uploadData.level, uploadData.category as string]
        });

        fileUrl = uploadResult.secure_url;

        // Extract duration from Cloudinary for videos (if not already extracted from file)
        if (uploadData.contentType === 'VIDEO') {
          if (uploadResult.duration) {
            // Cloudinary returns duration in seconds, convert to minutes
            const cloudinaryDuration = Math.round(uploadResult.duration / 60);
            // Use Cloudinary duration if file extraction failed, otherwise use the more accurate file extraction
            if (!extractedDuration) {
              extractedDuration = cloudinaryDuration;
              logger.info('Video duration extracted from Cloudinary', {
                durationSeconds: uploadResult.duration,
                durationMinutes: extractedDuration,
                publicId: uploadResult.public_id
              });
            } else {
              // Log both for comparison
              logger.info('Video duration comparison', {
                fileExtraction: extractedDuration,
                cloudinaryExtraction: cloudinaryDuration,
                using: extractedDuration
              });
            }
          } else if (!extractedDuration) {
            logger.error('No duration extracted from video file or Cloudinary - duration will be 0', {
              filePath: uploadData.file.path,
              publicId: uploadResult.public_id
            });
            // Set to 0 as last resort, but log error
            extractedDuration = 0;
          }
        }
        
        // Validate extracted duration for videos
        if (uploadData.contentType === 'VIDEO' && (!extractedDuration || extractedDuration === 0)) {
          logger.error('Video duration is 0 or undefined - this should not happen', {
            filePath: uploadData.file.path,
            extractedDuration
          });
        }

        // Generate thumbnail for videos
        if (uploadData.contentType === 'VIDEO') {
          thumbnailUrl = CloudinaryService.getVideoThumbnailUrl(uploadResult.public_id);
        }

        // Clean up local file after successful Cloudinary upload
        try {
          const fs = require('fs');
          if (fs.existsSync(uploadData.file.path)) {
            await fs.promises.unlink(uploadData.file.path);
            logger.info('Local file deleted after Cloudinary upload', {
              filePath: uploadData.file.path,
              contentType: uploadData.contentType
            });
          }
        } catch (unlinkError) {
          logger.warn('Failed to delete local file after Cloudinary upload', {
            filePath: uploadData.file.path,
            error: unlinkError
          });
          // Don't throw - Cloudinary upload succeeded, local cleanup failure is non-critical
        }
      }

      // Create content based on type
      let content: ContentItem;
      let analysis: ContentAnalysisResult | undefined;

      // Use extracted duration for videos, user-provided duration for tests, undefined for PDFs/Notes
      const finalDuration = uploadData.contentType === 'VIDEO' && extractedDuration 
        ? extractedDuration 
        : (uploadData.contentType === 'TEST' || uploadData.contentType === 'CORRIGER_TCF')
          ? uploadData.duration 
          : undefined;

      switch (uploadData.contentType) {
        case 'NOTE':
        case 'VIDEO':
          content = await this.createCourseContent(uploadData, userId, fileUrl, thumbnailUrl, finalDuration);
          break;
        case 'TEST':
        case 'CORRIGER_TCF':
          content = await this.createTestContent(uploadData, userId, fileUrl, finalDuration);
          break;
        case 'SIMULATION':
          content = await this.createSimulationContent(uploadData, userId, fileUrl);
          break;
        default:
          throw new ValidationError('Invalid content type');
      }

      // Perform AI analysis if file was uploaded
      if (uploadData.file && fileUrl) {
        analysis = await this.performAIAnalysis(uploadData.file, content.id, userId);
      }

      logger.info(`Content uploaded successfully: ${content.id}`, {
        contentType: uploadData.contentType,
        userId,
        userRole
      });

      return { content, analysis };
    } catch (error) {
      logger.error('Error uploading content:', error);
      throw error;
    }
  }

  /**
   * Create course content (notes, videos)
   */
  private static async createCourseContent(
    uploadData: ContentUploadData,
    userId: string,
    fileUrl?: string,
    thumbnailUrl?: string,
    duration?: number
  ): Promise<ContentItem> {
    // Note: Prisma schema only supports single level and tier
    // Multiple levels/tiers would require a separate junction table
    const course = await prisma.course.create({
      data: {
        title: uploadData.title,
        description: uploadData.description,
        level: uploadData.level, // Primary level (single value)
        category: uploadData.category as CourseCategory,
        requiredTier: uploadData.subscriptionTier, // Primary tier (single value)
        duration: duration || 0, // Use extracted duration for videos, 0 for PDFs/Notes
        lessons: 1,
        tags: uploadData.tags || [],
        thumbnail: thumbnailUrl,
        isPublished: true,
        createdById: userId,
        lessons_data: fileUrl ? {
          create: {
            title: uploadData.title,
            description: uploadData.description,
            content: fileUrl, // Store actual Cloudinary URL
            videoUrl: uploadData.contentType === 'VIDEO' ? fileUrl : undefined, // Store actual Cloudinary URL for videos
            duration: duration ? Math.round(duration) : 0, // Use extracted duration for videos (in minutes), 0 for PDFs/Notes
            order: 1,
            resources: uploadData.tags || []
          }
        } : undefined
      },
      include: {
        lessons_data: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      level: course.level,
      category: course.category,
      subscriptionTier: course.requiredTier,
      contentType: uploadData.contentType,
      fileUrl,
      thumbnailUrl,
      duration: course.duration,
      tags: course.tags,
      isPublished: course.isPublished,
      createdBy: course.createdBy,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    };
  }

  /**
   * Upload bulk course content (multiple videos as lessons in a single course)
   */
  static async uploadBulkCourseContent(
    title: string,
    description: string,
    level: CourseLevel,
    category: CourseCategory,
    subscriptionTier: SubscriptionTier,
    availableLevels: CourseLevel[],
    availableTiers: SubscriptionTier[],
    files: Array<{ path: string; mimetype: string; originalname: string }>,
    userId: string,
    userRole: string,
    tags?: string[]
  ): Promise<{ content: ContentItem; lessons: number }> {
    try {
      // Validate user permissions
      if (!['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(userRole)) {
        throw new ForbiddenError('Insufficient permissions to upload content');
      }

      // Validate junior manager restrictions
      if (userRole === 'JUNIOR_MANAGER') {
        if (!['A1', 'A2', 'B1'].includes(level)) {
          throw new ForbiddenError('Junior managers can only create content for levels A1-B1');
        }
      }

      if (files.length === 0) {
        throw new ValidationError('At least one file is required');
      }

      if (files.length > 20) {
        throw new ValidationError('Maximum 20 files allowed per course');
      }

      // Upload all files to Cloudinary and extract metadata
      const lessonData: Array<{
        title: string;
        description: string;
        content: string;
        videoUrl?: string;
        duration: number;
        order: number;
        thumbnailUrl?: string;
      }> = [];

      let totalDuration = 0;
      let thumbnailUrl: string | undefined;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Extract duration from video file BEFORE upload (more reliable)
        let duration = 0;
        try {
          const durationInSeconds = await getVideoDuration(file.path);
          // Convert seconds to minutes (rounded to nearest minute)
          duration = Math.round(durationInSeconds / 60);
          totalDuration += duration;
          logger.info('Video duration extracted from file', {
            filePath: file.path,
            fileName: file.originalname,
            durationSeconds: durationInSeconds,
            durationMinutes: duration,
            lessonNumber: i + 1
          });
        } catch (error) {
          logger.warn('Failed to extract duration from video file, will try Cloudinary', {
            filePath: file.path,
            fileName: file.originalname,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        const uploadResult = await CloudinaryService.uploadFile(file.path, {
          folder: `tcf-tef-platform/content/video`,
          resource_type: 'video',
          tags: ['VIDEO', level, category as string, `lesson-${i + 1}`]
        });

        const fileUrl = uploadResult.secure_url;

        // Use Cloudinary duration as fallback if file extraction failed
        if (duration === 0 && uploadResult.duration) {
          // Cloudinary returns duration in seconds, convert to minutes
          duration = Math.round(uploadResult.duration / 60);
          totalDuration += duration;
          logger.info('Video duration extracted from Cloudinary (fallback)', {
            fileName: file.originalname,
            durationSeconds: uploadResult.duration,
            durationMinutes: duration,
            lessonNumber: i + 1
          });
        } else if (uploadResult.duration && duration > 0) {
          // Log comparison if both are available
          const cloudinaryDuration = Math.round(uploadResult.duration / 60);
          logger.info('Video duration comparison', {
            fileName: file.originalname,
            fileExtraction: duration,
            cloudinaryExtraction: cloudinaryDuration,
            using: duration
          });
        }
        
        // Validate duration was extracted
        if (duration === 0) {
          logger.error('Video duration is 0 - extraction failed for both file and Cloudinary', {
            fileName: file.originalname,
            filePath: file.path
          });
        }

        // Generate thumbnail for first video
        if (i === 0) {
          thumbnailUrl = CloudinaryService.getVideoThumbnailUrl(uploadResult.public_id);
        }

        // Extract lesson title from filename (remove extension)
        const lessonTitle = file.originalname.replace(/\.[^/.]+$/, "") || `${title} - Leçon ${i + 1}`;

        lessonData.push({
          title: lessonTitle,
          description: description || `Leçon ${i + 1} du cours ${title}`,
          content: fileUrl,
          videoUrl: fileUrl,
          duration: Math.round(duration),
          order: i + 1,
          thumbnailUrl: i === 0 ? thumbnailUrl : undefined
        });

        // Clean up local file
        try {
          const fs = require('fs');
          if (fs.existsSync(file.path)) {
            await fs.promises.unlink(file.path);
          }
        } catch (unlinkError) {
          logger.warn('Failed to delete local file after Cloudinary upload', {
            filePath: file.path,
            error: unlinkError
          });
        }
      }

      // Create ONE course with all lessons and restrictions
      const course = await prisma.course.create({
        data: {
          title,
          description,
          level,
          category,
          requiredTier: subscriptionTier,
          availableLevels: availableLevels.length > 0 ? availableLevels : [level],
          availableSubscriptions: availableTiers.length > 0 ? availableTiers : [subscriptionTier],
          duration: Math.round(totalDuration),
          lessons: lessonData.length,
          tags: tags || [],
          thumbnail: thumbnailUrl,
          isPublished: true,
          createdById: userId,
          lessons_data: {
            create: lessonData.map(lesson => ({
              title: lesson.title,
              description: lesson.description,
              content: lesson.content,
              videoUrl: lesson.videoUrl,
              duration: lesson.duration,
              order: lesson.order,
              resources: tags || []
            }))
          }
        } as any, // Type assertion needed until migration is run
        include: {
          lessons_data: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          }
        }
      });

      logger.info(`Bulk course content uploaded successfully: ${course.id}`, {
        courseId: course.id,
        lessonsCount: lessonData.length,
        totalDuration,
        userId,
        userRole
      });

      return {
        content: {
          id: course.id,
          title: course.title,
          description: course.description,
          level: course.level,
          category: course.category,
          subscriptionTier: course.requiredTier,
          contentType: 'VIDEO',
          fileUrl: lessonData[0]?.content,
          thumbnailUrl,
          duration: Math.round(totalDuration),
          tags: course.tags,
          isPublished: course.isPublished,
          createdBy: {
            id: course.createdBy.id,
            firstName: course.createdBy.firstName,
            lastName: course.createdBy.lastName,
            role: course.createdBy.role
          },
          createdAt: course.createdAt,
          updatedAt: course.updatedAt
        },
        lessons: lessonData.length
      };
    } catch (error) {
      logger.error('Error uploading bulk course content:', error);
      throw error;
    }
  }

  /**
   * Create test content
   */
  private static async createTestContent(
    uploadData: ContentUploadData,
    userId: string,
    fileUrl?: string,
    duration?: number
  ): Promise<ContentItem> {
    const test = await prisma.test.create({
      data: {
        title: uploadData.title,
        description: uploadData.description,
        level: uploadData.level,
        type: uploadData.category === 'CORRIGER_TCF' ? 'PRACTICE' : 'QUICK',
        category: uploadData.category as CourseCategory,
        requiredTier: uploadData.subscriptionTier,
        duration: duration || uploadData.duration || 60, // Use passed duration or fallback to user input or default
        questionCount: 10,
        passingScore: uploadData.passingScore || 60,
        tags: uploadData.tags || [],
        isPublished: true,
        createdById: userId,
        status: 'PUBLISHED'
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    return {
      id: test.id,
      title: test.title,
      description: test.description,
      level: test.level,
      category: test.category,
      subscriptionTier: test.requiredTier,
      contentType: uploadData.contentType,
      fileUrl: undefined, // Tests don't have fileUrl in schema
      duration: test.duration,
      tags: test.tags,
      isPublished: test.isPublished,
      createdBy: test.createdBy,
      createdAt: test.createdAt,
      updatedAt: test.updatedAt
    };
  }

  /**
   * Create simulation content
   */
  private static async createSimulationContent(
    uploadData: ContentUploadData,
    userId: string,
    fileUrl?: string
  ): Promise<ContentItem> {
    // For now, create as a test with simulation type
    const simulation = await prisma.test.create({
      data: {
        title: uploadData.title,
        description: uploadData.description,
        level: uploadData.level,
        type: 'SIMULATION',
        category: uploadData.category as CourseCategory,
        requiredTier: uploadData.subscriptionTier,
        duration: uploadData.duration || 120,
        questionCount: 20,
        passingScore: uploadData.passingScore || 60,
        tags: uploadData.tags || [],
        isPublished: true,
        createdById: userId,
        status: 'PUBLISHED'
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    return {
      id: simulation.id,
      title: simulation.title,
      description: simulation.description,
      level: simulation.level,
      category: 'SIMULATION',
      subscriptionTier: simulation.requiredTier,
      contentType: uploadData.contentType,
      fileUrl: undefined, // Tests don't have fileUrl in schema
      duration: simulation.duration,
      tags: simulation.tags,
      isPublished: simulation.isPublished,
      createdBy: simulation.createdBy,
      createdAt: simulation.createdAt,
      updatedAt: simulation.updatedAt
    };
  }

  /**
   * Perform AI analysis on uploaded content
   */
  private static async performAIAnalysis(
    file: Express.Multer.File,
    contentId: string,
    userId: string
  ): Promise<ContentAnalysisResult> {
    try {
      // Extract text from file (implementation depends on file type)
      const extractedText = await this.extractTextFromFile(file);

      // Store in question bank using VAPI logic (placeholder for now)
      const questionBankEntry = {
        id: `qb_${contentId}`,
        title: `Content Analysis - ${contentId}`,
        content: extractedText,
        contentId,
        uploadedBy: userId,
        tags: ['ai-analysis', 'content-extraction']
      };

      // Perform AI analysis (mock implementation - replace with actual AI service)
      const aiAnalysis = {
        topics: this.extractTopics(extractedText),
        difficulty: this.assessDifficulty(extractedText),
        keyPoints: this.extractKeyPoints(extractedText),
        suggestedQuestions: this.generateSuggestedQuestions(extractedText)
      };

      logger.info(`AI analysis completed for content: ${contentId}`);

      return {
        extractedText,
        questionBankId: questionBankEntry.id,
        aiAnalysis
      };
    } catch (error) {
      logger.error('Error performing AI analysis:', error);
      throw error;
    }
  }

  /**
   * Get resource type for Cloudinary upload
   */
  private static getResourceType(mimetype: string): 'image' | 'video' | 'raw' | 'auto' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'video'; // Cloudinary handles audio as video
    return 'raw';
  }

  /**
   * Extract text from file (placeholder implementation)
   */
  private static async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    // This would use libraries like pdf-parse, mammoth, etc. based on file type
    // For now, return a placeholder
    return `Extracted text from ${file.originalname}`;
  }

  /**
   * Extract topics from text (placeholder implementation)
   */
  private static extractTopics(text: string): string[] {
    // This would use NLP libraries or AI services
    return ['grammar', 'vocabulary', 'comprehension'];
  }

  /**
   * Assess difficulty level (placeholder implementation)
   */
  private static assessDifficulty(text: string): string {
    // This would analyze text complexity
    return 'intermediate';
  }

  /**
   * Extract key points (placeholder implementation)
   */
  private static extractKeyPoints(text: string): string[] {
    // This would identify main concepts
    return ['Key point 1', 'Key point 2', 'Key point 3'];
  }

  /**
   * Generate suggested questions (placeholder implementation)
   */
  private static generateSuggestedQuestions(text: string): any[] {
    // This would generate questions based on content
    return [
      { type: 'multiple_choice', question: 'Sample question?', options: ['A', 'B', 'C', 'D'] }
    ];
  }

  /**
   * Get content for student course pages - FIXED: No more duplicate courses
   */
  static async getContentForCourses(
    level?: CourseLevel,
    category?: CourseCategory,
    subscriptionTier?: SubscriptionTier,
    search?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ content: ContentItem[]; total: number; pages: number }> {
    try {
      const where: any = {
        isPublished: true
      };

      // Filter by category and search (level is just for display/filtering, not access control)
      if (category) where.category = category;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } }
        ];
      }

      // Get all courses first (we'll filter by subscription in code)
      const [allCourses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            lessons_data: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.course.count({ where })
      ]);

      // Filter by subscription tier (access control) - check if student's subscription is in availableSubscriptions
      // Also deduplicate by title (keep only one course per title)
      const courseMap = new Map<string, any>();
      const studentSubscription = subscriptionTier || 'FREE';
      
      for (const course of allCourses) {
        // Check access: student's subscription must be in course's availableSubscriptions
        const availableSubs = (course as any).availableSubscriptions && (course as any).availableSubscriptions.length > 0
          ? (course as any).availableSubscriptions
          : [course.requiredTier];
        
        const hasAccess = availableSubs.includes(studentSubscription);
        
        if (!hasAccess) continue; // Skip courses student can't access
        
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
      const paginatedCourses = uniqueCourses.slice((page - 1) * limit, page * limit);

      const content = paginatedCourses.map(course => {
        // ALWAYS calculate real duration from lesson durations - NEVER use stored course.duration
        // Sum all lesson durations to get actual course duration
        const realDuration = course.lessons_data && course.lessons_data.length > 0
          ? course.lessons_data.reduce((total, lesson) => {
              const lessonDuration = lesson.duration || 0
              return total + lessonDuration
            }, 0)
          : 0; // If no lessons, duration is 0
        
        // Get available levels (for display)
        const availableLevels = (course as any).availableLevels && (course as any).availableLevels.length > 0
          ? (course as any).availableLevels
          : [course.level];
        
        return {
          id: course.id,
          title: course.title,
          description: course.description,
          level: availableLevels[0], // Use first level for display
          category: course.category,
          subscriptionTier: course.requiredTier,
          contentType: course.lessons_data.length > 0 && course.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
          fileUrl: course.lessons_data.length > 0 ? course.lessons_data[0].content : undefined,
          thumbnailUrl: course.thumbnail,
          duration: realDuration, // Use calculated duration from lessons_data only
          tags: course.tags,
          isPublished: course.isPublished,
          createdBy: course.createdBy,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
          lessons_data: course.lessons_data.map(lesson => ({
            id: lesson.id,
            title: lesson.title,
            content: lesson.content,
            videoUrl: lesson.videoUrl,
            duration: lesson.duration,
            order: lesson.order,
            resources: lesson.resources
          }))
        };
      });

      return {
        content,
        total: uniqueCourses.length, // Use deduplicated count
        pages: Math.ceil(uniqueCourses.length / limit)
      };
    } catch (error) {
      logger.error('Error fetching course content:', error);
      throw error;
    }
  }

  /**
   * Get content for student test pages
   */
  static async getContentForTests(
    level?: CourseLevel,
    type?: string,
    subscriptionTier?: SubscriptionTier,
    search?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ content: ContentItem[]; total: number; pages: number }> {
    try {
      const where: any = {
        isPublished: true
      };

      // Filter by subscription tier access
      if (subscriptionTier) {
        const tierHierarchy = ['FREE', 'ESSENTIAL', 'PREMIUM', 'PRO'];
        const userTierIndex = tierHierarchy.indexOf(subscriptionTier);
        const allowedTiers = tierHierarchy.slice(0, userTierIndex + 1);
        where.requiredTier = { in: allowedTiers };
      } else {
        where.requiredTier = 'FREE';
      }

      if (level) where.level = level;
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [tests, total] = await Promise.all([
        prisma.test.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.test.count({ where })
      ]);

      const content = tests.map(test => ({
        id: test.id,
        title: test.title,
        description: test.description,
        level: test.level,
        category: test.category,
        subscriptionTier: test.requiredTier,
        contentType: test.type === 'SIMULATION' ? 'SIMULATION' : 'TEST',
        fileUrl: undefined, // Tests don't have fileUrl in schema
        duration: test.duration,
        tags: test.tags,
        isPublished: test.isPublished,
        createdBy: test.createdBy,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt
      }));

      return {
        content,
        total,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error fetching test content:', error);
      throw error;
    }
  }

  /**
   * Get content for admin/manager content pages
   */
  static async getContentForManagement(
    userRole: string,
    userId?: string,
    contentType?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ content: ContentItem[]; total: number; pages: number }> {
    try {
      console.log('🔍 ContentManagementService.getContentForManagement called:', {
        userRole,
        userId,
        contentType,
        page,
        limit
      });

      const where: any = {};

      // Junior managers can only see their own content and A1-B1 levels
      if (userRole === 'JUNIOR_MANAGER') {
        where.createdById = userId;
        where.level = { in: ['A1', 'A2', 'B1'] };
      }

      // Get all courses first (we'll deduplicate in code)
      const [allCourses, tests] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            lessons_data: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.test.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        })
      ]);

      // Deduplicate courses by title and aggregate all levels/subscriptions
      const courseGroups = new Map<string, any[]>();
      
      // Group all courses by normalized title
      for (const course of allCourses) {
        const normalizedTitle = course.title.trim().toLowerCase();
        
        if (!courseGroups.has(normalizedTitle)) {
          courseGroups.set(normalizedTitle, []);
        }
        courseGroups.get(normalizedTitle)!.push(course);
      }

      // For each group, create a single unified course with aggregated data
      const unifiedCourses = Array.from(courseGroups.entries()).map(([normalizedTitle, courseGroup]) => {
        // Find the primary course (one with most lessons, or most recent)
        const primaryCourse = courseGroup.reduce((best, current) => {
          const bestLessons = best.lessons_data?.length || 0;
          const currentLessons = current.lessons_data?.length || 0;
          
          if (currentLessons > bestLessons) return current;
          if (currentLessons === bestLessons && current.createdAt > best.createdAt) return current;
          return best;
        });

        // Aggregate all levels from all courses in the group
        const allLevelsSet = new Set<CourseLevel>();
        courseGroup.forEach(c => {
          // Check if course has availableLevels array (new system)
          if ((c as any).availableLevels && Array.isArray((c as any).availableLevels) && (c as any).availableLevels.length > 0) {
            (c as any).availableLevels.forEach((level: CourseLevel) => allLevelsSet.add(level));
          } else {
            // Old system: use single level field
            allLevelsSet.add(c.level);
          }
        });
        const aggregatedLevels = Array.from(allLevelsSet);

        // Aggregate all subscriptions from all courses in the group
        const allSubscriptionsSet = new Set<SubscriptionTier>();
        courseGroup.forEach(c => {
          // Check if course has availableSubscriptions array (new system)
          if ((c as any).availableSubscriptions && Array.isArray((c as any).availableSubscriptions) && (c as any).availableSubscriptions.length > 0) {
            (c as any).availableSubscriptions.forEach((tier: SubscriptionTier) => allSubscriptionsSet.add(tier));
          } else {
            // Old system: use single requiredTier field
            allSubscriptionsSet.add(c.requiredTier);
          }
        });
        const aggregatedSubscriptions = Array.from(allSubscriptionsSet);

        // Use primary course's lessons_data (they should all be the same anyway)
        return {
          ...primaryCourse,
          // Override with aggregated data
          level: aggregatedLevels[0] || primaryCourse.level, // Keep first level as primary for display
          requiredTier: aggregatedSubscriptions[0] || primaryCourse.requiredTier, // Keep first tier as primary
          availableLevels: aggregatedLevels, // Store all levels
          availableSubscriptions: aggregatedSubscriptions, // Store all subscriptions
        };
      });
      
      // Apply pagination after deduplication
      const paginatedCourses = unifiedCourses.slice((page - 1) * limit, page * limit);

      // Process courses (now deduplicated - one course per title with aggregated data)
      const courseContent = paginatedCourses.map(course => {
        // ALWAYS calculate real duration from lessons_data - NEVER use stored course.duration
        // Sum all lesson durations to get actual course duration
        const realDuration = course.lessons_data && course.lessons_data.length > 0
          ? course.lessons_data.reduce((total, lesson) => {
              const lessonDuration = lesson.duration || 0
              return total + lessonDuration
            }, 0)
          : 0; // If no lessons, duration is 0
        
        // Count total number of video lessons
        const videoLessons = course.lessons_data.filter(lesson => lesson.videoUrl);
        const totalVideoCount = videoLessons.length;
        
        // Get available levels and subscriptions (use aggregated arrays from deduplication)
        const allLevels = (course as any).availableLevels && Array.isArray((course as any).availableLevels) && (course as any).availableLevels.length > 0 
          ? (course as any).availableLevels 
          : [course.level];
        const allSubscriptions = (course as any).availableSubscriptions && Array.isArray((course as any).availableSubscriptions) && (course as any).availableSubscriptions.length > 0
          ? (course as any).availableSubscriptions
          : [course.requiredTier];
        
        // Map subscription tiers to French names for frontend
        const mapTierToFrench = (tier: string): string => {
          const tierMap: Record<string, string> = {
            'FREE': 'Gratuit',
            'ESSENTIAL': 'Essentiel',
            'PREMIUM': 'Premium',
            'PRO': 'Pro+'
          };
          return tierMap[tier] || tier;
        };
        
        const subscriptionsFrench = allSubscriptions.map(mapTierToFrench);
        
        return {
          id: course.id,
          title: course.title,
          description: course.description,
          level: allLevels, // Return array of levels
          category: course.category,
          subscriptionTier: allSubscriptions, // Return array of subscriptions
          contentType: course.lessons_data.length > 0 && course.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
          fileUrl: course.lessons_data.length > 0 ? course.lessons_data[0].content : undefined,
          thumbnailUrl: course.thumbnail,
          duration: realDuration, // Use calculated real duration
          totalVideoCount, // Real video count
          tags: course.tags,
          isPublished: course.isPublished,
          createdBy: course.createdBy,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
          // Add unified fields
          levels: allLevels,
          subscriptions: subscriptionsFrench, // Return French names for frontend
          lessons_data: course.lessons_data
        };
      });

      const testContent = tests.map(test => ({
        id: test.id,
        title: test.title,
        description: test.description,
        level: test.level,
        category: test.category,
        subscriptionTier: test.requiredTier,
        contentType: test.type === 'SIMULATION' ? 'SIMULATION' : 'TEST',
        fileUrl: undefined, // Tests don't have fileUrl in schema
        duration: test.duration,
        tags: test.tags,
        isPublished: test.isPublished,
        createdBy: test.createdBy,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt
      }));

      const allContent = [...courseContent, ...testContent]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Filter by content type if specified
      const filteredContent = contentType
        ? allContent.filter(item => item.contentType === contentType)
        : allContent;

      return {
        content: filteredContent,
        total: unifiedCourses.length, // Use deduplicated count
        pages: Math.ceil(unifiedCourses.length / limit)
      };
    } catch (error) {
      logger.error('Error fetching management content:', error);
      throw error;
    }
  }

  /**
   * Update course levels and subscriptions
   */
  static async updateCourseLevelsAndSubscriptions(
    courseId: string,
    levels: string[],
    subscriptions: string[],
    userId: string,
    userRole: string
  ): Promise<ContentItem> {
    try {
      // Find the primary course
      const primaryCourse = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          lessons_data: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          }
        }
      });

      if (!primaryCourse) {
        throw new NotFoundError('Course not found');
      }

      // Check permissions
      if (userRole !== 'ADMIN' && primaryCourse.createdById !== userId) {
        throw new ForbiddenError('You can only update your own courses');
      }

      // Validate inputs
      if (!levels || levels.length === 0) {
        throw new ValidationError('At least one level must be provided');
      }
      if (!subscriptions || subscriptions.length === 0) {
        throw new ValidationError('At least one subscription tier must be provided');
      }

      // Map French subscription names to backend tier values
      const mapFrenchToTier = (frenchName: string): SubscriptionTier => {
        const tierMap: Record<string, SubscriptionTier> = {
          'Gratuit': 'FREE',
          'Essentiel': 'ESSENTIAL',
          'Premium': 'PREMIUM',
          'Pro+': 'PRO'
        };
        return tierMap[frenchName] || frenchName as SubscriptionTier;
      };

      const backendSubscriptions = subscriptions.map(mapFrenchToTier);
      const backendLevels = levels.map(level => level as CourseLevel);

      // Calculate real duration from lessons
      const realDuration = primaryCourse.lessons_data.reduce((total, lesson) => total + (lesson.duration || 0), 0);
      const videoLessons = primaryCourse.lessons_data.filter(lesson => lesson.videoUrl);
      const totalVideoCount = videoLessons.length;

      // Update the SINGLE course with new restrictions
      const updatedCourse = await prisma.course.update({
        where: { id: primaryCourse.id },
        data: {
          availableLevels: backendLevels,
          availableSubscriptions: backendSubscriptions,
          level: backendLevels[0], // Keep first level as primary for display
          requiredTier: backendSubscriptions[0], // Keep first tier as primary
        } as any, // Type assertion needed until migration is run
        include: {
          lessons_data: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          }
        }
      });

      // Map subscription tiers to French names for frontend
      const mapTierToFrench = (tier: string): string => {
        const tierMap: Record<string, string> = {
          'FREE': 'Gratuit',
          'ESSENTIAL': 'Essentiel',
          'PREMIUM': 'Premium',
          'PRO': 'Pro+'
        };
        return tierMap[tier] || tier;
      };

      const subscriptionsFrench = backendSubscriptions.map(mapTierToFrench);

      return {
        id: updatedCourse.id,
        title: updatedCourse.title,
        description: updatedCourse.description,
        level: backendLevels,
        category: updatedCourse.category,
        subscriptionTier: backendSubscriptions as SubscriptionTier[],
        contentType: updatedCourse.lessons_data.length > 0 && updatedCourse.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
        fileUrl: updatedCourse.lessons_data.length > 0 ? updatedCourse.lessons_data[0].content : undefined,
        thumbnailUrl: updatedCourse.thumbnail,
        duration: realDuration,
        totalVideoCount,
        tags: updatedCourse.tags,
        isPublished: updatedCourse.isPublished,
        createdBy: {
          id: updatedCourse.createdBy.id,
          firstName: updatedCourse.createdBy.firstName,
          lastName: updatedCourse.createdBy.lastName,
          role: updatedCourse.createdBy.role
        },
        createdAt: updatedCourse.createdAt,
        updatedAt: updatedCourse.updatedAt,
        levels: backendLevels,
        subscriptions: subscriptionsFrench as SubscriptionTier[],
        lessons_data: updatedCourse.lessons_data
      };
    } catch (error) {
      logger.error('Error updating course levels and subscriptions:', error);
      throw error;
    }
  }

  /**
   * Publish content
   */
  static async publishContent(
    contentId: string,
    contentType: string,
    userId: string,
    userRole: string
  ): Promise<ContentItem> {
    try {
      // Validate permissions
      if (!['ADMIN', 'SENIOR_MANAGER'].includes(userRole)) {
        throw new ForbiddenError('Only admins and senior managers can publish content');
      }

      let updatedContent;

      if (contentType === 'TEST' || contentType === 'SIMULATION') {
        updatedContent = await prisma.test.update({
          where: { id: contentId },
          data: { isPublished: true, status: 'PUBLISHED' }
        });
      } else {
        updatedContent = await prisma.course.update({
          where: { id: contentId },
          data: { isPublished: true }
        });
      }

      logger.info(`Content published: ${contentId}`, { userId, userRole });

      return {
        id: updatedContent.id,
        title: updatedContent.title,
        description: updatedContent.description,
        level: updatedContent.level,
        category: updatedContent.category || updatedContent.type,
        subscriptionTier: updatedContent.subscriptionTier,
        contentType,
        fileUrl: updatedContent.fileUrl,
        duration: updatedContent.duration,
        tags: updatedContent.tags,
        isPublished: updatedContent.isPublished,
        createdBy: updatedContent.createdBy,
        createdAt: updatedContent.createdAt,
        updatedAt: updatedContent.updatedAt
      };
    } catch (error) {
      logger.error('Error publishing content:', error);
      throw error;
    }
  }

  /**
   * Delete content
   */
  static async deleteContent(
    contentId: string,
    contentType: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    try {
      // Validate permissions
      if (userRole === 'JUNIOR_MANAGER') {
        // Junior managers can only delete their own content
        const content = contentType === 'TEST' || contentType === 'SIMULATION'
          ? await prisma.test.findUnique({ where: { id: contentId } })
          : await prisma.course.findUnique({ where: { id: contentId } });

        if (!content || content.createdById !== userId) {
          throw new ForbiddenError('You can only delete your own content');
        }
      }

      if (contentType === 'TEST' || contentType === 'SIMULATION') {
        await prisma.test.delete({ where: { id: contentId } });
      } else {
        await prisma.course.delete({ where: { id: contentId } });
      }

      logger.info(`Content deleted: ${contentId}`, { userId, userRole });
    } catch (error) {
      logger.error('Error deleting content:', error);
      throw error;
    }
  }
}
