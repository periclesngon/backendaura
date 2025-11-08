import { prisma } from '@/database/connection';
import { ContentType } from '@prisma/client';

interface PaginationOptions {
  page: number;
  limit: number;
}

interface FavoriteFilters {
  contentType?: string;
  folder?: string;
  search?: string;
}

interface AddFavoriteData {
  contentId: string;
  contentType: ContentType;
  folder?: string;
  tags?: string[];
  notes?: string;
}

interface FolderData {
  name: string;
  description?: string;
  color?: string;
}

export class FavoriteService {
  /**
   * Get user's favorites
   */
  static async getFavorites(
    userId: string,
    pagination: PaginationOptions,
    filters: FavoriteFilters
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (filters.contentType) {
      where.contentType = filters.contentType;
    }

    if (filters.folder) {
      where.folder = filters.folder;
    }

    if (filters.search) {
      where.OR = [
        { notes: { contains: filters.search, mode: 'insensitive' } },
        { tags: { has: filters.search } }
      ];
    }

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Note: Favorite model doesn't have direct relations to content
        // Content details will be fetched separately based on contentType and contentId
      }),
      prisma.favorite.count({ where })
    ]);

    console.log('🔍 FavoriteService.getFavorites:', {
      userId,
      filters,
      favoritesCount: favorites.length,
      total
    });

    return {
      favorites,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Add item to favorites
   */
  static async addToFavorites(userId: string, data: AddFavoriteData) {
    // Check if already favorited
    const existing = await prisma.favorite.findFirst({
      where: {
        userId,
        contentId: data.contentId,
        contentType: data.contentType
      }
    });

    if (existing) {
      throw new Error('Item is already in favorites');
    }

    // Verify content exists based on type
    await this.verifyContentExists(data.contentId, data.contentType);

    const favorite = await prisma.favorite.create({
      data: {
        userId,
        contentId: data.contentId,
        contentType: data.contentType,
        folder: data.folder,
        tags: data.tags || []
      },
      // Note: Favorite model doesn't have direct relations to content
      // Content details will be fetched separately based on contentType and contentId
    });

    return favorite;
  }

  /**
   * Remove from favorites
   */
  static async removeFromFavorites(favoriteId: string, userId: string) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        id: favoriteId,
        userId
      }
    });

    if (!favorite) {
      throw new Error('Favorite not found');
    }

    await prisma.favorite.delete({
      where: { id: favoriteId }
    });
  }

  /**
   * Update favorite
   */
  static async updateFavorite(favoriteId: string, userId: string, updateData: any) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        id: favoriteId,
        userId
      }
    });

    if (!favorite) {
      throw new Error('Favorite not found');
    }

    const updatedFavorite = await prisma.favorite.update({
      where: { id: favoriteId },
      data: {
        folder: updateData.folder,
        tags: updateData.tags
      }
    });

    return updatedFavorite;
  }

  /**
   * Get favorite folders
   */
  static async getFolders(userId: string) {
    const folders = await prisma.favorite.groupBy({
      by: ['folder'],
      where: {
        userId,
        folder: { not: null }
      },
      _count: {
        folder: true
      }
    });

    return folders.map(folder => ({
      name: folder.folder,
      count: folder._count.folder
    }));
  }

  /**
   * Create favorite folder (mock implementation)
   */
  static async createFolder(userId: string, data: FolderData) {
    // In a real implementation, you might have a separate FavoriteFolder table
    // For now, we'll just return the folder data
    return {
      id: `folder_${Date.now()}`,
      name: data.name,
      description: data.description,
      color: data.color,
      userId,
      createdAt: new Date()
    };
  }

  /**
   * Update favorite folder (mock implementation)
   */
  static async updateFolder(folderId: string, userId: string, updateData: any) {
    // Mock implementation
    return {
      id: folderId,
      ...updateData,
      userId,
      updatedAt: new Date()
    };
  }

  /**
   * Delete favorite folder
   */
  static async deleteFolder(folderId: string, userId: string) {
    // Remove folder from all favorites
    await prisma.favorite.updateMany({
      where: {
        userId,
        folder: folderId
      },
      data: {
        folder: null
      }
    });
  }

  /**
   * Check if item is favorited
   */
  static async checkFavorite(userId: string, contentId: string, contentType: string) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        userId,
        contentId,
        contentType: contentType as ContentType
      }
    });

    return !!favorite;
  }

  /**
   * Get favorite statistics
   */
  static async getFavoriteStats(userId: string) {
    const [
      totalFavorites,
      favoritesByType,
      favoritesByFolder,
      recentFavorites
    ] = await Promise.all([
      prisma.favorite.count({ where: { userId } }),
      
      prisma.favorite.groupBy({
        by: ['contentType'],
        where: { userId },
        _count: { contentType: true }
      }),
      
      prisma.favorite.groupBy({
        by: ['folder'],
        where: { userId, folder: { not: null } },
        _count: { folder: true }
      }),
      
      prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          contentType: true,
          createdAt: true
        }
      })
    ]);

    return {
      totalFavorites,
      favoritesByType: favoritesByType.map(item => ({
        type: item.contentType,
        count: item._count.contentType
      })),
      favoritesByFolder: favoritesByFolder.map(item => ({
        folder: item.folder,
        count: item._count.folder
      })),
      recentFavorites
    };
  }

  /**
   * Bulk operations on favorites
   */
  static async bulkOperation(
    userId: string,
    operation: string,
    favoriteIds: string[],
    targetFolder?: string
  ) {
    switch (operation) {
      case 'move':
        if (!targetFolder) {
          throw new Error('Target folder is required for move operation');
        }
        await prisma.favorite.updateMany({
          where: {
            id: { in: favoriteIds },
            userId
          },
          data: { folder: targetFolder }
        });
        return { moved: favoriteIds.length };

      case 'delete':
        const deleteResult = await prisma.favorite.deleteMany({
          where: {
            id: { in: favoriteIds },
            userId
          }
        });
        return { deleted: deleteResult.count };

      case 'removeFolder':
        await prisma.favorite.updateMany({
          where: {
            id: { in: favoriteIds },
            userId
          },
          data: { folder: null }
        });
        return { updated: favoriteIds.length };

      default:
        throw new Error('Invalid bulk operation');
    }
  }

  /**
   * Verify content exists
   */
  private static async verifyContentExists(contentId: string, contentType: ContentType) {
    try {
      switch (contentType) {
        case ContentType.COURSE:
          const course = await prisma.course.findUnique({ where: { id: contentId } });
          if (!course) throw new Error('Course not found');
          break;

        case ContentType.TEST:
          const test = await prisma.test.findUnique({ where: { id: contentId } });
          if (!test) throw new Error('Test not found');
          break;

        case ContentType.LIVE_SESSION:
          const liveSession = await prisma.liveSession.findUnique({ where: { id: contentId } });
          if (!liveSession) throw new Error('Live session not found');
          break;

        case ContentType.POST:
          const post = await prisma.post.findUnique({ where: { id: contentId } });
          if (!post) throw new Error('Post not found');
          break;

        default:
          // Allow unknown content types for flexibility
          break;
      }
    } catch (error: any) {
      // Log the error but don't throw - allow favorites for any content
      console.warn(`Content verification warning: ${error.message}`);
    }
  }
}
