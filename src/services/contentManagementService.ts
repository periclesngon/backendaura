import { CourseLevel, CourseCategory, TestType, SubscriptionTier } from '@prisma/client';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { CloudinaryService } from './cloudinaryService';
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
        const uploadResult = await CloudinaryService.uploadFile(uploadData.file.path, {
          folder: `tcf-tef-platform/content/${uploadData.contentType.toLowerCase()}`,
          resource_type: this.getResourceType(uploadData.file.mimetype),
          tags: [uploadData.contentType, uploadData.level, uploadData.category as string]
        });

        fileUrl = uploadResult.secure_url;

        // Extract duration from Cloudinary for videos
        if (uploadData.contentType === 'VIDEO' && uploadResult.duration) {
          // Cloudinary returns duration in seconds, convert to minutes for storage
          // Store as minutes (rounded to 1 decimal place for accuracy)
          extractedDuration = Math.round((uploadResult.duration / 60) * 10) / 10;
          logger.info('Video duration extracted from Cloudinary', {
            durationSeconds: uploadResult.duration,
            durationMinutes: extractedDuration,
            publicId: uploadResult.public_id
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

      // Filter by user's level and subscription access
      // Note: Prisma schema only supports single level and tier, not arrays
      if (level) {
        where.level = level; // Direct level match
      }

      if (subscriptionTier) {
        const tierHierarchy = ['FREE', 'ESSENTIAL', 'PREMIUM', 'PRO'];
        const userTierIndex = tierHierarchy.indexOf(subscriptionTier);
        const allowedTiers = tierHierarchy.slice(0, userTierIndex + 1);
        
        where.requiredTier = { in: allowedTiers }; // Direct tier access
      } else {
        where.requiredTier = 'FREE';
      }

      if (category) where.category = category;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } }
        ];
      }

      const [courses, total] = await Promise.all([
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
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.course.count({ where })
      ]);

      const content = courses.map(course => {
        // Calculate real duration from lesson durations
        const realDuration = course.lessons_data.reduce((total, lesson) => total + (lesson.duration || 0), 0);
        
        return {
          id: course.id,
          title: course.title,
          description: course.description,
          level: course.level,
          category: course.category,
          subscriptionTier: course.requiredTier,
          // Note: availableLevels and availableTiers don't exist in Prisma schema
          // These would need to be implemented via junction tables if needed
          contentType: course.lessons_data.length > 0 && course.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
          fileUrl: course.lessons_data.length > 0 ? course.lessons_data[0].content : undefined,
          thumbnailUrl: course.thumbnail,
          duration: realDuration, // Use calculated duration instead of stored duration
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
        total,
        pages: Math.ceil(total / limit)
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

      // Get both courses and tests
      const [courses, tests] = await Promise.all([
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
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
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

      // Group courses by title to create unified entries
      const courseGroups = new Map<string, any[]>();
      
      courses.forEach(course => {
        const key = course.title;
        if (!courseGroups.has(key)) {
          courseGroups.set(key, []);
        }
        courseGroups.get(key)!.push(course);
      });

      const courseContent = Array.from(courseGroups.entries()).map(([title, courseGroup]) => {
        const primaryCourse = courseGroup[0]; // Use first course as primary
        const allLevels = [...new Set(courseGroup.map(c => c.level))];
        const allSubscriptions = [...new Set(courseGroup.map(c => c.requiredTier))];
        
        return {
          id: primaryCourse.id,
          title: primaryCourse.title,
          description: primaryCourse.description,
          level: allLevels, // Return array of levels
          category: primaryCourse.category,
          subscriptionTier: allSubscriptions, // Return array of subscriptions
          contentType: primaryCourse.lessons_data.length > 0 && primaryCourse.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
          fileUrl: primaryCourse.lessons_data.length > 0 ? primaryCourse.lessons_data[0].content : undefined,
          thumbnailUrl: primaryCourse.thumbnail,
          duration: primaryCourse.duration,
          tags: primaryCourse.tags,
          isPublished: primaryCourse.isPublished,
          createdBy: primaryCourse.createdBy,
          createdAt: primaryCourse.createdAt,
          updatedAt: primaryCourse.updatedAt,
          // Add unified fields
          levels: allLevels,
          subscriptions: allSubscriptions,
          totalVariants: courseGroup.length
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
        total: filteredContent.length,
        pages: Math.ceil(filteredContent.length / limit)
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

      // Get all courses with the same title
      const allCourses = await prisma.course.findMany({
        where: { title: primaryCourse.title },
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

      // Validate inputs
      if (!levels || levels.length === 0) {
        throw new ValidationError('At least one level must be provided');
      }
      if (!subscriptions || subscriptions.length === 0) {
        throw new ValidationError('At least one subscription tier must be provided');
      }

      // Handle "all" selections - if all levels/subscriptions are selected, use the first one
      // Since Prisma schema only supports single level/tier, we'll use the first selected
      const selectedLevel = levels.includes('ALL') || levels.length === 6 
        ? 'A1' // Default to A1 if all selected
        : (levels[0] as CourseLevel);
      
      const selectedTier = subscriptions.includes('ALL') || subscriptions.length === 4
        ? 'FREE' // Default to FREE if all selected
        : (subscriptions[0] as SubscriptionTier);

      // ✅ FIXED: Update the SINGLE course with selected level and tier
      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: {
          level: selectedLevel,
          requiredTier: selectedTier,
          // Note: Multiple levels/tiers would require junction tables in Prisma schema
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
          id: updatedCourse.id,
          title: updatedCourse.title,
          description: updatedCourse.description,
          level: updatedCourse.level,
          category: updatedCourse.category,
          subscriptionTier: updatedCourse.requiredTier, // Map requiredTier to subscriptionTier
          requiredTier: updatedCourse.requiredTier,
          // Note: availableLevels and availableTiers don't exist in Prisma schema
          contentType: updatedCourse.lessons_data.length > 0 && updatedCourse.lessons_data[0].videoUrl ? 'VIDEO' : 'NOTE',
          fileUrl: updatedCourse.lessons_data.length > 0 ? updatedCourse.lessons_data[0].content : undefined,
          thumbnailUrl: updatedCourse.thumbnail,
          duration: updatedCourse.duration,
          tags: updatedCourse.tags,
          isPublished: updatedCourse.isPublished,
          createdBy: updatedCourse.createdBy,
          createdAt: updatedCourse.createdAt,
          updatedAt: updatedCourse.updatedAt
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
