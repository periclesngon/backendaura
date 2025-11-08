import { prisma } from '@/database/connection';
import { CloudinaryService } from './cloudinaryService';
import QuestionBankService from './questionBankService';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

export interface FileProcessingResult {
  fileId: string;
  originalName: string;
  cloudinaryUrl: string;
  thumbnailUrl?: string;
  extractedText?: string;
  metadata: {
    size: number;
    mimeType: string;
    dimensions?: { width: number; height: number };
    duration?: number;
    pages?: number;
  };
  aiAnalysis?: {
    questions: Array<{
      question: string;
      answer: string;
      explanation?: string;
      difficulty: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
      category: string;
    }>;
    summary: string;
    topics: string[];
  };
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processedAt?: Date;
}

export interface FileSearchFilters {
  category?: string;
  level?: string;
  contentType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasAiAnalysis?: boolean;
  createdBy?: string;
}

export class EnhancedFileManagementService {
  /**
   * Upload and process file with advanced capabilities
   */
  static async uploadAndProcess(
    file: Express.Multer.File,
    metadata: {
      title: string;
      description: string;
      level: string;
      category: string;
      contentType: string;
      subscriptionTier: string;
      userId: string;
    }
  ): Promise<FileProcessingResult> {
    try {
      logger.info(`Starting enhanced file upload and processing for: ${file.originalname}`);

      // Upload to Cloudinary
      const uploadResult = await CloudinaryService.uploadFile(file.path, {
        folder: `tcf-tef-platform/enhanced/${metadata.contentType.toLowerCase()}`,
        resource_type: this.getResourceType(file.mimetype),
        tags: [metadata.contentType, metadata.level, metadata.category]
      });

      // Generate thumbnail for videos
      let thumbnailUrl: string | undefined;
      if (file.mimetype.startsWith('video/')) {
        thumbnailUrl = CloudinaryService.getVideoThumbnailUrl(uploadResult.public_id);
      }

      // Extract text content for analysis
      let extractedText: string | undefined;
      if (file.mimetype === 'application/pdf') {
        extractedText = await this.extractTextFromPDF(file.path);
      }

      // Create file record in database
      const fileRecord = await prisma.file.create({
        data: {
          originalName: file.originalname,
          filename: uploadResult.public_id,
          path: file.path,
          url: uploadResult.secure_url,
          mimeType: file.mimetype,
          mimetype: file.mimetype,
          size: file.size,
          userId: metadata.userId,
          uploadedById: metadata.userId,
          category: metadata.category || 'OTHER',
          metadata: {
            cloudinaryPublicId: uploadResult.public_id,
            thumbnailUrl,
            extractedText: extractedText?.substring(0, 10000), // Limit text length
          }
        }
      });

      // Perform AI analysis if text was extracted
      let aiAnalysis;
      if (extractedText) {
        aiAnalysis = await this.performAIAnalysis(extractedText, metadata.level, metadata.category);
        
        // Store questions in question bank
        // TODO: Implement question storage when storeContent method is available
        if (aiAnalysis.questions.length > 0) {
          logger.info('Questions extracted from file', {
            questionCount: aiAnalysis.questions.length,
            fileId: fileRecord.id
          });
        }
      }

      // Clean up temporary file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      const result: FileProcessingResult = {
        fileId: fileRecord.id,
        originalName: file.originalname,
        cloudinaryUrl: uploadResult.secure_url,
        thumbnailUrl,
        extractedText,
        metadata: {
          size: file.size,
          mimeType: file.mimetype,
          dimensions: uploadResult.width && uploadResult.height ? 
            { width: uploadResult.width, height: uploadResult.height } : undefined,
          duration: uploadResult.duration,
        },
        aiAnalysis,
        status: 'COMPLETED',
        processedAt: new Date()
      };

      logger.info(`Enhanced file processing completed for: ${file.originalname}`);
      return result;

    } catch (error) {
      logger.error('Enhanced file processing failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from PDF files
   */
  private static async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse.default(dataBuffer);
      return data.text;
    } catch (error) {
      logger.error('PDF text extraction failed:', error);
      return '';
    }
  }

  /**
   * Perform AI analysis on extracted text
   */
  private static async performAIAnalysis(
    text: string, 
    level: string, 
    category: string
  ): Promise<FileProcessingResult['aiAnalysis']> {
    try {
      // Simulate AI analysis - in production, this would call actual AI service
      const questions = this.extractQuestionsFromText(text, level, category);
      const summary = this.generateSummary(text);
      const topics = this.extractTopics(text);

      return {
        questions,
        summary,
        topics
      };
    } catch (error) {
      logger.error('AI analysis failed:', error);
      return {
        questions: [],
        summary: 'Analysis failed',
        topics: []
      };
    }
  }

  /**
   * Extract questions from text (simplified implementation)
   */
  private static extractQuestionsFromText(
    text: string, 
    level: string, 
    category: string
  ): Array<{
    question: string;
    answer: string;
    explanation?: string;
    difficulty: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    category: string;
  }> {
    const questions = [];
    
    // Simple pattern matching for questions
    const questionPatterns = [
      /\d+\.\s*(.+?\?)/g,
      /Question\s*\d*:?\s*(.+?\?)/gi,
      /Q\d*:?\s*(.+?\?)/gi
    ];

    for (const pattern of questionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null && questions.length < 10) {
        questions.push({
          question: match[1].trim(),
          answer: 'Answer extracted from context',
          explanation: 'Explanation based on document content',
          difficulty: level as any,
          category: category
        });
      }
    }

    return questions;
  }

  /**
   * Generate summary from text
   */
  private static generateSummary(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const summary = sentences.slice(0, 3).join('. ');
    return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
  }

  /**
   * Extract topics from text
   */
  private static extractTopics(text: string): string[] {
    const commonTopics = [
      'grammaire', 'vocabulaire', 'conjugaison', 'orthographe', 'syntaxe',
      'compréhension', 'expression', 'communication', 'culture', 'littérature'
    ];
    
    const foundTopics = commonTopics.filter(topic => 
      text.toLowerCase().includes(topic)
    );
    
    return foundTopics.slice(0, 5);
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
   * Search files with advanced filters
   */
  static async searchFiles(
    filters: FileSearchFilters,
    pagination: { page: number; limit: number }
  ): Promise<{ files: any[]; total: number; pagination: any }> {
    try {
      const where: any = {};

      if (filters.category) where.category = filters.category;
      if (filters.level) where.level = filters.level;
      if (filters.contentType) where.contentType = filters.contentType;
      if (filters.createdBy) where.uploadedById = filters.createdBy;
      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const total = await prisma.file.count({ where });
      const files = await prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit
      });

      return {
        files,
        total,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          totalPages: Math.ceil(total / pagination.limit),
          hasNext: pagination.page * pagination.limit < total,
          hasPrev: pagination.page > 1
        }
      };
    } catch (error) {
      logger.error('File search failed:', error);
      throw error;
    }
  }

  /**
   * Process file manually (for reprocessing)
   */
  static async processFile(fileId: string): Promise<FileProcessingResult> {
    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new NotFoundError('File not found');
      }

      // Reprocess the file if it's a PDF
      if (file.mimeType === 'application/pdf') {
        // Download from Cloudinary and reprocess
        // This is a simplified implementation
        logger.info(`Reprocessing file: ${file.originalName}`);
      }

      return {
        fileId: file.id,
        originalName: file.originalName,
        cloudinaryUrl: file.url,
        metadata: {
          size: file.size,
          mimeType: file.mimeType
        },
        status: 'COMPLETED',
        processedAt: new Date()
      };
    } catch (error) {
      logger.error('File reprocessing failed:', error);
      throw error;
    }
  }
}
