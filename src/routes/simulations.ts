import express, { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { LevelAssessmentService } from '../services/levelAssessmentService';
import { AITeacherFeedbackService } from '../services/aiTeacherFeedbackService';
import { logger } from '../utils/logger';
import { checkSimulationLimit } from '../services/simulationLimitService';

const router = express.Router();


/**
 * @route GET /api/simulations
 * @desc Get all available simulations
 * @access Private
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const simulations = await prisma.test.findMany({
      where: {
        isPublished: true
      },
      include: {
        questions: {
          select: {
            id: true,
            type: true,
            category: true,
            level: true,
            points: true
          }
        },
        _count: {
          select: {
            questions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform data for frontend
    const transformedSimulations = simulations.map(simulation => ({
      id: simulation.id,
      title: simulation.title,
      description: simulation.description,
      type: simulation.type,
      level: simulation.level,
      duration: simulation.duration,
      totalQuestions: simulation._count.questions,
      sections: [...new Set(simulation.questions.map(q => q.category))].length,
      difficulty: simulation.difficulty || 3,
      requiredTier: simulation.requiredTier?.toLowerCase() || 'free',
      category: simulation.category,
      language: 'fr', // Default to French
      createdAt: simulation.createdAt
    }));

    res.json({
      success: true,
      data: {
        simulations: transformedSimulations,
        total: transformedSimulations.length
      }
    });
  } catch (error) {
    console.error('Error fetching simulations:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch simulations' }
    });
  }
});

/**
 * @route GET /api/simulations/questions
 * @desc Get simulation questions for AI assistant
 * @access Private
 */
router.get('/questions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questions = await prisma.testQuestion.findMany({
      include: {
        test: {
          select: {
            title: true,
            type: true,
            level: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: {
        questions: questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          type: q.type,
          category: q.category,
          level: q.level,
          testTitle: q.test?.title,
          testType: q.test?.type
        })),
        total: questions.length
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch questions' }
    });
  }
});

/**
 * @route POST /api/simulations/:id/start
 * @desc Start a simulation session
 * @access Private
 */
router.post('/:id/start', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // STRICT LIMIT ENFORCEMENT: Check simulation limit before creating
    const limitCheck = await checkSimulationLimit(userId);
    if (!limitCheck.canCreate) {
      return res.status(403).json({
        success: false,
        error: {
          message: limitCheck.error || 'Simulation limit reached for this billing period. Please upgrade your subscription or wait for the next billing cycle.',
          limitReached: true,
          remaining: limitCheck.remaining,
          maxSimulations: limitCheck.maxSimulations,
          periodEndDate: limitCheck.periodEndDate.toISOString()
        }
      });
    }

    // Get simulation details
    const simulation = await prisma.test.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { message: 'Simulation not found' }
      });
    }

    // Create a new session
    const session = await prisma.testAttempt.create({
      data: {
        userId,
        testId: id,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        answers: {
        timeRemaining: simulation.duration * 60, // Convert minutes to seconds
          progress: {}
        } as any,
      }
    });

    // Transform simulation data for frontend
    const sessionData = {
      id: session.id,
      simulationId: id,
      title: simulation.title,
      duration: simulation.duration,
      sections: [
        {
          name: 'Compréhension écrite',
          duration: Math.floor(simulation.duration * 0.4),
          questions: simulation.questions.filter(q => q.category === 'READING').map(q => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options as string[],
            correctAnswer: q.correctAnswer,
            points: q.points,
            section: q.category,
            order: q.order,
            audioUrl: null,
            imageUrl: null
          }))
        },
        {
          name: 'Compréhension orale',
          duration: Math.floor(simulation.duration * 0.3),
          questions: simulation.questions.filter(q => q.category === 'LISTENING').map(q => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options as string[],
            correctAnswer: q.correctAnswer,
            points: q.points,
            section: q.category,
            order: q.order,
            audioUrl: null,
            imageUrl: null
          }))
        },
        {
          name: 'Expression écrite',
          duration: Math.floor(simulation.duration * 0.2),
          questions: simulation.questions.filter(q => q.category === 'WRITING').map(q => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options as string[],
            correctAnswer: q.correctAnswer,
            points: q.points,
            section: q.category,
            order: q.order,
            audioUrl: null,
            imageUrl: null
          }))
        },
        {
          name: 'Expression orale',
          duration: Math.floor(simulation.duration * 0.1),
          questions: simulation.questions.filter(q => q.category === 'ORAL').map(q => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options as string[],
            correctAnswer: q.correctAnswer,
            points: q.points,
            section: q.category,
            order: q.order,
            audioUrl: null,
            imageUrl: null
          }))
        }
      ].filter(section => section.questions.length > 0),
      timeRemaining: simulation.duration * 60,
      currentSection: 0,
      currentQuestion: 0,
      answers: {},
      isFullscreen: true,
      autoSave: true
    };

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        ...sessionData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/simulations/sessions/:id/progress
 * @desc Save session progress
 * @access Private
 */
router.put('/sessions/:id/progress', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { answers, currentSection, currentQuestion, timeRemaining } = req.body;
    const userId = req.user!.userId;

    const session = await prisma.testAttempt.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found' }
      });
    }

    // Merge answers with progress metadata
    const updatedAnswers = {
      ...(typeof answers === 'object' ? answers : {}),
        timeRemaining,
          currentSection,
          currentQuestion,
          lastSaved: new Date().toISOString()
    };

    await prisma.testAttempt.update({
      where: { id },
      data: {
        answers: updatedAnswers as any
      }
    });

    res.json({
      success: true,
      message: 'Progress saved'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/simulations/sessions/:id/submit
 * @desc Submit simulation session
 * @access Private
 */
router.post('/sessions/:id/submit', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { answers, timeSpent } = req.body;
    const userId = req.user!.userId;

    const session = await prisma.testAttempt.findFirst({
      where: {
        id,
        userId
      },
      include: {
        test: {
          include: {
            questions: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found' }
      });
    }

    // Calculate score
    let totalScore = 0;
    let maxScore = 0;
    let correctAnswers = 0;

    const questionResults = session.test.questions.map(question => {
      const userAnswer = answers[question.id] || '';
      const correctAnswer = typeof question.correctAnswer === 'string' ? question.correctAnswer : JSON.stringify(question.correctAnswer);
      const isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
      
      maxScore += question.points;
      if (isCorrect) {
        totalScore += question.points;
        correctAnswers++;
      }

      return {
        questionId: question.id,
        userAnswer,
        isCorrect,
        points: isCorrect ? question.points : 0
      };
    });

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const grade = getGradeFromPercentage(percentage);

    // Prepare detailed results for storage in feedback
    const detailedResults = {
        maxScore,
        percentage,
        correctAnswers,
      grade,
        level: session.test.level,
        sections: generateSectionResults(session.test.questions, answers),
        overallFeedback: generateOverallFeedback(percentage),
        strengths: generateStrengths(questionResults),
        weaknesses: generateWeaknesses(questionResults),
      recommendations: generateRecommendations(percentage, session.test.level),
      questionResults
    };

    // Update session with final results
    const completedSession = await prisma.testAttempt.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        score: totalScore,
        timeSpent,
        answers: answers as any,
        feedback: JSON.stringify(detailedResults)
      }
    });

    res.json({
      success: true,
      data: {
        resultId: completedSession.id,
        score: totalScore,
        maxScore,
        percentage,
        grade,
        correctAnswers,
        totalQuestions: session.test.questions.length,
        timeSpent
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/simulations/results
 * @desc Get all simulation results for user
 * @access Private
 */
router.get('/results', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const attempts = await prisma.testAttempt.findMany({
      where: { 
        userId,
        status: 'COMPLETED'
      },
          include: {
            test: {
              select: {
            id: true,
                title: true,
            titleEn: true,
                level: true,
            type: true,
            category: true
              }
            }
      },
      orderBy: { completedAt: 'desc' }
    });

    // Transform attempts to results format
    const results = attempts.map(attempt => {
      let feedbackData: any = {};
      if (attempt.feedback) {
        try {
          feedbackData = JSON.parse(attempt.feedback);
        } catch (e) {
          // If parsing fails, use empty object
        }
      }

      // Calculate maxScore from test questions if not in feedback
      const maxScore = feedbackData.maxScore || 100;
      const percentage = feedbackData.percentage || (attempt.score && maxScore > 0 
        ? Math.round((attempt.score / maxScore) * 100) 
        : 0);

      return {
        id: attempt.id,
        userId: attempt.userId,
        testAttemptId: attempt.id,
        simulationTitle: attempt.test.title,
        totalScore: attempt.score || 0,
        maxScore,
        percentage,
        grade: feedbackData.grade || getGradeFromPercentage(percentage),
        level: attempt.test.level || feedbackData.level,
        timeSpent: attempt.timeSpent || 0,
        sections: feedbackData.sections || [],
        overallFeedback: feedbackData.overallFeedback || '',
        strengths: feedbackData.strengths || [],
        weaknesses: feedbackData.weaknesses || [],
        recommendations: feedbackData.recommendations || [],
        createdAt: attempt.completedAt || attempt.createdAt,
        test: attempt.test
      };
    });

    res.json({
      success: true,
      data: results,
      message: 'Simulation results retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/simulations/results/:id
 * @desc Get simulation results
 * @access Private
 */
router.get('/results/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const attempt = await prisma.testAttempt.findFirst({
      where: {
        id,
        userId,
        status: 'COMPLETED'
      },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            level: true,
            type: true,
            category: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        error: { message: 'Results not found' }
      });
    }

    // Parse feedback data
    let feedbackData: any = {};
    if (attempt.feedback) {
      try {
        feedbackData = JSON.parse(attempt.feedback);
      } catch (e) {
        // If parsing fails, use empty object
      }
    }

    // Calculate values if not in feedback
    const maxScore = feedbackData.maxScore || 100;
    const percentage = feedbackData.percentage || (attempt.score && maxScore > 0 
      ? Math.round((attempt.score / maxScore) * 100) 
      : 0);

    const result = {
      id: attempt.id,
      userId: attempt.userId,
      testAttemptId: attempt.id,
      simulationTitle: attempt.test.title,
      totalScore: attempt.score || 0,
      maxScore,
      percentage,
      grade: feedbackData.grade || getGradeFromPercentage(percentage),
      level: attempt.test.level || feedbackData.level,
      timeSpent: attempt.timeSpent || 0,
      sections: feedbackData.sections || [],
      overallFeedback: feedbackData.overallFeedback || '',
      strengths: feedbackData.strengths || [],
      weaknesses: feedbackData.weaknesses || [],
      recommendations: feedbackData.recommendations || [],
      questionResults: feedbackData.questionResults || [],
      createdAt: attempt.completedAt || attempt.createdAt,
      test: attempt.test
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Helper functions
function getGradeFromPercentage(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  return 'D';
}

function generateSectionResults(questions: any[], answers: Record<string, string>) {
  const sections = ['READING', 'LISTENING', 'WRITING', 'SPEAKING'];
  
  return sections.map(sectionName => {
    const sectionQuestions = questions.filter(q => q.section === sectionName);
    if (sectionQuestions.length === 0) return null;

    let sectionScore = 0;
    let sectionMaxScore = 0;

    const questionResults = sectionQuestions.map(q => {
      const userAnswer = answers[q.id] || '';
      const isCorrect = userAnswer.toLowerCase().trim() === q.correctAnswer?.toLowerCase().trim();
      
      sectionMaxScore += q.points;
      if (isCorrect) {
        sectionScore += q.points;
      }

      return {
        id: q.id,
        questionText: q.questionText,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        points: q.points,
        section: q.section,
        explanation: q.explanation || ''
      };
    });

    const percentage = sectionMaxScore > 0 ? Math.round((sectionScore / sectionMaxScore) * 100) : 0;

    return {
      name: getSectionDisplayName(sectionName),
      score: sectionScore,
      maxScore: sectionMaxScore,
      percentage,
      timeSpent: 0, // Would need to track this separately
      questions: questionResults
    };
  }).filter(Boolean);
}

function getSectionDisplayName(section: string): string {
  const names: Record<string, string> = {
    'READING': 'Compréhension écrite',
    'LISTENING': 'Compréhension orale',
    'WRITING': 'Expression écrite',
    'SPEAKING': 'Expression orale'
  };
  return names[section] || section;
}

function generateOverallFeedback(percentage: number): string {
  if (percentage >= 80) {
    return "Excellent travail ! Vous maîtrisez très bien le français et êtes prêt pour les examens officiels.";
  } else if (percentage >= 60) {
    return "Bon niveau ! Vous avez une bonne maîtrise du français avec quelques points à améliorer.";
  } else if (percentage >= 40) {
    return "Niveau correct. Continuez à pratiquer pour améliorer vos compétences en français.";
  } else {
    return "Il y a encore du travail à faire. Concentrez-vous sur les bases et pratiquez régulièrement.";
  }
}

function generateStrengths(results: any[]): string[] {
  const strengths = [];
  const correctPercentage = (results.filter(r => r.isCorrect).length / results.length) * 100;
  
  if (correctPercentage >= 80) {
    strengths.push("Excellente compréhension générale");
  }
  if (correctPercentage >= 60) {
    strengths.push("Bonne capacité d'analyse");
  }
  
  strengths.push("Participation active à l'examen");
  return strengths;
}

function generateWeaknesses(results: any[]): string[] {
  const weaknesses = [];
  const incorrectPercentage = (results.filter(r => !r.isCorrect).length / results.length) * 100;
  
  if (incorrectPercentage >= 40) {
    weaknesses.push("Attention aux détails à améliorer");
  }
  if (incorrectPercentage >= 60) {
    weaknesses.push("Compréhension des consignes à renforcer");
  }
  
  return weaknesses;
}

function generateRecommendations(percentage: number, level: string): string[] {
  const recommendations = [];
  
  if (percentage < 60) {
    recommendations.push("Pratiquez davantage les exercices de base");
    recommendations.push("Révisez la grammaire française fondamentale");
  }
  
  recommendations.push("Continuez à pratiquer régulièrement");
  recommendations.push(`Concentrez-vous sur les exercices de niveau ${level}`);
  
  return recommendations;
}

/**
 * @route POST /api/simulations/assess-level
 * @desc Assess student's French level based on simulation results
 * @access Private
 */
router.post('/assess-level', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
    }

    const {
      simulationId,
      testLevel,
      score,
      totalQuestions,
      correctAnswers,
      timeSpent,
      answers,
      sectionScores
    } = req.body;

    // Debug logging
    logger.info('Level assessment request body:', {
      simulationId,
      testLevel,
      score,
      totalQuestions,
      correctAnswers,
      timeSpent,
      hasAnswers: !!answers,
      hasSectionScores: !!sectionScores
    });

    // Validate required fields (simulationId can be null)
    if (!testLevel || score === undefined || !totalQuestions || correctAnswers === undefined) {
      logger.error('Missing required fields:', {
        testLevel: !!testLevel,
        score: score !== undefined,
        totalQuestions: !!totalQuestions,
        correctAnswers: correctAnswers !== undefined
      });
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields for level assessment' }
      });
    }

    // Perform level assessment
    const assessment = await LevelAssessmentService.assessLevel(userId, {
      simulationId,
      testLevel,
      score,
      totalQuestions,
      correctAnswers,
      timeSpent: timeSpent || 0,
      answers: answers || [],
      sectionScores: sectionScores || {}
    });

    res.json({
      success: true,
      data: {
        assessment,
        message: 'Level assessment completed successfully'
      }
    });
  } catch (error) {
    console.error('Error in level assessment:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to assess level' }
    });
  }
});

/**
 * @route GET /api/simulations/level-history
 * @desc Get user's level assessment history
 * @access Private
 */
router.get('/level-history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
    }

    const history = await LevelAssessmentService.getLevelHistory(userId);

    res.json({
      success: true,
      data: {
        history,
        currentLevel: await LevelAssessmentService.getCurrentLevel(userId)
      }
    });
  } catch (error) {
    console.error('Error fetching level history:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch level history' }
    });
  }
});

/**
 * @route POST /api/simulations/:id/start
 * @desc Start a simulation session
 * @access Private
 */
router.post('/:id/start', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Get simulation details
    const simulation = await prisma.test.findFirst({
      where: {
        id: id,
        isPublished: true
      },
      include: {
        questions: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { message: 'Simulation not found' }
      });
    }

    // Create exam session
    const examSession = {
      id: `session_${Date.now()}_${userId}`,
      simulationId: simulation.id,
      title: simulation.title,
      duration: simulation.duration || 60, // Default 60 minutes
      sections: groupQuestionsBySection(simulation.questions),
      timeRemaining: (simulation.duration || 60) * 60, // Convert to seconds
      currentSection: 0,
      currentQuestion: 0,
      answers: {},
      isFullscreen: true,
      autoSave: true
    };

    res.json({
      success: true,
      data: examSession
    });
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to start simulation' }
    });
  }
});

/**
 * @route POST /api/simulations/sessions/:sessionId/submit
 * @desc Submit simulation and generate AI teacher feedback
 * @access Private
 */
router.post('/sessions/:sessionId/submit', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const { answers, timeSpent } = req.body;
    const userId = req.user!.userId;

    // Extract simulation ID from session ID
    const simulationId = sessionId.split('_')[2] || sessionId;

    // Get simulation details
    const simulation = await prisma.test.findFirst({
      where: {
        id: simulationId,
        isPublished: true
      },
      include: {
        questions: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: { message: 'Simulation not found' }
      });
    }

    // Generate AI Teacher Feedback
    const teacherFeedbackRequest = {
      userId,
      simulationId: simulation.id,
      simulationTitle: simulation.title,
      answers,
      questions: simulation.questions.map(q => ({
        id: q.id,
        type: q.type as 'MCQ' | 'FILL_IN' | 'TRUE_FALSE' | 'ESSAY' | 'AUDIO_RESPONSE',
        questionText: q.questionText,
        correctAnswer: q.correctAnswer as string,
        options: q.options as string[],
        points: q.points || 1,
        section: q.category || 'General'
      })),
      timeSpent: timeSpent || 0,
      totalDuration: (simulation.duration || 60) * 60
    };

    const teacherFeedback = await AITeacherFeedbackService.generateTeacherFeedback(teacherFeedbackRequest);

    // Create simulation result
    const simulationResult = {
      id: `result_${Date.now()}_${userId}`,
      simulationId: simulation.id,
      userId,
      score: teacherFeedback.overallScore,
      maxScore: teacherFeedback.maxScore,
      percentage: Math.round((teacherFeedback.overallScore / teacherFeedback.maxScore) * 100),
      timeSpent,
      answers,
      teacherFeedbackId: teacherFeedback.id,
      completedAt: new Date()
    };

    res.json({
      success: true,
      data: {
        resultId: simulationResult.id,
        score: simulationResult.score,
        maxScore: simulationResult.maxScore,
        percentage: simulationResult.percentage,
        teacherFeedbackId: teacherFeedback.id,
        message: 'Simulation completed successfully with AI teacher feedback'
      }
    });
  } catch (error) {
    console.error('Error submitting simulation:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit simulation' }
    });
  }
});


/**
 * @route GET /api/simulations/free-attempts/count
 * @desc Get count of simulation attempts for current user based on subscription
 * @access Private
 * @note Counts ALL simulation types: testAttempt, VoiceSimulation, ImmigrationSimulation
 */
router.get('/free-attempts/count', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Use helper function to get limit information
    const limitInfo = await checkSimulationLimit(userId);

    // Get detailed breakdown for response
    const [testAttempts, voiceSimulations, immigrationSimulations] = await Promise.all([
      prisma.testAttempt.count({
      where: {
        userId,
          createdAt: { gte: limitInfo.periodStartDate }
      }
      }),
      prisma.voiceSimulation.count({
        where: {
          userId,
          createdAt: { gte: limitInfo.periodStartDate }
        }
      }),
      prisma.immigrationSimulation.count({
        where: {
          userId,
          createdAt: { gte: limitInfo.periodStartDate }
        }
      })
    ]);

    const totalSimulationsUsed = testAttempts + voiceSimulations + immigrationSimulations;
    
    // Calculate days remaining in current period
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((limitInfo.periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      success: true,
      data: {
        totalSimulationsUsed,
        remainingSimulations: limitInfo.remaining,
        maxSimulations: limitInfo.maxSimulations,
        subscriptionTier: limitInfo.subscriptionTier,
        isBlocked: !limitInfo.canCreate,
        canAccessPaid: limitInfo.subscriptionTier !== 'FREE',
        periodStartDate: limitInfo.periodStartDate.toISOString(),
        periodEndDate: limitInfo.periodEndDate.toISOString(),
        daysRemaining,
        // Keep legacy fields for backward compatibility
        freeAttemptsUsed: limitInfo.subscriptionTier === 'FREE' ? totalSimulationsUsed : 0,
        remainingFreeAttempts: limitInfo.subscriptionTier === 'FREE' ? limitInfo.remaining : 0,
        breakdown: {
          testAttempts,
          voiceSimulations,
          immigrationSimulations
        }
      }
    });
  } catch (error) {
    console.error('Error getting simulation attempts count:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get simulation attempts count' }
    });
  }
});

/**
 * @route GET /api/simulations/test-niveau
 * @desc Get simulations for test de niveau page with proper filtering
 * @access Private
 */
router.get('/test-niveau', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { level, tier } = req.query;

    // Get user subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true }
    });

    const userTier = user?.subscriptionTier || 'FREE';

    // Count free attempts
    const freeAttempts = await prisma.testAttempt.count({
      where: { userId }
    });

    const isBlocked = freeAttempts >= 5 && userTier === 'FREE';

    // Build where clause based on tier
    let whereClause: any = {
      isPublished: true,
      type: 'SIMULATION'
    };

    // Filter by level if provided
    if (level) {
      whereClause.level = level as string;
    }

    // Filter by subscription tier
    if (tier === 'essentiel') {
      whereClause.level = { in: ['B1', 'B2'] };
      whereClause.requiredTier = { in: ['FREE', 'ESSENTIAL'] };
    } else if (tier === 'premium' || tier === 'pro') {
      whereClause.level = { in: ['B1', 'B2', 'C1', 'C2'] };
      whereClause.requiredTier = { in: ['FREE', 'ESSENTIAL', 'PREMIUM', 'PRO'] };
    }

    const simulations = await prisma.test.findMany({
      where: whereClause,
      include: {
        questions: {
          select: {
            id: true,
            type: true,
            category: true,
            level: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({
      success: true,
      data: {
        simulations: simulations.map(sim => ({
          id: sim.id,
          title: sim.title,
          description: sim.description,
          level: sim.level,
          duration: sim.duration,
          totalQuestions: sim.questions.length,
          requiredTier: sim.requiredTier,
          category: sim.category
        })),
        accessInfo: {
          freeAttemptsUsed: freeAttempts,
          remainingFreeAttempts: Math.max(0, 5 - freeAttempts),
          isBlocked,
          userTier
        }
      }
    });
  } catch (error) {
    console.error('Error fetching test-niveau simulations:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch simulations' }
    });
  }
});

/**
 * @route POST /api/simulations/extract-questions
 * @desc Extract questions from PDF using AI
 * @access Private (Manager+)
 */
router.post('/extract-questions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pdfUrl, simulationType, level } = req.body;

    if (!pdfUrl) {
      return res.status(400).json({
        success: false,
        error: { message: 'PDF URL is required' }
      });
    }

    // Import AIService dynamically
    const { AIService } = await import('../services/aiService');
    const pdfParse = (await import('pdf-parse')).default;
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    const path = (await import('path')).default;
    const os = (await import('os')).default;

    // Download PDF from URL
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(response.data);

    // Extract text from PDF
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Could not extract text from PDF' }
      });
    }

    // Generate questions using AI
    const questionCount = 25; // Default for TCF/TEF simulations
    const questionTypes = ["multiple-choice", "true-false", "short-answer"];
    const category = "reading"; // Default category for simulations

    const result = await AIService.generateQuestions(
      extractedText,
      `Simulation ${simulationType || 'TCF/TEF'}`,
      `Simulation ${simulationType || 'TCF/TEF'} - Niveau ${level || 'B1'}`,
      questionCount,
      questionTypes,
      category,
      "medium"
    );

    // Transform questions to match simulation builder format
    const transformedQuestions = result.questions.map((q: any, index: number) => {
      // Ensure options is an array
      let options = q.options || [];
      if (!Array.isArray(options)) {
        options = [];
      }
      // Ensure at least 4 options for multiple-choice
      if (q.type === "multiple-choice" && options.length < 4) {
        while (options.length < 4) {
          options.push("");
        }
      }

      // Map question types
      let mappedType = "MULTIPLE_CHOICE";
      if (q.type === "true-false") {
        mappedType = "TRUE_FALSE";
      } else if (q.type === "short-answer") {
        mappedType = "FILL_BLANK";
      } else if (q.type === "essay") {
        mappedType = "ESSAY";
      }

      return {
        id: `q_${Date.now()}_${index}`,
        question: q.questionText || q.question || "",
        type: mappedType,
        options: options,
        correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : (q.type === "multiple-choice" ? 0 : ""),
        points: q.points || 1,
        section: "comprehension_ecrite" // Default section
      };
    });

    res.json({
      success: true,
      data: {
        questions: transformedQuestions,
        extractedText: extractedText.substring(0, 500) + '...'
      }
    });
  } catch (error) {
    console.error('Error extracting questions from PDF:', error);
    next(error);
  }
});

/**
 * @route POST /api/simulations
 * @desc Create a new simulation
 * @access Private (Manager+)
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const {
      title,
      description,
      type,
      level,
      targetTier,
      questions,
      questionCount,
      sections,
      totalDuration,
      createdById
    } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Title and questions are required' }
      });
    }

    // Map targetTier to SubscriptionTier
    const subscriptionTierMap: Record<string, string> = {
      'FREE': 'FREE',
      'ESSENTIAL': 'ESSENTIAL',
      'PREMIUM': 'PREMIUM',
      'PRO': 'PRO'
    };
    const requiredTier = subscriptionTierMap[targetTier] || 'FREE';

    // Map category based on sections
    let category = 'READING';
    if (sections && sections.length > 0) {
      const firstSection = sections[0];
      if (firstSection.key === 'comprehension_orale') {
        category = 'LISTENING';
      } else if (firstSection.key === 'expression_ecrite') {
        category = 'WRITING';
      } else if (firstSection.key === 'expression_orale') {
        category = 'ORAL';
      }
    }

    // Create test (simulation) in database
    const test = await prisma.test.create({
      data: {
        title,
        description: description || '',
        type: 'PRACTICE',
        level: level || 'B1',
        category: category as any,
        requiredTier: requiredTier as any,
        duration: totalDuration || 60,
        questionCount: questionCount || questions.length,
        difficulty: 1,
        passingScore: 60,
        tags: [type || 'SIMULATION', level || 'B1'],
        aiPowered: true,
        hasAIFeedback: false,
        isOfficial: false,
        isPublished: true,
        status: 'PUBLISHED',
        createdById: createdById || userId
      }
    });

    // Create questions
    if (questions && questions.length > 0) {
      await prisma.testQuestion.createMany({
        data: questions.map((q: any, index: number) => {
          // Build options object
          let optionsData: any = {};
          if (q.type === "MULTIPLE_CHOICE" && Array.isArray(q.options)) {
            optionsData.choices = q.options;
          } else if (q.options && !Array.isArray(q.options)) {
            optionsData = q.options;
          }

          return {
            testId: test.id,
            questionText: q.question || q.questionText || '',
            type: q.type || 'MULTIPLE_CHOICE',
            options: Object.keys(optionsData).length > 0 ? optionsData : (Array.isArray(q.options) ? q.options : []),
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : (q.type === "MULTIPLE_CHOICE" ? 0 : ""),
            points: q.points || 1,
            explanation: q.explanation || null,
            order: index + 1,
            level: level || 'B1',
            category: category as any
          };
        })
      });
    }

    res.json({
      success: true,
      data: {
        test,
        message: 'Simulation created successfully'
      }
    });
  } catch (error) {
    console.error('Error creating simulation:', error);
    next(error);
  }
});

/**
 * Helper function to group questions by section
 */
function groupQuestionsBySection(questions: any[]) {
  const sections: Record<string, any> = {};

  questions.forEach(question => {
    const sectionName = question.category || 'General';
    if (!sections[sectionName]) {
      sections[sectionName] = {
        name: sectionName,
        duration: 20, // Default 20 minutes per section
        questions: []
      };
    }
    sections[sectionName].questions.push({
      id: question.id,
      type: question.type,
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      points: question.points || 1,
      section: sectionName,
      order: question.order,
      audioUrl: question.audioUrl,
      imageUrl: question.imageUrl
    });
  });

  return Object.values(sections);
}

export default router;
