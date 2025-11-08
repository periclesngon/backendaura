import { logger } from '../utils/logger'
const geminiApiManager = require('../utils/geminiApiManager')

export class AIService {
  // Generate personalized greeting message
  static async generateGreeting(firstName: string, lastName: string): Promise<string> {
    try {
      const hour = new Date().getHours()
      let timeOfDay = ''
      
      if (hour >= 5 && hour < 12) {
        timeOfDay = 'matin'
      } else if (hour >= 12 && hour < 17) {
        timeOfDay = 'après-midi'
      } else if (hour >= 17 && hour < 21) {
        timeOfDay = 'soir'
      } else {
        timeOfDay = 'nuit'
      }

      const greetings = [
        `Bon ${timeOfDay}, ${firstName}! Prêt pour une nouvelle session d'apprentissage?`,
        `Salut ${firstName}! Comment allez-vous aujourd'hui?`,
        `Bonjour ${firstName}! Votre parcours français vous attend.`,
        `Coucou ${firstName}! Prêt à progresser en français?`,
        `Bon ${timeOfDay} ${firstName}! Continuons votre apprentissage.`
      ]

      return greetings[Math.floor(Math.random() * greetings.length)]
    } catch (error) {
      logger.error('Error generating greeting:', error)
      return `Bonjour ${firstName}!`
    }
  }t

  // Generate motivational message
  static async generateMotivation(firstName: string): Promise<string> {
    try {
      const motivationalQuotes = [
        "Chaque mot appris vous rapproche de vos rêves.",
        "Votre persévérance en français porte déjà ses fruits.",
        "Chaque erreur est une opportunité d'apprendre.",
        "Votre accent n'est pas un défaut, c'est votre signature unique.",
        "Aujourd'hui est une nouvelle chance de progresser.",
        "Le français vous ouvre les portes du monde.",
        "Votre détermination inspire les autres.",
        "Chaque session d'étude vous rend plus fort.",
        "Vos efforts d'aujourd'hui sont les succès de demain.",
        "La maîtrise du français est à votre portée."
      ]

      return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]
    } catch (error) {
      logger.error('Error generating motivation:', error)
      return "Chaque mot appris vous rapproche de vos rêves."
    }
  }

  // Generate weather-based message
  static async generateWeatherMessage(country: string): Promise<string> {
    try {
      const weatherMessages = {
        'Canada': [
          "Il fait frais au Canada aujourd'hui, parfait pour étudier à l'intérieur!",
          "Le temps canadien est idéal pour une session d'étude confortable.",
          "Profitez du temps pour vous concentrer sur votre français."
        ],
        'France': [
          "Le temps en France est magnifique pour apprendre le français!",
          "Quel beau jour pour pratiquer votre français!",
          "Le climat français inspire l'apprentissage."
        ],
        'Belgium': [
          "Le temps belge est parfait pour une session d'étude.",
          "Profitez du temps pour améliorer votre français.",
          "Le climat belge favorise la concentration."
        ],
        'Switzerland': [
          "Le temps suisse est idéal pour apprendre le français.",
          "Profitez de l'air frais pour étudier.",
          "Le climat suisse favorise l'apprentissage."
        ],
        'default': [
          "Bonne journée pour apprendre le français!",
          "Le temps est parfait pour une session d'étude.",
          "Profitez de cette belle journée pour progresser."
        ]
      }

      const messages = weatherMessages[country as keyof typeof weatherMessages] || weatherMessages.default
      return messages[Math.floor(Math.random() * messages.length)]
    } catch (error) {
      logger.error('Error generating weather message:', error)
      return "Bonne journée pour apprendre le français!"
    }
  }

  // Generate personalized study recommendations
  static async generateStudyRecommendations(userId: string): Promise<any[]> {
    try {
      // This would integrate with actual AI service in production
      // For now, return mock recommendations
      return [
        {
          id: 1,
          type: 'test',
          title: 'Test de vocabulaire avancé',
          description: 'Améliorez votre vocabulaire avec des mots complexes',
          difficulty: 'Intermédiaire',
          time: '15 min',
          reward: '50 XP'
        },
        {
          id: 2,
          type: 'course',
          title: 'Grammaire française',
          description: 'Maîtrisez les règles de grammaire essentielles',
          difficulty: 'Débutant',
          time: '20 min',
          reward: '75 XP'
        },
        {
          id: 3,
          type: 'practice',
          title: 'Expression orale',
          description: 'Pratiquez votre prononciation française',
          difficulty: 'Avancé',
          time: '10 min',
          reward: '100 XP'
        }
      ]
    } catch (error) {
      logger.error('Error generating study recommendations:', error)
      return []
    }
  }

  // Generate daily tip
  static async generateDailyTip(): Promise<string> {
    try {
      const tips = [
        "Pratiquez l'expression orale 10 minutes par jour pour améliorer votre fluidité de 40% en 2 semaines.",
        "Écoutez de la musique française pour améliorer votre compréhension orale naturellement.",
        "Lisez un article de journal français chaque jour pour enrichir votre vocabulaire.",
        "Pratiquez avec un partenaire de conversation pour gagner en confiance.",
        "Utilisez des flashcards pour mémoriser efficacement le vocabulaire.",
        "Regardez des films français avec sous-titres pour améliorer votre écoute.",
        "Écrivez un journal en français pour pratiquer l'expression écrite.",
        "Rejoignez des groupes de conversation française pour pratiquer régulièrement."
      ]

      return tips[Math.floor(Math.random() * tips.length)]
    } catch (error) {
      logger.error('Error generating daily tip:', error)
      return "Pratiquez l'expression orale 10 minutes par jour pour améliorer votre fluidité."
    }
  }

  // Generate AI response using Gemini
  static async generateResponse(params: {
    message: string
    systemPrompt: string
    context: {
      userLevel: string
      language: string
      relevantQuestions: any[]
      conversationHistory: any[]
    }
  }): Promise<{ content: string; confidence?: number }> {
    try {
      const { message, systemPrompt, context } = params
      
      // Use Gemini API Manager for AI response
      const response = await geminiApiManager.makeRequest(async (model) => {
        const prompt = `${systemPrompt}

Message: ${message}

Réponds directement et utilement en français.`

        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      })

      return {
        content: response,
        confidence: 0.9
      }
    } catch (error) {
      logger.error('Error generating AI response:', error)

      // Fallback response
      return {
        content: "Je suis désolé, je rencontre un problème technique. Pouvez-vous reformuler votre question ?",
        confidence: 0.5
      }
    }
  }

  /**
   * Generate content using AI
   */
  static async generateContent(prompt: string): Promise<string> {
    try {
      return await geminiApiManager.generateContent(async (model) => {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      })
    } catch (error) {
      logger.error('Error generating AI content:', error)
      throw new Error('Failed to generate AI content')
    }
  }

  // Generate course notes using AI
  static async generateNotes(content: string, lessonTitle: string, courseTitle: string): Promise<{ notes: string[] }> {
    const prompt = `
      Vous êtes un assistant IA spécialisé dans l'éducation du français. 
      Générez des notes de cours structurées et utiles basées sur le contenu suivant:
      
      Cours: ${courseTitle}
      Leçon: ${lessonTitle}
      Contenu: ${content}
      
      Veuillez générer 5-7 notes clés qui résument les points importants de cette leçon.
      Chaque note doit être concise (1-2 phrases) et pédagogique.
      Format de réponse: Liste de notes, une par ligne, sans numérotation.
    `

    const response = await geminiApiManager.generateContent(async (model) => {
      const result = await model.generateContent(prompt)
      const response = await result.response
      return response.text()
    })
    
    // Parse the response into an array of notes
    const notes = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 7) // Limit to 7 notes

    return { notes }
  }

  // Generate course questions using AI
  static async generateQuestions(
    content: string, 
    lessonTitle: string, 
    courseTitle: string, 
    questionCount: number = 5,
    questionTypes: string[] = ["multiple-choice", "true-false", "short-answer"],
    category?: string,
    difficulty?: string
  ): Promise<{ questions: any[] }> {
    const difficultyInstructions = {
      "easy": "Questions simples et directes, vocabulaire basique, concepts fondamentaux",
      "medium": "Questions de niveau intermédiaire, vocabulaire courant, application des règles",
      "hard": "Questions complexes, vocabulaire avancé, analyse et synthèse",
      "expert": "Questions très difficiles, vocabulaire spécialisé, réflexion critique et créative"
    }

    const categoryInstructions = {
      "grammar": "Questions de grammaire française: conjugaisons, accords, syntaxe, temps verbaux",
      "vocabulary": "Questions de vocabulaire: définitions, synonymes, antonymes, usage contextuel",
      "listening": "Questions de compréhension orale: détails, idées principales, contexte, ton",
      "reading": "Questions de compréhension écrite: analyse de texte, inférence, structure",
      "writing": "Questions d'expression écrite: rédaction, style, cohérence",
      "oral": "Questions d'expression orale: prononciation, fluidité, communication"
    }

    // Validate question count first - allow 0 for manual question addition
    const validQuestionCount = Math.min(Math.max(0, questionCount), 100); // Allow 0-100 questions
    if (validQuestionCount !== questionCount) {
      console.log(`⚠️ Question count adjusted from ${questionCount} to ${validQuestionCount}`);
    }
    
    // If questionCount is 0, return empty questions array (for manual addition)
    if (validQuestionCount === 0) {
      console.log('📝 Question count is 0 - allowing manual question addition only');
      return { questions: [] };
    }
    
    // If content is too short, use title and description to generate meaningful questions
    const effectiveContent = content.trim().length < 50 
      ? `Le sujet d'examen "${content.trim()}" pour le cours "${courseTitle}" et la leçon "${lessonTitle}". ${categoryInstructions[category as keyof typeof categoryInstructions] || 'Questions générales de français.'}`
      : content;
    
    console.log('📝 AI Generation Input:', {
      contentLength: content.length,
      effectiveContentLength: effectiveContent.length,
      lessonTitle,
      courseTitle,
      questionCount,
      validQuestionCount,
      category,
      difficulty
    });

    const prompt = `
      Vous êtes un assistant IA spécialisé dans l'éducation du français et la préparation aux tests TCF/TEF.
      Générez des questions COMPLÈTES et DÉTAILLÉES basées sur le contenu suivant.
      
      CONTEXTE IMPORTANT:
      - Vous devez générer EXACTEMENT ${validQuestionCount} questions DÉTAILLÉES et UNIQUES
      - Chaque question doit être COMPLÈTE et COMPRÉHENSIVE, couvrant toutes les informations essentielles
      - Les questions doivent encourager des réponses élaborées, pas seulement des réponses courtes
      - Chaque question doit aborder différents aspects du contenu (vocabulaire, grammaire, compréhension, expression)
      - Les questions doivent être VARIÉES et DIFFÉRENTES les unes des autres
      
      Cours: ${courseTitle}
      Leçon: ${lessonTitle}
      Contenu: ${effectiveContent.substring(0, 8000)} ${effectiveContent.length > 8000 ? '...[contenu tronqué pour respecter les limites]' : ''}
      Catégorie: ${category || 'générale'}
      Niveau de difficulté: ${difficulty || 'moyen'} - ${difficultyInstructions[difficulty as keyof typeof difficultyInstructions] || 'niveau standard'}
      
      INSTRUCTIONS SPÉCIFIQUES:
      1. Générez EXACTEMENT ${validQuestionCount} questions/SUJETS DÉTAILLÉS
      2. Chaque question doit être LONGUE et COMPLÈTE (minimum 20-30 mots)
      3. Chaque question doit couvrir des aspects ESSENTIELS du contenu
      4. Les questions doivent varier en difficulté et en type
      5. ${categoryInstructions[category as keyof typeof categoryInstructions] || 'Questions générales de français.'}
      6. Niveau de difficulté: ${difficultyInstructions[difficulty as keyof typeof difficultyInstructions] || 'Questions de niveau standard.'}
      
      EXEMPLE DE QUESTION DÉTAILLÉE (à suivre):
      "Pouvez-vous expliquer en détail les différents aspects de [sujet], en incluant les avantages, les inconvénients, et les implications pratiques pour [contexte]?"
      
      Format de réponse JSON:
      {
        "questions": [
          {
            "questionText": "Question COMPLÈTE et DÉTAILLÉE (minimum 20-30 mots, couvrant tous les aspects essentiels)",
            "type": "multiple-choice",
            "options": ["Option A détaillée", "Option B détaillée", "Option C détaillée", "Option D détaillée"],
            "correctAnswer": 0,
            "explanation": "Explication DÉTAILLÉE de la réponse (minimum 50 mots)",
            "points": 1,
            "category": "${category || 'GENERAL'}",
            "level": "${difficulty || 'B1'}"
          }
        ]
      }
      
      Types de questions supportés: ${questionTypes.join(", ")}
      Pour les questions à choix multiples, fournissez 4 options DÉTAILLÉES et indiquez l'index de la bonne réponse (0-3).
      Pour les questions vrai/faux, utilisez "true" ou "false" comme correctAnswer.
      Pour les questions ouvertes, fournissez la réponse attendue DÉTAILLÉE comme correctAnswer.
      
      IMPORTANT: Assurez-vous que chaque question est COMPLÈTE, DÉTAILLÉE, et couvre les informations ESSENTIELLES du contenu.
      Ne générez PAS de questions courtes ou superficielles. Chaque question doit permettre une réponse élaborée.
    `

    try {
      // validQuestionCount is already defined above
      
      // For large question counts (80+), generate in batches
      let allQuestions: any[] = []
      const batchSize = validQuestionCount > 50 ? 25 : validQuestionCount // Generate 25 questions per batch for large counts
      const batches = Math.ceil(validQuestionCount / batchSize)
      
      console.log(`🔄 Generating ${validQuestionCount} questions in ${batches} batch(es) of ${batchSize} questions each`)
      
      for (let batch = 0; batch < batches; batch++) {
        const currentBatchSize = batch === batches - 1 ? (validQuestionCount - allQuestions.length) : batchSize
        const batchPrompt = prompt.replace(
          `Générez EXACTEMENT ${validQuestionCount} questions/SUJETS DÉTAILLÉS`,
          `Générez EXACTEMENT ${currentBatchSize} questions/SUJETS DÉTAILLÉS (lot ${batch + 1}/${batches})`
        ).replace(
          `Vous devez générer ${validQuestionCount} questions/SUJETS DÉTAILLÉS`,
          `Vous devez générer ${currentBatchSize} questions/SUJETS DÉTAILLÉS pour ce lot (${batch + 1}/${batches})`
        ).replace(
          `Générez EXACTEMENT ${questionCount} questions DÉTAILLÉES et UNIQUES`,
          `Générez EXACTEMENT ${currentBatchSize} questions DÉTAILLÉES et UNIQUES (lot ${batch + 1}/${batches})`
        )
        
      const response = await geminiApiManager.generateContent(async (model) => {
          const result = await model.generateContent(batchPrompt)
        const response = await result.response
        return response.text()
      })
      
        console.log(`🤖 AI Response (Batch ${batch + 1}/${batches}):`, response.substring(0, 300) + '...')
      
      // Try to parse JSON response
      try {
        // Clean the response to extract JSON - look for the complete JSON object
        const jsonMatch = response.match(/\{[\s\S]*"questions"[\s\S]*\}/)
        if (jsonMatch) {
          const jsonStr = jsonMatch[0]
          // Try to fix common JSON issues
          const cleanedJson = jsonStr
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
            .replace(/(\w+):/g, '"$1":') // Quote unquoted keys
            .replace(/:(\w+)/g, ':"$1"') // Quote unquoted string values
          
          const parsed = JSON.parse(cleanedJson)
          if (parsed.questions && Array.isArray(parsed.questions)) {
              console.log(`✅ Successfully parsed JSON response (Batch ${batch + 1}): ${parsed.questions.length} questions`)
              allQuestions.push(...parsed.questions)
              continue // Move to next batch
          }
        }
      } catch (parseError) {
          console.log(`❌ Failed to parse JSON (Batch ${batch + 1}):`, parseError.message)
      }
      
        // Try to extract questions from text response for this batch
      try {
        const questionMatches = response.match(/"questionText":\s*"([^"]+)"/g)
        if (questionMatches && questionMatches.length > 0) {
            console.log(`🔍 Found question text matches (Batch ${batch + 1}):`, questionMatches.length)
            const batchQuestions = questionMatches.slice(0, currentBatchSize).map((match, index) => {
              const questionText = match.match(/"questionText":\s*"([^"]+)"/)?.[1] || `Question ${allQuestions.length + index + 1}`
              const questionType = questionTypes[(allQuestions.length + index) % questionTypes.length]
            
            return {
              questionText,
              type: questionType,
                // Generate realistic options based on content - NO hardcoded options
                options: questionType === "multiple-choice" ? this.generateRealisticOptions(effectiveContent, category, allQuestions.length + index) : [],
                correctAnswer: questionType === "multiple-choice" ? Math.floor(Math.random() * 4) : questionType === "true-false" ? (Math.random() > 0.5 ? "true" : "false") : "Réponse attendue basée sur le contenu",
                explanation: `Explication détaillée pour la question ${allQuestions.length + index + 1}`,
                points: 1,
                category: category || 'GENERAL',
                level: difficulty || 'B1'
            }
          })
          
            console.log(`✅ Extracted ${batchQuestions.length} questions from text (Batch ${batch + 1})`)
            allQuestions.push(...batchQuestions)
            continue // Move to next batch
        }
      } catch (extractError) {
          console.log(`❌ Failed to extract questions from text (Batch ${batch + 1}):`, extractError.message)
      }
      
        // Fallback for this batch: Generate structured questions from content analysis
        console.log(`🔄 Using fallback question generation (Batch ${batch + 1})`)
        
        for (let i = 0; i < currentBatchSize; i++) {
          const globalIndex = allQuestions.length + i
          const questionType = questionTypes[globalIndex % questionTypes.length]
        let questionText = ""
        let options = []
          let correctAnswer: number | string = Math.floor(Math.random() * 4) // Randomize correct answer between 0-3
        
          // Generate detailed questions based on content analysis
        if (questionType === "multiple-choice") {
          if (category === "grammar") {
              questionText = `Pouvez-vous expliquer en détail la règle de grammaire correcte pour cette phrase, en incluant les accords, la conjugaison, et les temps verbaux appropriés ?`
            options = [
                "Règle A - Conjugaison correcte avec accords appropriés",
                "Règle B - Accord correct avec syntaxe appropriée", 
                "Règle C - Syntaxe appropriée avec temps verbaux adaptés",
                "Règle D - Temps verbal adapté avec structure correcte"
            ]
          } else if (category === "vocabulary") {
              questionText = `Pouvez-vous expliquer en détail le sens de ce mot dans ce contexte, en incluant les synonymes, les antonymes, et les nuances d'usage ?`
            options = [
                "Définition A avec contexte et nuances",
                "Définition B avec synonymes et usage", 
                "Définition C avec antonymes et registre",
                "Définition D avec contexte complet"
            ]
          } else if (category === "listening") {
              questionText = `Pouvez-vous expliquer en détail ce que dit la personne dans l'enregistrement, en incluant le contexte, le ton, et les détails importants ?`
            options = [
                "Réponse A avec contexte détaillé",
                "Réponse B avec ton et nuances", 
                "Réponse C avec détails importants",
                "Réponse D avec analyse complète"
            ]
          } else {
              questionText = `Pouvez-vous expliquer en détail les aspects essentiels de cette question sur le contenu étudié, en couvrant tous les éléments importants et les implications pratiques ?`
              options = this.generateRealisticOptions(effectiveContent, category, globalIndex)
          }
            // Randomize correct answer after generating options
            correctAnswer = Math.floor(Math.random() * 4)
        } else if (questionType === "true-false") {
          if (category === "grammar") {
              questionText = `Cette phrase respecte-t-elle les règles de grammaire française ? Expliquez en détail pourquoi, en incluant les règles spécifiques, les accords, et les exceptions éventuelles.`
          } else if (category === "vocabulary") {
              questionText = `Ce mot a-t-il le sens donné dans ce contexte ? Expliquez en détail pourquoi, en incluant les nuances, le registre, et les usages possibles.`
          } else if (category === "listening") {
              questionText = `L'enregistrement mentionne-t-il cette information ? Expliquez en détail pourquoi, en incluant le contexte, les détails, et les implications.`
          } else {
              questionText = `Cette affirmation est-elle correcte ? Expliquez en détail pourquoi, en incluant tous les aspects essentiels, les nuances, et les implications pratiques.`
          }
          correctAnswer = "true"
        } else if (questionType === "short-answer") {
          if (category === "grammar") {
              questionText = `Expliquez en détail la règle de grammaire appliquée dans cette phrase, en incluant tous les aspects pertinents, les exceptions, et les nuances.`
          } else if (category === "vocabulary") {
              questionText = `Définissez ce terme en détail dans votre propre vocabulaire, en incluant le contexte, les synonymes, et les usages possibles.`
          } else if (category === "listening") {
              questionText = `Résumez en détail le contenu principal de l'enregistrement, en incluant les points clés, le contexte, et les implications.`
            } else {
              questionText = `Répondez en détail à cette question, en couvrant tous les aspects essentiels, les nuances, et les implications pratiques du contenu étudié.`
            }
            correctAnswer = "Réponse attendue détaillée selon le contenu"
          }
          
          allQuestions.push({
            questionText,
            type: questionType,
            options: questionType === "multiple-choice" ? options : [],
            correctAnswer,
            explanation: `Explication détaillée et complète pour la question ${globalIndex + 1}, couvrant tous les aspects essentiels et les nuances importantes.`,
            points: 1,
            category: category || 'GENERAL',
            level: difficulty || 'B1'
          })
        }
        
        console.log(`✅ Generated ${currentBatchSize} structured questions (Batch ${batch + 1})`)
      }
      
      // Return all questions from all batches
      // Ensure we have exactly the requested number of questions
      const finalQuestions = allQuestions.slice(0, validQuestionCount)
      
      // If we don't have enough questions, generate more to reach the exact count
      if (finalQuestions.length < validQuestionCount) {
        console.log(`⚠️ Only ${finalQuestions.length} questions generated, requested ${validQuestionCount}. Generating ${validQuestionCount - finalQuestions.length} more...`)
        
        // Generate additional questions to reach exact count
        // Instead of repeating content, generate unique questions based on different aspects
        while (finalQuestions.length < validQuestionCount) {
          const remainingCount = questionCount - finalQuestions.length
          const questionIndex = finalQuestions.length + 1
          const questionType = questionTypes[finalQuestions.length % questionTypes.length]
          
          // Split content into sentences/parts for variety
          const contentParts = content.split(/[.!?]\s+/).filter(p => p.length > 20)
          const partIndex = finalQuestions.length % Math.max(1, contentParts.length)
          const contentPart = contentParts[partIndex] || content.substring(0, 200)
          
          let questionText = ""
          let options: any[] = []
          let correctAnswer: any = 0
          
          // Generate unique questions based on different aspects of the content
          if (questionType === "multiple-choice") {
            // Generate question based on specific aspect of content
            const aspects = [
              "Quelle est la règle principale concernant",
              "Comment expliquez-vous",
              "Quel est le concept clé de",
              "Quelle est la différence entre",
              "Quel est le principe de",
              "Comment identifier",
              "Quelle est l'importance de",
              "Comment appliquer",
              "Quel est le mécanisme de",
              "Comment distinguer"
            ]
            const aspectIndex = finalQuestions.length % aspects.length
            questionText = `${aspects[aspectIndex]} ${contentPart.substring(0, 150)} ?`
            
            options = this.generateRealisticOptions(effectiveContent, category, questionIndex)
            // Randomize correct answer 
            correctAnswer = Math.floor(Math.random() * 4)
          } else if (questionType === "true-false") {
            // Generate true/false based on content
            const statements = [
              `Selon le contenu, cette affirmation est correcte: ${contentPart.substring(0, 100)}`,
              `Cette affirmation est vraie concernant le contenu: ${contentPart.substring(0, 100)}`,
              `Cette règle s'applique selon le contenu: ${contentPart.substring(0, 100)}`,
              `Cette information est correcte: ${contentPart.substring(0, 100)}`
            ]
            const statementIndex = finalQuestions.length % statements.length
            questionText = statements[statementIndex]
            correctAnswer = "true"
          } else {
            // Generate short-answer question
            const prompts = [
              "Expliquez en détail",
              "Décrivez précisément",
              "Analysez les aspects de",
              "Résumez les concepts de",
              "Définissez les termes de",
              "Illustrez avec des exemples",
              "Comparez les différentes approches de",
              "Évaluez l'importance de"
            ]
            const promptIndex = finalQuestions.length % prompts.length
            questionText = `${prompts[promptIndex]} ${contentPart.substring(0, 150)} ?`
            correctAnswer = `Réponse attendue basée sur l'analyse de ${contentPart.substring(0, 100)}`
          }
          
          finalQuestions.push({
            questionText,
            type: questionType,
            options: questionType === "multiple-choice" ? options : [],
            correctAnswer,
            explanation: `Explication détaillée pour la question ${questionIndex} basée sur le contenu fourni`,
            points: 1,
            category: category || 'GENERAL',
            level: difficulty || 'B1'
          })
        }
      }
      
      console.log(`✅ Returning exactly ${finalQuestions.length} questions (requested: ${validQuestionCount})`)
      return { questions: finalQuestions }
    } catch (error: any) {
      console.error('❌ Error generating questions:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        contentLength: content.length,
        lessonTitle,
        courseTitle,
        questionCount
      });
      
      // Note: allQuestions is not accessible here due to scope, so we'll use fallback
      
      // Return fallback questions based on the requested count
      console.log(`⚠️ Using fallback question generation due to error: ${error.message}`);
      const fallbackQuestions: any[] = [];
      const fallbackCount = Math.min(Math.max(1, questionCount), 100);
      
      for (let i = 0; i < fallbackCount; i++) {
        const questionType = questionTypes[i % questionTypes.length];
        let questionText = "";
        let options: string[] = [];
        let correctAnswer: any = 0;
        
        if (questionType === "multiple-choice") {
          questionText = `Question ${i + 1}: ${lessonTitle || courseTitle || 'Sujet d\'examen'} - ${categoryInstructions[category as keyof typeof categoryInstructions] || 'Question générale'}`;
          options = this.generateRealisticOptions(effectiveContent || content, category, i);
          correctAnswer = Math.floor(Math.random() * 4); // Random correct answer
        } else if (questionType === "true-false") {
          questionText = `Question ${i + 1}: ${lessonTitle || courseTitle || 'Sujet d\'examen'} - Cette affirmation est correcte selon le contenu.`;
          correctAnswer = "true";
          options = [];
        } else {
          questionText = `Question ${i + 1}: ${lessonTitle || courseTitle || 'Sujet d\'examen'} - Expliquez en détail.`;
          correctAnswer = "Réponse attendue basée sur le contenu";
          options = [];
        }
        
        fallbackQuestions.push({
          questionText,
          type: questionType,
          options,
          correctAnswer,
          explanation: `Explication détaillée pour la question ${i + 1} basée sur ${lessonTitle || courseTitle || 'le sujet d\'examen'}`,
          points: 1,
          category: category || 'GENERAL',
          level: difficulty || 'B1'
        });
      }
      
      return { questions: fallbackQuestions };
    }
  }

  /**
   * Generate realistic MCQ options based on content and category
   */
  private static generateRealisticOptions(content: string, category: string = 'general', questionIndex: number = 0): string[] {
    // Extract key phrases and concepts from content
    const contentWords = content.split(/\s+/).filter(word => word.length > 3);
    const keyPhrases = contentWords.slice(0, 20); // Get first 20 meaningful words
    
    // Category-specific option templates
    const optionTemplates = {
      grammar: [
        () => `${keyPhrases[questionIndex % keyPhrases.length]} - règle de grammaire correcte`,
        () => `Usage incorrect de ${keyPhrases[(questionIndex + 1) % keyPhrases.length]}`,
        () => `Exception grammaticale pour ${keyPhrases[(questionIndex + 2) % keyPhrases.length]}`,
        () => `Conjugaison erronée de ${keyPhrases[(questionIndex + 3) % keyPhrases.length]}`
      ],
      vocabulary: [
        () => `Définition exacte de ${keyPhrases[questionIndex % keyPhrases.length]}`,
        () => `Synonyme de ${keyPhrases[(questionIndex + 1) % keyPhrases.length]}`,
        () => `Contexte d'usage de ${keyPhrases[(questionIndex + 2) % keyPhrases.length]}`,
        () => `Nuance sémantique de ${keyPhrases[(questionIndex + 3) % keyPhrases.length]}`
      ],
      reading: [
        () => `Idée principale: ${keyPhrases[questionIndex % keyPhrases.length]}`,
        () => `Détail secondaire: ${keyPhrases[(questionIndex + 1) % keyPhrases.length]}`,
        () => `Implication du texte sur ${keyPhrases[(questionIndex + 2) % keyPhrases.length]}`,
        () => `Conclusion erronée sur ${keyPhrases[(questionIndex + 3) % keyPhrases.length]}`
      ],
      listening: [
        () => `Information claire sur ${keyPhrases[questionIndex % keyPhrases.length]}`,
        () => `Détail mentionné: ${keyPhrases[(questionIndex + 1) % keyPhrases.length]}`,
        () => `Inference sur ${keyPhrases[(questionIndex + 2) % keyPhrases.length]}`,
        () => `Information non mentionnée: ${keyPhrases[(questionIndex + 3) % keyPhrases.length]}`
      ]
    };

    // Get templates for category or use general
    const templates = optionTemplates[category as keyof typeof optionTemplates] || [
      () => `Réponse basée sur ${keyPhrases[questionIndex % keyPhrases.length]}`,
      () => `Alternative avec ${keyPhrases[(questionIndex + 1) % keyPhrases.length]}`,
      () => `Explication de ${keyPhrases[(questionIndex + 2) % keyPhrases.length]}`,
      () => `Analyse de ${keyPhrases[(questionIndex + 3) % keyPhrases.length]}`
    ];

    // Generate 4 unique options
    const options = templates.map((template, index) => {
      try {
        return template();
      } catch {
        return `Option ${String.fromCharCode(65 + index)} basée sur le contenu`;
      }
    });

    return options;
  }

  // Generate AI chat response
  static async generateChatResponse(message: string, context: { lessonTitle: string, courseTitle: string, content: string }): Promise<{ response: string }> {
    const prompt = `
      Vous êtes un assistant IA spécialisé dans l'éducation du français.
      Vous aidez les étudiants à comprendre leur cours.
      
      Contexte du cours:
      - Titre du cours: ${context.courseTitle}
      - Titre de la leçon: ${context.lessonTitle}
      - Contenu: ${context.content}
      
      Question de l'étudiant: ${message}
      
      Répondez de manière pédagogique, claire et encourageante.
      Si la question n'est pas liée au cours, redirigez poliment vers le contenu du cours.
      Réponse en français.
    `

    const response = await geminiApiManager.generateContent(async (model) => {
      const result = await model.generateContent(prompt)
      const response = await result.response
      return response.text()
    })

    return { response }
  }

  // Generate transcription for video content
  static async generateTranscription(videoUrl: string, lessonTitle: string, courseTitle: string): Promise<{ transcription: string }> {
    const prompt = `
      Vous êtes un assistant IA spécialisé dans la transcription de cours de français.

      Contexte:
      - Titre du cours: ${courseTitle}
      - Titre de la leçon: ${lessonTitle}
      - URL de la vidéo: ${videoUrl}

      Générez une transcription réaliste et éducative pour cette leçon de français.
      La transcription doit être:
      - En français
      - Éducative et pédagogique
      - Adaptée au niveau du cours
      - Structurée avec des paragraphes
      - D'environ 200-300 mots

      Format de réponse: Transcription directe du contenu de la leçon.
    `

    try {
      const response = await geminiApiManager.generateContent(async (model) => {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      })

      return { transcription: response }
    } catch (error) {
      console.error('Error generating transcription:', error)
      // Return a fallback transcription
      return {
        transcription: `Transcription de la leçon "${lessonTitle}" du cours "${courseTitle}". Cette leçon couvre les concepts fondamentaux de la langue française et fournit des exemples pratiques pour améliorer votre compréhension. Le contenu est structuré pour faciliter l'apprentissage et la rétention des informations clés.`
      }
    }
  }

  // Extract sujets (topics) from text
  static async extractSujetsFromText(text: string): Promise<string[]> {
    const prompt = `
      Vous êtes un assistant IA spécialisé dans l'extraction de sujets de textes français.

      Analysez le texte suivant et extrayez les 5-8 sujets ou thèmes principaux:

      Texte:
      ${text.substring(0, 2000)}

      Répondez avec une liste de sujets, un par ligne, sans numérotation ni tirets.
      Les sujets doivent être:
      - Concis (2-5 mots)
      - Pertinents au contenu
      - En français
      - Uniques (pas de doublons)
    `

    try {
      const response = await geminiApiManager.generateContent(async (model) => {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      })

      // Parse the response into an array of sujets
      const sujets = response
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('-') && !line.match(/^\d+\./))
        .slice(0, 8) // Limit to 8 sujets

      return sujets.length > 0 ? sujets : [
        'Immigration et intégration',
        'Vie quotidienne et culture',
        'Travail et carrière',
        'Éducation et formation'
      ]
    } catch (error) {
      console.error('Error extracting sujets from text:', error)
      // Return default sujets
      return [
        'Immigration et intégration',
        'Vie quotidienne et culture',
        'Travail et carrière',
        'Éducation et formation',
        'Santé et bien-être',
        'Voyages et tourisme',
        'Technologie et innovation',
        'Environnement et développement durable'
      ]
    }
  }
}
