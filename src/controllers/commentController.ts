import { Request, Response } from 'express';
import { CommentService, SocialInteractionService } from '../services/commentService';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

export class CommentController {
  /**
   * Get comments for a post
   */
  static async getPostComments(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const userId = req.user?.userId;

      if (limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      const result = await CommentService.getPostComments(postId, userId, page, limit);

      res.json({
        success: true,
        data: result,
        message: `Retrieved ${result.comments.length} comments for post`
      });
    } catch (error) {
      logger.error('Failed to get post comments', { 
        postId: req.params.postId, 
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'POST_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
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
            message: 'Failed to get comments',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENTS_FETCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Create a new comment
   */
  static async createComment(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const { content, parentId } = req.body;
      const userId = req.user!.userId;

      if (!content || typeof content !== 'string') {
        throw new ValidationError('Comment content is required');
      }

      const comment = await CommentService.createComment(
        { content, postId, parentId },
        userId
      );

      res.status(201).json({
        success: true,
        data: { comment },
        message: parentId ? 'Reply created successfully' : 'Comment created successfully'
      });
    } catch (error) {
      logger.error('Failed to create comment', { 
        postId: req.params.postId,
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'RESOURCE_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
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
            message: 'Failed to create comment',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENT_CREATION_ERROR'
          }
        });
      }
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const userId = req.user!.userId;

      if (!content || typeof content !== 'string') {
        throw new ValidationError('Comment content is required');
      }

      const comment = await CommentService.updateComment(
        commentId,
        { content },
        userId
      );

      res.json({
        success: true,
        data: { comment },
        message: 'Comment updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update comment', { 
        commentId: req.params.commentId,
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COMMENT_NOT_FOUND'
          }
        });
      } else if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
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
            message: 'Failed to update comment',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENT_UPDATE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user!.userId;

      await CommentService.deleteComment(commentId, userId);

      res.json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete comment', { 
        commentId: req.params.commentId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COMMENT_NOT_FOUND'
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
            message: 'Failed to delete comment',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENT_DELETE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Toggle like on a comment
   */
  static async toggleCommentLike(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user!.userId;

      const result = await CommentService.toggleCommentLike(commentId, userId);

      res.json({
        success: true,
        data: result,
        message: result.isLiked ? 'Comment liked' : 'Comment unliked'
      });
    } catch (error) {
      logger.error('Failed to toggle comment like', { 
        commentId: req.params.commentId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COMMENT_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to toggle comment like',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENT_LIKE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get comment by ID
   */
  static async getCommentById(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.userId;

      const comment = await CommentService.getCommentById(commentId, userId);

      res.json({
        success: true,
        data: { comment },
        message: 'Comment retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get comment by ID', { 
        commentId: req.params.commentId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'COMMENT_NOT_FOUND'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Failed to get comment',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'COMMENT_FETCH_ERROR'
          }
        });
      }
    }
  }
}

export class SocialController {
  /**
   * Toggle like on a post
   */
  static async togglePostLike(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const userId = req.user!.userId;

      const result = await SocialInteractionService.togglePostLike(postId, userId);

      res.json({
        success: true,
        data: result,
        message: result.isLiked ? 'Post liked' : 'Post unliked'
      });
    } catch (error) {
      logger.error('Failed to toggle post like', { 
        postId: req.params.postId,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'POST_NOT_FOUND'
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
            message: 'Failed to toggle post like',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'POST_LIKE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Share a post
   */
  static async sharePost(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const { platform } = req.body;
      const userId = req.user!.userId;

      const result = await SocialInteractionService.sharePost(postId, userId, platform);

      res.json({
        success: true,
        data: result,
        message: 'Post shared successfully'
      });
    } catch (error) {
      logger.error('Failed to share post', { 
        postId: req.params.postId,
        body: req.body,
        error,
        userId: req.user?.userId 
      });

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'POST_NOT_FOUND'
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
            message: 'Failed to share post',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'POST_SHARE_ERROR'
          }
        });
      }
    }
  }

  /**
   * Get post engagement stats
   */
  static async getPostEngagement(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const userId = req.user?.userId;

      const engagement = await SocialInteractionService.getPostEngagement(postId, userId);

      res.json({
        success: true,
        data: { engagement },
        message: 'Post engagement retrieved successfully'
      });
    } catch (error) {
      logger.error('Failed to get post engagement', { 
        postId: req.params.postId,
        error,
        userId: req.user?.userId 
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get post engagement',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'ENGAGEMENT_FETCH_ERROR'
        }
      });
    }
  }
}
