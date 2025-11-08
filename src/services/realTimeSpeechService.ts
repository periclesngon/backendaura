import { GoogleGenerativeAI } from '@google/generative-ai';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBIXbgZ3EE043v9RLa0Z_h93-BArAF-Hr4');

export interface ConversationSession {
  id: string;
  userId: string;
  level: string;
  topic?: string;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    audioData?: string;
  }>;
  isActive: boolean;
  startedAt: Date;
  lastActivity: Date;
}

export interface SpeechAnalysis {
  transcription: string;
  confidence: number;
  grammar: {
    errors: Array<{
      text: string;
      correction: string;
      explanation: string;
    }>;
    score: number;
  };
  pronunciation: {
    score: number;
    feedback: string[];
  };
  vocabulary: {
    level: string;
    suggestions: string[];
  };
  fluency: {
    score: number;
    pace: string;
  };
}

export class RealTimeSpeechService {
  private static sessions: Map<string, ConversationSession> = new Map();
  private static io: SocketIOServer;

  /**
   * Initialize Socket.IO for real-time communication
   */
  static initializeSocketIO(io: SocketIOServer): void {
    this.io = io;

    io.on('connection', (socket) => {
      logger.info('Client connected for speech conversation', { socketId: socket.id });

      // Start conversation session
      socket.on('start-conversation', async (data: {
        userId: string;
        level: string;
        topic?: string;
      }) => {
        try {
          const session = await this.createConversationSession(
            data.userId,
            data.level,
            data.topic
          );

          socket.join(`conversation-${session.id}`);
          
          socket.emit('conversation-started', {
            sessionId: session.id,
            welcomeMessage: this.getWelcomeMessage(data.level, data.topic),
            instructions: this.getInstructions(data.level)
          });

          logger.info('Conversation session started', {
            sessionId: session.id,
            userId: data.userId,
            level: data.level
          });
        } catch (error) {
          socket.emit('error', { message: 'Failed to start conversation' });
          logger.error('Failed to start conversation', { error });
        }
      });

      // Handle speech input
      socket.on('speech-input', async (data: {
        sessionId: string;
        transcription: string;
        confidence: number;
        audioData?: string;
      }) => {
        try {
          const response = await this.processSpeechInput(
            data.sessionId,
            data.transcription,
            data.confidence,
            data.audioData
          );

          socket.emit('ai-response', response);
        } catch (error) {
          socket.emit('error', { message: 'Failed to process speech' });
          logger.error('Failed to process speech input', { error });
        }
      });

      // Handle text input (fallback)
      socket.on('text-input', async (data: {
        sessionId: string;
        message: string;
      }) => {
        try {
          const response = await this.processTextInput(
            data.sessionId,
            data.message
          );

          socket.emit('ai-response', response);
        } catch (error) {
          socket.emit('error', { message: 'Failed to process text' });
          logger.error('Failed to process text input', { error });
        }
      });

      // End conversation
      socket.on('end-conversation', async (data: { sessionId: string }) => {
        try {
          const summary = await this.endConversationSession(data.sessionId);
          socket.emit('conversation-ended', summary);
        } catch (error) {
          socket.emit('error', { message: 'Failed to end conversation' });
          logger.error('Failed to end conversation', { error });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected from speech conversation', { socketId: socket.id });
      });
    });
  }

  /**
   * Create a new conversation session
   */
  private static async createConversationSession(
    userId: string,
    level: string,
    topic?: string
  ): Promise<ConversationSession> {
    const sessionId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ConversationSession = {
      id: sessionId,
      userId,
      level,
      topic,
      history: [],
      isActive: true,
      startedAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Process speech input and generate AI response
   */
  private static async processSpeechInput(
    sessionId: string,
    transcription: string,
    confidence: number,
    audioData?: string
  ): Promise<{
    response: string;
    audioResponse: string;
    analysis: SpeechAnalysis;
    suggestions: string[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add user message to history
    session.history.push({
      role: 'user',
      content: transcription,
      timestamp: new Date(),
      audioData
    });

    // Analyze speech quality
    const analysis = await this.analyzeSpeech(transcription, session.level);

    // Generate AI response
    const aiResponse = await this.generateAIResponse(session, transcription, analysis);

    // Add AI response to history
    session.history.push({
      role: 'assistant',
      content: aiResponse.response,
      timestamp: new Date()
    });

    session.lastActivity = new Date();

    return {
      response: aiResponse.response,
      audioResponse: aiResponse.audioInstructions,
      analysis,
      suggestions: aiResponse.suggestions
    };
  }

  /**
   * Process text input (fallback)
   */
  private static async processTextInput(
    sessionId: string,
    message: string
  ): Promise<{
    response: string;
    audioResponse: string;
    suggestions: string[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add user message to history
    session.history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Generate AI response
    const aiResponse = await this.generateAIResponse(session, message);

    // Add AI response to history
    session.history.push({
      role: 'assistant',
      content: aiResponse.response,
      timestamp: new Date()
    });

    session.lastActivity = new Date();

    return {
      response: aiResponse.response,
      audioResponse: aiResponse.audioInstructions,
      suggestions: aiResponse.suggestions
    };
  }

  /**
   * Generate AI response using Gemini
   */
  private static async generateAIResponse(
    session: ConversationSession,
    userInput: string,
    analysis?: SpeechAnalysis
  ): Promise<{
    response: string;
    audioInstructions: string;
    suggestions: string[];
  }> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const conversationHistory = session.history
        .slice(-6) // Last 6 messages for context
        .map(msg => `${msg.role === 'user' ? 'Étudiant' : 'Professeur'}: ${msg.content}`)
        .join('\n');

      const analysisContext = analysis ? `
      ANALYSE DE LA PAROLE:
      - Transcription: "${analysis.transcription}"
      - Confiance: ${analysis.confidence}
      - Score grammaire: ${analysis.grammar.score}/100
      - Score prononciation: ${analysis.pronunciation.score}/100
      - Erreurs: ${analysis.grammar.errors.map(e => e.text).join(', ')}
      ` : '';

      const prompt = `
      Tu es un professeur de français expérimenté qui fait une conversation en temps réel avec un étudiant de niveau ${session.level}.
      ${session.topic ? `Le sujet de conversation est: ${session.topic}` : ''}

      HISTORIQUE DE LA CONVERSATION:
      ${conversationHistory}

      NOUVEAU MESSAGE DE L'ÉTUDIANT: "${userInput}"
      ${analysisContext}

      Réponds en tant que professeur bienveillant et pédagogique:

      1. RÉPONSE CONVERSATIONNELLE (100-150 mots):
      - Réponds naturellement au message de l'étudiant
      - Corrige gentiment les erreurs s'il y en a
      - Pose une question de suivi pour continuer la conversation
      - Adapte ton vocabulaire au niveau ${session.level}
      - Sois encourageant et motivant

      2. INSTRUCTIONS AUDIO (50 mots max):
      - Instructions spécifiques pour la prononciation
      - Conseils pour améliorer la fluidité
      - Points à travailler

      3. SUGGESTIONS (3-5 suggestions):
      - Expressions utiles à apprendre
      - Vocabulaire à enrichir
      - Points grammaticaux à réviser

      Format de réponse JSON:
      {
        "response": "Ta réponse conversationnelle ici",
        "audioInstructions": "Instructions pour la prononciation",
        "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
      }

      Réponds UNIQUEMENT avec le JSON valide.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      let responseData;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          responseData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        logger.error('Failed to parse Gemini response', { text, parseError });
        // Fallback response
        responseData = {
          response: "Très bien ! Continuez à pratiquer. Pouvez-vous me parler de vos hobbies ?",
          audioInstructions: "Parlez lentement et clairement. Articulez bien chaque syllabe.",
          suggestions: ["Enrichir le vocabulaire", "Travailler la prononciation", "Pratiquer les liaisons"]
        };
      }

      return responseData;
    } catch (error) {
      logger.error('Failed to generate AI response', { error });
      throw error;
    }
  }

  /**
   * Analyze speech quality using Gemini
   */
  private static async analyzeSpeech(
    transcription: string,
    level: string
  ): Promise<SpeechAnalysis> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
      Analyse cette production orale en français de niveau ${level}:

      TRANSCRIPTION: "${transcription}"

      Fournis une analyse détaillée au format JSON:
      {
        "transcription": "${transcription}",
        "confidence": 0.85,
        "grammar": {
          "errors": [
            {
              "text": "erreur trouvée",
              "correction": "correction proposée",
              "explanation": "explication de l'erreur"
            }
          ],
          "score": 75
        },
        "pronunciation": {
          "score": 80,
          "feedback": ["Bonne articulation", "Attention aux liaisons"]
        },
        "vocabulary": {
          "level": "B1",
          "suggestions": ["Enrichir avec des synonymes", "Utiliser plus de connecteurs"]
        },
        "fluency": {
          "score": 78,
          "pace": "naturel"
        }
      }

      Réponds UNIQUEMENT avec le JSON valide.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      let analysisData;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // Fallback analysis
        analysisData = {
          transcription,
          confidence: 0.8,
          grammar: { errors: [], score: 75 },
          pronunciation: { score: 80, feedback: ["Continuez vos efforts"] },
          vocabulary: { level: level, suggestions: ["Enrichir le vocabulaire"] },
          fluency: { score: 78, pace: "naturel" }
        };
      }

      return analysisData;
    } catch (error) {
      logger.error('Failed to analyze speech', { error });
      // Return default analysis
      return {
        transcription,
        confidence: 0.8,
        grammar: { errors: [], score: 75 },
        pronunciation: { score: 80, feedback: ["Continuez vos efforts"] },
        vocabulary: { level: level, suggestions: ["Enrichir le vocabulaire"] },
        fluency: { score: 78, pace: "naturel" }
      };
    }
  }

  /**
   * End conversation session and provide summary
   */
  private static async endConversationSession(sessionId: string): Promise<{
    summary: string;
    duration: number;
    messageCount: number;
    overallScore: number;
    recommendations: string[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.isActive = false;
    const duration = Math.round((Date.now() - session.startedAt.getTime()) / 1000 / 60); // minutes
    const messageCount = session.history.filter(msg => msg.role === 'user').length;

    // Generate summary using Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const conversationText = session.history
      .map(msg => `${msg.role === 'user' ? 'Étudiant' : 'Professeur'}: ${msg.content}`)
      .join('\n');

    const prompt = `
    Analyse cette conversation en français et fournis un résumé:

    CONVERSATION:
    ${conversationText}

    NIVEAU: ${session.level}
    DURÉE: ${duration} minutes
    MESSAGES: ${messageCount}

    Fournis un résumé JSON:
    {
      "summary": "Résumé de la conversation en 2-3 phrases",
      "overallScore": 85,
      "recommendations": ["recommandation 1", "recommandation 2", "recommandation 3"]
    }

    Réponds UNIQUEMENT avec le JSON valide.
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const summaryData = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        summary: "Excellente conversation ! Vous avez bien participé et montré de bons progrès.",
        overallScore: 80,
        recommendations: ["Continuez à pratiquer", "Enrichissez votre vocabulaire", "Travaillez la fluidité"]
      };

      // Clean up session
      this.sessions.delete(sessionId);

      return {
        ...summaryData,
        duration,
        messageCount
      };
    } catch (error) {
      logger.error('Failed to generate conversation summary', { error });
      return {
        summary: "Conversation terminée avec succès !",
        duration,
        messageCount,
        overallScore: 80,
        recommendations: ["Continuez à pratiquer régulièrement"]
      };
    }
  }

  /**
   * Get welcome message based on level and topic
   */
  private static getWelcomeMessage(level: string, topic?: string): string {
    const welcomeMessages = {
      'A1': `Bonjour ! Je suis votre professeur de français. Nous allons avoir une conversation simple. ${topic ? `Parlons de ${topic}.` : 'Présentez-vous, s\'il vous plaît.'}`,
      'A2': `Salut ! Prêt pour notre conversation en français ? ${topic ? `Aujourd'hui, nous parlons de ${topic}.` : 'Racontez-moi votre journée.'}`,
      'B1': `Bonjour ! J'ai hâte de discuter avec vous en français. ${topic ? `Le sujet d'aujourd'hui est ${topic}.` : 'Que faites-vous dans la vie ?'}`,
      'B2': `Bonjour ! Nous allons avoir une conversation enrichissante. ${topic ? `Explorons le sujet de ${topic}.` : 'Parlez-moi de vos passions.'}`,
      'C1': `Bonjour ! Prêt pour une discussion approfondie ? ${topic ? `Analysons ensemble ${topic}.` : 'Quel est votre avis sur l\'actualité ?'}`,
      'C2': `Bonjour ! Engageons une conversation sophistiquée. ${topic ? `Débattons de ${topic}.` : 'Exprimez votre point de vue sur un sujet qui vous tient à cœur.'}`
    };

    return welcomeMessages[level as keyof typeof welcomeMessages] || welcomeMessages['B1'];
  }

  /**
   * Get instructions based on level
   */
  private static getInstructions(level: string): string[] {
    const instructions = {
      'A1': [
        "Parlez lentement et clairement",
        "Utilisez des phrases simples",
        "N'hésitez pas à répéter si nécessaire",
        "Cliquez sur le micro pour parler"
      ],
      'A2': [
        "Exprimez-vous naturellement",
        "Utilisez le présent et le passé composé",
        "Décrivez vos activités quotidiennes",
        "Posez des questions si vous ne comprenez pas"
      ],
      'B1': [
        "Racontez des expériences personnelles",
        "Exprimez vos opinions",
        "Utilisez différents temps verbaux",
        "Développez vos idées"
      ],
      'B2': [
        "Argumentez vos points de vue",
        "Utilisez un vocabulaire varié",
        "Structurez votre discours",
        "Nuancez vos opinions"
      ],
      'C1': [
        "Exprimez-vous avec précision",
        "Utilisez des structures complexes",
        "Analysez et synthétisez",
        "Adaptez votre registre de langue"
      ],
      'C2': [
        "Maîtrisez les subtilités linguistiques",
        "Utilisez l'ironie et l'implicite",
        "Débattez avec finesse",
        "Perfectionnez votre style"
      ]
    };

    return instructions[level as keyof typeof instructions] || instructions['B1'];
  }

  /**
   * Get active sessions count
   */
  static getActiveSessionsCount(): number {
    return Array.from(this.sessions.values()).filter(session => session.isActive).length;
  }

  /**
   * Clean up inactive sessions
   */
  static cleanupInactiveSessions(): void {
    const now = Date.now();
    const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > maxInactiveTime) {
        this.sessions.delete(sessionId);
        logger.info('Cleaned up inactive session', { sessionId });
      }
    }
  }
}
