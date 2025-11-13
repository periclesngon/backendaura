const { PrismaClient } = require('@prisma/client');
const geminiApiManager = require('../utils/geminiApiManager');
const { logger } = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

class TestManagementService {
  /**
   * Available test types
   */
  static getTestTypes() {
    return {
      'level_assessment': {
        name: 'Test de niveau',
        description: 'Évaluation complète du niveau de français',
        duration: 45,
        sections: ['comprehension_orale', 'comprehension_ecrite', 'grammaire', 'expression_ecrite'],
        questionCount: 25,
        difficulty: 'Complet',
        levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
      },
      'grammar_test': {
        name: 'Test de grammaire',
        description: 'Évaluation spécialisée en grammaire française',
        duration: 30,
        sections: ['grammaire'],
        questionCount: 20,
        difficulty: 'Moyen',
        levels: ['A1', 'A2', 'B1', 'B2']
      },
      'vocabulary_test': {
        name: 'Test de vocabulaire',
        description: 'Évaluation du vocabulaire français',
        duration: 25,
        sections: ['vocabulaire'],
        questionCount: 30,
        difficulty: 'Facile',
        levels: ['A1', 'A2', 'B1', 'B2']
      },
      'comprehension_test': {
        name: 'Test de compréhension',
        description: 'Évaluation de la compréhension écrite et orale',
        duration: 40,
        sections: ['comprehension_orale', 'comprehension_ecrite'],
        questionCount: 20,
        difficulty: 'Moyen',
        levels: ['A2', 'B1', 'B2', 'C1']
      },
      'expression_test': {
        name: 'Test d\'expression',
        description: 'Évaluation de l\'expression écrite',
        duration: 50,
        sections: ['expression_ecrite'],
        questionCount: 10,
        difficulty: 'Difficile',
        levels: ['B1', 'B2', 'C1', 'C2']
      }
    };
  }

  /**
   * Create a new test session
   */
  static async createTest(userId, testData) {
    try {
      const { testType, level, customSections } = testData;
      
      const testTypes = this.getTestTypes();
      if (!testTypes[testType]) {
        throw new ValidationError('Invalid test type');
      }

      const testConfig = testTypes[testType];
      const sections = customSections || testConfig.sections;

      // Generate test questions using Gemini AI
      const questions = await this.generateTestQuestions(testType, level, sections, testConfig.questionCount);

      // Create test session
      const test = await prisma.test.create({
        data: {
          userId,
          testType,
          level,
          status: 'CREATED',
          questions: JSON.stringify(questions),
          answers: JSON.stringify({}),
          currentQuestionIndex: 0,
          timeRemaining: testConfig.duration * 60, // Convert to seconds
          maxScore: questions.reduce((sum, q) => sum + q.points, 0),
          createdAt: new Date()
        }
      });

      logger.info('Test created', {
        testId: test.id,
        userId,
        testType,
        level,
        questionCount: questions.length
      });

      return {
        id: test.id,
        testType,
        level,
        status: 'CREATED',
        description: testConfig.description,
        duration: testConfig.duration,
        questionCount: questions.length,
        maxScore: test.maxScore,
        sections
      };
    } catch (error) {
      logger.error('Failed to create test', { userId, testData, error });
      throw error;
    }
  }

  /**
   * Generate test questions using Gemini AI
   */
  static async generateTestQuestions(testType, level, sections, questionCount) {
    try {
      const response = await geminiApiManager.makeRequest(async (model) => {
        const prompt = `
        Génère exactement ${questionCount} questions pour un ${testType} de niveau ${level}.
        
        Sections: ${sections.join(', ')}
        
        Répartition par section (équitable):
        ${sections.map(section => `- ${section}: ${Math.ceil(questionCount / sections.length)} questions`).join('\n')}

        Format JSON EXACT:
        {
          "questions": [
            {
              "id": "q1",
              "type": "multiple_choice",
              "section": "grammaire",
              "level": "${level}",
              "question": "Question en français",
              "context": "Contexte si nécessaire",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "Option A",
              "explanation": "Explication détaillée",
              "points": 2,
              "difficulty": "medium"
            }
          ]
        }

        Types de questions selon la section:
        - grammaire: multiple_choice (conjugaison, accord, syntaxe)
        - vocabulaire: multiple_choice (synonymes, définitions, usage)
        - comprehension_ecrite: reading_comprehension (texte + questions)
        - comprehension_orale: audio_comprehension (description audio + questions)
        - expression_ecrite: text_input (rédaction, transformation)

        Niveaux de difficulté:
        - easy: 1 point
        - medium: 2 points  
        - hard: 3 points

        Questions authentiques et progressives selon le niveau ${level}.
        Réponds UNIQUEMENT avec le JSON valide.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in Gemini response');
        }

        const questionsData = JSON.parse(jsonMatch[0]);
        
        if (!questionsData.questions || !Array.isArray(questionsData.questions)) {
          throw new Error('Invalid questions format from Gemini');
        }

        return questionsData.questions;
      });

      return response || this.getDefaultTestQuestions(testType, level, sections);
    } catch (error) {
      logger.error('Failed to generate test questions', { testType, level, sections, error });
      return this.getDefaultTestQuestions(testType, level, sections);
    }
  }

  /**
   * Start test session
   */
  static async startTest(testId, userId) {
    try {
      const test = await prisma.test.findFirst({
        where: { id: testId, userId }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      if (test.status !== 'CREATED') {
        throw new ValidationError('Test has already been started');
      }

      const updatedTest = await prisma.test.update({
        where: { id: testId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      const questions = JSON.parse(test.questions);

      logger.info('Test started', { testId, userId });

      return {
        id: updatedTest.id,
        status: 'IN_PROGRESS',
        currentQuestion: {
          ...questions[0],
          correctAnswer: undefined,
          explanation: undefined
        },
        currentQuestionIndex: 0,
        totalQuestions: questions.length,
        timeRemaining: test.timeRemaining
      };
    } catch (error) {
      logger.error('Failed to start test', { testId, userId, error });
      throw error;
    }
  }

  /**
   * Submit test answer
   */
  static async submitAnswer(testId, userId, answerData) {
    try {
      const { questionId, answer, timeSpent } = answerData;

      const test = await prisma.test.findFirst({
        where: { id: testId, userId, status: 'IN_PROGRESS' }
      });

      if (!test) {
        throw new NotFoundError('Active test not found');
      }

      const questions = JSON.parse(test.questions);
      const answers = JSON.parse(test.answers);
      
      const question = questions.find(q => q.id === questionId);
      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // Evaluate answer
      const evaluation = await this.evaluateAnswer(question, answer);

      // Store answer
      answers[questionId] = {
        answer,
        timeSpent,
        submittedAt: new Date(),
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback
      };

      // Calculate next question
      const currentIndex = questions.findIndex(q => q.id === questionId);
      const nextIndex = currentIndex + 1;
      const nextQuestion = nextIndex < questions.length ? questions[nextIndex] : null;

      // Update test
      await prisma.test.update({
        where: { id: testId },
        data: {
          answers: JSON.stringify(answers),
          currentQuestionIndex: nextIndex,
          timeRemaining: Math.max(0, test.timeRemaining - timeSpent)
        }
      });

      logger.info('Test answer submitted', {
        testId,
        userId,
        questionId,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score
      });

      return {
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback,
        explanation: question.explanation,
        nextQuestion: nextQuestion ? {
          ...nextQuestion,
          correctAnswer: undefined,
          explanation: undefined
        } : null,
        progress: {
          current: nextIndex,
          total: questions.length,
          percentage: Math.round((nextIndex / questions.length) * 100)
        }
      };
    } catch (error) {
      logger.error('Failed to submit test answer', { testId, userId, answerData, error });
      throw error;
    }
  }

  /**
   * Complete test and generate results
   */
  static async completeTest(testId, userId) {
    try {
      const test = await prisma.test.findFirst({
        where: { id: testId, userId }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      const questions = JSON.parse(test.questions);
      const answers = JSON.parse(test.answers);

      // Calculate detailed results
      const results = this.calculateTestResults(questions, answers);

      // Update test
      await prisma.test.update({
        where: { id: testId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: results.totalScore,
          percentage: results.percentage,
          levelAchieved: results.levelAchieved
        }
      });

      // Send completion email
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true }
        });

        if (user) {
          const EventEmailService = require('./eventEmailService');
          await EventEmailService.handleTestCompletion({
            userId,
            testId,
            email: user.email,
            firstName: user.firstName,
            testName: `Test ${test.testType} - ${test.level}`,
            score: results.totalScore,
            totalQuestions: questions.length,
            percentage: results.percentage,
            level: results.levelAchieved
          });
        }
      } catch (emailError) {
        logger.warn('Failed to send test completion email', { emailError });
      }

      // Generate certificate if high score
      if (results.percentage >= 80) {
        try {
          const CertificateService = require('./certificateService');
          await CertificateService.generateCertificate({
            userId,
            type: 'TEST_ACHIEVEMENT',
            title: `Certificat de Réussite - Test ${test.testType}`,
            description: `Excellent résultat au test ${test.testType} avec ${results.percentage}% de réussite.`,
            level: results.levelAchieved,
            score: results.totalScore,
            percentage: results.percentage,
            testName: `Test ${test.testType}`,
            validityPeriod: 12
          });
        } catch (certError) {
          logger.warn('Failed to generate test certificate', { certError });
        }
      }

      logger.info('Test completed', {
        testId,
        userId,
        score: results.totalScore,
        percentage: results.percentage,
        levelAchieved: results.levelAchieved
      });

      return results;
    } catch (error) {
      logger.error('Failed to complete test', { testId, userId, error });
      throw error;
    }
  }

  /**
   * Get test details
   */
  static async getTest(testId, userId) {
    try {
      const test = await prisma.test.findFirst({
        where: { id: testId, userId }
      });

      if (!test) {
        throw new NotFoundError('Test not found');
      }

      const questions = JSON.parse(test.questions);
      const answers = JSON.parse(test.answers);

      return {
        id: test.id,
        testType: test.testType,
        level: test.level,
        status: test.status,
        currentQuestionIndex: test.currentQuestionIndex,
        timeRemaining: test.timeRemaining,
        maxScore: test.maxScore,
        score: test.score,
        percentage: test.percentage,
        levelAchieved: test.levelAchieved,
        createdAt: test.createdAt,
        startedAt: test.startedAt,
        completedAt: test.completedAt,
        questions: test.status === 'COMPLETED' ? questions : questions.map(q => ({
          ...q,
          correctAnswer: undefined,
          explanation: undefined
        })),
        answers: test.status === 'COMPLETED' ? answers : {}
      };
    } catch (error) {
      logger.error('Failed to get test', { testId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's test history
   */
  static async getUserTestHistory(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;

      const [tests, total] = await Promise.all([
        prisma.test.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            testType: true,
            level: true,
            status: true,
            score: true,
            percentage: true,
            levelAchieved: true,
            createdAt: true,
            completedAt: true
          }
        }),
        prisma.test.count({ where: { userId } })
      ]);

      return {
        tests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user test history', { userId, error });
      throw error;
    }
  }

  /**
   * Helper methods - Updated to use new AIEvaluationService
   */
  static async evaluateAnswer(question, userAnswer) {
    // Import the new evaluation service
    const { AIEvaluationService } = require('./aiEvaluationService');
    
    try {
      const evaluationRequest = {
        question: {
          id: question.id || '',
          type: question.type,
          questionText: question.question || question.questionText || '',
          passage: question.passage || null,
          correctAnswer: question.correctAnswer,
          category: question.category || 'GENERAL',
          level: question.level || 'B1',
          points: question.points || 1,
          options: question.options || [],
          minWords: question.minWords || null,
          maxWords: question.maxWords || null,
          writingType: question.writingType || null
        },
        userAnswer: userAnswer
      };

      const evaluation = await AIEvaluationService.evaluateAnswer(evaluationRequest);
      return evaluation;
    } catch (error) {
      logger.warn('Failed to evaluate answer with AIEvaluationService', { error, questionId: question.id });
      
      // Fallback to simple evaluation
      if (question.type === 'multiple-choice' || question.type === 'true-false') {
        const isCorrect = String(userAnswer) === String(question.correctAnswer);
        return {
          isCorrect,
          score: isCorrect ? question.points : 0,
          maxScore: question.points,
          feedback: isCorrect ? 'Correct!' : 'Incorrect.'
        };
      }
      
      // Fallback for text answers
      return {
        isCorrect: false,
        score: 0,
        maxScore: question.points || 1,
        feedback: 'Erreur lors de l\'évaluation. Veuillez réessayer.'
      };
    }
  }

  static calculateTestResults(questions, answers) {
    let totalScore = 0;
    let maxScore = 0;
    const sectionResults = {};

    questions.forEach(question => {
      maxScore += question.points;
      
      if (!sectionResults[question.section]) {
        sectionResults[question.section] = {
          score: 0,
          maxScore: 0,
          questions: 0,
          correct: 0
        };
      }

      sectionResults[question.section].maxScore += question.points;
      sectionResults[question.section].questions += 1;

      const answer = answers[question.id];
      if (answer) {
        totalScore += answer.score || 0;
        sectionResults[question.section].score += answer.score || 0;
        if (answer.isCorrect) {
          sectionResults[question.section].correct += 1;
        }
      }
    });

    const percentage = Math.round((totalScore / maxScore) * 100);
    const levelAchieved = this.calculateLevel(percentage);

    return {
      totalScore,
      maxScore,
      percentage,
      levelAchieved,
      sectionResults,
      recommendations: this.generateTestRecommendations(percentage, sectionResults)
    };
  }

  static calculateLevel(percentage) {
    if (percentage >= 90) return 'C2';
    if (percentage >= 80) return 'C1';
    if (percentage >= 70) return 'B2';
    if (percentage >= 60) return 'B1';
    if (percentage >= 50) return 'A2';
    return 'A1';
  }

  static generateTestRecommendations(percentage, sectionResults) {
    const recommendations = [];

    if (percentage >= 85) {
      recommendations.push("Excellent résultat! Vous maîtrisez bien ce niveau.");
      recommendations.push("Vous pouvez passer au niveau supérieur.");
    } else if (percentage >= 70) {
      recommendations.push("Bon résultat! Continuez vos efforts.");
      recommendations.push("Travaillez sur les points faibles identifiés.");
    } else {
      recommendations.push("Il y a de la marge d'amélioration.");
      recommendations.push("Révisez les concepts fondamentaux.");
    }

    // Section-specific recommendations
    Object.entries(sectionResults).forEach(([section, result]) => {
      const sectionPercentage = Math.round((result.score / result.maxScore) * 100);
      if (sectionPercentage < 60) {
        const sectionNames = {
          'grammaire': 'grammaire',
          'vocabulaire': 'vocabulaire',
          'comprehension_ecrite': 'compréhension écrite',
          'comprehension_orale': 'compréhension orale',
          'expression_ecrite': 'expression écrite'
        };
        recommendations.push(`Travaillez davantage ${sectionNames[section]}.`);
      }
    });

    return recommendations;
  }

  static getDefaultTestQuestions(testType, level, sections) {
    return [
      {
        id: 'default_q1',
        type: 'multiple_choice',
        section: 'grammaire',
        level,
        question: 'Complétez la phrase: "Je _____ français depuis deux ans."',
        options: ['apprends', 'apprend', 'apprenons', 'apprennent'],
        correctAnswer: 'apprends',
        explanation: 'Le verbe "apprendre" se conjugue "j\'apprends" à la première personne du singulier.',
        points: 2,
        difficulty: 'medium'
      },
      {
        id: 'default_q2',
        type: 'multiple_choice',
        section: 'vocabulaire',
        level,
        question: 'Quel est le synonyme de "content"?',
        options: ['triste', 'heureux', 'fatigué', 'malade'],
        correctAnswer: 'heureux',
        explanation: '"Content" et "heureux" sont des synonymes.',
        points: 1,
        difficulty: 'easy'
      }
    ].filter(q => sections.includes(q.section));
  }
}

module.exports = TestManagementService;
