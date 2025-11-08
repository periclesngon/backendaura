import { Router } from 'express'
import { AiChatController } from '../controllers/aiChatController'
import { AiChatService } from '../services/aiChatService'

import { authenticate, authorize } from '@/middleware/auth'
import { UserRole } from '@prisma/client'

const router = Router()

// Send message to AI assistant
router.post('/message', authenticate, authorize(UserRole.STUDENT), AiChatController.sendMessage)

// Get chat history
router.get('/history', authenticate, authorize(UserRole.STUDENT), AiChatController.getChatHistory)

// Get specific chat session
router.get('/session/:chatId', authenticate, authorize(UserRole.STUDENT), AiChatController.getChatSession)

// Delete chat session
router.delete('/session/:chatId', authenticate, authorize(UserRole.STUDENT), AiChatController.deleteChatSession)

// Test endpoint (no auth for debugging)
router.post('/test', async (req, res) => {
  try {
    const { message } = req.body
    
    // Use real Gemini API service
    const { AIService } = await import('../services/aiService')
    const response = await AIService.generateResponse({
      message,
      systemPrompt: "Tu es un assistant IA pour Aura.ca, une plateforme d'apprentissage du français. Réponds de manière utile et engageante.",
      context: {
        userLevel: 'BASIC',
        language: 'fr',
        relevantQuestions: [],
        conversationHistory: []
      }
    })
    
    res.json({ success: true, data: { message: response.content, confidence: response.confidence } })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET test endpoint for debugging
router.get('/test', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: "AI Chat service is working",
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router