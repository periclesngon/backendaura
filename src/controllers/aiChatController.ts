import { Request, Response } from 'express'
import { asyncHandler } from '@/middleware/errorHandler'
import { AiChatService } from '../services/aiChatService'
import { logger } from '@/utils/logger'

export class AiChatController {
  // Send message to AI assistant
  static sendMessage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { message, chatId, context } = req.body
      const userId = req.user!.userId

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'Message is required', code: 'INVALID_INPUT' }
        })
        return
      }

      const response = await AiChatService.sendMessage(userId, message, chatId, context || {})
      
      res.status(200).json({
        success: true,
        data: response,
        message: 'Message sent successfully'
      })
    } catch (error: any) {
      logger.error('Error sending AI message:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to send message', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get chat history
  static getChatHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId
      const limit = parseInt(req.query.limit as string) || 10

      const history = await AiChatService.getChatHistory(userId, limit)
      
      res.status(200).json({
        success: true,
        data: history,
        message: 'Chat history fetched successfully'
      })
    } catch (error: any) {
      logger.error('Error getting chat history:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch chat history', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Get specific chat session
  static getChatSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params
      const userId = req.user!.userId

      const session = await AiChatService.getChatSession(chatId, userId)
      
      if (!session) {
        res.status(404).json({
          success: false,
          error: { message: 'Chat session not found', code: 'NOT_FOUND' }
        })
        return
      }

      res.status(200).json({
        success: true,
        data: session,
        message: 'Chat session fetched successfully'
      })
    } catch (error: any) {
      logger.error('Error getting chat session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch chat session', code: 'INTERNAL_ERROR' }
      })
    }
  })

  // Delete chat session
  static deleteChatSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params
      const userId = req.user!.userId

      await AiChatService.deleteChatSession(chatId, userId)
      
      res.status(200).json({
        success: true,
        message: 'Chat session deleted successfully'
      })
    } catch (error: any) {
      logger.error('Error deleting chat session:', error)
      res.status(500).json({
        success: false,
        error: { message: 'Failed to delete chat session', code: 'INTERNAL_ERROR' }
      })
    }
  })
}