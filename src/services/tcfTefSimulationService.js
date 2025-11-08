const { PrismaClient } = require('@prisma/client');
const geminiApiManager = require('../utils/geminiApiManager');
const { logger } = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

class TCFTEFSimulationService {
  /**
   * Create a new simulation session
   */
  static async createSimulation(userId, simulationData) {
    try {
      const { type, level, sections, duration } = simulationData;
      
      // Validate input
      if (!['TCF', 'TEF'].includes(type)) {
        throw new ValidationError('Invalid simulation type. Must be TCF or TEF.');
      }

      if (!['starter', 'intermediate', 'advanced'].includes(level)) {
        throw new ValidationError('Invalid level. Must be starter, intermediate, or advanced.');
      }

      // Generate questions using Gemini AI
      const questions = await this.generateQuestionsWithGemini(type, level, sections);
      
      // Calculate total duration and max score
      const totalDuration = duration || this.getDefaultDuration(level);
      const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

      // Create simulation in database
      const simulation = await prisma.simulation.create({
        data: {
          userId,
          type,
          level,
          status: 'CREATED',
          currentSection: sections[0],
          currentQuestionIndex: 0,
          questions: JSON.stringify(questions),
          answers: JSON.stringify({}),
          timeRemaining: totalDuration * 60, // Convert to seconds
          maxScore,
          createdAt: new Date()
        }
      });

      logger.info('TCF/TEF simulation created', {
        simulationId: simulation.id,
        userId,
        type,
        level,
        questionCount: questions.length
      });

      return {
        id: simulation.id,
        type: simulation.type,
        level: simulation.level,
        status: simulation.status,
        questions: questions.map(q => ({
          ...q,
          correctAnswer: undefined, // Don't send correct answers to frontend
          explanation: undefined
        })),
        timeRemaining: simulation.timeRemaining,
        maxScore: simulation.maxScore,
        currentQuestionIndex: 0
      };
    } catch (error) {
      logger.error('Failed to create TCF/TEF simulation', { userId, simulationData, error });
      throw error;
    }
  }

  /**
   * Generate questions using Gemini AI
   */
  static async generateQuestionsWithGemini(type, level, sections) {
    try {
      const levelMapping = {
        'starter': 'A1-A2',
        'intermediate': 'B1-B2', 
        'advanced': 'C1-C2'
      };

      const cefrLevel = levelMapping[level];
      const questionCount = this.getQuestionCount(level);

      const response = await geminiApiManager.makeRequest(async (model) => {
        const prompt = `
        Génère exactement ${questionCount} questions pour un examen ${type} de niveau ${cefrLevel}.
        
        Sections: ${sections.join(', ')}
        
        Répartition par section:
        - comprehension_ecrite: 40% des questions
        - grammaire: 30% des questions  
        - expression_ecrite: 20% des questions
        - comprehension_orale: 10% des questions

        Format JSON EXACT:
        {
          "questions": [
            {
              "id": "q1",
              "type": "multiple_choice",
              "section": "comprehension_ecrite",
              "level": "B1",
              "question": "Question en français",
              "context": "Texte de contexte si nécessaire",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "Option A",
              "explanation": "Explication détaillée de la réponse",
              "points": 2,
              "timeLimit": 120
            }
          ]
        }

        RÈGLES IMPORTANTES:
        - Questions authentiques et réalistes pour ${type}
        - Difficulté appropriée au niveau ${cefrLevel}
        - Types: multiple_choice, text_input, reading_comprehension
        - Points: 1-3 selon la difficulté
        - Temps limite: 60-300 secondes selon le type
        - Contexte français authentique
        - Grammaire progressive selon le niveau

        Réponds UNIQUEMENT avec le JSON valide.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse JSON response
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

      return response || this.getDefaultQuestions(type, level, sections);
    } catch (error) {
      logger.error('Failed to generate questions with Gemini', { type, level, sections, error });
      return this.getDefaultQuestions(type, level, sections);
    }
  }

  /**
   * Start simulation session
   */
  static async startSimulation(simulationId, userId) {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: simulationId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation not found');
      }

      if (simulation.status !== 'CREATED') {
        throw new ValidationError('Simulation has already been started');
      }

      const updatedSimulation = await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      logger.info('TCF/TEF simulation started', { simulationId, userId });

      const questions = JSON.parse(simulation.questions);
      return {
        id: updatedSimulation.id,
        status: 'IN_PROGRESS',
        currentQuestion: questions[0],
        timeRemaining: simulation.timeRemaining,
        totalQuestions: questions.length,
        currentQuestionIndex: 0
      };
    } catch (error) {
      logger.error('Failed to start simulation', { simulationId, userId, error });
      throw error;
    }
  }

  /**
   * Submit answer for a question
   */
  static async submitAnswer(simulationId, userId, answerData) {
    try {
      const { questionId, answer, timeSpent } = answerData;

      const simulation = await prisma.simulation.findFirst({
        where: { id: simulationId, userId, status: 'IN_PROGRESS' }
      });

      if (!simulation) {
        throw new NotFoundError('Active simulation not found');
      }

      const questions = JSON.parse(simulation.questions);
      const answers = JSON.parse(simulation.answers);
      
      const question = questions.find(q => q.id === questionId);
      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // Store answer
      answers[questionId] = {
        answer,
        timeSpent,
        submittedAt: new Date(),
        isCorrect: this.checkAnswer(question, answer)
      };

      // Calculate next question
      const currentIndex = questions.findIndex(q => q.id === questionId);
      const nextIndex = currentIndex + 1;
      const nextQuestion = nextIndex < questions.length ? questions[nextIndex] : null;

      // Update simulation
      await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          answers: JSON.stringify(answers),
          currentQuestionIndex: nextIndex,
          timeRemaining: Math.max(0, simulation.timeRemaining - timeSpent)
        }
      });

      logger.info('Answer submitted', {
        simulationId,
        userId,
        questionId,
        isCorrect: answers[questionId].isCorrect
      });

      return {
        isCorrect: answers[questionId].isCorrect,
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
      logger.error('Failed to submit answer', { simulationId, userId, answerData, error });
      throw error;
    }
  }

  /**
   * Complete simulation and calculate results
   */
  static async completeSimulation(simulationId, userId) {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: simulationId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation not found');
      }

      const questions = JSON.parse(simulation.questions);
      const answers = JSON.parse(simulation.answers);

      // Calculate detailed results
      const results = this.calculateDetailedResults(questions, answers);

      // Update simulation
      await prisma.simulation.update({
        where: { id: simulationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: results.totalScore,
          percentage: results.percentage,
          levelAchieved: results.levelAchieved
        }
      });

      // Send completion email (if user exists)
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true }
        });

        if (user) {
          const EventEmailService = require('./eventEmailService');
          await EventEmailService.handleTestCompletion({
            userId,
            testId: simulationId,
            email: user.email,
            firstName: user.firstName,
            testName: `Simulation ${simulation.type} - ${simulation.level}`,
            score: results.totalScore,
            totalQuestions: questions.length,
            percentage: results.percentage,
            level: results.levelAchieved
          });
        }
      } catch (emailError) {
        logger.warn('Failed to send completion email', { emailError });
      }

      logger.info('TCF/TEF simulation completed', {
        simulationId,
        userId,
        score: results.totalScore,
        percentage: results.percentage,
        levelAchieved: results.levelAchieved
      });

      return results;
    } catch (error) {
      logger.error('Failed to complete simulation', { simulationId, userId, error });
      throw error;
    }
  }

  /**
   * Get simulation details
   */
  static async getSimulation(simulationId, userId) {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: simulationId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation not found');
      }

      const questions = JSON.parse(simulation.questions);
      const answers = JSON.parse(simulation.answers);

      return {
        id: simulation.id,
        type: simulation.type,
        level: simulation.level,
        status: simulation.status,
        currentQuestionIndex: simulation.currentQuestionIndex,
        timeRemaining: simulation.timeRemaining,
        maxScore: simulation.maxScore,
        score: simulation.score,
        percentage: simulation.percentage,
        levelAchieved: simulation.levelAchieved,
        createdAt: simulation.createdAt,
        startedAt: simulation.startedAt,
        completedAt: simulation.completedAt,
        questions: simulation.status === 'COMPLETED' ? questions : questions.map(q => ({
          ...q,
          correctAnswer: undefined,
          explanation: undefined
        })),
        answers: simulation.status === 'COMPLETED' ? answers : {}
      };
    } catch (error) {
      logger.error('Failed to get simulation', { simulationId, userId, error });
      throw error;
    }
  }

  /**
   * Helper methods
   */
  static checkAnswer(question, userAnswer) {
    if (!question.correctAnswer) return false;

    switch (question.type) {
      case 'multiple_choice':
        return userAnswer === question.correctAnswer;
      case 'text_input':
        return userAnswer?.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      default:
        return false;
    }
  }

  static calculateDetailedResults(questions, answers) {
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
      if (answer && answer.isCorrect) {
        totalScore += question.points;
        sectionResults[question.section].score += question.points;
        sectionResults[question.section].correct += 1;
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
      recommendations: this.generateRecommendations(percentage, sectionResults)
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

  static generateRecommendations(percentage, sectionResults) {
    const recommendations = [];

    if (percentage >= 90) {
      recommendations.push("Excellent travail! Vous maîtrisez parfaitement ce niveau.");
      recommendations.push("Passez au niveau supérieur pour continuer votre progression.");
    } else if (percentage >= 70) {
      recommendations.push("Très bon résultat! Continuez vos efforts.");
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
          'comprehension_ecrite': 'compréhension écrite',
          'grammaire': 'grammaire',
          'expression_ecrite': 'expression écrite',
          'comprehension_orale': 'compréhension orale'
        };
        recommendations.push(`Travaillez davantage la ${sectionNames[section]}.`);
      }
    });

    return recommendations;
  }

  static getQuestionCount(level) {
    const counts = {
      'starter': 10,
      'intermediate': 15,
      'advanced': 20
    };
    return counts[level] || 15;
  }

  static getDefaultDuration(level) {
    const durations = {
      'starter': 15,
      'intermediate': 25,
      'advanced': 35
    };
    return durations[level] || 25;
  }

  static getDefaultQuestions(type, level, sections) {
    // Fallback questions when Gemini is unavailable
    return [
      {
        id: 'fallback_q1',
        type: 'multiple_choice',
        section: 'comprehension_ecrite',
        level: 'B1',
        question: 'Quel est le thème principal de ce texte?',
        context: 'La France est un pays riche en histoire et en culture. Ses monuments, ses musées et ses traditions attirent des millions de visiteurs chaque année.',
        options: [
          'La géographie française',
          'Le tourisme en France', 
          'L\'histoire de France',
          'La cuisine française'
        ],
        correctAnswer: 'Le tourisme en France',
        explanation: 'Le texte parle des attractions touristiques de la France.',
        points: 2,
        timeLimit: 120
      },
      {
        id: 'fallback_q2',
        type: 'multiple_choice',
        section: 'grammaire',
        level: 'B1',
        question: 'Complétez la phrase: "Je _____ au cinéma hier soir."',
        options: ['vais', 'suis allé', 'irai', 'allais'],
        correctAnswer: 'suis allé',
        explanation: 'Le passé composé est utilisé pour exprimer une action accomplie dans le passé.',
        points: 1,
        timeLimit: 60
      }
    ].filter(q => sections.includes(q.section));
  }
}

module.exports = TCFTEFSimulationService;
