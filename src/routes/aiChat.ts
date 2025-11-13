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

// Get API status and usage
router.get('/api-status', authenticate, async (req, res) => {
  try {
    const mistralApiManager = require('../utils/mistralApiManager')
    const usageStatus = mistralApiManager.getUsageStatus()
    
    // Get model name from the manager
    const modelName = 'mistral-small-latest' // Mistral AI free tier model
    
    // Check if API keys are available
    const hasApiKeys = usageStatus.length > 0
    const availableKeys = usageStatus.filter(key => key.available).length
    const totalKeys = usageStatus.length
    
    // Test API key by making a simple request
    let apiTestResult = null
    try {
      const testResponse = await mistralApiManager.generateContent('Test', {
        maxTokens: 10
      })
      apiTestResult = {
        working: true,
        message: 'API key is working'
      }
    } catch (testError: any) {
      apiTestResult = {
        working: false,
        error: testError.message || 'API test failed',
        status: testError.status || testError.statusCode || testError.code,
        details: {
          message: testError.message,
          status: testError.status || testError.statusCode,
          code: testError.code
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        modelName,
        hasApiKeys,
        totalKeys,
        availableKeys,
        usageStatus,
        status: availableKeys > 0 ? 'active' : 'exhausted',
        apiTest: apiTestResult
      }
    })
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: { message: error.message || 'Failed to get API status' }
    })
  }
})

export default router