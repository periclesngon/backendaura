import { Request, Response } from 'express';
import { FavoriteService } from '@/services/favoriteService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import { logger } from '@/utils/logger';

export class FavoriteController {
  /**
   * Get user's favorites
   */
  static getFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const contentType = req.query.contentType as string;
    const folder = req.query.folder as string;
    const search = req.query.search as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const filters = {
      contentType,
      folder,
      search
    };

    const result = await FavoriteService.getFavorites(userId, { page, limit }, filters);

    const response: ApiResponse = {
      success: true,
      data: {
        favorites: result.favorites,
        pagination: result.pagination
      },
      message: 'Favorites retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Add item to favorites
   */
  static addToFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { contentId, contentType, folder, tags, notes } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const favorite = await FavoriteService.addToFavorites(userId, {
      contentId,
      contentType,
      folder,
      tags,
      notes
    });

    const response: ApiResponse = {
      success: true,
      data: { favorite },
      message: 'Item added to favorites successfully'
    };

    logger.info('Item added to favorites', { userId, contentId, contentType });

    res.status(201).json(response);
  });

  /**
   * Remove from favorites
   */
  static removeFromFavorites = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { favoriteId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await FavoriteService.removeFromFavorites(favoriteId, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Item removed from favorites successfully'
    };

    logger.info('Item removed from favorites', { favoriteId, userId });

    res.status(200).json(response);
  });

  /**
   * Update favorite
   */
  static updateFavorite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { favoriteId } = req.params;
    const userId = req.user?.userId;
    const updateData = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const favorite = await FavoriteService.updateFavorite(favoriteId, userId, updateData);

    const response: ApiResponse = {
      success: true,
      data: { favorite },
      message: 'Favorite updated successfully'
    };

    logger.info('Favorite updated', { favoriteId, userId });

    res.status(200).json(response);
  });

  /**
   * Get favorite folders
   */
  static getFolders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const folders = await FavoriteService.getFolders(userId);

    const response: ApiResponse = {
      success: true,
      data: { folders },
      message: 'Favorite folders retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create favorite folder
   */
  static createFolder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { name, description, color } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const folder = await FavoriteService.createFolder(userId, { name, description, color });

    const response: ApiResponse = {
      success: true,
      data: { folder },
      message: 'Favorite folder created successfully'
    };

    logger.info('Favorite folder created', { userId, folderName: name });

    res.status(201).json(response);
  });

  /**
   * Update favorite folder
   */
  static updateFolder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { folderId } = req.params;
    const userId = req.user?.userId;
    const updateData = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const folder = await FavoriteService.updateFolder(folderId, userId, updateData);

    const response: ApiResponse = {
      success: true,
      data: { folder },
      message: 'Favorite folder updated successfully'
    };

    logger.info('Favorite folder updated', { folderId, userId });

    res.status(200).json(response);
  });

  /**
   * Delete favorite folder
   */
  static deleteFolder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { folderId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await FavoriteService.deleteFolder(folderId, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Favorite folder deleted successfully'
    };

    logger.info('Favorite folder deleted', { folderId, userId });

    res.status(200).json(response);
  });

  /**
   * Check if item is favorited
   */
  static checkFavorite = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { contentId, contentType } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    if (!contentId || !contentType) {
      res.status(400).json({
        success: false,
        error: { message: 'contentId and contentType are required' }
      });
      return;
    }

    const isFavorited = await FavoriteService.checkFavorite(
      userId,
      contentId as string,
      contentType as string
    );

    const response: ApiResponse = {
      success: true,
      data: { isFavorited },
      message: 'Favorite status checked successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get favorite statistics
   */
  static getFavoriteStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const stats = await FavoriteService.getFavoriteStats(userId);

    const response: ApiResponse = {
      success: true,
      data: stats,
      message: 'Favorite statistics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Bulk operations on favorites
   */
  static bulkOperation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { operation, favoriteIds, targetFolder } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await FavoriteService.bulkOperation(userId, operation, favoriteIds, targetFolder);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Bulk ${operation} completed successfully`
    };

    logger.info('Bulk favorite operation', { userId, operation, count: favoriteIds.length });

    res.status(200).json(response);
  });
}
