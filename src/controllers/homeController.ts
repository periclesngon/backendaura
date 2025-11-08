import { Request, Response } from 'express'
import { HomeService } from '../services/homeService'
import { asyncHandler } from '@/middleware/errorHandler'
import { logger } from '../utils/logger'

export class HomeController {
  // Get comprehensive dashboard data
  static getDashboardData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const dashboardData = await HomeService.getDashboardData(userId)
      
      res.status(200).json({
        success: true,
        data: dashboardData
      })
    } catch (error: any) {
      logger.error('Error fetching dashboard data:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch dashboard data', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get AI-generated messages
  static getAIMessages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const aiMessages = await HomeService.getAIMessages(userId)
      
      res.status(200).json({
        success: true,
        data: aiMessages
      })
    } catch (error: any) {
      logger.error('Error fetching AI messages:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch AI messages', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get study session data
  static getStudySession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const studySession = await HomeService.getStudySessionData(userId)
      
      res.status(200).json({
        success: true,
        data: studySession
      })
    } catch (error: any) {
      logger.error('Error fetching study session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch study session', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Start study session
  static startStudySession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const { targetTime } = req.body // Get target time from request body
      const result = await HomeService.startStudySession(userId, targetTime)
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Study session started successfully'
      })
    } catch (error: any) {
      logger.error('Error starting study session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to start study session', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Stop study session
  static stopStudySession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const result = await HomeService.stopStudySession(userId)
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Study session stopped successfully'
      })
    } catch (error: any) {
      logger.error('Error stopping study session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to stop study session', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Reset study session
  static resetStudySession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const result = await HomeService.resetStudySession(userId)
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Study session reset successfully'
      })
    } catch (error: any) {
      logger.error('Error resetting study session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to reset study session', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get days on platform
  static getDaysOnPlatform = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const daysOnPlatform = await HomeService.getDaysOnPlatform(userId)
      
      res.status(200).json({
        success: true,
        data: { daysOnPlatform }
      })
    } catch (error: any) {
      logger.error('Error fetching days on platform:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch days on platform', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get regional time
  static getRegionalTime = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { message: 'User not authenticated', code: 'AUTHENTICATION_ERROR' }
        })
        return
      }

      const regionalTime = await HomeService.getRegionalTimeData(userId)
      
      res.status(200).json({
        success: true,
        data: regionalTime
      })
    } catch (error: any) {
      logger.error('Error fetching regional time:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch regional time', code: 'INTERNAL_ERROR' }
      })
    }
  })
}
