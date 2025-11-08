import { prisma } from '@/database/connection';
import { PostStatus, PostVisibility, UserRole } from '@prisma/client';
import { logger } from '@/utils/logger';

interface PaginationOptions {
  page: number;
  limit: number;
}

interface PostFilters {
  category?: string;
  level?: string;
  status?: string;
  search?: string;
  authorId?: string;
}

interface SortOptions {
  sortBy: string;
  sortOrder: string;
}

interface UserPostFilters {
  status?: string;
}

interface SearchFilters {
  category?: string;
  level?: string;
  author?: string;
}

export class PostService {
  /**
   * Get all posts with filtering and pagination
   */
  static async getAllPosts(
    pagination: PaginationOptions,
    filters: PostFilters,
    sort: SortOptions
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      status: PostStatus.PUBLISHED,
      visibility: PostVisibility.PUBLIC
    };

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.level) {
      where.level = filters.level;
    }

    if (filters.authorId) {
      where.authorId = filters.authorId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
        { excerpt: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const orderBy: any = {};
    orderBy[sort.sortBy] = sort.sortOrder;

    // Query posts with author and counts - handle missing relations gracefully
    let posts: any[] = []
    let total = 0
    
    try {
      [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
                role: true,
                profileImage: true,
                profilePicture: true,
                email: true
            }
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              shares: true
            }
          }
        }
        }).catch(async (error: any) => {
          // If _count fails, try without it
          logger.warn('Failed to fetch posts with _count, trying without', { error: error.message });
          return await prisma.post.findMany({
            where,
            skip,
            take: limit,
            orderBy,
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  profileImage: true,
                  profilePicture: true,
                  email: true
                }
              }
            }
          }).then(posts => posts.map(post => ({
            ...post,
            _count: {
              likes: 0,
              comments: 0,
              shares: 0
            }
          })));
        }),
        prisma.post.count({ where }).catch(() => 0)
      ]);
    } catch (error: any) {
      logger.error('Failed to fetch posts', { error: error.message });
      // Return empty results on error
      posts = []
      total = 0
    }

    // Map posts to include counts from _count field and format properly
    const formattedPosts = posts.map(post => ({
      ...post,
      likes: post._count?.likes || 0,
      comments: post._count?.comments || 0,
      shares: post._count?.shares || 0,
      views: post.viewCount || 0,
      images: post.media ? [post.media] : []
    }));

    return {
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get post by ID
   */
  static async getPostById(postId: string, userId?: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            _count: {
              select: {
                replies: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            shares: true
          }
        }
      }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user can view this post
    if (post.visibility === PostVisibility.PRIVATE && post.authorId !== userId) {
      throw new Error('Access denied');
    }

    // Increment view count
    await prisma.post.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } }
    });

    // Check if user has liked this post
    let userLiked = false;
    if (userId) {
      const like = await prisma.like.findFirst({
        where: {
          userId,
          postId: postId
        }
      });
      userLiked = !!like;
    }

    return {
      ...post,
      userLiked
    };
  }

  /**
   * Create new post
   */
  static async createPost(authorId: string, postData: any) {
    const post = await prisma.post.create({
      data: {
        title: postData.title,
        content: postData.content,
        excerpt: postData.excerpt,
        media: postData.media,
        visibility: postData.visibility || PostVisibility.PUBLIC,
        status: postData.status || PostStatus.DRAFT,
        authorId,
        category: postData.category,
        tags: postData.tags || [],
        objectives: postData.objectives || [],
        keyPoints: postData.keyPoints || [],
        level: postData.level,
        targetTier: postData.targetTier || 'FREE',
        scheduledAt: postData.scheduledAt ? new Date(postData.scheduledAt) : null
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    // If post is published immediately, set publishedAt
    if (post.status === PostStatus.PUBLISHED) {
      await prisma.post.update({
        where: { id: post.id },
        data: { publishedAt: new Date() }
      });
    }

    return post;
  }

  /**
   * Update post
   */
  static async updatePost(postId: string, userId: string, updateData: any) {
    // Check if user owns the post or has permission to edit
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: true
      }
    });

    if (!existingPost) {
      throw new Error('Post not found');
    }

    // Check permissions
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const canEdit = existingPost.authorId === userId || 
                   user?.role === UserRole.ADMIN || 
                   user?.role === UserRole.SENIOR_MANAGER;

    if (!canEdit) {
      throw new Error('Access denied');
    }

    const post = await prisma.post.update({
      where: { id: postId },
      data: {
        ...updateData,
        updatedAt: new Date(),
        ...(updateData.status === PostStatus.PUBLISHED && !existingPost.publishedAt && {
          publishedAt: new Date()
        })
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    return post;
  }

  /**
   * Delete post
   */
  static async deletePost(postId: string, userId: string) {
    const existingPost = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!existingPost) {
      throw new Error('Post not found');
    }

    // Check permissions
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const canDelete = existingPost.authorId === userId || 
                     user?.role === UserRole.ADMIN || 
                     user?.role === UserRole.SENIOR_MANAGER;

    if (!canDelete) {
      throw new Error('Access denied');
    }

    await prisma.post.delete({
      where: { id: postId }
    });
  }

  /**
   * Toggle like on post
   */
  static async toggleLike(postId: string, userId: string) {
    try {
      // Check if user already liked this post
    const existingLike = await prisma.like.findFirst({
      where: {
        userId,
          postId: postId
      }
    });

    let liked = false;
    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      liked = false;
        logger.info('Post unliked', { postId, userId });
    } else {
      // Like
      await prisma.like.create({
        data: {
          userId,
            postId: postId
        }
      });
      liked = true;
        logger.info('Post liked', { postId, userId });
    }

    // Get updated like count
    const likeCount = await prisma.like.count({
        where: { postId: postId }
    });

    return { liked, likeCount };
    } catch (error: any) {
      logger.error('Failed to toggle post like', { postId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Add comment to post
   */
  static async addComment(postId: string, userId: string, content: string, parentId?: string) {
    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // If parentId is provided, verify parent comment exists
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId }
      });

      if (!parentComment || parentComment.postId !== postId) {
        throw new Error('Parent comment not found');
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        postId,
        authorId: userId,
        parentId
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            profilePicture: true,
            role: true
          }
        },
        _count: {
          select: {
            replies: true
          }
        }
      }
    });

    return comment;
  }

  /**
   * Get post comments
   */
  static async getComments(postId: string, pagination: PaginationOptions) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: {
          postId,
          parentId: null // Only top-level comments
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
              email: true,
              profileImage: true,
              profilePicture: true,
              role: true
            }
          },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  profileImage: true,
                  profilePicture: true,
                  role: true
                }
              }
            },
            orderBy: { createdAt: 'asc' },
            take: 5
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

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Share post
   */
  static async sharePost(postId: string, userId: string, platform?: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    const share = await prisma.share.create({
      data: {
        userId,
        postId,
        platform
      }
    });

    return share;
  }

  /**
   * Get post analytics
   */
  static async getPostAnalytics(postId: string, userId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Check if user owns the post or has permission
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const canViewAnalytics = post.authorId === userId ||
                            user?.role === UserRole.ADMIN ||
                            user?.role === UserRole.SENIOR_MANAGER;

    if (!canViewAnalytics) {
      throw new Error('Access denied');
    }

    const [likes, comments, shares, views] = await Promise.all([
      prisma.like.count({ where: { postId: postId } }),
      prisma.comment.count({ where: { postId } }),
      prisma.share.count({ where: { postId } }),
      post.viewCount
    ]);

    return {
      postId,
      views,
      likes,
      comments,
      shares,
      engagement: likes + comments + shares,
      engagementRate: views > 0 ? ((likes + comments + shares) / views) * 100 : 0
    };
  }

  /**
   * Get user's posts
   */
  static async getUserPosts(
    userId: string,
    pagination: PaginationOptions,
    filters: UserPostFilters
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { authorId: userId };

    if (filters.status) {
      where.status = filters.status;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              likes: true,
              comments: true,
              shares: true
            }
          }
        }
      }),
      prisma.post.count({ where })
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get trending posts
   */
  static async getTrendingPosts(limit: number, timeframe: string) {
    const startDate = this.getStartDate(timeframe);

    // Get posts with high engagement in the timeframe
    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        publishedAt: {
          gte: startDate
        }
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            shares: true
          }
        }
      },
      take: limit * 2 // Get more to sort by engagement
    });

    // Sort by engagement score
    const postsWithScore = posts.map(post => ({
      ...post,
      engagementScore: (post._count.likes * 1) + (post._count.comments * 2) + (post._count.shares * 3) + (post.viewCount * 0.1)
    }));

    return postsWithScore
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);
  }

  /**
   * Search posts
   */
  static async searchPosts(
    query: string,
    pagination: PaginationOptions,
    filters: SearchFilters
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      status: PostStatus.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
        { excerpt: { contains: query, mode: 'insensitive' } },
        { tags: { has: query } }
      ]
    };

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.level) {
      where.level = filters.level;
    }

    if (filters.author) {
      where.author = {
        OR: [
          { firstName: { contains: filters.author, mode: 'insensitive' } },
          { lastName: { contains: filters.author, mode: 'insensitive' } }
        ]
      };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              shares: true
            }
          }
        }
      }),
      prisma.post.count({ where })
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Helper methods
  private static getStartDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '1d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }
}
