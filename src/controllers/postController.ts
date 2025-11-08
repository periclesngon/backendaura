import { Request, Response } from 'express';
import { PostService } from '@/services/postService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import { logger } from '@/utils/logger';

export class PostController {
  /**
   * Get all posts with filtering and pagination
   */
  static getAllPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string;
    const level = req.query.level as string;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const authorId = req.query.authorId as string;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as string || 'desc';

    const filters = {
      category,
      level,
      status,
      search,
      authorId
    };

    const result = await PostService.getAllPosts(
      { page, limit },
      filters,
      { sortBy, sortOrder }
    );

    const response: ApiResponse = {
      success: true,
      data: result.posts,
      pagination: result.pagination,
      message: 'Posts retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get post by ID
   */
  static getPostById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;

    const post = await PostService.getPostById(postId, userId);

    const response: ApiResponse = {
      success: true,
      data: { post },
      message: 'Post retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create new post
   */
  static createPost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const authorId = req.user?.userId;
    const postData = req.body;

    if (!authorId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const post = await PostService.createPost(authorId, postData);

    const response: ApiResponse = {
      success: true,
      data: { post },
      message: 'Post created successfully'
    };

    logger.info('Post created', { postId: post.id, authorId });

    res.status(201).json(response);
  });

  /**
   * Update post
   */
  static updatePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;
    const updateData = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const post = await PostService.updatePost(postId, userId, updateData);

    const response: ApiResponse = {
      success: true,
      data: { post },
      message: 'Post updated successfully'
    };

    logger.info('Post updated', { postId, userId });

    res.status(200).json(response);
  });

  /**
   * Delete post
   */
  static deletePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await PostService.deletePost(postId, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Post deleted successfully'
    };

    logger.info('Post deleted', { postId, userId });

    res.status(200).json(response);
  });

  /**
   * Like/unlike post
   */
  static toggleLike = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await PostService.toggleLike(postId, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: result.liked ? 'Post liked' : 'Post unliked'
    };

    res.status(200).json(response);
  });

  /**
   * Add comment to post
   */
  static addComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;
    const { content, parentId } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const comment = await PostService.addComment(postId, userId, content, parentId);

    const response: ApiResponse = {
      success: true,
      data: { comment },
      message: 'Comment added successfully'
    };

    logger.info('Comment added', { postId, commentId: comment.id, userId });

    res.status(201).json(response);
  });

  /**
   * Get post comments
   */
  static getComments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await PostService.getComments(postId, { page, limit });

    const response: ApiResponse = {
      success: true,
      data: result.comments,
      pagination: result.pagination,
      message: 'Comments retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Share post
   */
  static sharePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;
    const { platform } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const share = await PostService.sharePost(postId, userId, platform);

    const response: ApiResponse = {
      success: true,
      data: { share },
      message: 'Post shared successfully'
    };

    logger.info('Post shared', { postId, userId, platform });

    res.status(201).json(response);
  });

  /**
   * Get post analytics
   */
  static getPostAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const analytics = await PostService.getPostAnalytics(postId, userId);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'Post analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get user's posts
   */
  static getUserPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await PostService.getUserPosts(userId, { page, limit }, { status });

    const response: ApiResponse = {
      success: true,
      data: result.posts,
      pagination: result.pagination,
      message: 'User posts retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get trending posts
   */
  static getTrendingPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 10;
    const timeframe = req.query.timeframe as string || '7d';

    const posts = await PostService.getTrendingPosts(limit, timeframe);

    const response: ApiResponse = {
      success: true,
      data: { posts },
      message: 'Trending posts retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Search posts
   */
  static searchPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const filters = {
      category: req.query.category as string,
      level: req.query.level as string,
      author: req.query.author as string
    };

    if (!query) {
      res.status(400).json({
        success: false,
        error: { message: 'Search query is required' }
      });
      return;
    }

    const result = await PostService.searchPosts(query, { page, limit }, filters);

    const response: ApiResponse = {
      success: true,
      data: result.posts,
      pagination: result.pagination,
      message: 'Search results retrieved successfully'
    };

    res.status(200).json(response);
  });
}
