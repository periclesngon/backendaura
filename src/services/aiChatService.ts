import { prisma } from '@/lib/prisma'
import { logger } from '@/utils/logger'
// AI Chat Service for handling chat functionality
import { AIService } from './aiService'
import QuestionBankService from './questionBankService'

interface ChatContext {
  userLevel: string
  language: string
  previousMessages: any[]
  [key: string]: any // Add index signature for JSON compatibility
}

interface ChatResponse {
  message: string
  sources: string[]
  confidence: number
  chatId: string
}

export class AiChatService {
  /**
   * Send a message to the AI assistant with question bank integration
   */
  static async sendMessage(
    userId: string,
    message: string,
    chatId: string | null,
    context: ChatContext
  ): Promise<ChatResponse> {
    try {
      // Get user data to populate context if missing
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentLevel: true, preferences: true }
      })

      // Ensure context has required fields with defaults
      const safeContext: ChatContext = {
        userLevel: context?.userLevel || user?.currentLevel || 'BASIC',
        language: context?.language || 'fr',
        previousMessages: context?.previousMessages || [],
        ...context
      }

      // Get or create chat session - only create new if chatId is null/undefined
      let session = null
      
      if (chatId) {
        // Try to find existing session
        session = await prisma.chatSession.findFirst({
          where: { 
            id: chatId,
            userId: userId // Ensure it belongs to the user
          }
        })
        
        if (!session) {
          // Session not found or doesn't belong to user, create new one
          session = await prisma.chatSession.create({
            data: {
              userId,
              title: this.generateSessionTitle(message),
              isActive: true
            }
          })
        }
      } else {
        // No chatId provided, create new session
        session = await prisma.chatSession.create({
          data: {
            userId,
            title: this.generateSessionTitle(message),
            isActive: true
          }
        })
      }

      // Save user message
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'USER',
          content: message,
          metadata: { context: safeContext }
        }
      })

      // Get relevant questions from question bank - REDUCED for speed
      const relevantQuestions = await this.getRelevantQuestions(message, safeContext).then(questions => questions.slice(0, 2)).catch(() => []) // Limit to 2 questions max, fallback to empty array
      
      // Generate AI response with Gemini AI and question bank context
      const aiResponse = await this.generateAIResponse(
        message, 
        safeContext, 
        relevantQuestions,
        session.id
      )

      // Save AI response
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'ASSISTANT',
          content: aiResponse.message,
          sources: aiResponse.sources,
          confidence: aiResponse.confidence,
          metadata: { 
            questionBankUsed: relevantQuestions.length > 0,
            context: safeContext 
          }
        }
      })

      return {
        message: aiResponse.message,
        sources: aiResponse.sources,
        confidence: aiResponse.confidence,
        chatId: session.id
      }

    } catch (error: any) {
      logger.error('Error in AiChatService.sendMessage:', {
        error: error?.message || error,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        status: error?.status || error?.statusCode,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      })
      
      // If it's a quota or auth error, throw it as-is
      if (error?.message?.includes('QUOTA_EXCEEDED') || error?.message?.includes('AUTH_ERROR')) {
        throw error
      }
      
      // For other errors, wrap them with a more specific message
      const errorMsg = error?.message || error?.toString() || 'Failed to process message'
      throw new Error(`AI_SERVICE_ERROR: ${errorMsg}`)
    }
  }

  /**
   * Get chat history for a user
   */
  static async getChatHistory(userId: string, limit: number = 10) {
    try {
      const sessions = await prisma.chatSession.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50 // Limit messages per session
          }
        }
      })

      return sessions
    } catch (error) {
      logger.error('Error getting chat history:', error)
      throw error
    }
  }

  /**
   * Get specific chat session with messages
   */
  static async getChatSession(chatId: string, userId: string) {
    try {
      const session = await prisma.chatSession.findFirst({
        where: { 
          id: chatId,
          userId 
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      return session
    } catch (error) {
      logger.error('Error getting chat session:', error)
      throw error
    }
  }

  /**
   * Delete a chat session
   */
  static async deleteChatSession(chatId: string, userId: string) {
    try {
      await prisma.chatSession.deleteMany({
        where: { 
          id: chatId,
          userId 
        }
      })

      return { success: true }
    } catch (error) {
      logger.error('Error deleting chat session:', error)
      throw error
    }
  }

  /**
   * Get relevant questions from question bank - ONLY for difficult TCF/TEF questions
   */
  private static async getRelevantQuestions(message: string, context: ChatContext) {
    try {
      const messageLower = message.toLowerCase().trim()
      
      // Skip question bank for simple conversational questions
      // Check if message is too short first
      if (messageLower.length < 15) {
        return [] // Skip question bank for very short messages
      }
      
      const simplePatterns = [
        // Greetings
        'salut', 'bonjour', 'bonsoir', 'hey', 'hi', 'hello', 'ça va', 'ca va',
        // Basic questions
        'ton nom', 'your name', 'comment tu t\'appelles', 'what is your name',
        'que sais tu', 'what can you', 'que peux tu', 'what do you',
        'quel jour', 'what day', 'quelle date', 'what date', 'aujourd\'hui', 'today',
        'comment allez', 'how are you', 'comment ça va'
      ]
      
      // Check if it's a simple question
      if (simplePatterns.some(pattern => messageLower.includes(pattern))) {
        return [] // Skip question bank for simple questions
      }
      
      // Check if question is TCF/TEF related
      const tcfTefKeywords = [
        'tcf', 'tef', 'examen', 'test', 'simulation', 'épreuve',
        'grammaire', 'grammar', 'vocabulaire', 'vocabulary',
        'compréhension', 'comprehension', 'expression', 'speaking',
        'écoute', 'listening', 'écrit', 'writing', 'oral',
        'niveau', 'level', 'exercice', 'exercise', 'pratique', 'practice',
        'conjugaison', 'conjugation', 'accord', 'agreement', 'temps', 'tense',
        'subjonctif', 'subjunctive', 'conditionnel', 'conditional',
        'immigration', 'canada', 'france', 'belgique', 'suisse'
      ]
      
      const isTcfTefRelated = tcfTefKeywords.some(keyword => messageLower.includes(keyword))
      
      // Only search question bank for TCF/TEF related questions
      if (!isTcfTefRelated) {
        return [] // Skip question bank for non-TCF/TEF questions
      }
      
      // Check if question seems difficult (longer, complex vocabulary)
      const isDifficult = messageLower.length > 30 || 
                         ['explique', 'explain', 'différence', 'difference', 'pourquoi', 'why', 'comment', 'how'].some(w => messageLower.includes(w))
      
      // Only use question bank for difficult TCF/TEF questions
      if (!isDifficult) {
        return [] // Skip question bank for easy TCF/TEF questions
      }
      
      // Search question bank for difficult TCF/TEF questions only
      const questions = await QuestionBankService.searchQuestions(message, 2)
      return questions
    } catch (error) {
      logger.error('Error getting relevant questions:', error)
      return []
    }
  }

  /**
   * Generate AI response with question bank context - ROBUST with fallbacks
   */
  private static async generateAIResponse(
    message: string,
    context: ChatContext,
    relevantQuestions: any[],
    sessionId: string
  ) {
    try {
      // Build context for AI with safe defaults
      const systemPrompt = this.buildSystemPrompt(context, relevantQuestions || [])
      
      // Get recent conversation history - REDUCED to 5 for speed, with error handling
      let recentMessages: any[] = []
      try {
        recentMessages = await prisma.chatMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
          take: 5 // Reduced from 10 to 5 for faster processing
        })
      } catch (dbError) {
        logger.warn('Error fetching conversation history, continuing without it:', dbError)
        recentMessages = []
      }

      // Generate response using Mistral AI service (with Gemini fallback) with question bank context
      let response: any
      try {
        response = await AIService.generateResponse({
          message,
          systemPrompt,
          context: {
            userLevel: context.userLevel || 'BASIC',
            language: context.language || 'fr',
            relevantQuestions: relevantQuestions || [],
            conversationHistory: recentMessages.reverse()
          }
        })
      } catch (aiError: any) {
        logger.error('Error calling AIService.generateResponse:', {
          error: aiError?.message || aiError,
          status: aiError?.status || aiError?.statusCode,
          code: aiError?.code
        })
        
        // Check if it's a quota/auth error - these should be thrown
        const errorMessage = aiError?.message || ''
        if (errorMessage.includes('QUOTA_EXCEEDED') || errorMessage.includes('AUTH_ERROR')) {
          throw aiError // Re-throw quota/auth errors
        }
        
        // For other errors, return fallback
        logger.warn('AI service unavailable, returning fallback response')
        return {
          message: 'Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.',
          sources: [],
          confidence: 0.5
        }
      }

      // Ensure we have a valid response
      if (!response || !response.content) {
        logger.warn('AI response is empty, returning fallback')
        return {
          message: 'Désolé, je n\'ai pas pu générer de réponse. Veuillez réessayer.',
          sources: [],
          confidence: 0.5
        }
      }

      return {
        message: response.content.trim() || 'Désolé, je n\'ai pas pu générer de réponse. Veuillez réessayer.',
        sources: this.extractSources(response, relevantQuestions || []),
        confidence: response.confidence || 0.8
      }

    } catch (error: any) {
      logger.error('Error generating AI response:', {
        error: error?.message || error,
        message,
        sessionId,
        context: { userLevel: context.userLevel, language: context.language }
      })
      
      // Check for specific error types
      const errorMessage = error?.message || error?.toString() || ''
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit') || errorMessage.includes('rate limit')) {
        throw new Error("QUOTA_EXCEEDED: Désolé, j'ai atteint ma limite de requêtes pour ce mois. Veuillez réessayer le mois prochain ou contactez le support pour plus d'informations.")
      } else if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
        throw new Error("AUTH_ERROR: Désolé, je rencontre un problème d'authentification avec le service IA. Veuillez contacter le support technique.")
      } else {
        // Return a fallback response instead of throwing
        return {
          message: 'Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants.',
          sources: [],
          confidence: 0.5
        }
      }
    }
  }

  /**
   * Build system prompt with question bank context - IMPROVED for natural responses
   */
  private static buildSystemPrompt(context: ChatContext, relevantQuestions: any[]) {
    const currentDate = new Date()
    const currentHour = currentDate.getHours()
    const currentDay = currentDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    
    // Natural greeting based on time
    let greetingInstruction = ''
    if (currentHour >= 5 && currentHour < 12) {
      greetingInstruction = 'Matin: Utilise "Bonjour" de manière naturelle. Varie tes salutations.'
    } else if (currentHour >= 12 && currentHour < 17) {
      greetingInstruction = 'Après-midi: Utilise "Bonjour" ou "Salut" naturellement. Varie tes réponses.'
    } else if (currentHour >= 17 && currentHour < 21) {
      greetingInstruction = 'Soir: Utilise "Bonsoir" naturellement. Varie tes réponses.'
    } else {
      greetingInstruction = 'Nuit: Utilise "Bonsoir" naturellement. Varie tes réponses.'
    }
    
    // Safe defaults for context
    const userLevel = context?.userLevel || 'BASIC'
    const language = context?.language || 'fr'
    
    // IMPROVED PROMPT for natural, varied responses
    const basePrompt = `Tu es Aura, l'assistant IA intelligent de Aura.ca, spécialisé dans la préparation TCF/TEF pour les Camerounais et Africains.

CONTEXTE:
- Date actuelle: ${currentDay}
- Niveau de l'utilisateur: ${userLevel}
- Langue: ${language === 'fr' ? 'français' : 'anglais'}

RÈGLES IMPORTANTES:
1. Salutations: ${greetingInstruction} NE RÉPÈTE PAS toujours "Salut!" au début. Varie tes réponses naturellement.
2. Personnalité: Sois amical, professionnel et encourageant. Réponds de manière naturelle et variée.
3. Formatage: JAMAIS d'astérisques (*) ou de markdown. Écris naturellement comme dans une conversation.
4. Longueur: Adapte-toi à la question. Questions simples: réponse courte et directe. Questions complexes: réponse détaillée.
5. Informations: Si on te demande la date/jour, utilise la date réelle: ${currentDay}
6. Variété: Change tes formulations. Ne commence pas toujours par "Salut!".`

    // Only include question bank context for difficult TCF/TEF questions
    if (relevantQuestions.length > 0) {
      const questionsContext = `

QUESTIONS TCF/TEF PERTINENTES (utilise-les comme référence pour des exemples concrets):
${relevantQuestions.map((q, i) => `${i + 1}. ${q.questionText || q.title} (Niveau: ${q.level || 'N/A'})`).join('\n')}

IMPORTANT: Utilise ces questions uniquement comme référence pour donner des exemples similaires et des exercices pratiques. Ne les répète pas mot pour mot.`
      
      return basePrompt + questionsContext
    }

    return basePrompt
  }

  /**
   * Extract keywords from user message
   */
  private static extractKeywords(message: string): string[] {
    const commonWords = ['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qui', 'quoi', 'où', 'quand', 'comment', 'pourquoi']
    
    return message
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word))
      .slice(0, 5)
  }

  /**
   * Detect question category from message
   */
  private static detectCategory(message: string): string {
    const messageLower = message.toLowerCase()
    
    if (messageLower.includes('grammaire') || messageLower.includes('grammar')) return 'GRAMMAR'
    if (messageLower.includes('vocabulaire') || messageLower.includes('vocabulary')) return 'VOCABULARY'
    if (messageLower.includes('écoute') || messageLower.includes('listening')) return 'LISTENING'
    if (messageLower.includes('expression') || messageLower.includes('speaking')) return 'SPEAKING'
    if (messageLower.includes('compréhension') || messageLower.includes('reading')) return 'READING'
    
    return 'GENERAL'
  }

  /**
   * Extract sources from AI response and relevant questions
   */
  private static extractSources(response: any, relevantQuestions: any[]): string[] {
    const sources: string[] = []
    
    if (relevantQuestions.length > 0) {
      sources.push('Banque de questions TCF/TEF')
    }
    
    if (response.sources) {
      sources.push(...response.sources)
    }
    
    return [...new Set(sources)] // Remove duplicates
  }

  /**
   * Generate session title from first message
   */
  private static generateSessionTitle(message: string): string {
    const words = message.split(' ').slice(0, 5)
    return words.join(' ') + (message.split(' ').length > 5 ? '...' : '')
  }
}