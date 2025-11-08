import { Request, Response } from 'express';
import { FileUploadService } from '../services/fileUploadService';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import path from 'path';
import fs from 'fs/promises';

export class FileUploadController {
  /**
   * Upload profile image
   */
  static async uploadProfileImage(req: Request, res: Response): Promise<void> {
    try {
      // Handle both userId and id from JWT payload
      const userId = req.user!.userId || (req.user as any).id;
      if (!userId) {
        throw new ValidationError('User ID not found in token');
      }
      const file = req.file;

      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const uploadedFile = await FileUploadService.processUploadedFile(
        file,
        userId,
        {
          category: 'PROFILE_IMAGE',
          maxSize: 5 * 1024 * 1024, // 5MB
          allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
          resize: {
            width: 300,
            height: 300,
            quality: 85
          }
        }
      );

      // Update user profile image
      await FileUploadService.updateProfileImage(userId, uploadedFile.id);

      res.status(201).json({
        success: true,
        data: { file: uploadedFile },
        message: 'Profile image uploaded successfully'
      });
    } catch (error) {
      logger.error('Failed to upload profile image', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload profile image',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'UPLOAD_ERROR'
          }
        });
      }
    }
  }

  /**
   * Upload course material
   */
  static async uploadCourseMaterial(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new ValidationError('No files uploaded');
      }

      const uploadedFiles = [];

      for (const file of files) {
        const uploadedFile = await FileUploadService.processUploadedFile(
          file,
          userId,
          {
            category: 'COURSE_MATERIAL',
            maxSize: 50 * 1024 * 1024, // 50MB
            allowedTypes: [
              'application/pdf',
              'video/mp4',
              'audio/mp3',
              'image/jpeg',
              'image/png',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.ms-powerpoint'
            ]
          }
        );
        uploadedFiles.push(uploadedFile);
      }

      res.status(201).json({
        success: true,
        data: { files: uploadedFiles },
        message: `${uploadedFiles.length} course material(s) uploaded successfully`
      });
    } catch (error) {
      logger.error('Failed to upload course material', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload course material',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'UPLOAD_ERROR'
          }
        });
      }
    }
  }

  /**
   * Upload post media
   */
  static async uploadPostMedia(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new ValidationError('No files uploaded');
      }

      const uploadedFiles = [];

      for (const file of files) {
        const uploadedFile = await FileUploadService.processUploadedFile(
          file,
          userId,
          {
            category: 'POST_MEDIA',
            maxSize: 20 * 1024 * 1024, // 20MB
            allowedTypes: [
              'image/jpeg',
              'image/png',
              'image/gif',
              'video/mp4',
              'audio/mp3'
            ]
          }
        );
        uploadedFiles.push(uploadedFile);
      }

      // Ensure all URLs are absolute
      const filesWithAbsoluteUrls = uploadedFiles.map(file => ({
        ...file,
        url: file.url?.startsWith('http') ? file.url : `http://localhost:3001${file.url || file.path || ''}`
      }));

      res.status(201).json({
        success: true,
        data: { files: filesWithAbsoluteUrls },
        message: `${uploadedFiles.length} media file(s) uploaded successfully`
      });
    } catch (error) {
      logger.error('Failed to upload post media', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload post media',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'UPLOAD_ERROR'
          }
        });
      }
    }
  }

  /**
   * Upload document
   */
  static async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const file = req.file;

      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const uploadedFile = await FileUploadService.processUploadedFile(
        file,
        userId,
        {
          category: 'DOCUMENT',
          maxSize: 25 * 1024 * 1024, // 25MB
          allowedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
          ]
        }
      );

      res.status(201).json({
        success: true,
        data: { file: uploadedFile },
        message: 'Document uploaded successfully'
      });
    } catch (error) {
      logger.error('Failed to upload document', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload document',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'UPLOAD_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get file by ID
   */
  static async getFileById(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const userId = req.user?.userId;

      const file = await FileUploadService.getFileById(fileId, userId);

      res.json({
        success: true,
        data: { file },
        message: 'File retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get file by ID', { 
        fileId: req.params.fileId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'FILE_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get file',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'FILE_FETCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Download/serve file
   */
  static async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const userId = req.user?.userId;

      const file = await FileUploadService.getFileById(fileId, userId);

      // Check if file exists on disk
      try {
        await fs.access(file.path);
      } catch {
        throw new NotFoundError('File not found on disk');
      }

      // Set appropriate headers
      res.setHeader('Content-Type', file.mimetype);
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Length', file.size.toString());

      // Stream file
      res.sendFile(path.resolve(file.path));

      logger.info('File downloaded', { 
        fileId, 
        originalName: file.originalName,
        userId 
      });
    } catch (error) {
      logger.error('Failed to download file', { 
        fileId: req.params.fileId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'FILE_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to download file',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'DOWNLOAD_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get user's files
   */
  static async getUserFiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const category = req.query.category as string;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      const result = await FileUploadService.getUserFiles(userId, category, page, limit);

      res.json({
        success: true,
        data: result,
        message: `Retrieved ${result.files.length} files`
      });
    } catch (error) {
      logger.error('Failed to get user files', { 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get files',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'FILES_FETCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Delete file
   */
  static async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const userId = req.user!.userId;

      await FileUploadService.deleteFile(fileId, userId);

      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete file', { 
        fileId: req.params.fileId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'FILE_NOT_FOUND'
          }
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: {
            message: error.message,
            code: 'FORBIDDEN'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to delete file',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'FILE_DELETE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get file statistics
   */
  static async getFileStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await FileUploadService.getFileStatistics(userId);

      res.json({
        success: true,
        data: { statistics: stats },
        message: 'File statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get file statistics', { 
        error,
        userId: req.user?.userId 
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get file statistics',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'STATISTICS_ERROR'
        }
      });
    }
  }
}
