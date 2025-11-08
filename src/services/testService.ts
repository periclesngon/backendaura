import { prisma } from '@/database/connection';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError
} from '@/middleware/errorHandler';
import {
  TestWithDetails,
  CreateTestRequest,
  StartTestResponse,
  SubmitTestRequest,
  TestQuestion,
  PaginationParams,
  FilterParams
} from '@/types';
import { UserRole, SubscriptionTier, TestAttemptStatus, TestStatus } from '@prisma/client';
import { logger } from '@/utils/logger';
import { AIService } from './aiService';

export class TestService {
  /**
   * Create a new test (Manager/Admin only)
   */
  static async createTest(
    testData: CreateTestRequest,
    createdById: string,
    creatorRole: UserRole
  ): Promise<TestWithDetails> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(creatorRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      // Create test
      const test = await prisma.test.create({
        data: {
          ...testData,
          createdById,
          status: TestStatus.DRAFT
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          questions: true,
          attempts: true
        }
      });

      logger.info('Test created successfully', { 
        testId: test.id, 
        title: test.title,
        createdById 
      });

      return test;
    } catch (error) {
      logger.error('Failed to create test', { testData, createdById, error });
      throw error;
    }
  }

  /**
   * Create a new test with questions (Manager/Admin only)
   */
  static async createTestWithQuestions(
    testData: CreateTestRequest,
    questionsData: any[],
    createdById: string,
    creatorRole: UserRole
  ): Promise<TestWithDetails> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(creatorRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      // Create test with questions in a transaction
      // Increase transaction timeout to 30 seconds for large test creation
      const result = await prisma.$transaction(async (tx) => {
        // Extract fileUrl from testData if present (for reading comprehension)
        const testDataWithFileUrl = testData as any;
        const fileUrl = testDataWithFileUrl.fileUrl;
        const tags = fileUrl 
          ? [...testData.tags, `fileUrl:${fileUrl}`] // Store fileUrl in tags temporarily
          : testData.tags;
        
        // Create test
        const test = await tx.test.create({
          data: {
            title: testData.title,
            description: testData.description,
            type: testData.type,
            level: testData.level,
            category: testData.category,
            requiredTier: testData.requiredTier,
            duration: testData.duration,
            questionCount: testData.questionCount,
            difficulty: testData.difficulty,
            passingScore: testData.passingScore,
            tags: tags,
            aiPowered: testData.aiPowered || false,
            hasAIFeedback: testData.hasAIFeedback || false,
            isOfficial: testData.isOfficial || false,
            // instructions: testData.instructions,
            createdById,
            status: TestStatus.PUBLISHED, // Publish immediately for questionnaires
            isPublished: true
          }
        });

        // Create questions
        if (questionsData && questionsData.length > 0) {
          logger.info('Creating questions', { 
            testId: test.id, 
            questionCount: questionsData.length,
            firstQuestion: questionsData[0]
          });
          
          const questionsToCreate = questionsData.map((question, index) => {
            // Ensure options is JSON (array or null)
            let optionsJson: any = null;
            if (question.options) {
              if (Array.isArray(question.options)) {
                optionsJson = question.options; // Array is valid JSON
              } else if (typeof question.options === 'object') {
                optionsJson = question.options; // Object is valid JSON
              } else {
                logger.warn('Invalid options format', { questionIndex: index, options: question.options });
                optionsJson = null;
              }
            }
            
            // Ensure correctAnswer is JSON (can be number, string, boolean, or object)
            let correctAnswerJson: any;
            if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
              // Already valid JSON type (number, string, boolean, object)
              correctAnswerJson = question.correctAnswer;
            } else {
              logger.warn('Missing correctAnswer', { questionIndex: index });
              // Default based on type
              correctAnswerJson = question.type === 'multiple-choice' ? 0 : question.type === 'true-false' ? true : '';
            }
            
            // Validate category and level are valid enum values
            const category = question.category || testData.category;
            const level = question.level || testData.level;
            
            logger.info('Question data prepared', {
              index,
              questionText: question.questionText?.substring(0, 50),
              type: question.type,
              optionsIsArray: Array.isArray(optionsJson),
              correctAnswerType: typeof correctAnswerJson,
              category,
              level
            });
            
            return {
              testId: test.id,
              questionText: question.questionText,
              type: question.type,
              options: optionsJson, // JSON field - can be array, object, or null
              correctAnswer: correctAnswerJson, // JSON field - required
              points: question.points || 1,
              explanation: question.explanation || null,
              order: question.order || index + 1,
              level: level, // CourseLevel enum
              category: category // CourseCategory enum
            };
          });
          
          await tx.testQuestion.createMany({
            data: questionsToCreate
          });
          
          logger.info('Questions created successfully', { 
            testId: test.id, 
            questionCount: questionsToCreate.length 
          });
        }

        // Handle multi-level and subscription variants
        const levels = testData.levels || [testData.level];
        const subscriptions = testData.subscriptions || [testData.requiredTier];
        
        // Create additional test variants for different levels and subscriptions
        if (levels.length > 1 || subscriptions.length > 1) {
          const variants = [];
          
          for (const level of levels) {
            for (const subscription of subscriptions) {
              // Skip the primary test (already created)
              if (level === testData.level && subscription === testData.requiredTier) {
                continue;
              }
              
              variants.push({
                title: testData.title,
                description: testData.description,
                type: testData.type,
                level: level,
                category: testData.category,
                requiredTier: subscription,
                duration: testData.duration,
                questionCount: testData.questionCount,
                difficulty: testData.difficulty,
                passingScore: testData.passingScore,
                tags: testData.tags,
                aiPowered: testData.aiPowered || false,
                hasAIFeedback: testData.hasAIFeedback || false,
                isOfficial: testData.isOfficial || false,
                // instructions: testData.instructions,
                createdById,
                status: TestStatus.PUBLISHED,
                isPublished: true
              });
            }
          }
          
          // Create variant tests
          if (variants.length > 0) {
            const createdVariants = await Promise.all(
              variants.map(variant => tx.test.create({ data: variant }))
            );
            
            // Create questions for each variant
            for (const variant of createdVariants) {
              await tx.testQuestion.createMany({
                data: questionsData.map((question, index) => ({
                  testId: variant.id,
                  questionText: question.questionText,
                  type: question.type,
                  options: question.options,
                  correctAnswer: question.correctAnswer,
                  points: question.points,
                  explanation: question.explanation,
                  order: question.order,
                  level: variant.level,
                  category: variant.category
                }))
              });
            }
          }
        }

        // Return test with questions
        return await tx.test.findUnique({
          where: { id: test.id },
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            questions: {
              orderBy: { order: 'asc' }
            },
            attempts: true
          }
        });
      }, {
        timeout: 30000, // 30 seconds timeout for large test creation
      });

      if (!result) {
        throw new Error('Failed to create test');
      }

      logger.info('Test with questions created successfully', { 
        testId: result.id, 
        title: result.title,
        questionCount: questionsData.length,
        createdById 
      });

      return result;
    } catch (error: any) {
      // Log detailed error information
      logger.error('Failed to create test with questions', { 
        testData: {
          title: testData.title,
          category: testData.category,
          level: testData.level,
          type: testData.type
        },
        questionsDataCount: questionsData?.length,
        firstQuestion: questionsData?.[0],
        createdById,
        error: {
          message: error.message,
          code: error.code,
          meta: error.meta,
          stack: error.stack
        }
      });
      
      // Provide more specific error messages
      if (error.code === 'P2002') {
        throw new ValidationError('A test with this title already exists');
      } else if (error.code === 'P2003') {
        throw new ValidationError('Invalid reference: The test or related data is invalid');
      } else if (error.message?.includes('Invalid enum value')) {
        throw new ValidationError(`Invalid enum value: ${error.message}. Please check category and level values.`);
      } else if (error.message?.includes('required')) {
        throw new ValidationError(`Missing required field: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Get test by ID
   */
  static async getTestById(
    testId: string, 
    userId?: string
  ): Promise<TestWithDetails> {
    try {
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          questions: {
            orderBy: { order: 'asc' }
          },
          attempts: userId ? {
            where: { userId },
            orderBy: { createdAt: 'desc' }
          } : undefined
        }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      // Check if user has access to this test
      if (test.requiredTier !== SubscriptionTier.FREE && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true }
        });

        if (user && !this.hasAccessToTier(user.subscriptionTier, test.requiredTier)) {
          throw new AuthorizationError('Subscription upgrade required to access this test');
        }
      }

      // Calculate user-specific data
      let bestScore = 0;
      let attemptsCount = 0;

      if (test.attempts && test.attempts.length > 0) {
        attemptsCount = test.attempts.length;
        const completedAttempts = test.attempts.filter(a => a.status === TestAttemptStatus.COMPLETED && a.score !== null);
        if (completedAttempts.length > 0) {
          bestScore = Math.max(...completedAttempts.map(a => a.score!));
        }
      }

      // Transform questions to extract media URLs from options JSON
      const transformedQuestions = test.questions.map((q: any) => {
        const question: any = {
          id: q.id,
          text: q.questionText,
          questionText: q.questionText,
          questionTextEn: q.questionTextEn,
          type: q.type,
          correctAnswer: q.correctAnswer,
          allowPause: true,
          allowRewind: true,
          timeLimit: undefined,
          points: q.points,
          explanation: q.explanation
        };

        // Extract options - handle both array format and object format
        let options: any = q.options;
        if (typeof options === 'string') {
          try {
            options = JSON.parse(options);
          } catch (e) {
            options = [];
          }
        }

        if (Array.isArray(options)) {
          // Legacy format: options is array of strings
          question.options = options;
        } else if (options && typeof options === 'object') {
          // New format: options is object with choices and media URLs
          if (options.choices && Array.isArray(options.choices)) {
            question.options = options.choices;
          } else if (Array.isArray(options)) {
            question.options = options;
          } else {
            question.options = [];
          }

          // Extract media URLs from options object
          if (options.audioUrl) {
            question.audioUrl = options.audioUrl;
          }
          if (options.videoUrl) {
            question.videoUrl = options.videoUrl;
          }
          if (options.imageUrl) {
            question.imageUrl = options.imageUrl;
          }
        } else {
          question.options = [];
        }

        return question;
      });

      // Extract fileUrl from test tags (temporary solution - stored as "fileUrl:URL")
      // In production, this should be stored in a metadata field
      let fileUrl: string | undefined = undefined;
      const fileUrlTag = test.tags.find(tag => tag.startsWith('fileUrl:'));
      if (fileUrlTag) {
        fileUrl = fileUrlTag.replace('fileUrl:', '');
      }

      // Add computed fields
      const testWithDetails: TestWithDetails & { fileUrl?: string } = {
        ...test,
        questions: transformedQuestions as any,
        fileUrl: fileUrl,
        isFavorited: false, // Will be calculated separately if needed
        bestScore,
        attemptsCount
      };

      return testWithDetails;
    } catch (error) {
      logger.error('Failed to get test by ID', { testId, userId, error });
      throw error;
    }
  }

  /**
   * Get all tests with pagination and filtering
   */
  static async getAllTests(
    pagination: PaginationParams,
    filters: FilterParams,
    userId?: string
  ): Promise<{
    tests: TestWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
      const { search, level, category, tier, type } = filters;

      // Build where clause
      const where: any = {
        status: TestStatus.PUBLISHED // Only show published tests to regular users
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { titleEn: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } }
        ];
      }

      if (level) {
        where.level = level;
      }

      if (category) {
        where.category = category;
      }

      if (tier) {
        where.requiredTier = tier;
      }

      if (type) {
        where.type = type;
      }

      // Get total count
      const total = await prisma.test.count({ where });

      // Get tests
      const tests = await prisma.test.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          attempts: userId ? {
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10 // Limit attempts to avoid large payloads
          } : {
            take: 0 // Don't include attempts if no userId
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      // Add computed fields
      const testsWithDetails: TestWithDetails[] = tests.map(test => {
        let bestScore = 0;
        let attemptsCount = 0;

        if (test.attempts && test.attempts.length > 0) {
          attemptsCount = test.attempts.length;
          const completedAttempts = test.attempts.filter(a => a.status === TestAttemptStatus.COMPLETED && a.score !== null);
          if (completedAttempts.length > 0) {
            bestScore = Math.max(...completedAttempts.map(a => a.score!));
          }
        }

        // Extract fileUrl from test tags (same logic as getTestById)
        let fileUrl: string | undefined = undefined;
        const fileUrlTag = test.tags.find(tag => tag.startsWith('fileUrl:'));
        if (fileUrlTag) {
          fileUrl = fileUrlTag.replace('fileUrl:', '');
        }

        return {
          ...test,
          fileUrl: fileUrl, // Include fileUrl for students to access uploaded content
          isFavorited: false, // Will be calculated separately if needed
          bestScore,
          attemptsCount
        };
      });

      return {
        tests: testsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get all tests', { error });
      throw error;
    }
  }

  /**
   * Start a test attempt
   */
  static async startTest(testId: string, userId: string): Promise<StartTestResponse> {
    try {
      // Get test
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          questions: {
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.status !== TestStatus.PUBLISHED) {
        throw new ValidationError('Test is not published');
      }

      // Check user subscription tier
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!this.hasAccessToTier(user.subscriptionTier, test.requiredTier)) {
        throw new AuthorizationError('Subscription upgrade required to take this test');
      }

      // Check max attempts
      if (test.maxAttempts) {
        const attemptCount = await prisma.testAttempt.count({
          where: {
            userId,
            testId,
            status: TestAttemptStatus.COMPLETED
          }
        });

        if (attemptCount >= test.maxAttempts) {
          throw new ValidationError(`Maximum attempts (${test.maxAttempts}) reached for this test`);
        }
      }

      // Check for existing in-progress attempt
      const existingAttempt = await prisma.testAttempt.findFirst({
        where: {
          userId,
          testId,
          status: TestAttemptStatus.IN_PROGRESS
        }
      });

      if (existingAttempt) {
        // Return existing attempt
        const questions = test.questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionTextEn: q.questionTextEn,
          type: q.type,
          options: q.options,
          points: q.points,
          order: q.order,
          level: q.level,
          category: q.category
        }));

        return {
          attemptId: existingAttempt.id,
          questions: questions as any,
          timeLimit: test.duration * 60 // Convert minutes to seconds
        };
      }

      // Create new attempt
      const attempt = await prisma.testAttempt.create({
        data: {
          userId,
          testId,
          status: TestAttemptStatus.IN_PROGRESS,
          startedAt: new Date()
        }
      });

      // Prepare questions (without correct answers)
      const questions = test.questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionTextEn: q.questionTextEn,
        type: q.type,
        options: q.options,
        points: q.points,
        order: q.order,
        level: q.level,
        category: q.category
      }));

      logger.info('Test attempt started', { testId, userId, attemptId: attempt.id });

      return {
        attemptId: attempt.id,
        questions: questions as any,
        timeLimit: test.duration * 60 // Convert minutes to seconds
      };
    } catch (error) {
      logger.error('Failed to start test', { testId, userId, error });
      throw error;
    }
  }

  /**
   * Submit test answers
   */
  static async submitTest(submitData: SubmitTestRequest, userId: string): Promise<{
    score: number;
    totalPoints: number;
    passed: boolean;
    feedback?: string;
  }> {
    try {
      const { attemptId, answers } = submitData;

      // Get attempt
      const attempt = await prisma.testAttempt.findUnique({
        where: { id: attemptId },
        include: {
          test: {
            include: {
              questions: true
            }
          }
        }
      });

      if (!attempt) {
        throw new NotFoundError('Test attempt not found');
      }

      if (attempt.userId !== userId) {
        throw new AuthorizationError('Access denied');
      }

      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        throw new ValidationError('Test attempt is not in progress');
      }

      // Calculate score
      let totalScore = 0;
      let totalPoints = 0;
      const questionAnswers = [];

      for (const question of attempt.test.questions) {
        const userAnswer = answers.find(a => a.questionId === question.id);
        totalPoints += question.points;

        console.log('🔍 Processing question:', {
          questionId: question.id,
          questionText: question.questionText,
          correctAnswer: question.correctAnswer,
          questionType: question.type,
          userAnswer: userAnswer?.answer,
          hasUserAnswer: !!userAnswer
        });

        if (userAnswer) {
          const isCorrect = this.checkAnswer(question.correctAnswer, userAnswer.answer, question.type);
          const pointsEarned = isCorrect ? question.points : 0;
          totalScore += pointsEarned;

          console.log('🔍 Answer evaluation result:', {
            questionId: question.id,
            isCorrect,
            pointsEarned,
            totalScore
          });

          // Create question answer record
          questionAnswers.push({
            attemptId,
            questionId: question.id,
            answer: userAnswer.answer,
            isCorrect,
            pointsEarned,
            timeSpent: userAnswer.timeSpent || 0
          });
        } else {
          console.log('🔍 No answer provided for question:', question.id);
          // No answer provided
          questionAnswers.push({
            attemptId,
            questionId: question.id,
            answer: null,
            isCorrect: false,
            pointsEarned: 0,
            timeSpent: 0
          });
        }
      }

      const scorePercentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
      const passed = scorePercentage >= attempt.test.passingScore;

      // Generate AI feedback if enabled (before updating attempt)
      let aiFeedback: string | undefined = undefined;
      if (attempt.test.hasAIFeedback) {
        try {
          aiFeedback = await this.generateAIFeedback(attempt, answers);
        } catch (aiError) {
          logger.warn('Failed to generate AI feedback', { attemptId, error: aiError });
          // Continue without AI feedback if generation fails
        }
      }

      // Update attempt with feedback
      await prisma.testAttempt.update({
        where: { id: attemptId },
        data: {
          status: TestAttemptStatus.COMPLETED,
          completedAt: new Date(),
          score: scorePercentage,
          timeSpent: Math.floor((new Date().getTime() - attempt.startedAt.getTime()) / 1000),
          answers: answers,
          feedback: aiFeedback
        }
      });

      // Create question answers
      await prisma.testQuestionAnswer.createMany({
        data: questionAnswers
      });

      // Update test completion count
      await prisma.test.update({
        where: { id: attempt.testId },
        data: {
          completionCount: {
            increment: 1
          },
          averageScore: {
            // This would need a more complex calculation in a real scenario
            set: scorePercentage
          }
        }
      });

      logger.info('Test submitted successfully', {
        testId: attempt.testId,
        userId,
        attemptId,
        score: scorePercentage
      });

      return {
        score: scorePercentage,
        totalPoints,
        passed,
        feedback: aiFeedback
      };
    } catch (error) {
      logger.error('Failed to submit test', { submitData, userId, error });
      throw error;
    }
  }

  /**
   * Generate AI feedback for test submission
   */
  private static async generateAIFeedback(attempt: any, answers: any[]): Promise<string> {
    try {
      // Build context for AI feedback
      const questionsContext = attempt.test.questions.map((q: any) => ({
        id: q.id,
        text: q.questionText,
        type: q.type,
        correctAnswer: q.correctAnswer
      }));

      const userAnswersContext = answers.map((a: any) => ({
        questionId: a.questionId,
        answer: a.answer
      }));

      const prompt = `
Tu es un professeur de français expérimenté et bienveillant. Analyse les réponses d'un étudiant à un test et fournis un retour constructif et encourageant.

Test: ${attempt.test.title}
Niveau: ${attempt.test.level}
Catégorie: ${attempt.test.category}

Questions et réponses:
${questionsContext.map((q: any, idx: number) => {
  const userAnswer = userAnswersContext.find((a: any) => a.questionId === q.id);
  return `Q${idx + 1}: ${q.text}
Réponse de l'étudiant: ${userAnswer?.answer || 'Pas de réponse'}
Réponse correcte: ${q.correctAnswer}`;
}).join('\n\n')}

Fournis un retour constructif qui:
1. Félicite l'étudiant pour ses efforts
2. Identifie les points forts
3. Suggère les domaines à améliorer
4. Donne des conseils pratiques pour progresser
5. Encourage l'étudiant à continuer

Réponds en français, de manière bienveillante et motivante.
      `;

      const feedback = await AIService.generateContent(prompt);
      return feedback;
    } catch (error) {
      logger.error('Error generating AI feedback', { error });
      throw error;
    }
  }

  /**
   * Get user's test attempts
   */
  static async getUserTestAttempts(
    userId: string,
    pagination: PaginationParams
  ): Promise<{
    attempts: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;

      // Get total count
      const total = await prisma.testAttempt.count({
        where: { userId }
      });

      // Get attempts
      const attempts = await prisma.testAttempt.findMany({
        where: { userId },
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
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      return {
        attempts,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get user test attempts', { userId, error });
      throw error;
    }
  }

  /**
   * Check if answer is correct
   */
  private static checkAnswer(correctAnswer: any, userAnswer: any, questionType: string): boolean {
    console.log('🔍 Checking answer:', { correctAnswer, userAnswer, questionType, correctAnswerType: typeof correctAnswer, userAnswerType: typeof userAnswer });
    
    switch (questionType) {
      case 'multiple-choice':
        // Handle type conversion for multiple choice questions
        // correctAnswer might be stored as number (index) or string
        // userAnswer might be sent as string from frontend
        const correctNum = typeof correctAnswer === 'string' ? parseInt(correctAnswer) : correctAnswer;
        const userNum = typeof userAnswer === 'string' ? parseInt(userAnswer) : userAnswer;
        const correctStr = String(correctAnswer);
        const userStr = String(userAnswer);
        
        console.log('🔍 Multiple choice comparison:', { correctNum, userNum, correctStr, userStr });
        
        // Try both numeric and string comparison
        return correctNum === userNum || correctStr === userStr;
        
      case 'true-false':
        // Handle boolean/string conversion for true-false questions
        const correctBool = typeof correctAnswer === 'string' ? correctAnswer.toLowerCase() === 'true' : correctAnswer;
        const userBool = typeof userAnswer === 'string' ? userAnswer.toLowerCase() === 'true' : userAnswer;
        const correctBoolStr = String(correctAnswer).toLowerCase();
        const userBoolStr = String(userAnswer).toLowerCase();
        
        console.log('🔍 True-false comparison:', { correctBool, userBool, correctBoolStr, userBoolStr });
        
        return correctBool === userBool || correctBoolStr === userBoolStr;
        
      case 'fill-blank':
        if (typeof correctAnswer === 'string' && typeof userAnswer === 'string') {
          return correctAnswer.toLowerCase().trim() === userAnswer.toLowerCase().trim();
        }
        return correctAnswer === userAnswer;
        
      case 'essay':
        // For essay questions, manual grading would be required
        // For now, return false (needs manual review)
        return false;
        
      default:
        console.log('🔍 Unknown question type:', questionType);
        return false;
    }
  }

  /**
   * Add questions to a test
   */
  static async addQuestionsToTest(testId: string, questions: any[], userId: string) {
    try {
      // Verify test exists and user has permission
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: { createdBy: true }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only add questions to your own tests.');
      }

      // Add questions
      const createdQuestions = await Promise.all(
        questions.map((question, index) =>
          prisma.testQuestion.create({
            data: {
              testId,
              questionText: question.questionText,
              questionTextEn: question.questionTextEn,
              type: question.type,
              options: question.options,
              correctAnswer: question.correctAnswer,
              points: question.points || 1,
              explanation: question.explanation,
              explanationEn: question.explanationEn,
              order: question.order || index + 1,
              level: question.level || test.level,
              category: question.category || test.category
            }
          })
        )
      );

      return { questions: createdQuestions };
    } catch (error) {
      logger.error('Error adding questions to test', { error, testId, userId });
      throw error;
    }
  }

  /**
   * Get questions for a test
   */
  static async getTestQuestions(testId: string, userId: string) {
    try {
      // Verify test exists and user has permission
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: { createdBy: true }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only view questions for your own tests.');
      }

      const questions = await prisma.testQuestion.findMany({
        where: { testId },
        orderBy: { order: 'asc' }
      });

      return questions;
    } catch (error) {
      logger.error('Error getting test questions', { error, testId, userId });
      throw error;
    }
  }

  /**
   * Update a test question
   */
  static async updateTestQuestion(testId: string, questionId: string, questionData: any, userId: string) {
    try {
      // Verify test exists and user has permission
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: { createdBy: true }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only update questions for your own tests.');
      }

      // Update question
      const question = await prisma.testQuestion.update({
        where: { id: questionId, testId },
        data: questionData
      });

      return question;
    } catch (error) {
      logger.error('Error updating test question', { error, testId, questionId, userId });
      throw error;
    }
  }

  /**
   * Delete a test question
   */
  static async deleteTestQuestion(testId: string, questionId: string, userId: string) {
    try {
      // Verify test exists and user has permission
      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: { createdBy: true }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.createdById !== userId) {
        throw new AuthorizationError('Access denied. You can only delete questions from your own tests.');
      }

      // Delete question
      await prisma.testQuestion.delete({
        where: { id: questionId, testId }
      });

      return true;
    } catch (error) {
      logger.error('Error deleting test question', { error, testId, questionId, userId });
      throw error;
    }
  }

  /**
   * Check if user has access to subscription tier
   */
  private static hasAccessToTier(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
    const tierHierarchy = {
      [SubscriptionTier.FREE]: 0,
      [SubscriptionTier.ESSENTIAL]: 1,
      [SubscriptionTier.PREMIUM]: 2,
      [SubscriptionTier.PRO]: 3
    };

    return tierHierarchy[userTier] >= tierHierarchy[requiredTier];
  }

  /**
   * Get test results with correct answers for a specific test
   */
  static async getTestResults(testId: string, userId: string): Promise<any> {
    try {
      // Get the latest completed attempt for this test by this user
      const attempt = await prisma.testAttempt.findFirst({
        where: {
          testId,
          userId,
          status: TestAttemptStatus.COMPLETED
        },
        include: {
          test: {
            include: {
              questions: {
                orderBy: { order: 'asc' }
              }
            }
          },
          questions: {
            include: {
              question: true
            }
          }
        },
        orderBy: { completedAt: 'desc' }
      });

      if (!attempt) {
        throw new NotFoundError('No completed test attempt found');
      }

      // Format the results with correct answers
      const questions = attempt.test.questions.map(question => {
        const userAnswer = attempt.questions.find(a => a.questionId === question.id);
        
        return {
          id: question.id,
          questionText: question.questionText,
          type: question.type,
          options: question.options,
          correctAnswer: question.correctAnswer,
          userAnswer: userAnswer?.answer || null,
          isCorrect: userAnswer?.isCorrect || false,
          points: question.points,
          explanation: question.explanation
        };
      });

      return {
        id: attempt.id,
        testId: attempt.testId,
        testTitle: attempt.test.title,
        testDescription: attempt.test.description || '',
        score: attempt.score || 0,
        maxScore: attempt.test.questions.reduce((sum, q) => sum + q.points, 0),
        percentage: attempt.score || 0,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() || '',
        duration: attempt.timeSpent || 0,
        correctAnswers: questions.filter(q => q.isCorrect).length,
        totalQuestions: questions.length,
        questions
      };
    } catch (error) {
      logger.error('Failed to get test results', { testId, userId, error });
      throw error;
    }
  }
}
