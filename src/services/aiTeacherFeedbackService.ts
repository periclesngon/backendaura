import { prisma } from '@/database/connection';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface TeacherFeedbackRequest {
  userId: string;
  simulationId: string;
  simulationTitle: string;
  answers: Record<string, string>;
  questions: Array<{
    id: string;
    type: 'MCQ' | 'FILL_IN' | 'TRUE_FALSE' | 'ESSAY' | 'AUDIO_RESPONSE';
    questionText: string;
    correctAnswer?: string;
    options?: string[];
    points: number;
    section: string;
  }>;
  timeSpent: number; // in seconds
  totalDuration: number; // in seconds
}

export interface TeacherFeedbackResult {
  id: string;
  overallScore: number;
  maxScore: number;
  confidence: number;
  canGradeTo100Percent: boolean;
  overallFeedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  detailedAnalysis: {
    questionAnalysis: Array<{
      questionId: string;
      studentAnswer: string;
      correctAnswer?: string;
      isCorrect: boolean;
      points: number;
      maxPoints: number;
      teacherComments: string;
      mistakeType?: string;
      correction?: string;
      explanation?: string;
    }>;
    sectionAnalysis: Array<{
      section: string;
      score: number;
      maxScore: number;
      feedback: string;
    }>;
    unclearResponses: string[];
    uniqueLanguageStyles: string[];
    grammarErrors: Array<{
      error: string;
      correction: string;
      explanation: string;
    }>;
    vocabularyNotes: Array<{
      word: string;
      usage: string;
      suggestion: string;
    }>;
  };
}

export class AITeacherFeedbackService {
  /**
   * Generate comprehensive teacher feedback for a completed simulation
   */
  static async generateTeacherFeedback(request: TeacherFeedbackRequest): Promise<TeacherFeedbackResult> {
    try {
      logger.info(`Generating AI teacher feedback for user ${request.userId}, simulation ${request.simulationId}`);

      // Analyze answers and generate detailed feedback
      const analysis = await this.analyzeStudentWork(request);
      
      // Generate AI teacher feedback using Gemini
      const aiFeedback = await this.generateAITeacherComments(request, analysis);
      
      // Calculate final scores and confidence
      const scores = this.calculateScoresAndConfidence(analysis);
      
      // Create comprehensive feedback result
      const feedbackResult: TeacherFeedbackResult = {
        id: '', // Will be set when saved to database
        overallScore: scores.totalScore,
        maxScore: scores.maxScore,
        confidence: scores.confidence,
        canGradeTo100Percent: scores.canGradeTo100Percent,
        overallFeedback: aiFeedback.overallFeedback,
        strengths: aiFeedback.strengths,
        weaknesses: aiFeedback.weaknesses,
        recommendations: aiFeedback.recommendations,
        detailedAnalysis: {
          questionAnalysis: analysis.questionAnalysis,
          sectionAnalysis: analysis.sectionAnalysis,
          unclearResponses: aiFeedback.unclearResponses,
          uniqueLanguageStyles: aiFeedback.uniqueLanguageStyles,
          grammarErrors: aiFeedback.grammarErrors,
          vocabularyNotes: aiFeedback.vocabularyNotes
        }
      };

      // Save to database
      const savedFeedback = await this.saveFeedbackToDatabase(request, feedbackResult);
      feedbackResult.id = savedFeedback.id;

      logger.info(`AI teacher feedback generated successfully: ${feedbackResult.id}`);
      return feedbackResult;

    } catch (error) {
      logger.error('Error generating AI teacher feedback:', error);
      throw new Error('Failed to generate AI teacher feedback');
    }
  }

  /**
   * Analyze student work and answers
   */
  private static async analyzeStudentWork(request: TeacherFeedbackRequest) {
    const questionAnalysis = [];
    const sectionScores: Record<string, { score: number; maxScore: number; questions: number }> = {};

    let totalScore = 0;
    let maxScore = 0;

    for (const question of request.questions) {
      const studentAnswer = request.answers[question.id] || '';
      const analysis = this.analyzeQuestion(question, studentAnswer);
      
      questionAnalysis.push(analysis);
      totalScore += analysis.points;
      maxScore += analysis.maxPoints;

      // Track section scores
      if (!sectionScores[question.section]) {
        sectionScores[question.section] = { score: 0, maxScore: 0, questions: 0 };
      }
      sectionScores[question.section].score += analysis.points;
      sectionScores[question.section].maxScore += analysis.maxPoints;
      sectionScores[question.section].questions += 1;
    }

    // Generate section analysis
    const sectionAnalysis = Object.entries(sectionScores).map(([section, data]) => ({
      section,
      score: data.score,
      maxScore: data.maxScore,
      feedback: this.generateSectionFeedback(section, data.score, data.maxScore, data.questions)
    }));

    return {
      questionAnalysis,
      sectionAnalysis,
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0
    };
  }

  /**
   * Analyze individual question
   */
  private static analyzeQuestion(question: any, studentAnswer: string) {
    const maxPoints = question.points || 1;
    let points = 0;
    let isCorrect = false;
    let teacherComments = '';
    let mistakeType = '';
    let correction = '';
    let explanation = '';

    if (!studentAnswer || studentAnswer.trim() === '') {
      teacherComments = 'Aucune réponse fournie. Il est important de répondre à toutes les questions.';
      mistakeType = 'NO_ANSWER';
    } else {
      switch (question.type) {
        case 'MCQ':
        case 'TRUE_FALSE':
          isCorrect = studentAnswer === question.correctAnswer;
          points = isCorrect ? maxPoints : 0;
          if (isCorrect) {
            teacherComments = 'Excellente réponse ! Vous avez bien compris la question.';
          } else {
            teacherComments = `Réponse incorrecte. La bonne réponse était "${question.correctAnswer}".`;
            correction = question.correctAnswer;
            mistakeType = 'INCORRECT_CHOICE';
          }
          break;

        case 'FILL_IN':
          // Simple similarity check for fill-in-the-blank
          const similarity = this.calculateStringSimilarity(studentAnswer.toLowerCase(), question.correctAnswer?.toLowerCase() || '');
          isCorrect = similarity > 0.8;
          points = isCorrect ? maxPoints : Math.max(0, Math.round(similarity * maxPoints));
          
          if (isCorrect) {
            teacherComments = 'Bonne réponse ! Votre compréhension est correcte.';
          } else {
            teacherComments = `Réponse partiellement correcte. Réponse attendue : "${question.correctAnswer}".`;
            correction = question.correctAnswer || '';
            mistakeType = 'PARTIAL_ANSWER';
          }
          break;

        case 'ESSAY':
        case 'AUDIO_RESPONSE':
          // For essays and audio, give partial credit and detailed feedback
          points = Math.round(maxPoints * 0.7); // Default 70% for attempting
          isCorrect = false; // Essays need human review
          teacherComments = 'Réponse développée fournie. Cette réponse nécessite une évaluation humaine pour une notation précise.';
          mistakeType = 'NEEDS_HUMAN_REVIEW';
          break;
      }
    }

    return {
      questionId: question.id,
      studentAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      points,
      maxPoints,
      teacherComments,
      mistakeType,
      correction,
      explanation
    };
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Generate section-specific feedback
   */
  private static generateSectionFeedback(section: string, score: number, maxScore: number, questions: number): string {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

    if (percentage >= 90) {
      return `Excellente performance dans la section ${section}. Vous maîtrisez bien ce domaine.`;
    } else if (percentage >= 70) {
      return `Bonne performance dans la section ${section}. Quelques points à améliorer.`;
    } else if (percentage >= 50) {
      return `Performance moyenne dans la section ${section}. Il y a de la place pour l'amélioration.`;
    } else {
      return `Cette section ${section} nécessite plus de travail. Concentrez-vous sur la révision de ces concepts.`;
    }
  }

  /**
   * Generate AI teacher comments using Gemini AI
   */
  private static async generateAITeacherComments(request: TeacherFeedbackRequest, analysis: any) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      // Prepare context for AI teacher
      const studentWork = request.questions.map(q => ({
        question: q.questionText,
        studentAnswer: request.answers[q.id] || 'Pas de réponse',
        correctAnswer: q.correctAnswer,
        type: q.type
      }));

      const prompt = `
Tu es un professeur de français expérimenté et bienveillant qui évalue le travail d'un étudiant sur la plateforme AURA.CA.

CONTEXTE DE LA SIMULATION:
- Titre: ${request.simulationTitle}
- Temps passé: ${Math.round(request.timeSpent / 60)} minutes sur ${Math.round(request.totalDuration / 60)} minutes allouées
- Score obtenu: ${analysis.totalScore}/${analysis.maxScore} (${Math.round(analysis.percentage)}%)

TRAVAIL DE L'ÉTUDIANT:
${studentWork.map((work, index) => `
Question ${index + 1} (${work.type}): ${work.question}
Réponse de l'étudiant: ${work.studentAnswer}
${work.correctAnswer ? `Réponse attendue: ${work.correctAnswer}` : ''}
`).join('\n')}

EN TANT QUE PROFESSEUR, FOURNIS:

1. FEEDBACK GÉNÉRAL (2-3 phrases encourageantes mais honnêtes)

2. POINTS FORTS (3-4 éléments spécifiques observés)

3. POINTS À AMÉLIORER (3-4 éléments concrets avec suggestions)

4. RECOMMANDATIONS PÉDAGOGIQUES (3-4 conseils pratiques)

5. RÉPONSES PEU CLAIRES (identifie les réponses que tu n'as pas bien comprises)

6. STYLE LINGUISTIQUE UNIQUE (note les particularités du style de l'étudiant)

7. ERREURS DE GRAMMAIRE (liste les erreurs avec corrections et explications)

8. NOTES DE VOCABULAIRE (mots mal utilisés avec suggestions)

IMPORTANT:
- Sois bienveillant mais précis
- Donne des exemples concrets
- Propose des corrections constructives
- Mentionne les fonctionnalités uniques d'AURA.CA (sessions live, marketplace de tuteurs, simulations TCF/TEF)
- Utilise un ton professoral encourageant

Réponds en JSON avec cette structure:
{
  "overallFeedback": "...",
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."],
  "unclearResponses": ["...", "..."],
  "uniqueLanguageStyles": ["...", "..."],
  "grammarErrors": [{"error": "...", "correction": "...", "explanation": "..."}],
  "vocabularyNotes": [{"word": "...", "usage": "...", "suggestion": "..."}]
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        logger.warn('Failed to parse AI response as JSON, using fallback');
      }

      // Fallback response if JSON parsing fails
      return this.generateFallbackTeacherFeedback(analysis);

    } catch (error) {
      logger.error('Error generating AI teacher comments:', error);
      return this.generateFallbackTeacherFeedback(analysis);
    }
  }

  /**
   * Generate fallback teacher feedback
   */
  private static generateFallbackTeacherFeedback(analysis: any) {
    const percentage = analysis.percentage;

    return {
      overallFeedback: percentage >= 70
        ? "Bon travail ! Vous montrez une bonne compréhension du français. Continuez vos efforts pour progresser encore."
        : "Votre travail montre des bases solides, mais il y a des domaines à améliorer. Ne vous découragez pas, la pratique régulière vous aidera à progresser.",
      strengths: [
        "Vous avez tenté de répondre à la plupart des questions",
        "Votre engagement dans l'exercice est visible",
        "Certaines réponses montrent une bonne compréhension"
      ],
      weaknesses: [
        "Quelques erreurs dans les réponses objectives",
        "Certaines réponses manquent de précision",
        "Le temps de réflexion pourrait être mieux utilisé"
      ],
      recommendations: [
        "Pratiquez régulièrement avec les simulations AURA.CA",
        "Participez aux sessions live pour améliorer votre expression",
        "Consultez un tuteur sur notre marketplace pour un suivi personnalisé",
        "Révisez les points grammaticaux de base"
      ],
      unclearResponses: [],
      uniqueLanguageStyles: [],
      grammarErrors: [],
      vocabularyNotes: []
    };
  }

  /**
   * Calculate scores and confidence
   */
  private static calculateScoresAndConfidence(analysis: any) {
    const percentage = analysis.percentage;
    let confidence = 0.85; // Base confidence for teacher feedback
    let canGradeTo100Percent = true;

    // Reduce confidence for essays and audio responses that need human review
    const needsHumanReview = analysis.questionAnalysis.some((q: any) =>
      q.mistakeType === 'NEEDS_HUMAN_REVIEW'
    );

    if (needsHumanReview) {
      confidence = 0.75; // Lower confidence when human review is needed
      canGradeTo100Percent = false; // Cannot grade to 100% without human review
    }

    // Adjust confidence based on performance
    if (percentage >= 90) {
      confidence = Math.min(0.95, confidence + 0.05);
    } else if (percentage >= 70) {
      confidence = Math.min(0.90, confidence);
    } else {
      confidence = Math.max(0.70, confidence - 0.05);
    }

    return {
      totalScore: analysis.totalScore,
      maxScore: analysis.maxScore,
      confidence,
      canGradeTo100Percent
    };
  }

  /**
   * Save feedback to database
   */
  private static async saveFeedbackToDatabase(request: TeacherFeedbackRequest, feedback: TeacherFeedbackResult) {
    try {
      const savedFeedback = await prisma.aIFeedback.create({
        data: {
          userId: request.userId,
          submissionType: 'SIMULATION_COMPLETION',
          submissionContent: JSON.stringify({
            simulationTitle: request.simulationTitle,
            answers: request.answers,
            timeSpent: request.timeSpent
          }),
          aiScore: feedback.overallScore,
          maxScore: feedback.maxScore,
          aiConfidence: feedback.confidence,
          overallFeedback: feedback.overallFeedback,
          strengths: feedback.strengths,
          weaknesses: feedback.weaknesses,
          recommendations: feedback.recommendations,
          // detailedAnalysis: feedback.detailedAnalysis, // Field does not exist in schema
          status: feedback.canGradeTo100Percent ? 'AI_COMPLETED' : 'PENDING_HUMAN'
        }
      });

      return savedFeedback;
    } catch (error) {
      logger.error('Error saving feedback to database:', error);
      throw new Error('Failed to save feedback to database');
    }
  }

  /**
   * Get teacher feedback by ID
   */
  static async getTeacherFeedbackById(feedbackId: string, userId: string) {
    try {
      const feedback = await prisma.aIFeedback.findFirst({
        where: {
          id: feedbackId,
          userId: userId
        }
      });

      return feedback;
    } catch (error) {
      logger.error('Error fetching teacher feedback:', error);
      throw new Error('Failed to fetch teacher feedback');
    }
  }

  /**
   * Get all teacher feedbacks for a user
   */
  static async getTeacherFeedbacksForUser(userId: string) {
    try {
      const feedbacks = await prisma.aIFeedback.findMany({
        where: {
          userId: userId,
          submissionType: 'SIMULATION_COMPLETION'
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return feedbacks;
    } catch (error) {
      logger.error('Error fetching teacher feedbacks:', error);
      throw new Error('Failed to fetch teacher feedbacks');
    }
  }
}
