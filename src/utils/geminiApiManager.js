const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class GeminiApiManager {
  constructor() {
    // Load all available API keys
    this.apiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4
    ].filter(key => key && key !== 'your-second-api-key-here' && key !== 'your-third-api-key-here' && key !== 'your-fourth-api-key-here');

    this.currentKeyIndex = 0;
    this.keyUsageCount = new Map();
    this.keyLastReset = new Map();
    this.maxRequestsPerKey = 45; // Leave some buffer from 50 limit
    
    // Initialize usage tracking
    this.apiKeys.forEach((key, index) => {
      this.keyUsageCount.set(index, 0);
      this.keyLastReset.set(index, new Date());
    });

    console.log(`🔑 Gemini API Manager initialized with ${this.apiKeys.length} API keys`);
  }

  /**
   * Get the current Gemini AI client with automatic key rotation
   */
  getClient() {
    const availableKeyIndex = this.getAvailableKeyIndex();
    
    if (availableKeyIndex === -1) {
      throw new Error('All API keys have exceeded their daily quota. Please wait for reset or add more keys.');
    }

    this.currentKeyIndex = availableKeyIndex;
    const apiKey = this.apiKeys[this.currentKeyIndex];
    
    return new GoogleGenerativeAI(apiKey);
  }

  /**
   * Find an available API key that hasn't exceeded quota
   */
  getAvailableKeyIndex() {
    const now = new Date();
    
    // Check if any keys need to be reset (24 hours passed)
    this.apiKeys.forEach((key, index) => {
      const lastReset = this.keyLastReset.get(index);
      const hoursSinceReset = (now - lastReset) / (1000 * 60 * 60);
      
      if (hoursSinceReset >= 24) {
        this.keyUsageCount.set(index, 0);
        this.keyLastReset.set(index, now);
        console.log(`🔄 API key ${index + 1} quota reset`);
      }
    });

    // Find first available key
    for (let i = 0; i < this.apiKeys.length; i++) {
      const usage = this.keyUsageCount.get(i);
      if (usage < this.maxRequestsPerKey) {
        return i;
      }
    }

    return -1; // No available keys
  }

  /**
   * Make a request with automatic retry and key rotation
   */
  async makeRequest(requestFunction, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = this.getClient();
        const model = client.getGenerativeModel({
          model: 'gemini-2.0-flash-exp',
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          }
        });

        // Execute the request with timeout
        const result = await Promise.race([
          requestFunction(model),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 30000)
          )
        ]);

        // Increment usage count for successful request
        const currentUsage = this.keyUsageCount.get(this.currentKeyIndex);
        this.keyUsageCount.set(this.currentKeyIndex, currentUsage + 1);

        console.log(`✅ API request successful (Key ${this.currentKeyIndex + 1}, Usage: ${currentUsage + 1}/${this.maxRequestsPerKey})`);

        return result;
      } catch (error) {
        lastError = error;

        if (error.status === 429) {
          // Quota exceeded for current key
          console.log(`⚠️ Quota exceeded for API key ${this.currentKeyIndex + 1}, trying next key...`);

          // Mark current key as exhausted
          this.keyUsageCount.set(this.currentKeyIndex, this.maxRequestsPerKey);

          // Try next available key
          const nextKeyIndex = this.getAvailableKeyIndex();
          if (nextKeyIndex === -1) {
            console.log('🚨 All API keys exhausted');
            break;
          }

          continue; // Try with next key
        } else {
          // Other error, don't retry
          console.error(`❌ API request failed:`, error.message);
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate content using Gemini API (wrapper for makeRequest)
   */
  async generateContent(requestFunction, maxRetries = 3) {
    return this.makeRequest(requestFunction, maxRetries);
  }

  /**
   * Generate AI conversation response with fallback
   */
  async generateConversationResponse(session, userInput) {
    try {
      return await this.makeRequest(async (model) => {
        const conversationHistory = session.history
          .slice(-6)
          .map(msg => `${msg.role === 'user' ? 'Étudiant' : 'Professeur'}: ${msg.content}`)
          .join('\n');

        const prompt = `
        Tu es un professeur de français expérimenté qui fait une conversation en temps réel avec un étudiant de niveau ${session.level}.
        ${session.topic ? `Le sujet de conversation est: ${session.topic}` : ''}

        HISTORIQUE:
        ${conversationHistory}

        NOUVEAU MESSAGE: "${userInput}"

        Réponds en JSON:
        {
          "response": "Ta réponse conversationnelle (100-150 mots)",
          "analysis": {
            "grammar": {"score": 85, "errors": []},
            "pronunciation": {"score": 80, "feedback": ["Bonne articulation"]},
            "fluency": {"score": 78, "pace": "naturel"}
          },
          "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
        }

        Sois encourageant, corrige gentiment, pose une question de suivi.
        Réponds UNIQUEMENT avec le JSON valide.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        let responseData;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          responseData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          responseData = null;
        }

        return responseData;
      });
    } catch (error) {
      console.error('Failed to generate conversation response:', error);
      
      // Return fallback response
      return this.getFallbackConversationResponse(session.level);
    }
  }

  /**
   * Generate conversation summary with fallback
   */
  async generateConversationSummary(session) {
    const duration = Math.round((Date.now() - session.startedAt.getTime()) / 1000 / 60);
    const messageCount = session.history.filter(msg => msg.role === 'user').length;

    try {
      return await this.makeRequest(async (model) => {
        const conversationText = session.history
          .map(msg => `${msg.role === 'user' ? 'Étudiant' : 'Professeur'}: ${msg.content}`)
          .join('\n');

        const prompt = `
        Analyse cette conversation en français:

        ${conversationText}

        Niveau: ${session.level}, Durée: ${duration} min, Messages: ${messageCount}

        Réponds en JSON:
        {
          "summary": "Résumé en 2-3 phrases",
          "overallScore": 85,
          "recommendations": ["recommandation 1", "recommandation 2"]
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const summaryData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        return {
          ...summaryData,
          duration,
          messageCount
        };
      });
    } catch (error) {
      console.error('Failed to generate conversation summary:', error);
      
      // Return fallback summary
      return {
        summary: "Conversation terminée avec succès ! Vous avez bien participé et montré de l'engagement.",
        duration,
        messageCount,
        overallScore: 80,
        recommendations: ["Continuez à pratiquer régulièrement", "Enrichissez votre vocabulaire"]
      };
    }
  }

  /**
   * Get fallback conversation response when API is unavailable
   */
  getFallbackConversationResponse(level) {
    const fallbackResponses = {
      'A1': [
        "Très bien ! Continuez à parler. Comment vous appelez-vous ?",
        "C'est bien ! Parlez-moi de votre famille.",
        "Excellent ! Que faites-vous aujourd'hui ?"
      ],
      'A2': [
        "Intéressant ! Pouvez-vous me dire plus ?",
        "Très bien ! Racontez-moi votre journée.",
        "C'est formidable ! Quels sont vos hobbies ?"
      ],
      'B1': [
        "Très intéressant ! Développez votre idée, s'il vous plaît.",
        "Excellent point ! Que pensez-vous de cette situation ?",
        "C'est une bonne observation ! Continuez votre récit."
      ],
      'B2': [
        "Votre point de vue est très pertinent ! Pouvez-vous l'argumenter ?",
        "Excellente analyse ! Comment pourriez-vous approfondir cette réflexion ?",
        "C'est une perspective intéressante ! Quels sont les enjeux selon vous ?"
      ],
      'C1': [
        "Votre argumentation est solide ! Quelles nuances pourriez-vous apporter ?",
        "Analyse très fine ! Comment cette situation évolue-t-elle dans votre contexte ?",
        "Réflexion approfondie ! Quelles implications voyez-vous ?"
      ],
      'C2': [
        "Votre maîtrise linguistique est remarquable ! Explorons les subtilités de cette question.",
        "Analyse très sophistiquée ! Comment articuleriez-vous cette problématique ?",
        "Excellente finesse d'expression ! Quelles sont vos conclusions ?"
      ]
    };

    const responses = fallbackResponses[level] || fallbackResponses['B1'];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return {
      response: randomResponse,
      analysis: {
        grammar: { score: 75, errors: [] },
        pronunciation: { score: 80, feedback: ["Continuez vos efforts"] },
        fluency: { score: 78, pace: "naturel" }
      },
      suggestions: ["Continuez à pratiquer", "Enrichissez votre vocabulaire", "Travaillez la fluidité"]
    };
  }

  /**
   * Get current API usage status
   */
  getUsageStatus() {
    const status = [];
    
    this.apiKeys.forEach((key, index) => {
      const usage = this.keyUsageCount.get(index);
      const lastReset = this.keyLastReset.get(index);
      const hoursUntilReset = 24 - ((new Date() - lastReset) / (1000 * 60 * 60));
      
      status.push({
        keyIndex: index + 1,
        usage: `${usage}/${this.maxRequestsPerKey}`,
        available: usage < this.maxRequestsPerKey,
        hoursUntilReset: Math.max(0, hoursUntilReset).toFixed(1)
      });
    });

    return status;
  }

  /**
   * Reset all key usage (for testing)
   */
  resetAllUsage() {
    const now = new Date();
    this.apiKeys.forEach((key, index) => {
      this.keyUsageCount.set(index, 0);
      this.keyLastReset.set(index, now);
    });
    console.log('🔄 All API key usage reset');
  }
}

// Create singleton instance
const geminiApiManager = new GeminiApiManager();

module.exports = geminiApiManager;
