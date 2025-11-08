import express from 'express';
import { authenticate } from '@/middleware/auth';
import { validate, aiAssistantSchemas } from '@/middleware/validation';
import { requestLogger, errorLogger } from '@/middleware/requestLogger';
import { FloatingAiAssistantService, AssistantContext } from '@/services/floatingAiAssistantService';
import { logger } from '@/utils/logger';

const router = express.Router();

/**
 * POST /api/floating-ai-assistant/chat
 * Get AI assistance based on context
 */
router.post('/chat',
  requestLogger,
  authenticate,
  validate(aiAssistantSchemas.chat),
  async (req, res) => {
  try {
    const { message, context } = req.body;
    const userId = req.user!.userId;

    // Validate required fields
    if (!message || !context) {
      return res.status(400).json({
        success: false,
        message: 'Message and context are required'
      });
    }

    // Validate context
    const assistantContext: AssistantContext = {
      page: context.page || 'general',
      userLevel: context.userLevel,
      simulationType: context.simulationType,
      country: context.country,
      immigrationType: context.immigrationType,
      language: context.language || 'fr'
    };

    // Get AI assistance
    const response = await FloatingAiAssistantService.getAssistance(
      userId,
      message,
      assistantContext
    );

    logger.info('AI Assistant chat request processed', {
      userId,
      page: assistantContext.page,
      messageLength: message.length
    });

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error in AI assistant chat:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/floating-ai-assistant/suggestions
 * Get quick help suggestions based on page context
 */
router.get('/suggestions',
  requestLogger,
  authenticate,
  validate({ query: aiAssistantSchemas.suggestions }),
  async (req, res) => {
  try {
    const { page, language = 'fr' } = req.query;

    const context: AssistantContext = {
      page: page as string || 'general',
      language: language as 'fr' | 'en'
    };

    const suggestions = FloatingAiAssistantService.getQuickSuggestions(context);

    res.json({
      success: true,
      data: {
        suggestions,
        page: context.page
      }
    });
  } catch (error) {
    logger.error('Error getting AI assistant suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/floating-ai-assistant/context-help
 * Get context-specific help without user message
 */
router.post('/context-help', authenticate, async (req, res) => {
  try {
    const { context } = req.body;
    const userId = req.user!.userId;

    if (!context) {
      return res.status(400).json({
        success: false,
        message: 'Context is required'
      });
    }

    const assistantContext: AssistantContext = {
      page: context.page || 'general',
      userLevel: context.userLevel,
      simulationType: context.simulationType,
      country: context.country,
      immigrationType: context.immigrationType,
      language: context.language || 'fr'
    };

    // Generate context-specific help message
    const helpMessage = assistantContext.language === 'fr'
      ? `Bonjour ! Je suis votre assistant IA pour vous aider sur cette page. Comment puis-je vous aider aujourd'hui ?`
      : `Hello! I'm your AI assistant to help you on this page. How can I help you today?`;

    const response = await FloatingAiAssistantService.getAssistance(
      userId,
      helpMessage,
      assistantContext
    );

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error getting context help:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
