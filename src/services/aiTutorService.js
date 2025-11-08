const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI with the provided API key
const genAI = new GoogleGenerativeAI('AIzaSyBIXbgZ3EE043v9RLa0Z_h93-BArAF-Hr4');

class AITutorService {
  constructor() {
    this.model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
    this.conversationHistory = new Map(); // Store conversation history per user
  }

  /**
   * Get comprehensive TCF-TEF knowledge base prompt
   */
  getKnowledgeBasePrompt() {
    return `
You are an expert TCF-TEF French language tutor with comprehensive knowledge of:

## TCF (Test de Connaissance du Français) Structure:
- **Listening Comprehension**: 39 multiple choice questions, 35 minutes
- **Reading Comprehension**: 39 multiple choice questions, 60 minutes  
- **Grammar & Vocabulary**: 18 multiple choice questions, 15 minutes
- **Written Expression**: 3 tasks, 60 minutes
- **Oral Expression**: 3 tasks, 12 minutes

## TEF (Test d'Évaluation de Français) Structure:
- **Listening**: 60 questions, 40 minutes
- **Reading**: 50 questions, 60 minutes
- **Vocabulary & Grammar**: 40 questions, 30 minutes
- **Written Expression**: 2 tasks, 60 minutes
- **Oral Expression**: 2 tasks, 15 minutes

## CEFR Levels (A1-C2):
- **A1 (Beginner)**: Basic phrases, simple interactions, present tense
- **A2 (Elementary)**: Simple conversations, past/future tenses, daily topics
- **B1 (Intermediate)**: Express opinions, complex sentences, subjunctive
- **B2 (Upper-Intermediate)**: Detailed discussions, advanced grammar
- **C1 (Advanced)**: Fluent expression, nuanced language, complex texts
- **C2 (Proficient)**: Near-native fluency, sophisticated language use

## Key French Grammar Topics:
- Verb conjugations (present, past, future, conditional, subjunctive)
- Articles (definite, indefinite, partitive)
- Pronouns (subject, object, relative, demonstrative)
- Adjective agreement and placement
- Negation patterns
- Question formation
- Prepositions and conjunctions

## Vocabulary Domains:
- Personal identification, family, relationships
- Education, work, professions
- Travel, transportation, accommodation
- Health, body, medical terms
- Food, shopping, daily activities
- Culture, arts, entertainment
- Environment, society, current events

## Test-Taking Strategies:
- Time management techniques
- Elimination methods for multiple choice
- Structure for written expression
- Oral presentation organization
- Common mistake patterns to avoid

Your role is to:
1. Assess user's current level through conversation
2. Provide personalized learning recommendations
3. Generate practice questions adapted to their level
4. Correct mistakes with detailed explanations
5. Offer test-taking strategies and tips
6. Create study plans based on weaknesses
7. Simulate real test conditions when requested
8. Provide cultural context for better understanding

Always respond in the user's preferred language (French or English) and adapt your teaching style to their proficiency level.
`;
  }

  /**
   * Generate personalized response based on user input and context
   */
  async generateResponse(userId, userMessage, userContext = {}) {
    try {
      const { level = 'unknown', preferredLanguage = 'fr', learningGoals = [], weaknesses = [] } = userContext;
      
      // Get or create conversation history
      if (!this.conversationHistory.has(userId)) {
        this.conversationHistory.set(userId, []);
      }
      const history = this.conversationHistory.get(userId);

      // Build context-aware prompt
      const contextPrompt = this.buildContextPrompt(userMessage, level, preferredLanguage, learningGoals, weaknesses, history);

      // Generate response with error handling
      const result = await this.model.generateContent(contextPrompt);
      const response = await result.response.text();

      // Update conversation history
      history.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response }
      );

      // Keep only last 10 exchanges to manage memory
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      return {
        response,
        suggestions: this.generateSuggestions(userMessage, level),
        levelAssessment: this.assessUserLevel(userMessage, response),
        studyRecommendations: this.generateStudyRecommendations(level, weaknesses)
      };

    } catch (error) {
      console.error('AI Tutor Error:', error);

      // Provide a more helpful fallback response based on user input
      const fallbackResponse = this.generateFallbackResponse(userMessage, level || 'A1', preferredLanguage || 'fr');

      return {
        response: fallbackResponse,
        suggestions: this.generateSuggestions(userMessage, level || 'A1'),
        levelAssessment: this.assessUserLevel(userMessage, ''),
        studyRecommendations: this.generateStudyRecommendations(level || 'A1', weaknesses || [])
      };
    }
  }

  /**
   * Build context-aware prompt for Gemini
   */
  buildContextPrompt(userMessage, level, language, goals, weaknesses, history) {
    const knowledgeBase = this.getKnowledgeBasePrompt();
    
    const contextInfo = `
User Context:
- Current Level: ${level}
- Preferred Language: ${language}
- Learning Goals: ${goals.join(', ') || 'General improvement'}
- Known Weaknesses: ${weaknesses.join(', ') || 'To be determined'}

Recent Conversation:
${history.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Current User Message: "${userMessage}"

Instructions:
- Respond in ${language === 'en' ? 'English' : 'French'}
- Adapt complexity to ${level} level
- Be encouraging and supportive
- Provide specific, actionable advice
- Include examples when explaining concepts
- Suggest follow-up activities
- If user asks for tests, generate appropriate questions
- If user makes mistakes, correct them gently with explanations
`;

    return `${knowledgeBase}\n\n${contextInfo}`;
  }

  /**
   * Generate contextual suggestions based on user input
   */
  generateSuggestions(userMessage, level) {
    const message = userMessage.toLowerCase();
    
    if (message.includes('test') || message.includes('exam')) {
      return [
        "Créer un test de niveau",
        "Stratégies d'examen",
        "Questions d'entraînement",
        "Simulation TCF/TEF"
      ];
    }
    
    if (message.includes('grammaire') || message.includes('grammar')) {
      return [
        "Exercices de conjugaison",
        "Règles d'accord",
        "Temps verbaux",
        "Structure des phrases"
      ];
    }
    
    if (message.includes('vocabulaire') || message.includes('vocabulary')) {
      return [
        "Mots du quotidien",
        "Vocabulaire professionnel",
        "Expressions idiomatiques",
        "Synonymes et antonymes"
      ];
    }

    // Default suggestions based on level
    const levelSuggestions = {
      'A1': ["Alphabet et prononciation", "Verbes être et avoir", "Nombres et dates", "Se présenter"],
      'A2': ["Passé composé", "Futur proche", "Comparaisons", "Décrire des activités"],
      'B1': ["Subjonctif", "Expression de l'opinion", "Connecteurs logiques", "Récits au passé"],
      'B2': ["Argumentation", "Registres de langue", "Nuances temporelles", "Analyse de textes"],
      'C1': ["Style soutenu", "Figures de style", "Débats complexes", "Rédaction académique"],
      'C2': ["Maîtrise parfaite", "Subtilités culturelles", "Création littéraire", "Expertise linguistique"]
    };

    return levelSuggestions[level] || [
      "Évaluer mon niveau",
      "Plan d'étude personnalisé",
      "Exercices adaptés",
      "Conseils d'apprentissage"
    ];
  }

  /**
   * Assess user level based on their input
   */
  assessUserLevel(userMessage, aiResponse) {
    // Simple heuristic-based level assessment
    const message = userMessage.toLowerCase();
    const complexity = this.analyzeComplexity(userMessage);
    
    if (complexity.score < 2) return 'A1';
    if (complexity.score < 4) return 'A2';
    if (complexity.score < 6) return 'B1';
    if (complexity.score < 8) return 'B2';
    if (complexity.score < 9) return 'C1';
    return 'C2';
  }

  /**
   * Analyze linguistic complexity of user input
   */
  analyzeComplexity(text) {
    let score = 0;
    const indicators = {
      length: text.length > 50 ? 1 : 0,
      vocabulary: (text.match(/\b\w{7,}\b/g) || []).length > 2 ? 1 : 0,
      sentences: text.split(/[.!?]/).length > 2 ? 1 : 0,
      conjunctions: /\b(cependant|néanmoins|toutefois|par conséquent)\b/i.test(text) ? 2 : 0,
      subjunctive: /\b(que.*(?:soit|ait|fasse|puisse))\b/i.test(text) ? 2 : 0,
      conditional: /\b\w+(?:rais|rait|rions|riez|raient)\b/i.test(text) ? 1 : 0,
      complex_tenses: /\b(?:avais|avait|avions|aviez|avaient|aurai|auras|aura)\b/i.test(text) ? 1 : 0
    };

    score = Object.values(indicators).reduce((sum, val) => sum + val, 0);
    return { score, indicators };
  }

  /**
   * Generate study recommendations based on level and weaknesses
   */
  generateStudyRecommendations(level, weaknesses) {
    const recommendations = [];
    
    // Level-based recommendations
    const levelRecs = {
      'A1': [
        "Commencez par les verbes être et avoir",
        "Apprenez les nombres de 0 à 100",
        "Pratiquez l'alphabet et la prononciation",
        "Mémorisez les salutations de base"
      ],
      'A2': [
        "Maîtrisez le passé composé",
        "Apprenez le futur proche",
        "Étudiez les prépositions de lieu",
        "Pratiquez les questions avec inversion"
      ],
      'B1': [
        "Travaillez le subjonctif présent",
        "Développez l'expression de l'opinion",
        "Apprenez les connecteurs logiques",
        "Pratiquez les récits au passé"
      ],
      'B2': [
        "Perfectionnez l'argumentation",
        "Étudiez les registres de langue",
        "Maîtrisez les temps du récit",
        "Analysez des textes complexes"
      ],
      'C1': [
        "Développez le style soutenu",
        "Étudiez les figures de style",
        "Participez à des débats complexes",
        "Rédigez des textes académiques"
      ],
      'C2': [
        "Perfectionnez les nuances stylistiques",
        "Explorez la création littéraire",
        "Maîtrisez tous les registres",
        "Développez l'expertise linguistique"
      ]
    };

    recommendations.push(...(levelRecs[level] || levelRecs['A1']));

    // Weakness-based recommendations
    if (weaknesses.includes('grammar')) {
      recommendations.push("Révisez les règles grammaticales de base");
    }
    if (weaknesses.includes('vocabulary')) {
      recommendations.push("Enrichissez votre vocabulaire quotidiennement");
    }
    if (weaknesses.includes('listening')) {
      recommendations.push("Écoutez des podcasts français adaptés à votre niveau");
    }
    if (weaknesses.includes('speaking')) {
      recommendations.push("Pratiquez la conversation avec des natifs");
    }

    return recommendations.slice(0, 4); // Return top 4 recommendations
  }

  /**
   * Generate practice test questions based on user level
   */
  async generateTestQuestions(level, questionType, count = 5) {
    try {
      const prompt = `
Generate ${count} ${questionType} questions for TCF/TEF level ${level}.

Question Types:
- multiple_choice: 4 options with 1 correct answer
- fill_blank: Sentence with missing word(s)
- true_false: Statement to evaluate
- short_answer: Brief response required

Format as JSON array with:
{
  "question": "Question text",
  "type": "${questionType}",
  "options": ["A", "B", "C", "D"] (for multiple choice),
  "correct_answer": "Correct answer",
  "explanation": "Why this is correct",
  "level": "${level}",
  "topic": "Grammar/Vocabulary/etc"
}

Focus on ${level} appropriate content:
${this.getLevelFocus(level)}
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response.text();
      
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.getFallbackQuestions(level, questionType, count);
      
    } catch (error) {
      console.error('Error generating test questions:', error);
      return this.getFallbackQuestions(level, questionType, count);
    }
  }

  /**
   * Get level-specific focus areas
   */
  getLevelFocus(level) {
    const focuses = {
      'A1': 'Basic vocabulary, present tense, simple sentences, personal information',
      'A2': 'Past and future tenses, daily activities, simple descriptions',
      'B1': 'Complex sentences, opinions, subjunctive, past narratives',
      'B2': 'Advanced grammar, argumentation, formal/informal registers',
      'C1': 'Sophisticated language, nuanced expressions, complex texts',
      'C2': 'Near-native proficiency, literary language, cultural references'
    };
    return focuses[level] || focuses['A1'];
  }

  /**
   * Fallback questions when AI generation fails
   */
  getFallbackQuestions(level, type, count) {
    const fallbackQuestions = {
      'A1': [
        {
          question: "Comment vous appelez-vous ?",
          type: "multiple_choice",
          options: ["Je m'appelle Marie", "Tu t'appelles Marie", "Il s'appelle Marie", "Nous nous appelons Marie"],
          correct_answer: "Je m'appelle Marie",
          explanation: "Pour répondre à la question 'Comment vous appelez-vous ?', on utilise 'Je m'appelle...'",
          level: "A1",
          topic: "Se présenter"
        }
      ]
    };

    return fallbackQuestions[level] || fallbackQuestions['A1'];
  }

  /**
   * Provide detailed feedback on user's answer
   */
  async provideFeedback(userAnswer, correctAnswer, question, level) {
    try {
      const prompt = `
As a TCF/TEF tutor, provide detailed feedback for this answer:

Question: ${question}
User Answer: ${userAnswer}
Correct Answer: ${correctAnswer}
User Level: ${level}

Provide:
1. Whether the answer is correct
2. Detailed explanation of the correct answer
3. Common mistakes to avoid
4. Additional tips for this type of question
5. Encouragement appropriate for ${level} level

Respond in French if the question is in French, English if in English.
`;

      const result = await this.model.generateContent(prompt);
      return await result.response.text();
      
    } catch (error) {
      console.error('Error providing feedback:', error);
      return "Bonne tentative ! Continuez à pratiquer pour améliorer vos compétences.";
    }
  }

  /**
   * Generate fallback response when AI fails
   */
  generateFallbackResponse(userMessage, level, language) {
    const message = userMessage.toLowerCase();

    if (language === 'en') {
      if (message.includes('hello') || message.includes('bonjour')) {
        return "Hello! I'm your French tutor. I can help you with grammar, vocabulary, test preparation, and conversation practice. What would you like to work on today?";
      }
      if (message.includes('test') || message.includes('exam')) {
        return "I can help you prepare for TCF and TEF exams! I can generate practice questions, explain test formats, and provide study strategies. What specific area would you like to focus on?";
      }
      if (message.includes('grammar')) {
        return "French grammar can be challenging, but I'm here to help! I can explain verb conjugations, article usage, sentence structure, and more. What grammar topic interests you?";
      }
      return "I'm your specialized TCF-TEF French tutor. I can help with grammar, vocabulary, test preparation, conversation practice, and level assessment. How can I assist you today?";
    } else {
      if (message.includes('bonjour') || message.includes('salut')) {
        return "Bonjour ! Je suis votre tuteur de français spécialisé TCF-TEF. Je peux vous aider avec la grammaire, le vocabulaire, la préparation aux examens et la pratique de la conversation. Que souhaitez-vous étudier aujourd'hui ?";
      }
      if (message.includes('test') || message.includes('examen')) {
        return "Je peux vous aider à préparer les examens TCF et TEF ! Je peux générer des questions d'entraînement, expliquer les formats d'examen et fournir des stratégies d'étude. Sur quel domaine souhaitez-vous vous concentrer ?";
      }
      if (message.includes('grammaire')) {
        return "La grammaire française peut être difficile, mais je suis là pour vous aider ! Je peux expliquer les conjugaisons, l'usage des articles, la structure des phrases et bien plus. Quel sujet grammatical vous intéresse ?";
      }
      return "Je suis votre tuteur de français spécialisé TCF-TEF. Je peux vous aider avec la grammaire, le vocabulaire, la préparation aux examens, la pratique de la conversation et l'évaluation de niveau. Comment puis-je vous aider aujourd'hui ?";
    }
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }
}

module.exports = new AITutorService();
