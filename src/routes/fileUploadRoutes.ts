import { Router } from 'express';
import { FileUploadController } from '../controllers/fileUploadController';
import { FileUploadService } from '../services/fileUploadService';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Initialize upload directories on startup
FileUploadService.initializeDirectories().catch(console.error);

// Validation schemas
const fileQuerySchema = {
  query: Joi.object({
    category: Joi.string().valid('PROFILE_IMAGE', 'COURSE_MATERIAL', 'POST_MEDIA', 'DOCUMENT', 'OTHER').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

// Configure multer for different upload types
const profileImageUpload = FileUploadService.configureMulter({
  category: 'PROFILE_IMAGE',
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
});

const courseMaterialUpload = FileUploadService.configureMulter({
  category: 'COURSE_MATERIAL',
  maxSize: 10 * 1024 * 1024 * 1024, // 10GB for large files and poor internet connections
  allowedTypes: [
    'application/pdf',
    'video/mp4',
    'audio/mp3',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ]
});

const postMediaUpload = FileUploadService.configureMulter({
  category: 'POST_MEDIA',
  maxSize: 10 * 1024 * 1024 * 1024, // 10GB for large files
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'audio/mp3'
  ]
});

const documentUpload = FileUploadService.configureMulter({
  category: 'DOCUMENT',
  maxSize: 10 * 1024 * 1024 * 1024, // 10GB for large documents
  allowedTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
});

/**
 * @swagger
 * /api/upload/profile-image:
 *   post:
 *     summary: Upload profile image
 *     tags: [File Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file (JPEG, PNG, GIF, max 5MB)
 *     responses:
 *       201:
 *         description: Profile image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     file:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         originalName:
 *                           type: string
 *                         url:
 *                           type: string
 *                         size:
 *                           type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid file or file too large
 *       401:
 *         description: Authentication required
 */
router.post('/profile-image', authenticate, profileImageUpload.single('file'), FileUploadController.uploadProfileImage);

/**
 * @swagger
 * /api/upload/course-material:
 *   post:
 *     summary: Upload course materials
 *     tags: [File Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Course material files (PDF, MP4, MP3, images, presentations, max 50MB each)
 *     responses:
 *       201:
 *         description: Course materials uploaded successfully
 *       400:
 *         description: Invalid files or files too large
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Manager role required
 */
router.post('/course-material', authenticate, requireRole(['SENIOR_MANAGER', 'JUNIOR_MANAGER', 'ADMIN']), courseMaterialUpload.array('files', 5), FileUploadController.uploadCourseMaterial);

/**
 * @swagger
 * /api/upload/post-media:
 *   post:
 *     summary: Upload post media
 *     tags: [File Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Media files for posts (images, videos, audio, max 20MB each)
 *     responses:
 *       201:
 *         description: Post media uploaded successfully
 *       400:
 *         description: Invalid files or files too large
 *       401:
 *         description: Authentication required
 */
router.post('/post-media', authenticate, postMediaUpload.array('files', 5), FileUploadController.uploadPostMedia);

/**
 * @swagger
 * /api/upload/document:
 *   post:
 *     summary: Upload document
 *     tags: [File Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file (PDF, DOC, DOCX, XLS, XLSX, TXT, max 25MB)
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Invalid file or file too large
 *       401:
 *         description: Authentication required
 */
router.post('/document', authenticate, documentUpload.single('file'), FileUploadController.uploadDocument);

/**
 * @swagger
 * /api/files:
 *   get:
 *     summary: Get user's uploaded files
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [PROFILE_IMAGE, COURSE_MATERIAL, POST_MEDIA, DOCUMENT, OTHER]
 *         description: Filter by file category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of files per page
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 */
router.get('/', authenticate, validate(fileQuerySchema), FileUploadController.getUserFiles);

/**
 * @swagger
 * /api/files/{fileId}:
 *   get:
 *     summary: Get file information by ID
 *     tags: [File Management]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: File ID
 *     responses:
 *       200:
 *         description: File information retrieved successfully
 *       404:
 *         description: File not found
 */
router.get('/:fileId', FileUploadController.getFileById);

/**
 * @swagger
 * /api/files/{fileId}/download:
 *   get:
 *     summary: Download file
 *     tags: [File Management]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: File ID
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 */
router.get('/:fileId/download', FileUploadController.downloadFile);

/**
 * @swagger
 * /api/files/{fileId}:
 *   delete:
 *     summary: Delete file
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: File ID
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to delete this file
 *       404:
 *         description: File not found
 */
router.delete('/:fileId', authenticate, FileUploadController.deleteFile);

/**
 * @swagger
 * /api/files/statistics:
 *   get:
 *     summary: Get file upload statistics
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         totalFiles:
 *                           type: integer
 *                         totalSize:
 *                           type: integer
 *                         byCategory:
 *                           type: array
 *                           items:
 *                             type: object
 *                         byMimetype:
 *                           type: array
 *                           items:
 *                             type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 */
router.get('/statistics', authenticate, FileUploadController.getFileStatistics);

export default router;
