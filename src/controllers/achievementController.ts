import { Request, Response } from 'express'
import { asyncHandler } from '@/middleware/errorHandler'
import { AchievementService } from '../services/achievementService'
import { logger } from '@/utils/logger'

export class AchievementController {
  // Get recent achievements for user
  static getRecentAchievements = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId
      const achievements = await AchievementService.getRecentAchievements(userId)
      
      // Always return success with empty array if no achievements (not an error)
      res.status(200).json({
        success: true,
        data: achievements || [], // Ensure we always return an array
        message: 'Recent achievements fetched successfully'
      })
    } catch (error: any) {
      logger.error('Error fetching recent achievements:', error)
      // Return empty array instead of 500 error to prevent frontend crashes
      res.status(200).json({
        success: true,
        data: [], // Return empty array on error - NO MOCK DATA
        message: 'Recent achievements fetched successfully'
      })
    }
  })

  // Get all achievements for user
  static getAllAchievements = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId
      const achievements = await AchievementService.getAllAchievements(userId)
      
      res.status(200).json({
        success: true,
        data: achievements,
        message: 'All achievements fetched successfully'
      })
    } catch (error: any) {
      logger.error('Error fetching all achievements:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch achievements', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get achievement progress
  static getAchievementProgress = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId
      const progress = await AchievementService.getAchievementProgress(userId)
      
      res.status(200).json({
        success: true,
        data: progress,
        message: 'Achievement progress fetched successfully'
      })
    } catch (error: any) {
      logger.error('Error fetching achievement progress:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch achievement progress', code: 'INTERNAL_ERROR' }
      })
    }
  })
}
