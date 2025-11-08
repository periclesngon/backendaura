import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { CloudinaryService } from './cloudinaryService';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import sharp from 'sharp';

export interface UploadedFile {
  id: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  category: 'PROFILE_IMAGE' | 'COURSE_MATERIAL' | 'POST_MEDIA' | 'DOCUMENT' | 'OTHER';
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    pages?: number;
  };
}

export interface FileUploadOptions {
  category: 'PROFILE_IMAGE' | 'COURSE_MATERIAL' | 'POST_MEDIA' | 'DOCUMENT' | 'OTHER';
  maxSize?: number;
  allowedTypes?: string[];
  resize?: {
    width: number;
    height: number;
    quality?: number;
  };
}

export class FileUploadService {
  private static readonly UPLOAD_DIR = process.env.UPLOAD_PATH || 'uploads/';
  private static readonly MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '0'); // No limit
  private static readonly ALLOWED_TYPES = (process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,application/pdf,video/mp4,audio/mp3').split(',');

  /**
   * Initialize upload directories
   */
  static async initializeDirectories(): Promise<void> {
    try {
      const directories = [
        this.UPLOAD_DIR,
        path.join(this.UPLOAD_DIR, 'profiles'),
        path.join(this.UPLOAD_DIR, 'courses'),
        path.join(this.UPLOAD_DIR, 'posts'),
        path.join(this.UPLOAD_DIR, 'documents'),
        path.join(this.UPLOAD_DIR, 'temp')
      ];

      for (const dir of directories) {
        try {
          await fs.access(dir);
        } catch {
          await fs.mkdir(dir, { recursive: true });
          logger.info('Created upload directory', { directory: dir });
        }
      }
    } catch (error) {
      logger.error('Failed to initialize upload directories', { error });
      throw error;
    }
  }

  /**
   * Configure multer for file uploads
   */
  static configureMulter(options: FileUploadOptions = { category: 'OTHER' }): multer.Multer {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        let subDir = 'temp';
        switch (options.category) {
          case 'PROFILE_IMAGE':
            subDir = 'profiles';
            break;
          case 'COURSE_MATERIAL':
            subDir = 'courses';
            break;
          case 'POST_MEDIA':
            subDir = 'posts';
            break;
          case 'DOCUMENT':
            subDir = 'documents';
            break;
        }
        cb(null, path.join(this.UPLOAD_DIR, subDir));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomUUID();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
      }
    });

    const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowedTypes = options.allowedTypes || this.ALLOWED_TYPES;
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ValidationError(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`));
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: options.maxSize || this.MAX_FILE_SIZE,
        files: 20 // Maximum 20 files per request for bulk uploads
      }
    });
  }

  /**
   * Process uploaded file
   */
  static async processUploadedFile(
    file: Express.Multer.File,
    userId: string,
    options: FileUploadOptions
  ): Promise<UploadedFile> {
    try {
      let processedPath = file.path;
      let metadata: any = {};

      // Process images
      if (file.mimetype.startsWith('image/')) {
        const imageInfo = await sharp(file.path).metadata();
        metadata.width = imageInfo.width;
        metadata.height = imageInfo.height;

        // Resize if requested
        if (options.resize) {
          const resizedPath = file.path.replace(path.extname(file.path), '_resized' + path.extname(file.path));
          await sharp(file.path)
            .resize(options.resize.width, options.resize.height, {
              fit: 'cover',
              position: 'center'
            })
            .jpeg({ quality: options.resize.quality || 80 })
            .toFile(resizedPath);
          
          // Replace original with resized
          await fs.unlink(file.path);
          processedPath = resizedPath;
        }
      }

      // Generate URL - ensure it's absolute
      const relativePath = path.relative(this.UPLOAD_DIR, processedPath);
      const url = `/uploads/${relativePath.replace(/\\/g, '/')}`;
      
      // Also create absolute URL for storage
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const absoluteUrl = `${backendUrl}${url}`;

      // Save to database
      const uploadedFile = await prisma.file.create({
        data: {
          originalName: file.originalname,
          filename: path.basename(processedPath),
          mimeType: file.mimetype,
          mimetype: file.mimetype,
          size: file.size,
          path: processedPath,
          url: absoluteUrl, // Save absolute URL for easier retrieval
          userId: userId,
          uploadedById: userId,
          category: options.category,
          metadata: JSON.stringify(metadata)
        }
      });

      logger.info('File uploaded and processed', {
        fileId: uploadedFile.id,
        originalName: file.originalname,
        category: options.category,
        userId
      });

      return {
        id: uploadedFile.id,
        url: absoluteUrl, // Return absolute URL
        path: url, // Keep relative path for reference
        originalName: uploadedFile.originalName,
        filename: uploadedFile.filename,
        mimetype: uploadedFile.mimetype,
        size: uploadedFile.size,
        uploadedBy: uploadedFile.userId,
        uploadedAt: uploadedFile.createdAt,
        category: uploadedFile.category as any,
        metadata: uploadedFile.metadata as any
      };
    } catch (error) {
      // Clean up file if processing failed
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up file after processing error', { 
          filePath: file.path, 
          cleanupError 
        });
      }
      
      logger.error('Failed to process uploaded file', { 
        originalName: file.originalname,
        userId,
        error 
      });
      throw error;
    }
  }

  /**
   * Get file by ID
   */
  static async getFileById(fileId: string, userId?: string): Promise<UploadedFile> {
    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new NotFoundError('File not found');
      }

      // Check if file exists on disk
      try {
        await fs.access(file.path);
      } catch {
        logger.warn('File not found on disk', { fileId, path: file.path });
        throw new NotFoundError('File not found on disk');
      }

      return {
        id: file.id,
        originalName: file.originalName,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: file.url,
        uploadedBy: file.userId,
        uploadedAt: file.createdAt,
        category: file.category as any,
        metadata: file.metadata as any
      };
    } catch (error) {
      logger.error('Failed to get file by ID', { fileId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's uploaded files
   */
  static async getUserFiles(
    userId: string,
    category?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    files: UploadedFile[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const skip = (page - 1) * limit;
      const whereClause: any = { userId: userId };
      
      if (category) {
        whereClause.category = category;
      }

      const [files, total] = await Promise.all([
        prisma.file.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.file.count({ where: whereClause })
      ]);

      const formattedFiles: UploadedFile[] = files.map(file => ({
        id: file.id,
        originalName: file.originalName,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: file.url,
        uploadedBy: file.userId,
        uploadedAt: file.createdAt,
        category: file.category as any,
        metadata: file.metadata as any
      }));

      return {
        files: formattedFiles,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user files', { userId, category, error });
      throw error;
    }
  }

  /**
   * Delete file
   */
  static async deleteFile(fileId: string, userId: string): Promise<void> {
    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          userId: true,
          path: true,
          originalName: true
        }
      });

      if (!file) {
        throw new NotFoundError('File not found');
      }

      if (file.userId !== userId) {
        throw new ForbiddenError('You can only delete your own files');
      }

      // Delete from database
      await prisma.file.delete({
        where: { id: fileId }
      });

      // Delete from disk
      try {
        await fs.unlink(file.path);
        logger.info('File deleted from disk', { fileId, path: file.path });
      } catch (diskError) {
        logger.warn('Failed to delete file from disk', { 
          fileId, 
          path: file.path, 
          diskError 
        });
      }

      logger.info('File deleted', { 
        fileId, 
        originalName: file.originalName, 
        userId 
      });
    } catch (error) {
      logger.error('Failed to delete file', { fileId, userId, error });
      throw error;
    }
  }

  /**
   * Update user profile image
   */
  static async updateProfileImage(userId: string, fileId: string): Promise<void> {
    try {
      // Verify file exists and belongs to user
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          userId: true,
          category: true,
          mimetype: true,
          url: true
        }
      });

      if (!file) {
        throw new NotFoundError('File not found');
      }

      if (file.userId !== userId) {
        throw new ForbiddenError('You can only use your own uploaded files');
      }

      if (file.category !== 'PROFILE_IMAGE') {
        throw new ValidationError('File must be a profile image');
      }

      if (!file.mimetype.startsWith('image/')) {
        throw new ValidationError('Profile image must be an image file');
      }

      // Generate absolute URL for the uploaded file
      // Backend serves static files at http://localhost:3001/uploads/
      const baseUrl = process.env.BACKEND_URL || process.env.API_URL?.replace('/api', '') || 'http://localhost:3001';
      const absoluteUrl = file.url.startsWith('http') 
        ? file.url 
        : `${baseUrl}${file.url.startsWith('/') ? '' : '/'}${file.url}`;

      // Update user profile - save ABSOLUTE URL to both profileImage and profilePicture for consistency
      await prisma.user.update({
        where: { id: userId },
        data: { 
          profileImage: absoluteUrl, // Save absolute URL so frontend doesn't need to convert
          profilePicture: absoluteUrl // Also update profilePicture field for compatibility
        }
      });

      logger.info('Profile image updated', { userId, fileId });
    } catch (error) {
      logger.error('Failed to update profile image', { userId, fileId, error });
      throw error;
    }
  }

  /**
   * Get file statistics
   */
  static async getFileStatistics(userId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byCategory: Array<{
      category: string;
      count: number;
      size: number;
    }>;
    byMimetype: Array<{
      mimetype: string;
      count: number;
      size: number;
    }>;
  }> {
    try {
      const whereClause = userId ? { userId: userId } : {};

      const [totalStats, categoryStats, mimetypeStats] = await Promise.all([
        prisma.file.aggregate({
          where: whereClause,
          _count: { id: true },
          _sum: { size: true }
        }),
        prisma.file.groupBy({
          by: ['category'],
          where: whereClause,
          _count: { id: true },
          _sum: { size: true }
        }),
        prisma.file.groupBy({
          by: ['mimetype'],
          where: whereClause,
          _count: { id: true },
          _sum: { size: true }
        })
      ]);

      return {
        totalFiles: totalStats._count.id,
        totalSize: totalStats._sum.size || 0,
        byCategory: categoryStats.map(stat => ({
          category: stat.category,
          count: stat._count.id,
          size: stat._sum.size || 0
        })),
        byMimetype: mimetypeStats.map(stat => ({
          mimetype: stat.mimetype,
          count: stat._count.id,
          size: stat._sum.size || 0
        }))
      };
    } catch (error) {
      logger.error('Failed to get file statistics', { userId, error });
      throw error;
    }
  }

  /**
   * Upload file to Cloudinary and save metadata to database
   */
  static async uploadToCloudinary(
    file: Express.Multer.File,
    userId: string,
    options: FileUploadOptions
  ): Promise<UploadedFile> {
    try {
      logger.info('Starting Cloudinary upload', {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        userId
      });

      // Determine folder based on category
      const folder = `tcf-tef-platform/${options.category.toLowerCase()}`;

      // Upload to Cloudinary
      const cloudinaryResult = await CloudinaryService.uploadFile(file.path, {
        folder,
        resource_type: 'auto',
        tags: [options.category, userId],
      });

      // Save file metadata to database
      const uploadedFile = await prisma.file.create({
        data: {
          originalName: file.originalname,
          filename: file.filename,
          mimeType: file.mimetype,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          url: cloudinaryResult.secure_url,
          userId: userId,
          uploadedById: userId,
          category: options.category.toString(),
          metadata: JSON.stringify({
            cloudinaryPublicId: cloudinaryResult.public_id,
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
            duration: cloudinaryResult.duration,
            format: cloudinaryResult.format,
            resourceType: cloudinaryResult.resource_type,
          })
        }
      });

      // Clean up local file after successful upload
      try {
        await fs.unlink(file.path);
      } catch (unlinkError) {
        logger.warn('Failed to delete local file after Cloudinary upload', {
          filePath: file.path,
          error: unlinkError
        });
      }

      logger.info('File uploaded to Cloudinary successfully', {
        fileId: uploadedFile.id,
        cloudinaryPublicId: cloudinaryResult.public_id,
        url: cloudinaryResult.secure_url
      });

      return {
        id: uploadedFile.id,
        originalName: uploadedFile.originalName,
        filename: uploadedFile.filename,
        mimetype: uploadedFile.mimetype,
        size: uploadedFile.size,
        path: uploadedFile.path,
        url: uploadedFile.url,
        uploadedBy: uploadedFile.userId,
        uploadedAt: uploadedFile.createdAt,
        category: uploadedFile.category as any,
        metadata: uploadedFile.metadata ? JSON.parse(uploadedFile.metadata as string) : null
      };
    } catch (error) {
      logger.error('Failed to upload file to Cloudinary', {
        filename: file.filename,
        userId,
        error
      });

      // Clean up local file on error
      try {
        await fs.unlink(file.path);
      } catch (unlinkError) {
        logger.warn('Failed to delete local file after upload error', {
          filePath: file.path,
          error: unlinkError
        });
      }

      throw error;
    }
  }

  /**
   * Delete file from both Cloudinary and database
   */
  static async deleteFromCloudinary(fileId: string, userId: string): Promise<void> {
    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) {
        throw new NotFoundError('File not found');
      }

      if (file.userId !== userId) {
        throw new ForbiddenError('You can only delete your own files');
      }

      // Delete from Cloudinary if public ID exists in metadata
      if (file.metadata) {
        const metadata = JSON.parse(file.metadata as string);
        if (metadata.cloudinaryPublicId) {
          await CloudinaryService.deleteFile(
            metadata.cloudinaryPublicId,
            metadata.resourceType || 'image'
          );
        }
      }

      // Delete from database
      await prisma.file.delete({
        where: { id: fileId }
      });

      const metadata = file.metadata ? JSON.parse(file.metadata as string) : {};
      logger.info('File deleted from Cloudinary and database', {
        fileId,
        cloudinaryPublicId: metadata.cloudinaryPublicId
      });
    } catch (error) {
      logger.error('Failed to delete file from Cloudinary', { fileId, userId, error });
      throw error;
    }
  }
}
