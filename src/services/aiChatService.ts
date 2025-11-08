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
      // Get or create chat session
      let session = chatId 
        ? await prisma.chatSession.findUnique({ where: { id: chatId } })
        : null

      if (!session) {
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
          metadata: { context }
        }
      })

      // Get relevant questions from question bank
      const relevantQuestions = await this.getRelevantQuestions(message, context)
      
      // Generate AI response with Gemini AI and question bank context
      const aiResponse = await this.generateAIResponse(
        message, 
        context, 
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
            context 
          }
        }
      })

      return {
        message: aiResponse.message,
        sources: aiResponse.sources,
        confidence: aiResponse.confidence,
        chatId: session.id
      }

    } catch (error) {
      logger.error('Error in AiChatService.sendMessage:', error)
      throw error
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
   * Get relevant questions from question bank based on user message
   */
  private static async getRelevantQuestions(message: string, context: ChatContext) {
    try {
      // Extract keywords from message
      const keywords = this.extractKeywords(message)
      
      // Search question bank for relevant questions
      const questions = await QuestionBankService.searchQuestions(message, 5)

      return questions
    } catch (error) {
      logger.error('Error getting relevant questions:', error)
      return []
    }
  }

  /**
   * Generate AI response with question bank context
   */
  private static async generateAIResponse(
    message: string,
    context: ChatContext,
    relevantQuestions: any[],
    sessionId: string
  ) {
    try {
      // Build context for AI
      const systemPrompt = this.buildSystemPrompt(context, relevantQuestions)
      
      // Get recent conversation history
      const recentMessages = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 10
      })

      // Generate response using Gemini AI service with question bank context
      const response = await AIService.generateResponse({
        message,
        systemPrompt,
        context: {
          userLevel: context.userLevel,
          language: context.language,
          relevantQuestions,
          conversationHistory: recentMessages.reverse()
        }
      })

      return {
        message: response.content,
        sources: this.extractSources(response, relevantQuestions),
        confidence: response.confidence || 0.8
      }

    } catch (error) {
      logger.error('Error generating AI response:', error)
      return {
        message: "Désolé, je rencontre un problème technique. Veuillez réessayer.",
        sources: [],
        confidence: 0.1
      }
    }
  }

  /**
   * Build system prompt with question bank context
   */
  private static buildSystemPrompt(context: ChatContext, relevantQuestions: any[]) {
    const currentDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const currentTime = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    })
    
    const basePrompt = `Tu es l'assistant IA d'Aura.ca, alimenté par Gemini AI et spécialisé dans l'aide aux étudiants pour le TCF/TEF.

INFORMATION ACTUELLE:
- Date d'aujourd'hui: ${currentDate}
- Heure actuelle: ${currentTime}

Ton rôle:
- Aider les étudiants avec leurs questions sur le français en utilisant la puissance de Gemini AI
- Fournir des explications claires et pédagogiques
- Utiliser les questions de la banque de données TCF/TEF pour enrichir tes réponses
- Adapter ton niveau de langue au niveau de l'étudiant (${context.userLevel})
- Répondre en ${context.language === 'fr' ? 'français' : 'anglais'}
- Tu as accès à la date et heure actuelles pour répondre aux questions temporelles

Contexte de l'utilisateur:
- Niveau: ${context.userLevel}
- Langue préférée: ${context.language}`

    if (relevantQuestions.length > 0) {
      const questionsContext = `
Questions pertinentes de la banque de données:
${relevantQuestions.map((q, i) => `${i + 1}. ${q.questionText} (Niveau: ${q.level})`).join('\n')}

Utilise ces questions comme référence pour donner des exemples concrets et des exercices similaires.`
      
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