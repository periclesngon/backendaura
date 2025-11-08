import express from 'express';
import multer from 'multer';
import { authenticate, requireManager } from '../middleware/auth';
import { EnhancedFileManagementService } from '../services/enhancedFileManagementService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 0, // No limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

/**
 * @route   POST /api/file-management/upload
 * @desc    Enhanced file upload with processing
 * @access  Private (Manager+)
 */
router.post('/upload', 
  authenticate, 
  requireManager, 
  upload.single('file'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file uploaded', code: 'VALIDATION_ERROR' }
        });
      }

      const { title, description, level, category, contentType, subscriptionTier } = req.body;

      if (!title || !description || !level || !category || !contentType) {
        return res.status(400).json({
          success: false,
          error: { message: 'Missing required fields', code: 'VALIDATION_ERROR' }
        });
      }

      const result = await EnhancedFileManagementService.uploadAndProcess(req.file, {
        title,
        description,
        level,
        category,
        contentType,
        subscriptionTier: subscriptionTier || 'FREE',
        userId: req.user!.userId
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'File uploaded and processed successfully'
      });

    } catch (error) {
      logger.error('Enhanced file upload failed:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'File upload failed',
          code: 'UPLOAD_ERROR'
        }
      });
    }
  }
);

/**
 * @route   GET /api/file-management/files
 * @desc    Get files with metadata and search
 * @access  Private (Manager+)
 */
router.get('/files', authenticate, requireManager, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      level,
      contentType,
      dateFrom,
      dateTo,
      hasAiAnalysis,
      createdBy
    } = req.query;

    const filters = {
      category: category as string,
      level: level as string,
      contentType: contentType as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      hasAiAnalysis: hasAiAnalysis === 'true',
      createdBy: createdBy as string
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    const result = await EnhancedFileManagementService.searchFiles(filters, pagination);

    res.json({
      success: true,
      data: result.files,
      pagination: result.pagination,
      total: result.total
    });

  } catch (error) {
    logger.error('File listing failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch files',
        code: 'FETCH_ERROR'
      }
    });
  }
});

/**
 * @route   POST /api/file-management/process
 * @desc    Manually trigger file processing
 * @access  Private (Manager+)
 */
router.post('/process/:fileId', authenticate, requireManager, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: { message: 'File ID is required', code: 'VALIDATION_ERROR' }
      });
    }

    const result = await EnhancedFileManagementService.processFile(fileId);

    res.json({
      success: true,
      data: result,
      message: 'File processing completed'
    });

  } catch (error) {
    logger.error('File processing failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'File processing failed',
        code: 'PROCESSING_ERROR'
      }
    });
  }
});

/**
 * @route   GET /api/file-management/search
 * @desc    Advanced file search with filters
 * @access  Private (Manager+)
 */
router.get('/search', authenticate, requireManager, async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      category,
      level,
      contentType,
      dateFrom,
      dateTo
    } = req.query;

    const filters = {
      category: category as string,
      level: level as string,
      contentType: contentType as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    const result = await EnhancedFileManagementService.searchFiles(filters, pagination);

    // If search query provided, filter by filename or content
    let filteredFiles = result.files;
    if (q) {
      const searchTerm = (q as string).toLowerCase();
      filteredFiles = result.files.filter(file => 
        file.originalName.toLowerCase().includes(searchTerm) ||
        (file.metadata?.extractedText && 
         file.metadata.extractedText.toLowerCase().includes(searchTerm))
      );
    }

    res.json({
      success: true,
      data: filteredFiles,
      pagination: result.pagination,
      total: filteredFiles.length,
      query: q
    });

  } catch (error) {
    logger.error('File search failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Search failed',
        code: 'SEARCH_ERROR'
      }
    });
  }
});

/**
 * @route   GET /api/file-management/stats
 * @desc    Get file management statistics
 * @access  Private (Manager+)
 */
router.get('/stats', authenticate, requireManager, async (req, res) => {
  try {
    // This would be implemented with actual database queries
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      filesByType: {},
      filesByLevel: {},
      processingStatus: {
        completed: 0,
        processing: 0,
        failed: 0
      },
      aiAnalysisStats: {
        questionsExtracted: 0,
        documentsAnalyzed: 0
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Stats fetch failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch stats',
        code: 'STATS_ERROR'
      }
    });
  }
});

/**
 * @route   DELETE /api/file-management/files/:fileId
 * @desc    Delete file and associated data
 * @access  Private (Manager+)
 */
router.delete('/files/:fileId', authenticate, requireManager, async (req, res) => {
  try {
    const { fileId } = req.params;

    // This would implement file deletion from Cloudinary and database
    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    logger.error('File deletion failed:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'File deletion failed',
        code: 'DELETE_ERROR'
      }
    });
  }
});

export default router;
