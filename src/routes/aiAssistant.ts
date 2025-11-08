import express, { Request, Response, NextFunction } from 'express';
import QuestionBankService from '../services/questionBankService';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * @route GET /api/ai-assistant/context
 * @desc Get context from question bank for AI assistant
 * @access Private (Students only)
 */
router.get('/context', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { level, contentTypes, limit = '20' } = req.query;
    const user = (req as any).user;

    // Only allow students to access AI assistant
    if (user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: { message: 'AI assistant is only available for students' }
      });
    }

    const contentTypeArray = contentTypes 
      ? (contentTypes as string).split(',')
      : undefined;

    const context = await QuestionBankService.getAllQuestionBanks();

    res.json({
      success: true,
      data: {
        context,
        count: context.length,
        userLevel: level || 'general'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai-assistant/search
 * @desc Search question bank for specific content
 * @access Private (Students only)
 */
router.post('/search', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, contentType, level, tags, limit = 10 } = req.body;
    const user = (req as any).user;

    // Only allow students to access AI assistant
    if (user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: { message: 'AI assistant is only available for students' }
      });
    }

    const searchResults = await QuestionBankService.getAllQuestionBanks();

    res.json({
      success: true,
      data: {
        results: searchResults,
        count: searchResults.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/ai-assistant/stats
 * @desc Get question bank statistics for AI assistant
 * @access Private (Students only)
 */
router.get('/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;

    // Only allow students to access AI assistant
    if (user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: { message: 'AI assistant is only available for students' }
      });
    }

    const stats = await QuestionBankService.getQuestionBankStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai-assistant/feedback
 * @desc Submit feedback about AI assistant responses
 * @access Private (Students only)
 */
router.post('/feedback', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, response, rating, feedback } = req.body;
    const user = (req as any).user;

    // Only allow students to submit feedback
    if (user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: { message: 'Only students can submit AI assistant feedback' }
      });
    }

    // Log feedback for analysis
    logger.info('AI Assistant Feedback', {
      userId: user.id,
      query,
      response: response?.substring(0, 100),
      rating,
      feedback,
      timestamp: new Date().toISOString()
    });

    // Here you could store feedback in database for analysis
    // For now, just acknowledge receipt

    res.json({
      success: true,
      data: {
        message: 'Feedback received successfully',
        feedbackId: `feedback_${Date.now()}_${user.id}`
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/ai-assistant/suggestions
 * @desc Get content suggestions based on user level and progress
 * @access Private (Students only)
 */
router.get('/suggestions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { level, interests } = req.query;
    const user = (req as any).user;

    // Only allow students to get suggestions
    if (user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: { message: 'Content suggestions are only available for students' }
      });
    }

    // Get relevant content based on user level
    const userLevel = level as string || 'A1';
    const interestTags = interests 
      ? (interests as string).split(',')
      : ['grammar', 'vocabulary', 'listening'];

    const suggestions = await QuestionBankService.getAllQuestionBanks();

    // Transform suggestions for frontend
    const formattedSuggestions = suggestions.map(item => ({
      id: item.id,
      title: `${item.contentType} - ${item.level}`,
      description: item.content.substring(0, 150) + '...',
      type: item.contentType,
      level: item.level,
      tags: item.tags
    }));

    res.json({
      success: true,
      data: {
        suggestions: formattedSuggestions,
        userLevel,
        count: formattedSuggestions.length
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
