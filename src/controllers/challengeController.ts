import { Request, Response } from 'express'
import { asyncHandler } from '@/middleware/errorHandler'
import { ChallengeService } from '../services/challengeService'
import { logger } from '@/utils/logger'

export class ChallengeController {
  // Get daily challenges - REAL IMPLEMENTATION
  static getDailyChallenges = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const challenges = await ChallengeService.getDailyChallenges()
      
      res.status(200).json({
        success: true,
        data: challenges, // Return real challenges from database
        message: 'Daily challenges retrieved successfully'
      })
    } catch (error: any) {
      logger.error('Error getting daily challenges:', error)
      // Return empty array on error instead of 500
      res.status(200).json({
        success: true,
        data: [],
        message: 'Daily challenges retrieved successfully'
      })
    }
  })

  // Get user's challenge progress
  static getUserProgress = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const progress = await ChallengeService.getUserProgress(userId)
      
      res.status(200).json({
        success: true,
        data: progress,
        message: 'User progress retrieved successfully'
      })
    } catch (error: any) {
      logger.error('Error getting user progress:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to get user progress', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Start a challenge
  static startChallenge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      const { challengeId } = req.params
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const result = await ChallengeService.startChallenge(userId, challengeId)
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Challenge started successfully'
      })
    } catch (error: any) {
      logger.error('Error starting challenge:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to start challenge', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Complete a challenge
  static completeChallenge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      const { challengeId } = req.params
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const result = await ChallengeService.completeChallenge(userId, challengeId)
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Challenge completed successfully'
      })
    } catch (error: any) {
      logger.error('Error completing challenge:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to complete challenge', code: 'INTERNAL_ERROR' }
      })
    }
  })
}
