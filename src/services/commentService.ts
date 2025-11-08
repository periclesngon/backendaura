import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';

export interface CreateCommentData {
  content: string;
  postId: string;
  parentId?: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface CommentWithReplies {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    profileImage?: string;
  };
  post: {
    id: string;
    title: string;
  };
  parent?: {
    id: string;
    author: {
      firstName: string;
      lastName: string;
    };
  };
  replies: CommentWithReplies[];
  _count: {
    replies: number;
  };
  isLiked?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export class CommentService {
  /**
   * Get comments for a post with nested replies
   */
  static async getPostComments(
    postId: string,
    userId?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    comments: CommentWithReplies[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const skip = (page - 1) * limit;

      // Verify post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, title: true }
      });

      if (!post) {
        throw new NotFoundError('Post not found');
      }

      // Get top-level comments (no parent)
      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where: {
            postId,
            parentId: null
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profileImage: true
              }
            },
            post: {
              select: {
                id: true,
                title: true
              }
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    profileImage: true
                  }
                },
                parent: {
                  select: {
                    id: true,
                    author: {
                      select: {
                        firstName: true,
                        lastName: true
                      }
                    }
                  }
                },
                _count: {
                  select: {
                    replies: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            },
            _count: {
              select: {
                replies: true
              }
            }
          }
        }),
        prisma.comment.count({
          where: {
            postId,
            parentId: null
          }
        })
      ]);

      // Get user's likes if authenticated
      let userLikes: string[] = [];
      if (userId) {
        const likes = await prisma.like.findMany({
          where: {
            userId,
            commentId: { not: null }
          },
          select: { commentId: true }
        });
        userLikes = likes.map(like => like.commentId).filter(Boolean) as string[];
      }

      // Format comments with nested structure
      const formattedComments: CommentWithReplies[] = comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        post: comment.post,
        replies: comment.replies.map(reply => ({
          id: reply.id,
          content: reply.content,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: reply.author,
          post: comment.post,
          parent: reply.parent,
          replies: [], // Replies to replies not included for simplicity
          _count: reply._count,
          isLiked: userLikes.includes(reply.id),
          canEdit: userId === reply.author.id,
          canDelete: userId === reply.author.id
        })),
        _count: comment._count,
        isLiked: userLikes.includes(comment.id),
        canEdit: userId === comment.author.id,
        canDelete: userId === comment.author.id
      }));

      logger.info('Post comments retrieved', { 
        postId, 
        commentsCount: formattedComments.length,
        userId 
      });

      return {
        comments: formattedComments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get post comments', { postId, userId, error });
      throw error;
    }
  }

  /**
   * Create a new comment
   */
  static async createComment(
    data: CreateCommentData,
    userId: string
  ): Promise<CommentWithReplies> {
    try {
      // Validate content
      if (!data.content || data.content.trim().length === 0) {
        throw new ValidationError('Comment content is required');
      }

      if (data.content.length > 2000) {
        throw new ValidationError('Comment content must not exceed 2000 characters');
      }

      // Verify post exists
      const post = await prisma.post.findUnique({
        where: { id: data.postId },
        select: { id: true, title: true, status: true }
      });

      if (!post) {
        throw new NotFoundError('Post not found');
      }

      if (post.status !== 'PUBLISHED') {
        throw new ForbiddenError('Cannot comment on unpublished posts');
      }

      // If replying to a comment, verify parent exists
      if (data.parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { id: data.parentId },
          select: { id: true, postId: true }
        });

        if (!parentComment) {
          throw new NotFoundError('Parent comment not found');
        }

        if (parentComment.postId !== data.postId) {
          throw new ValidationError('Parent comment must belong to the same post');
        }
      }

      // Create comment
      const comment = await prisma.comment.create({
        data: {
          content: data.content.trim(),
          postId: data.postId,
          parentId: data.parentId,
          authorId: userId
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              profileImage: true
            }
          },
          post: {
            select: {
              id: true,
              title: true
            }
          },
          parent: {
            select: {
              id: true,
              author: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          _count: {
            select: {
              replies: true
            }
          }
        }
      });

      logger.info('Comment created', { 
        commentId: comment.id, 
        postId: data.postId, 
        userId,
        isReply: !!data.parentId 
      });

      return {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        post: comment.post,
        parent: comment.parent,
        replies: [],
        _count: comment._count,
        isLiked: false,
        canEdit: true,
        canDelete: true
      };
    } catch (error) {
      logger.error('Failed to create comment', { data, userId, error });
      throw error;
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(
    commentId: string,
    data: UpdateCommentData,
    userId: string
  ): Promise<CommentWithReplies> {
    try {
      // Validate content
      if (!data.content || data.content.trim().length === 0) {
        throw new ValidationError('Comment content is required');
      }

      if (data.content.length > 2000) {
        throw new ValidationError('Comment content must not exceed 2000 characters');
      }

      // Find comment and verify ownership
      const existingComment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, createdAt: true }
      });

      if (!existingComment) {
        throw new NotFoundError('Comment not found');
      }

      if (existingComment.authorId !== userId) {
        throw new ForbiddenError('You can only edit your own comments');
      }

      // Check if comment is too old to edit (24 hours)
      const hoursSinceCreation = (Date.now() - existingComment.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        throw new ForbiddenError('Comments can only be edited within 24 hours of creation');
      }

      // Update comment
      const updatedComment = await prisma.comment.update({
        where: { id: commentId },
        data: {
          content: data.content.trim(),
          updatedAt: new Date()
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              profileImage: true
            }
          },
          post: {
            select: {
              id: true,
              title: true
            }
          },
          parent: {
            select: {
              id: true,
              author: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          _count: {
            select: {
              replies: true
            }
          }
        }
      });

      logger.info('Comment updated', { commentId, userId });

      return {
        id: updatedComment.id,
        content: updatedComment.content,
        createdAt: updatedComment.createdAt,
        updatedAt: updatedComment.updatedAt,
        author: updatedComment.author,
        post: updatedComment.post,
        parent: updatedComment.parent,
        replies: [],
        _count: updatedComment._count,
        canEdit: true,
        canDelete: true
      };
    } catch (error) {
      logger.error('Failed to update comment', { commentId, data, userId, error });
      throw error;
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      // Find comment and verify ownership
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { 
          id: true, 
          authorId: true, 
          _count: { 
            select: { replies: true } 
          } 
        }
      });

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      if (comment.authorId !== userId) {
        throw new ForbiddenError('You can only delete your own comments');
      }

      // If comment has replies, soft delete by updating content
      if (comment._count.replies > 0) {
        await prisma.comment.update({
          where: { id: commentId },
          data: {
            content: '[This comment has been deleted]',
            updatedAt: new Date()
          }
        });
        logger.info('Comment soft deleted (has replies)', { commentId, userId });
      } else {
        // Hard delete if no replies
        await prisma.comment.delete({
          where: { id: commentId }
        });
        logger.info('Comment hard deleted', { commentId, userId });
      }
    } catch (error) {
      logger.error('Failed to delete comment', { commentId, userId, error });
      throw error;
    }
  }

  /**
   * Toggle like on a comment
   */
  static async toggleCommentLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    try {
      // Verify comment exists
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { id: true }
      });

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      // Check if user already liked this comment
      const existingLike = await prisma.like.findFirst({
        where: {
          userId,
          commentId: commentId
        }
      });

      let isLiked: boolean;

      if (existingLike) {
        // Unlike
        await prisma.like.delete({
          where: { id: existingLike.id }
        });
        isLiked = false;
        logger.info('Comment unliked', { commentId, userId });
      } else {
        // Like
        await prisma.like.create({
          data: {
            userId,
            commentId: commentId
          }
        });
        isLiked = true;
        logger.info('Comment liked', { commentId, userId });
      }

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: { commentId: commentId }
      });

      return { isLiked, likeCount };
    } catch (error) {
      logger.error('Failed to toggle comment like', { commentId, userId, error });
      throw error;
    }
  }

  /**
   * Get comment by ID
   */
  static async getCommentById(
    commentId: string,
    userId?: string
  ): Promise<CommentWithReplies> {
    try {
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              profileImage: true
            }
          },
          post: {
            select: {
              id: true,
              title: true
            }
          },
          parent: {
            select: {
              id: true,
              author: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  profileImage: true
                }
              },
              _count: {
                select: {
                  replies: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          _count: {
            select: {
              replies: true
            }
          }
        }
      });

      if (!comment) {
        throw new NotFoundError('Comment not found');
      }

      // Check if user liked this comment
      let isLiked = false;
      if (userId) {
        const like = await prisma.like.findFirst({
          where: {
            userId,
            commentId: commentId
          }
        });
        isLiked = !!like;
      }

      return {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        post: comment.post,
        parent: comment.parent,
        replies: comment.replies.map(reply => ({
          id: reply.id,
          content: reply.content,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: reply.author,
          post: comment.post,
          replies: [],
          _count: reply._count,
          canEdit: userId === reply.author.id,
          canDelete: userId === reply.author.id
        })),
        _count: comment._count,
        isLiked,
        canEdit: userId === comment.author.id,
        canDelete: userId === comment.author.id
      };
    } catch (error) {
      logger.error('Failed to get comment by ID', { commentId, userId, error });
      throw error;
    }
  }
}

export class SocialInteractionService {
  /**
   * Toggle like on a post
   */
  static async togglePostLike(
    postId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    try {
      // Verify post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, status: true }
      });

      if (!post) {
        throw new NotFoundError('Post not found');
      }

      if (post.status !== 'PUBLISHED') {
        throw new ForbiddenError('Cannot like unpublished posts');
      }

      // Check if user already liked this post
      const existingLike = await prisma.like.findFirst({
        where: {
          userId,
          postId: postId
        }
      });

      let isLiked: boolean;

      if (existingLike) {
        // Unlike
        await prisma.like.delete({
          where: { id: existingLike.id }
        });
        isLiked = false;
        logger.info('Post unliked', { postId, userId });
      } else {
        // Like
        await prisma.like.create({
          data: {
            userId,
            postId: postId
          }
        });
        isLiked = true;
        logger.info('Post liked', { postId, userId });
      }

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: { postId: postId }
      });

      return { isLiked, likeCount };
    } catch (error) {
      logger.error('Failed to toggle post like', { postId, userId, error });
      throw error;
    }
  }

  /**
   * Share a post
   */
  static async sharePost(
    postId: string,
    userId: string,
    platform?: string
  ): Promise<{ shareCount: number }> {
    try {
      // Verify post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, status: true }
      });

      if (!post) {
        throw new NotFoundError('Post not found');
      }

      if (post.status !== 'PUBLISHED') {
        throw new ForbiddenError('Cannot share unpublished posts');
      }

      // Create share record
      await prisma.share.create({
        data: {
          userId,
          postId,
          platform: platform || 'internal'
        }
      });

      // Get updated share count
      const shareCount = await prisma.share.count({
        where: { postId }
      });

      logger.info('Post shared', { postId, userId, platform });

      return { shareCount };
    } catch (error) {
      logger.error('Failed to share post', { postId, userId, platform, error });
      throw error;
    }
  }

  /**
   * Get post engagement stats
   */
  static async getPostEngagement(postId: string, userId?: string): Promise<{
    likeCount: number;
    commentCount: number;
    shareCount: number;
    isLiked?: boolean;
    hasShared?: boolean;
  }> {
    try {
      const [likeCount, commentCount, shareCount, userLike, userShare] = await Promise.all([
        prisma.like.count({ where: { postId: postId } }),
        prisma.comment.count({ where: { postId } }),
        prisma.share.count({ where: { postId } }),
        userId ? prisma.like.findFirst({
          where: { userId, postId: postId }
        }) : null,
        userId ? prisma.share.findFirst({
          where: { userId, postId }
        }) : null
      ]);

      return {
        likeCount,
        commentCount,
        shareCount,
        isLiked: !!userLike,
        hasShared: !!userShare
      };
    } catch (error) {
      logger.error('Failed to get post engagement', { postId, userId, error });
      throw error;
    }
  }
}
