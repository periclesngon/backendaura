import { logger } from '../utils/logger';
import geminiApiManager from '../utils/geminiApiManager';

export interface AssistantContext {
  page: string;
  userLevel?: string;
  simulationType?: 'voice' | 'immigration';
  country?: string;
  immigrationType?: string;
  language: 'fr' | 'en';
}

export interface AssistantResponse {
  message: string;
  suggestions?: string[];
  confidence: number;
}

export class FloatingAiAssistantService {
  /**
   * Get context-aware AI assistance
   */
  static async getAssistance(
    userId: string,
    userMessage: string,
    context: AssistantContext
  ): Promise<AssistantResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildUserPrompt(userMessage, context);

      const genAI = geminiApiManager.getClient();
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt }
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse response to extract suggestions if any
      const parsed = this.parseResponse(text);

      logger.info('AI Assistant response generated', {
        userId,
        page: context.page,
        messageLength: text.length
      });

      return {
        message: parsed.message,
        suggestions: parsed.suggestions,
        confidence: 0.9 // High confidence for assistant responses
      };
    } catch (error) {
      logger.error('Error generating AI assistance:', error);
      return {
        message: context.language === 'fr' 
          ? "Désolé, je ne peux pas vous aider pour le moment. Veuillez réessayer plus tard."
          : "Sorry, I can't help you right now. Please try again later.",
        confidence: 0.1
      };
    }
  }

  /**
   * Build system prompt based on context
   */
  private static buildSystemPrompt(context: AssistantContext): string {
    const basePrompt = context.language === 'fr' 
      ? `Tu es un assistant IA spécialisé dans l'apprentissage du français et les simulations TCF/TEF. Tu aides les étudiants sur la plateforme AURA.CA.`
      : `You are an AI assistant specialized in French learning and TCF/TEF simulations. You help students on the AURA.CA platform.`;

    let contextualPrompt = '';

    switch (context.page) {
      case 'voice-simulation':
        contextualPrompt = context.language === 'fr'
          ? `Tu es actuellement sur la page de simulation vocale. Tu peux aider avec:
- La préparation aux entretiens oraux
- Les techniques de prononciation
- La gestion du stress avant l'entretien
- L'utilisation de VAPI pour les simulations
- Les conseils pour améliorer la fluidité`
          : `You are currently on the voice simulation page. You can help with:
- Oral interview preparation
- Pronunciation techniques
- Managing stress before interviews
- Using VAPI for simulations
- Tips to improve fluency`;
        break;

      case 'immigration-simulation':
        contextualPrompt = context.language === 'fr'
          ? `Tu es actuellement sur la page de simulation d'immigration pour ${context.country || 'le pays sélectionné'}. Tu peux aider avec:
- La préparation aux entretiens d'immigration
- Les questions typiques pour ${context.immigrationType || 'ce type d\'immigration'}
- Les documents nécessaires
- Les stratégies de réponse
- La compréhension des procédures`
          : `You are currently on the immigration simulation page for ${context.country || 'the selected country'}. You can help with:
- Immigration interview preparation
- Typical questions for ${context.immigrationType || 'this type of immigration'}
- Required documents
- Response strategies
- Understanding procedures`;
        break;

      case 'tcf-tef-simulation':
        contextualPrompt = context.language === 'fr'
          ? `Tu es sur la page des simulations TCF/TEF. Tu peux aider avec:
- La compréhension des formats d'examen
- Les stratégies de gestion du temps
- Les techniques de réponse
- L'interprétation des résultats
- La préparation ciblée selon le niveau`
          : `You are on the TCF/TEF simulations page. You can help with:
- Understanding exam formats
- Time management strategies
- Response techniques
- Interpreting results
- Targeted preparation by level`;
        break;

      default:
        contextualPrompt = context.language === 'fr'
          ? `Tu peux aider avec toutes les questions liées à l'apprentissage du français, aux examens TCF/TEF, et à l'utilisation de la plateforme.`
          : `You can help with all questions related to French learning, TCF/TEF exams, and platform usage.`;
    }

    return `${basePrompt}\n\n${contextualPrompt}\n\nRéponds de manière concise et utile. Si tu proposes des suggestions d'actions, formate-les comme une liste à puces à la fin de ta réponse.`;
  }

  /**
   * Build user prompt with context
   */
  private static buildUserPrompt(userMessage: string, context: AssistantContext): string {
    let prompt = `Question de l'utilisateur: ${userMessage}\n\n`;
    
    if (context.userLevel) {
      prompt += `Niveau de l'utilisateur: ${context.userLevel}\n`;
    }
    
    if (context.simulationType) {
      prompt += `Type de simulation: ${context.simulationType}\n`;
    }
    
    if (context.country) {
      prompt += `Pays: ${context.country}\n`;
    }
    
    if (context.immigrationType) {
      prompt += `Type d'immigration: ${context.immigrationType}\n`;
    }

    return prompt;
  }

  /**
   * Parse AI response to extract suggestions
   */
  private static parseResponse(text: string): { message: string; suggestions: string[] } {
    const lines = text.split('\n');
    const suggestions: string[] = [];
    let message = '';
    let inSuggestions = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        suggestions.push(trimmed.replace(/^[•\-*]\s*/, ''));
        inSuggestions = true;
      } else if (!inSuggestions) {
        message += line + '\n';
      }
    }

    return {
      message: message.trim(),
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }

  /**
   * Get quick help suggestions based on page context
   */
  static getQuickSuggestions(context: AssistantContext): string[] {
    const suggestions = {
      'voice-simulation': {
        fr: [
          "Comment me préparer à un entretien oral ?",
          "Quels sont les critères d'évaluation ?",
          "Comment gérer mon stress ?",
          "Conseils pour améliorer ma prononciation"
        ],
        en: [
          "How to prepare for an oral interview?",
          "What are the evaluation criteria?",
          "How to manage my stress?",
          "Tips to improve my pronunciation"
        ]
      },
      'immigration-simulation': {
        fr: [
          "Questions typiques d'entretien d'immigration",
          "Documents nécessaires pour l'immigration",
          "Comment présenter mon projet ?",
          "Stratégies de réponse efficaces"
        ],
        en: [
          "Typical immigration interview questions",
          "Required documents for immigration",
          "How to present my project?",
          "Effective response strategies"
        ]
      },
      'tcf-tef-simulation': {
        fr: [
          "Différences entre TCF et TEF",
          "Comment gérer mon temps ?",
          "Stratégies pour chaque section",
          "Interpréter mes résultats"
        ],
        en: [
          "Differences between TCF and TEF",
          "How to manage my time?",
          "Strategies for each section",
          "Interpreting my results"
        ]
      }
    };

    return suggestions[context.page]?.[context.language] || suggestions['tcf-tef-simulation'][context.language];
  }
}
