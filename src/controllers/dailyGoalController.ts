import { Request, Response } from 'express'
import { asyncHandler } from '@/middleware/errorHandler'
import { DailyGoalService } from '../services/dailyGoalService'
import { logger } from '@/utils/logger'

export class DailyGoalController {
  /**
   * Get today's daily goal
   */
  static getTodayGoal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      })
      return
    }

    try {
      const goal = await DailyGoalService.getTodayGoal(userId)

      res.status(200).json({
        success: true,
        data: goal || null,
        message: goal ? 'Daily goal retrieved successfully' : 'No daily goal set for today'
      })
    } catch (error: any) {
      logger.error('Error getting today goal:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to get daily goal' }
      })
    }
  })

  /**
   * Create or update daily goal
   */
  static setDailyGoal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      })
      return
    }

    const { title, description, targetValue, unit, xpReward } = req.body

    if (!title || !targetValue) {
      res.status(400).json({
        success: false,
        error: { message: 'Title and targetValue are required' }
      })
      return
    }

    try {
      const goal = await DailyGoalService.setDailyGoal(userId, {
        title,
        description,
        targetValue: parseInt(targetValue),
        unit,
        xpReward: xpReward ? parseInt(xpReward) : undefined
      })

      res.status(200).json({
        success: true,
        data: goal,
        message: 'Daily goal set successfully'
      })
    } catch (error: any) {
      logger.error('Error setting daily goal:', error)
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to set daily goal' }
      })
    }
  })

  /**
   * Update goal progress
   */
  static updateProgress = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      })
      return
    }

    const { progressValue } = req.body

    if (progressValue === undefined || progressValue < 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Valid progressValue is required' }
      })
      return
    }

    try {
      const goal = await DailyGoalService.updateProgress(userId, parseFloat(progressValue))

      if (!goal) {
        res.status(404).json({
          success: false,
          error: { message: 'No daily goal found for today' }
        })
        return
      }

      res.status(200).json({
        success: true,
        data: goal,
        message: 'Progress updated successfully'
      })
    } catch (error: any) {
      logger.error('Error updating progress:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to update progress' }
      })
    }
  })

  /**
   * Complete daily goal
   */
  static completeGoal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId || req.user?.id

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      })
      return
    }

    try {
      const goal = await DailyGoalService.completeGoal(userId)

      res.status(200).json({
        success: true,
        data: goal,
        message: 'Daily goal completed! XP awarded.'
      })
    } catch (error: any) {
      logger.error('Error completing goal:', error)
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to complete goal' }
      })
    }
  })
}

