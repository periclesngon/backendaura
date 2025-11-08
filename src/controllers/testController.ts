import { Request, Response } from 'express';
import { TestService } from '@/services/testService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, CreateTestRequest, SubmitTestRequest, PaginationParams, FilterParams } from '@/types';
import { UserRole } from '@prisma/client';
import { logger } from '@/utils/logger';

export class TestController {
  /**
   * Create a new test (Manager/Admin only)
   */
  static createTest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { test: testData, questions: questionsData } = req.body;
    const createdById = req.user?.userId;
    const creatorRole = req.user?.role;

    if (!createdById || !creatorRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const test = await TestService.createTestWithQuestions(testData, questionsData, createdById, creatorRole);

    const response: ApiResponse = {
      success: true,
      data: { test },
      message: 'Test created successfully'
    };

    logger.info('Test created', { testId: test.id, createdById });

    res.status(201).json(response);
  });

  /**
   * Get test by ID
   */
  static getTestById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const userId = req.user?.userId;

    const test = await TestService.getTestById(testId, userId);

    const response: ApiResponse = {
      success: true,
      data: { test },
      message: 'Test retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get all tests with pagination and filtering
   */
  static getAllTests = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const filters: FilterParams = {
      search: req.query.search as string,
      level: req.query.level as string,
      category: req.query.category as string,
      tier: req.query.tier as string,
      type: req.query.type as string
    };

    const result = await TestService.getAllTests(pagination, filters, userId);

    const response: ApiResponse = {
      success: true,
      data: result.tests,
      pagination: result.pagination,
      message: 'Tests retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Start a test attempt
   */
  static startTest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await TestService.startTest(testId, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Test started successfully'
    };

    logger.info('Test started', { testId, userId, attemptId: result.attemptId });

    res.status(200).json(response);
  });

  /**
   * Submit test answers
   */
  static submitTest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const submitData: SubmitTestRequest = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await TestService.submitTest(submitData, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Test submitted successfully'
    };

    logger.info('Test submitted', { 
      attemptId: submitData.attemptId, 
      userId, 
      score: result.score 
    });

    res.status(200).json(response);
  });

  /**
   * Get user's test attempts
   */
  static getUserTestAttempts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await TestService.getUserTestAttempts(userId, pagination);

    const response: ApiResponse = {
      success: true,
      data: result.attempts,
      pagination: result.pagination,
      message: 'Test attempts retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get tests created by user (Manager/Admin only)
   */
  static getUserCreatedTests = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any)) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Manager role required.' }
      });
      return;
    }

    const pagination: PaginationParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const filters: FilterParams = {
      search: req.query.search as string,
      level: req.query.level as string,
      category: req.query.category as string,
      tier: req.query.tier as string,
      type: req.query.type as string
    };

    // Add creator filter
    const extendedFilters = {
      ...filters,
      createdById: userId
    };

    const result = await TestService.getAllTests(pagination, extendedFilters, userId);

    const response: ApiResponse = {
      success: true,
      data: result.tests,
      pagination: result.pagination,
      message: 'Created tests retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get test attempt details
   */
  static getTestAttemptDetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { attemptId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    // Import prisma here since it's not imported at the top
    const { prisma } = await import('@/database/connection');

    // Get attempt with detailed results
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            type: true,
            level: true,
            category: true,
            passingScore: true
          }
        },
        questions: {
          include: {
            question: {
              select: {
                id: true,
                questionText: true,
                questionTextEn: true,
                type: true,
                options: true,
                correctAnswer: true,
                explanation: true,
                explanationEn: true,
                points: true
              }
            }
          }
        }
      }
    });

    if (!attempt) {
      res.status(404).json({
        success: false,
        error: { message: 'Test attempt not found' }
      });
      return;
    }

    if (attempt.userId !== userId) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: { attempt },
      message: 'Test attempt details retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Add questions to a test (Manager/Admin only)
   */
  static addQuestionsToTest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const questions = req.body.questions;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await TestService.addQuestionsToTest(testId, questions, userId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Questions added to test successfully'
    };

    res.status(201).json(response);
  });

  /**
   * Get questions for a test
   */
  static getTestQuestions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const questions = await TestService.getTestQuestions(testId, userId);

    const response: ApiResponse = {
      success: true,
      data: { questions },
      message: 'Test questions retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Update a test question
   */
  static updateTestQuestion = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId, questionId } = req.params;
    const questionData = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const question = await TestService.updateTestQuestion(testId, questionId, questionData, userId);

    const response: ApiResponse = {
      success: true,
      data: { question },
      message: 'Test question updated successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Delete a test question
   */
  static deleteTestQuestion = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId, questionId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    await TestService.deleteTestQuestion(testId, questionId, userId);

    const response: ApiResponse = {
      success: true,
      data: null,
      message: 'Test question deleted successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Upload test file
   */
  static uploadTestFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    // This would handle file upload and parsing
    // For now, return a placeholder response
    const response: ApiResponse = {
      success: true,
      data: { message: 'Test file upload functionality will be implemented' },
      message: 'Test file upload endpoint ready'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for test service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'test',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Test service is healthy'
    };

    res.status(200).json(response);
  });

  /**
   * Get test results with correct answers
   */
  static getTestResults = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { testId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const results = await TestService.getTestResults(testId, userId);

    const response: ApiResponse = {
      success: true,
      data: results,
      message: 'Test results retrieved successfully'
    };

    res.status(200).json(response);
  });
}
