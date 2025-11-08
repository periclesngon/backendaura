import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';

export enum LikeType {
  POST = 'POST',
  COMMENT = 'COMMENT'
}

export class LikeService {
  // Like a post or comment
  async likeContent(
    userId: string,
    contentId: string,
    contentType: LikeType
  ): Promise<{ success: boolean; liked: boolean; likeCount: number }> {
    try {
      // Map contentId and contentType to postId or commentId
      const whereCondition: any = { userId };
      
      if (contentType === LikeType.POST) {
        whereCondition.postId = contentId;
      } else if (contentType === LikeType.COMMENT) {
        whereCondition.commentId = contentId;
      } else {
        throw new Error(`Invalid contentType: ${contentType}`);
      }

      // Check if user already liked this content
      const existingLike = await prisma.like.findFirst({
        where: whereCondition
      });

      if (existingLike) {
        // Unlike the content
        await prisma.like.delete({
          where: {
            id: existingLike.id
          }
        });

        // Get updated like count
        const countWhere: any = {};
        if (contentType === LikeType.POST) {
          countWhere.postId = contentId;
        } else {
          countWhere.commentId = contentId;
        }
        
        const likeCount = await prisma.like.count({
          where: countWhere
        });

        logger.info('Content unliked', { userId, contentId, contentType, likeCount });
        return { success: true, liked: false, likeCount };
      } else {
        // Like the content
        const createData: any = {
          userId
        };
        
        if (contentType === LikeType.POST) {
          createData.postId = contentId;
        } else {
          createData.commentId = contentId;
        }
        
        await prisma.like.create({
          data: createData
        });

        // Get updated like count
        const countWhere: any = {};
        if (contentType === LikeType.POST) {
          countWhere.postId = contentId;
        } else {
          countWhere.commentId = contentId;
        }
        
        const likeCount = await prisma.like.count({
          where: countWhere
        });

        logger.info('Content liked', { userId, contentId, contentType, likeCount });
        return { success: true, liked: true, likeCount };
      }
    } catch (error) {
      logger.error('Error liking content:', error);
      throw error;
    }
  }

  // Get like status for a user and content
  async getLikeStatus(
    userId: string,
    contentId: string,
    contentType: LikeType
  ): Promise<{ liked: boolean; likeCount: number }> {
    try {
      const whereCondition: any = { userId };
      
      if (contentType === LikeType.POST) {
        whereCondition.postId = contentId;
      } else {
        whereCondition.commentId = contentId;
      }

      const countWhere: any = {};
      if (contentType === LikeType.POST) {
        countWhere.postId = contentId;
      } else {
        countWhere.commentId = contentId;
      }

      const [liked, likeCount] = await Promise.all([
        prisma.like.findFirst({
          where: whereCondition
        }),
        prisma.like.count({
          where: countWhere
        })
      ]);

      return {
        liked: !!liked,
        likeCount
      };
    } catch (error) {
      logger.error('Error getting like status:', error);
      throw error;
    }
  }

  // Get all likes for a content
  async getContentLikes(
    contentId: string,
    contentType: LikeType,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    
    const whereCondition: any = {};
    if (contentType === LikeType.POST) {
      whereCondition.postId = contentId;
    } else {
      whereCondition.commentId = contentId;
    }

    const [likes, total] = await Promise.all([
      prisma.like.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.like.count({
        where: whereCondition
      })
    ]);

    return {
      likes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get user's liked content
  async getUserLikes(
    userId: string,
    contentType?: LikeType,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    const where: any = { userId };

    // Filter by contentType if provided
    if (contentType === LikeType.POST) {
      where.postId = { not: null };
    } else if (contentType === LikeType.COMMENT) {
      where.commentId = { not: null };
    }

    const [likes, total] = await Promise.all([
      prisma.like.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true
            }
          },
          post: contentType === LikeType.POST ? {
            select: {
              id: true,
              title: true,
              excerpt: true
            }
          } : undefined
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.like.count({ where })
    ]);

    return {
      likes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get like statistics
  async getLikeStats(contentId: string, contentType: LikeType) {
    const countWhere: any = {};
    if (contentType === LikeType.POST) {
      countWhere.postId = contentId;
    } else {
      countWhere.commentId = contentId;
    }

    const [totalLikes, recentLikes] = await Promise.all([
      prisma.like.count({
        where: countWhere
      }),
      prisma.like.count({
        where: {
          ...countWhere,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      })
    ]);

    return {
      totalLikes,
      recentLikes,
      engagement: recentLikes > 0 ? 'high' : totalLikes > 10 ? 'medium' : 'low'
    };
  }
}

export default new LikeService();
