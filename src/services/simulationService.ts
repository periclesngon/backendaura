import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';
import { EventEmailService } from './eventEmailService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBIXbgZ3EE043v9RLa0Z_h93-BArAF-Hr4');

export interface SimulationQuestion {
  id: string;
  type: 'multiple_choice' | 'text_input' | 'audio_response' | 'reading_comprehension';
  section: 'comprehension_orale' | 'comprehension_ecrite' | 'grammaire' | 'expression_orale' | 'expression_ecrite';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  question: string;
  context?: string; // For reading comprehension
  audioUrl?: string; // For listening comprehension
  options?: string[]; // For multiple choice
  correctAnswer?: string;
  explanation?: string;
  points: number;
  timeLimit?: number; // in seconds
}

export interface SimulationSession {
  id: string;
  userId: string;
  type: 'TCF' | 'TEF';
  level: string;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  currentSection: string;
  currentQuestionIndex: number;
  questions: SimulationQuestion[];
  answers: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  timeRemaining: number;
  score?: number;
  maxScore?: number;
  percentage?: number;
  levelAchieved?: string;
}

export interface CreateSimulationRequest {
  type: 'TCF' | 'TEF';
  level: 'starter' | 'intermediate' | 'advanced';
  sections: string[];
  duration?: number; // in minutes
}

export interface SubmitAnswerRequest {
  questionId: string;
  answer: any;
  timeSpent: number;
}

export class SimulationService {
  /**
   * Create a new simulation session
   */
  static async createSimulation(
    userId: string,
    request: CreateSimulationRequest
  ): Promise<SimulationSession> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Generate questions using Gemini
      const questions = await this.generateQuestionsWithGemini(
        request.type,
        request.level,
        request.sections
      );

      const totalDuration = request.duration || this.getDefaultDuration(request.level);
      
      const session: SimulationSession = {
        id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type: request.type,
        level: request.level,
        status: 'CREATED',
        currentSection: request.sections[0],
        currentQuestionIndex: 0,
        questions,
        answers: {},
        startedAt: new Date(),
        timeRemaining: totalDuration * 60, // Convert to seconds
        maxScore: questions.reduce((sum, q) => sum + q.points, 0)
      };

      // Store in database (you'll need to create the simulation table)
      await prisma.simulation.create({
        data: {
          id: session.id,
          userId: session.userId,
          type: session.type,
          level: session.level,
          status: session.status,
          currentSection: session.currentSection,
          currentQuestionIndex: session.currentQuestionIndex,
          questions: JSON.stringify(session.questions),
          answers: JSON.stringify(session.answers),
          startedAt: session.startedAt,
          timeRemaining: session.timeRemaining,
          maxScore: session.maxScore
        }
      });

      logger.info('Simulation session created', {
        sessionId: session.id,
        userId,
        type: request.type,
        level: request.level,
        questionCount: questions.length
      });

      return session;
    } catch (error) {
      logger.error('Failed to create simulation', { userId, request, error });
      throw error;
    }
  }

  /**
   * Generate questions using Gemini AI
   */
  private static async generateQuestionsWithGemini(
    type: 'TCF' | 'TEF',
    level: string,
    sections: string[]
  ): Promise<SimulationQuestion[]> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const levelMapping = {
        'starter': 'A1-A2',
        'intermediate': 'B1-B2',
        'advanced': 'C1-C2'
      };

      const cefrLevel = levelMapping[level as keyof typeof levelMapping] || 'B1-B2';
      
      const prompt = `
      Génère exactement 5 questions pour un examen ${type} de niveau ${cefrLevel}.
      
      Sections demandées: ${sections.join(', ')}
      
      Pour chaque question, fournis EXACTEMENT ce format JSON:
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
            "explanation": "Explication de la réponse correcte",
            "points": 2,
            "timeLimit": 120
          }
        ]
      }
      
      RÈGLES IMPORTANTES:
      - Utilise uniquement les sections: comprehension_orale, comprehension_ecrite, grammaire, expression_orale, expression_ecrite
      - Types de questions: multiple_choice, text_input, audio_response, reading_comprehension
      - Niveaux CECR: A1, A2, B1, B2, C1, C2
      - Questions authentiques et réalistes pour ${type}
      - Difficulté appropriée au niveau ${cefrLevel}
      - Points: 1-3 selon la difficulté
      - Temps limite: 60-300 secondes selon le type
      
      Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      let questionsData;
      try {
        // Clean the response to extract JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          questionsData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        logger.error('Failed to parse Gemini response', { text, parseError });
        // Fallback to default questions
        return this.getDefaultQuestions(type, level, sections);
      }

      if (!questionsData.questions || !Array.isArray(questionsData.questions)) {
        logger.warn('Invalid questions format from Gemini, using fallback');
        return this.getDefaultQuestions(type, level, sections);
      }

      logger.info('Questions generated successfully with Gemini', {
        type,
        level,
        sections,
        questionCount: questionsData.questions.length
      });

      return questionsData.questions;
    } catch (error) {
      logger.error('Failed to generate questions with Gemini', { type, level, sections, error });
      // Fallback to default questions
      return this.getDefaultQuestions(type, level, sections);
    }
  }

  /**
   * Get default questions as fallback
   */
  private static getDefaultQuestions(
    type: 'TCF' | 'TEF',
    level: string,
    sections: string[]
  ): SimulationQuestion[] {
    const defaultQuestions: SimulationQuestion[] = [
      {
        id: 'q1',
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
        id: 'q2',
        type: 'multiple_choice',
        section: 'grammaire',
        level: 'B1',
        question: 'Complétez la phrase: "Je _____ au cinéma hier soir."',
        options: [
          'vais',
          'suis allé',
          'irai',
          'allais'
        ],
        correctAnswer: 'suis allé',
        explanation: 'Le passé composé est utilisé pour exprimer une action accomplie dans le passé.',
        points: 1,
        timeLimit: 60
      },
      {
        id: 'q3',
        type: 'text_input',
        section: 'expression_ecrite',
        level: 'B1',
        question: 'Rédigez une phrase décrivant vos loisirs préférés (minimum 10 mots).',
        points: 3,
        timeLimit: 180
      },
      {
        id: 'q4',
        type: 'multiple_choice',
        section: 'comprehension_orale',
        level: 'B1',
        question: 'Que dit la personne dans l\'enregistrement?',
        audioUrl: '/audio/sample-b1.mp3',
        options: [
          'Elle parle de ses vacances',
          'Elle commande au restaurant',
          'Elle demande des directions',
          'Elle présente sa famille'
        ],
        correctAnswer: 'Elle commande au restaurant',
        explanation: 'L\'enregistrement contient une conversation dans un restaurant.',
        points: 2,
        timeLimit: 90
      },
      {
        id: 'q5',
        type: 'audio_response',
        section: 'expression_orale',
        level: 'B1',
        question: 'Décrivez votre ville natale en 30 secondes.',
        points: 4,
        timeLimit: 45
      }
    ];

    return defaultQuestions.filter(q => sections.includes(q.section));
  }

  /**
   * Start a simulation session
   */
  static async startSimulation(sessionId: string, userId: string): Promise<SimulationSession> {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation session not found');
      }

      if (simulation.status !== 'CREATED') {
        throw new ValidationError('Simulation has already been started');
      }

      const updatedSimulation = await prisma.simulation.update({
        where: { id: sessionId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      const session: SimulationSession = {
        id: updatedSimulation.id,
        userId: updatedSimulation.userId,
        type: updatedSimulation.type as 'TCF' | 'TEF',
        level: updatedSimulation.level,
        status: updatedSimulation.status as any,
        currentSection: updatedSimulation.currentSection,
        currentQuestionIndex: updatedSimulation.currentQuestionIndex,
        questions: JSON.parse(updatedSimulation.questions as string),
        answers: JSON.parse(updatedSimulation.answers as string),
        startedAt: updatedSimulation.startedAt,
        timeRemaining: updatedSimulation.timeRemaining,
        maxScore: updatedSimulation.maxScore
      };

      logger.info('Simulation started', { sessionId, userId });

      return session;
    } catch (error) {
      logger.error('Failed to start simulation', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Submit an answer
   */
  static async submitAnswer(
    sessionId: string,
    userId: string,
    request: SubmitAnswerRequest
  ): Promise<{ correct: boolean; explanation?: string; nextQuestion?: SimulationQuestion }> {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: sessionId, userId, status: 'IN_PROGRESS' }
      });

      if (!simulation) {
        throw new NotFoundError('Active simulation session not found');
      }

      const questions: SimulationQuestion[] = JSON.parse(simulation.questions as string);
      const answers = JSON.parse(simulation.answers as string);
      
      const question = questions.find(q => q.id === request.questionId);
      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // Store the answer
      answers[request.questionId] = {
        answer: request.answer,
        timeSpent: request.timeSpent,
        submittedAt: new Date()
      };

      // Check if answer is correct
      const isCorrect = this.checkAnswer(question, request.answer);
      
      // Move to next question
      const currentIndex = questions.findIndex(q => q.id === request.questionId);
      const nextIndex = currentIndex + 1;
      const nextQuestion = nextIndex < questions.length ? questions[nextIndex] : undefined;

      // Update simulation
      await prisma.simulation.update({
        where: { id: sessionId },
        data: {
          answers: JSON.stringify(answers),
          currentQuestionIndex: nextIndex,
          timeRemaining: Math.max(0, simulation.timeRemaining - request.timeSpent)
        }
      });

      logger.info('Answer submitted', {
        sessionId,
        userId,
        questionId: request.questionId,
        correct: isCorrect
      });

      return {
        correct: isCorrect,
        explanation: question.explanation,
        nextQuestion
      };
    } catch (error) {
      logger.error('Failed to submit answer', { sessionId, userId, request, error });
      throw error;
    }
  }

  /**
   * Complete simulation and calculate results
   */
  static async completeSimulation(sessionId: string, userId: string): Promise<{
    score: number;
    maxScore: number;
    percentage: number;
    levelAchieved: string;
    results: any;
  }> {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation session not found');
      }

      const questions: SimulationQuestion[] = JSON.parse(simulation.questions as string);
      const answers = JSON.parse(simulation.answers as string);

      // Calculate score
      let score = 0;
      const results: any[] = [];

      for (const question of questions) {
        const userAnswer = answers[question.id];
        if (userAnswer) {
          const isCorrect = this.checkAnswer(question, userAnswer.answer);
          if (isCorrect) {
            score += question.points;
          }
          
          results.push({
            questionId: question.id,
            question: question.question,
            userAnswer: userAnswer.answer,
            correctAnswer: question.correctAnswer,
            isCorrect,
            points: isCorrect ? question.points : 0,
            explanation: question.explanation
          });
        }
      }

      const maxScore = simulation.maxScore || questions.reduce((sum, q) => sum + q.points, 0);
      const percentage = Math.round((score / maxScore) * 100);
      const levelAchieved = this.calculateLevel(percentage);

      // Update simulation
      await prisma.simulation.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score,
          percentage,
          levelAchieved
        }
      });

      // Get user info for email
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true }
      });

      // Send completion email
      if (user) {
        await EventEmailService.handleTestCompletion({
          userId,
          testId: sessionId,
          email: user.email,
          firstName: user.firstName,
          testName: `Simulation ${simulation.type} - ${simulation.level}`,
          score,
          totalQuestions: questions.length,
          percentage,
          level: levelAchieved
        });
      }

      logger.info('Simulation completed', {
        sessionId,
        userId,
        score,
        maxScore,
        percentage,
        levelAchieved
      });

      return {
        score,
        maxScore,
        percentage,
        levelAchieved,
        results
      };
    } catch (error) {
      logger.error('Failed to complete simulation', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Check if an answer is correct
   */
  private static checkAnswer(question: SimulationQuestion, userAnswer: any): boolean {
    if (!question.correctAnswer) return false;

    switch (question.type) {
      case 'multiple_choice':
        return userAnswer === question.correctAnswer;
      case 'text_input':
        // Simple text comparison (you might want to make this more sophisticated)
        return userAnswer?.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      case 'audio_response':
        // For audio responses, you'd need speech-to-text analysis
        // For now, we'll assume it's manually graded
        return true;
      default:
        return false;
    }
  }

  /**
   * Calculate CEFR level based on percentage
   */
  private static calculateLevel(percentage: number): string {
    if (percentage >= 90) return 'C2';
    if (percentage >= 80) return 'C1';
    if (percentage >= 70) return 'B2';
    if (percentage >= 60) return 'B1';
    if (percentage >= 50) return 'A2';
    return 'A1';
  }

  /**
   * Get default duration for simulation level
   */
  private static getDefaultDuration(level: string): number {
    const durations = {
      'starter': 15,      // 15 minutes
      'intermediate': 25, // 25 minutes
      'advanced': 35      // 35 minutes
    };
    return durations[level as keyof typeof durations] || 25;
  }

  /**
   * Get simulation session
   */
  static async getSimulation(sessionId: string, userId: string): Promise<SimulationSession> {
    try {
      const simulation = await prisma.simulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!simulation) {
        throw new NotFoundError('Simulation session not found');
      }

      return {
        id: simulation.id,
        userId: simulation.userId,
        type: simulation.type as 'TCF' | 'TEF',
        level: simulation.level,
        status: simulation.status as any,
        currentSection: simulation.currentSection,
        currentQuestionIndex: simulation.currentQuestionIndex,
        questions: JSON.parse(simulation.questions as string),
        answers: JSON.parse(simulation.answers as string),
        startedAt: simulation.startedAt,
        completedAt: simulation.completedAt || undefined,
        timeRemaining: simulation.timeRemaining,
        score: simulation.score || undefined,
        maxScore: simulation.maxScore || undefined,
        percentage: simulation.percentage || undefined,
        levelAchieved: simulation.levelAchieved || undefined
      };
    } catch (error) {
      logger.error('Failed to get simulation', { sessionId, userId, error });
      throw error;
    }
  }
}
