const { PrismaClient } = require('@prisma/client');
const geminiApiManager = require('../utils/geminiApiManager');
const { logger } = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Create prisma instance
const prisma = new PrismaClient();

// Active session tracking for immigration simulations (similar to voice simulation)
// Stores: askedQuestions, questionResponses, currentLevel, performanceScores
const activeImmigrationSessions = new Map();

class ImmigrationSimulationService {
  /**
   * Get active session for tracking questions and responses
   */
  static getActiveSession(sessionId) {
    return activeImmigrationSessions.get(sessionId);
  }
  /**
   * Available immigration scenarios
   */
  static getAvailableScenarios() {
    return {
      'canada': {
        name: 'Canada',
        types: {
          'skilled_worker': {
            name: 'Travailleur qualifié',
            description: 'Programme des travailleurs qualifiés du Québec',
            duration: 45,
            questions: 15
          },
          'student': {
            name: 'Étudiant international',
            description: 'Demande de permis d\'études',
            duration: 30,
            questions: 12
          },
          'family_reunification': {
            name: 'Réunification familiale',
            description: 'Parrainage de membre de famille',
            duration: 35,
            questions: 10
          }
        }
      },
      'france': {
        name: 'France',
        types: {
          'work_permit': {
            name: 'Permis de travail',
            description: 'Demande d\'autorisation de travail',
            duration: 40,
            questions: 14
          },
          'student': {
            name: 'Visa étudiant',
            description: 'Demande de visa long séjour étudiant',
            duration: 30,
            questions: 12
          },
          'family': {
            name: 'Regroupement familial',
            description: 'Procédure de regroupement familial',
            duration: 35,
            questions: 11
          }
        }
      },
      'belgium': {
        name: 'Belgique',
        types: {
          'work': {
            name: 'Permis de travail',
            description: 'Demande de permis de travail',
            duration: 35,
            questions: 13
          },
          'student': {
            name: 'Visa étudiant',
            description: 'Demande de visa étudiant',
            duration: 25,
            questions: 10
          }
        }
      }
    };
  }

  /**
   * Create immigration simulation session
   */
  static async createImmigrationSession(userId, sessionData) {
    try {
      const { country, immigrationType, level, personalInfo, voicePreference, bookingType, scheduledDate, questionsData } = sessionData;

      // STRICT LIMIT ENFORCEMENT: Check simulation limit before creating
      // Import simulation limit service - use path resolution that works with ts-node
      let limitCheck;
      try {
        // Use path.resolve to handle the space in directory name correctly
        const path = require('path');
        const fs = require('fs');
        
        // Try compiled version first (dist folder)
        const distPath = path.join(__dirname, '../dist/services/simulationLimitService.js');
        let checkSimulationLimit;
        
        if (fs.existsSync(distPath)) {
          const limitService = require(distPath);
          checkSimulationLimit = limitService.checkSimulationLimit;
          console.log('✅ Loaded simulationLimitService from dist');
        } else {
          // Fallback: use dynamic import with full path resolution
          const sourcePath = path.join(__dirname, 'simulationLimitService.ts');
          const limitService = await import(sourcePath);
          checkSimulationLimit = limitService.checkSimulationLimit || limitService.default?.checkSimulationLimit;
          console.log('✅ Loaded simulationLimitService from source');
        }
        
        if (checkSimulationLimit && typeof checkSimulationLimit === 'function') {
          limitCheck = await checkSimulationLimit(userId);
        } else {
          throw new Error('checkSimulationLimit function not found');
        }
      } catch (error) {
        console.error('❌ Failed to import/use simulationLimitService:', {
          error: error?.message,
          stack: error?.stack,
          code: error?.code
        });
        // Don't fail the booking - just skip limit check if service unavailable
        console.warn('⚠️ Continuing without limit check due to import error');
        // Set a default limit check that allows creation
        limitCheck = {
          canCreate: true,
          remaining: 999,
          maxSimulations: 999,
          subscriptionTier: 'FREE'
        };
      }
      
      // Check limit (only if we have a valid limitCheck)
      if (limitCheck && !limitCheck.canCreate) {
        throw new ValidationError(
          limitCheck.error || `Vous avez atteint votre limite de simulations (${limitCheck.maxSimulations}) pour cette période.`
        );
      }
      
      // Check if user has Pro subscription (immigration is Pro-only, except for free attempts)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });

      // Allow FREE tier users to book (they have limited attempts)
      // Only block if they've exceeded their limit
      if (!user) {
        throw new ValidationError('Utilisateur non trouvé');
      }

      // The limit check already handles FREE tier limits, so we only need to check if limit is exceeded
      // FREE tier users can book immigration simulations (with limits), not just PRO
      if (!limitCheck.canCreate) {
        throw new ValidationError(
          limitCheck.error || `Vous avez atteint votre limite de simulations (${limitCheck.maxSimulations}) pour cette période.`
        );
      }

      const scenarios = this.getAvailableScenarios();
      if (!scenarios[country] || !scenarios[country].types[immigrationType]) {
        throw new ValidationError('Invalid country or immigration type');
      }

      const scenario = scenarios[country].types[immigrationType];
      
      // Store questionsData for VAPI function calls (will fetch from question bank dynamically)
      // For now, generate basic questions structure
      const questions = await this.generateInterviewQuestions(country, immigrationType, level, personalInfo);

      // Determine scheduled date
      let scheduledDateTime = null;
      if (bookingType === 'MANUAL' && scheduledDate) {
        scheduledDateTime = new Date(scheduledDate);
      } else if (bookingType === 'AUTO') {
        // Auto-schedule for immediate start (next available slot)
        scheduledDateTime = new Date();
        scheduledDateTime.setMinutes(scheduledDateTime.getMinutes() + 5); // Start in 5 minutes
      }

      // Store voice preference details in questionsData (for VAPI to access)
      // Merge incoming questionsData with voiceId - ensure voiceId is always set
      const questionsDataStored = {
        voiceId: voicePreference || 'france_female_1', // This is the actual voice ID selected by user (e.g., 'france_male_1')
        country: country.toUpperCase(),
        topic: immigrationType,
        bookingType,
        ...(questionsData || {})
      };
      
      // Override voiceId if it was passed in questionsData (but prioritize voicePreference parameter)
      if (questionsData && questionsData.voiceId && !voicePreference) {
        questionsDataStored.voiceId = questionsData.voiceId;
      }

      // Store all booking metadata in personalInfo JSON since ImmigrationSimulation schema doesn't have these fields
      const personalInfoWithMetadata = {
        ...(personalInfo || {}),
        scheduledDate: scheduledDateTime ? scheduledDateTime.toISOString() : null,
        voicePreference: voicePreference || questionsDataStored.voiceId || 'france_female_1', // Store the voice ID for easy access
        bookingType: bookingType || 'AUTO',
        questionsData: questionsDataStored // Store full questionsData object with voiceId for VAPI
      };
      
      console.log('💾 Storing voice preference in immigration simulation:', {
        voicePreference,
        questionsDataStored,
        personalInfoWithMetadata: {
          scheduledDate: personalInfoWithMetadata.scheduledDate,
          voicePreference: personalInfoWithMetadata.voicePreference,
          bookingType: personalInfoWithMetadata.bookingType,
          questionsData: personalInfoWithMetadata.questionsData
        }
      });

      // Create session in database - store scheduledDate in both field and personalInfo JSON
      const session = await prisma.immigrationSimulation.create({
        data: {
          userId,
          country: country.toUpperCase(),
          immigrationType,
          level: level || 'B1',
          status: bookingType === 'AUTO' ? 'SCHEDULED' : 'SCHEDULED', // Use SCHEDULED for both
          scheduledDate: scheduledDateTime, // Store in dedicated field
          personalInfo: JSON.stringify(personalInfoWithMetadata),
          questions: JSON.stringify(questions),
          responses: JSON.stringify({}),
          currentQuestionIndex: 0,
          duration: 300, // 5 minutes
          questionsData: questionsDataStored, // Store questionsData in dedicated field
          createdAt: new Date()
        }
      });

      // Get user data for confirmation email (expand the earlier user query)
      const userForEmail = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          subscriptionTier: true
        }
      });

      // Send confirmation email if MANUAL booking
      if (userForEmail && bookingType === 'MANUAL' && scheduledDateTime) {
        try {
          // Extract metadata from personalInfo for email
          const personalInfoParsed = typeof session.personalInfo === 'string' 
            ? JSON.parse(session.personalInfo) 
            : session.personalInfo;
          
          await this.sendBookingConfirmation({ 
            ...session, 
            user: userForEmail, 
            country, 
            immigrationType,
            scheduledDate: scheduledDateTime,
            voicePreference: personalInfoParsed.voicePreference || voicePreference || 'france_female_1',
            questionsData: personalInfoParsed.questionsData || questionsDataStored
          });
          console.log('✅ Immigration booking confirmation email sent successfully');
        } catch (emailError) {
          console.error('❌ Error sending booking confirmation email:', {
            error: emailError?.message,
            sessionId: session.id,
            userEmail: userForEmail.email
          });
          // Don't fail the booking if email fails - just log the error
        }
      }

      logger.info('Immigration simulation session created', {
        sessionId: session.id,
        userId,
        country,
        immigrationType,
        questionCount: questions.length
      });

      return {
        id: session.id,
        country,
        immigrationType,
        scenario: scenario.name,
        description: scenario.description,
        status: 'SCHEDULED', // Always SCHEDULED (will be marked EXPIRED by cron if past)
        duration: 300,
        totalQuestions: questions.length,
        welcomeMessage: this.generateWelcomeMessage(country, immigrationType, level),
        scheduledDate: scheduledDateTime
      };
    } catch (error) {
      logger.error('Failed to create immigration session', { userId, sessionData, error });
      throw error;
    }
  }

  /**
   * Generate interview questions using Gemini AI
   */
  static async generateInterviewQuestions(country, immigrationType, level, personalInfo) {
    try {
      const response = await geminiApiManager.makeRequest(async (model) => {
        const prompt = `
        Génère des questions d'entretien d'immigration pour:
        - Pays: ${country}
        - Type: ${immigrationType}
        - Niveau français: ${level}
        - Informations personnelles: ${JSON.stringify(personalInfo || {})}

        Crée 12-15 questions progressives d'entretien d'immigration réalistes.
        Les questions doivent être posées par un agent d'immigration.

        Format JSON:
        {
          "questions": [
            {
              "id": "q1",
              "category": "personal_info",
              "question": "Bonjour, pouvez-vous vous présenter et me dire votre nom complet?",
              "expectedElements": ["nom", "prénom", "politesse"],
              "difficulty": "easy",
              "points": 5,
              "followUpQuestions": ["Quelle est votre date de naissance?"]
            },
            {
              "id": "q2", 
              "category": "motivation",
              "question": "Pourquoi souhaitez-vous immigrer au ${country}?",
              "expectedElements": ["motivation claire", "projets", "connaissance du pays"],
              "difficulty": "medium",
              "points": 10,
              "followUpQuestions": ["Avez-vous déjà visité le ${country}?"]
            }
          ]
        }

        Catégories de questions:
        - personal_info: Informations personnelles
        - motivation: Motivations et projets
        - professional: Expérience professionnelle
        - language: Compétences linguistiques
        - integration: Intégration et adaptation
        - legal: Aspects légaux et administratifs

        Difficulté progressive: easy → medium → hard
        Questions authentiques d'entretien d'immigration.
        Adapte le vocabulaire au niveau ${level}.

        Réponds UNIQUEMENT avec le JSON valide.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

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

      return response || this.getDefaultQuestions(country, immigrationType);
    } catch (error) {
      logger.error('Failed to generate immigration questions', { country, immigrationType, error });
      return this.getDefaultQuestions(country, immigrationType);
    }
  }

  /**
   * Start immigration interview session
   */
  static async startSession(sessionId, userId) {
    try {
      // Use transaction to prevent race conditions when multiple users click simultaneously
      const result = await prisma.$transaction(async (tx) => {
        // Lock the simulation row and check status atomically
        const session = await tx.immigrationSimulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!session) {
        throw new NotFoundError('Immigration session not found');
      }

        // Check status atomically - prevents race conditions
        if (session.status !== 'SCHEDULED') {
          throw new ValidationError(`Simulation is not in scheduled status. Current status: ${session.status}`);
        }

        // Immediately update status to ACTIVE to prevent duplicate starts
        // This acts as a distributed lock for concurrent requests
        const updatedSimulation = await tx.immigrationSimulation.update({
          where: { 
            id: sessionId,
            status: 'SCHEDULED' // Only update if still SCHEDULED (optimistic locking)
          },
          data: {
            status: 'ACTIVE' // Lock the simulation
          }
        });

        if (!updatedSimulation) {
          throw new ValidationError('Simulation was already started by another request');
        }

        return { simulation: updatedSimulation };
      }, {
        timeout: 10000, // 10 second timeout for transaction
        isolationLevel: 'Serializable' // Highest isolation level to prevent race conditions
      });

      const session = result.simulation;

      // Get VAPI service
      const { default: vapiService } = await import('./vapiService');
      
      // Get voice ID from personalInfo.questionsData (where it's stored)
      let voiceId = null;
      
      // First try to extract from personalInfo JSON
      if (session.personalInfo) {
        try {
          const personalInfoParsed = typeof session.personalInfo === 'string' 
            ? JSON.parse(session.personalInfo) 
            : session.personalInfo;
          
          if (personalInfoParsed.questionsData) {
            const questionsData = typeof personalInfoParsed.questionsData === 'string' 
              ? JSON.parse(personalInfoParsed.questionsData) 
              : personalInfoParsed.questionsData;
            voiceId = questionsData.voiceId;
          }
          
          // Also check voicePreference in personalInfo
          if (!voiceId && personalInfoParsed.voicePreference) {
            voiceId = personalInfoParsed.voicePreference;
          }
        } catch (e) {
          console.warn('Failed to parse personalInfo for voiceId in startSession:', e);
        }
      }
      
      // Fallback: try old questionsData field (for backward compatibility)
      if (!voiceId && session.questionsData) {
        try {
          const questionsData = typeof session.questionsData === 'string' 
            ? JSON.parse(session.questionsData) 
            : session.questionsData;
          voiceId = questionsData.voiceId;
        } catch (e) {
          console.warn('Failed to parse questionsData:', e);
        }
      }
      
      // Final fallback to default
      if (!voiceId) {
        voiceId = 'france_female_1'; // Default voice
        console.warn('⚠️ No voiceId found, using default:', voiceId);
      }
      
      console.log('🎤 Using voice for immigration simulation:', {
        voiceId,
        sessionId,
        hasPersonalInfo: !!session.personalInfo
      });

      // Get questions from question bank (will be fetched dynamically via function calls)
      const questions = JSON.parse(session.questions || '[]');
      
      // Create VAPI assistant for immigration
      // Wrap in try-catch to handle VAPI rate limits gracefully
      let assistant;
      let call;
      try {
        assistant = await vapiService.createImmigrationAssistant(
        voiceId,
        session.country.toLowerCase(),
        session.immigrationType,
        questions,
        'fr'
      );

        // Start VAPI call with retry logic for rate limits
        call = await vapiService.startVoiceSimulation(sessionId, assistant.id);
      } catch (vapiError) {
        // If VAPI fails, revert simulation status to SCHEDULED
        await prisma.immigrationSimulation.update({
          where: { id: sessionId },
          data: { status: 'SCHEDULED' }
        });
        
        // Re-throw with more context
        throw new Error(
          `Failed to start VAPI call: ${vapiError.message || 'Unknown error'}. ` +
          `This may be due to rate limiting. Please try again in a moment.`
        );
      }

      // Create active session for tracking (similar to voice simulation)
      const activeSession = {
        simulationId: sessionId,
        userId: userId,
        assistantId: assistant.id,
        callId: call.id,
        country: session.country,
        immigrationType: session.immigrationType,
        askedQuestions: new Map(), // Track questions asked: questionId -> question data
        questionResponses: new Map(), // Track responses: questionId -> {question, response, analysis}
        currentLevel: session.level || 'B1', // Start with simulation level
        questionCount: 0,
        performanceScores: {
          relevance: [],
          completeness: [],
          clarity: [],
          language: [],
          credibility: []
        },
        startTime: new Date()
      };
      
      // Store active session for function calls
      activeImmigrationSessions.set(sessionId, activeSession);

      // Update session with VAPI info (status already ACTIVE from transaction)
      const updatedSession = await prisma.immigrationSimulation.update({
        where: { id: sessionId },
        data: {
          startedAt: new Date(),
          vapiSessionId: call.id,
          vapiAssistantId: assistant.id
          // Status is already ACTIVE from the transaction above
        }
      });

      logger.info('Immigration interview started with VAPI', { 
        sessionId, 
        userId,
        assistantId: assistant.id,
        callId: call.id,
        country: session.country,
        immigrationType: session.immigrationType,
        startingLevel: activeSession.currentLevel
      });

      return {
        id: updatedSession.id,
        status: 'ACTIVE',
        assistant: assistant,
        call: call,
        vapiSessionId: call.id,
        vapiAssistantId: assistant.id,
        currentQuestionIndex: 0,
        totalQuestions: questions.length,
        timeRemaining: session.duration // Already in seconds
      };
    } catch (error) {
      logger.error('Failed to start immigration session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Process user response and generate AI follow-up
   */
  static async processResponse(sessionId, userId, responseData) {
    try {
      const { questionId, response, timeSpent } = responseData;

      const session = await prisma.immigrationSimulation.findFirst({
        where: { id: sessionId, userId, status: 'IN_PROGRESS' }
      });

      if (!session) {
        throw new NotFoundError('Active immigration session not found');
      }

      const questions = JSON.parse(session.questions);
      const responses = JSON.parse(session.responses);
      
      const currentQuestion = questions.find(q => q.id === questionId);
      if (!currentQuestion) {
        throw new NotFoundError('Question not found');
      }

      // Analyze response using Gemini AI
      const analysis = await this.analyzeResponse(currentQuestion, response, session.level);

      // Store response
      responses[questionId] = {
        response,
        timeSpent,
        submittedAt: new Date(),
        analysis
      };

      // Determine next question or follow-up
      const nextAction = await this.determineNextAction(
        currentQuestion, 
        response, 
        analysis, 
        questions, 
        session.currentQuestionIndex
      );

      // Update session
      await prisma.immigrationSimulation.update({
        where: { id: sessionId },
        data: {
          responses: JSON.stringify(responses),
          currentQuestionIndex: nextAction.nextIndex,
          timeRemaining: Math.max(0, session.timeRemaining - timeSpent)
        }
      });

      logger.info('Immigration response processed', {
        sessionId,
        userId,
        questionId,
        score: analysis.score
      });

      return {
        analysis,
        feedback: nextAction.feedback,
        nextQuestion: nextAction.nextQuestion,
        isFollowUp: nextAction.isFollowUp,
        progress: {
          current: nextAction.nextIndex,
          total: questions.length,
          percentage: Math.round((nextAction.nextIndex / questions.length) * 100)
        }
      };
    } catch (error) {
      logger.error('Failed to process immigration response', { sessionId, userId, responseData, error });
      throw error;
    }
  }

  /**
   * Analyze user response using Gemini AI
   * This MUST use AI - never returns mock data unless AI completely fails
   */
  static async analyzeResponse(question, userResponse, level) {
    let attemptCount = 0;
    const maxAttempts = 3;
    
    while (attemptCount < maxAttempts) {
      try {
        attemptCount++;
        logger.info(`🤖 AI Analysis attempt ${attemptCount}/${maxAttempts}`, {
          questionId: question?.id,
          level,
          responseLength: userResponse?.length
        });

        const response = await geminiApiManager.makeRequest(async (model) => {
          const prompt = `
        Tu es un agent d'immigration expérimenté chargé d'évaluer les réponses d'un candidat lors d'un entretien d'immigration.

        QUESTION POSÉE: "${question.question}"
        ÉLÉMENTS ATTENDUS DANS LA RÉPONSE: ${JSON.stringify(question.expectedElements || [])}
        RÉPONSE DU CANDIDAT: "${userResponse}"
        NIVEAU DE FRANÇAIS ATTENDU: ${level}

        ÉVALUATION REQUISE:
        Tu dois évaluer cette réponse selon CINQ critères précis (score de 0 à 100 pour chaque):

        1. PERTINENCE (relevance):
           - La réponse répond-elle directement à la question posée?
           - Les informations sont-elles pertinentes au contexte d'immigration?
           - Score: 0-100 avec commentaire détaillé

        2. COMPLÉTUDE (completeness):
           - Tous les éléments attendus sont-ils présents?
           - Des informations importantes manquent-elles?
           - Score: 0-100 avec commentaire détaillé

        3. CLARTÉ ET COHÉRENCE (clarity):
           - La réponse est-elle claire et bien structurée?
           - Les idées sont-elles logiquement organisées?
           - Score: 0-100 avec commentaire détaillé

        4. NIVEAU DE FRANÇAIS (language):
           - Grammaire et conjugaison correctes
           - Vocabulaire approprié au niveau ${level}
           - Expression naturelle et fluide
           - Score: 0-100 avec commentaire détaillé

        5. CRÉDIBILITÉ (credibility):
           - Les informations semblent-elles crédibles et cohérentes?
           - Le projet d'immigration est-il réaliste?
           - Score: 0-100 avec commentaire détaillé

        FORMAT JSON OBLIGATOIRE (pas de texte avant ou après):
        {
          "score": 85,
          "maxScore": 100,
          "criteria": {
            "relevance": {"score": 90, "comment": "Répond bien à la question avec des informations pertinentes"},
            "completeness": {"score": 80, "comment": "Manque quelques détails importants"},
            "clarity": {"score": 85, "comment": "Expression claire et bien structurée"},
            "language": {"score": 80, "comment": "Bon niveau de français pour le niveau ${level}"},
            "credibility": {"score": 90, "comment": "Réponse crédible et cohérente"}
          },
          "strengths": ["Réponse structurée", "Motivation claire", "Bon niveau de français"],
          "improvements": ["Ajouter plus de détails", "Préciser les dates", "Enrichir le vocabulaire"],
          "followUpNeeded": true,
          "suggestedFollowUp": "Pouvez-vous me donner plus de détails sur votre projet professionnel au ${question.country || 'pays de destination'}?"
        }

        IMPORTANT:
        - Sois professionnel mais bienveillant dans l'évaluation
        - Adapte tes critères au niveau ${level}
        - Les scores doivent refléter VRAIMENT la qualité de la réponse (pas de scores fictifs)
        - Réponds UNIQUEMENT avec le JSON valide, rien d'autre
        `;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();

          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            logger.error('❌ No JSON found in Gemini response', { 
              text: text.substring(0, 200),
              attempt: attemptCount 
            });
            throw new Error('No JSON found in Gemini response');
          }

          const parsedResponse = JSON.parse(jsonMatch[0]);
          
          // Validate the response structure
          if (!parsedResponse.score || !parsedResponse.criteria) {
            logger.error('❌ Invalid AI response structure', { parsedResponse, attempt: attemptCount });
            throw new Error('Invalid AI response structure');
          }

          logger.info(`✅ AI Analysis successful (attempt ${attemptCount})`, {
            score: parsedResponse.score,
            criteriaCount: Object.keys(parsedResponse.criteria).length
          });

          return parsedResponse;
        });

        // Verify we got a valid response
        if (!response || !response.score) {
          throw new Error('Invalid AI response: missing score');
        }

        // Success - return AI analysis
        return response;

      } catch (error) {
        logger.error(`❌ AI Analysis failed (attempt ${attemptCount}/${maxAttempts})`, {
          error: error.message,
          questionId: question?.id,
          level,
          stack: error.stack
        });

        // If this is the last attempt, we must throw or return a clear error
        if (attemptCount >= maxAttempts) {
          logger.error('🚨 AI Analysis completely failed after all attempts', {
            question: question?.question,
            userResponse: userResponse?.substring(0, 100),
            level
          });
          
          // Return default only as absolute last resort - but log a warning
          // In production, you might want to throw an error instead
          logger.warn('⚠️ Using fallback analysis - AI analysis failed completely');
          return this.getDefaultAnalysis();
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attemptCount));
      }
    }

    // Should never reach here, but just in case
    logger.error('🚨 AI Analysis failed - using fallback');
    return this.getDefaultAnalysis();
  }

  /**
   * Determine next action (follow-up or next question)
   */
  static async determineNextAction(currentQuestion, userResponse, analysis, questions, currentIndex) {
    // If follow-up is needed and suggested
    if (analysis.followUpNeeded && analysis.suggestedFollowUp) {
      return {
        nextIndex: currentIndex, // Stay on same question
        isFollowUp: true,
        nextQuestion: {
          id: `${currentQuestion.id}_followup`,
          question: analysis.suggestedFollowUp,
          category: currentQuestion.category,
          isFollowUp: true
        },
        feedback: `Score: ${analysis.score}/${analysis.maxScore}. ${analysis.improvements.join(' ')}`
      };
    }

    // Move to next question
    const nextIndex = currentIndex + 1;
    const nextQuestion = nextIndex < questions.length ? questions[nextIndex] : null;

    return {
      nextIndex,
      isFollowUp: false,
      nextQuestion,
      feedback: `Score: ${analysis.score}/${analysis.maxScore}. ${analysis.strengths.join(' ')}`
    };
  }

  /**
   * Complete immigration interview and generate final report
   */
  static async completeSession(sessionId, userId) {
    try {
      const session = await prisma.immigrationSimulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!session) {
        throw new NotFoundError('Immigration session not found');
      }

      const questions = JSON.parse(session.questions);
      const responses = JSON.parse(session.responses);

      // Calculate final results
      const results = this.calculateFinalResults(questions, responses);

      // Generate immigration report
      const report = await this.generateImmigrationReport(session, results);

      // Update session
      // Store completedAt timestamp for access control (tokens expire 2 minutes after this)
      const endedAt = new Date();
      await prisma.immigrationSimulation.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: endedAt, // Store actual end time for access control
          finalScore: results.totalScore || null,
          finalReport: JSON.stringify(report) || null
        }
      });

      // Clean up active session tracking
      const activeSession = activeImmigrationSessions.get(sessionId);
      if (activeSession) {
        activeImmigrationSessions.delete(sessionId);
        logger.info('✅ Active immigration session cleaned up', {
          sessionId,
          questionsAsked: activeSession.questionCount,
          totalQuestions: activeSession.askedQuestions?.size || 0,
          finalLevel: activeSession.currentLevel
        });
      }

      logger.info('Immigration simulation completed', {
        sessionId,
        userId,
        finalScore: results.totalScore,
        recommendation: report.recommendation,
        questionsAsked: activeSession?.questionCount || Object.keys(responses).length,
        finalLevel: activeSession?.currentLevel || session.level
      });

      return {
        ...results,
        report,
        sessionSummary: {
          duration: Math.round((new Date() - new Date(session.startedAt)) / 1000 / 60),
          questionsAnswered: Object.keys(responses).length,
          country: session.country,
          immigrationType: session.immigrationType
        }
      };
    } catch (error) {
      logger.error('Failed to complete immigration session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's immigration simulation history
   */
  static async getUserSimulations(userId) {
    try {
      console.log('📋 getUserSimulations: Fetching immigration simulations for user:', userId);
      
      // Fetch simulations ordered by createdAt
      const simulations = await prisma.immigrationSimulation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      // Extract scheduledDate from personalInfo JSON and sort accordingly
      const simulationsWithDates = simulations.map((sim) => {
        let personalInfoParsed = {};
        let scheduledDate = null;
        
        try {
          personalInfoParsed = typeof sim.personalInfo === 'string' 
            ? JSON.parse(sim.personalInfo) 
            : (sim.personalInfo || {});
          
          if (personalInfoParsed.scheduledDate) {
            scheduledDate = new Date(personalInfoParsed.scheduledDate);
          }
        } catch (e) {
          console.warn('Failed to parse personalInfo for simulation:', sim.id, e);
        }
        
        return {
          ...sim,
          scheduledDate,
          personalInfoParsed
        };
      });

      // Sort by scheduledDate first (if available), then by createdAt
      simulationsWithDates.sort((a, b) => {
        if (a.scheduledDate && b.scheduledDate) {
          return b.scheduledDate.getTime() - a.scheduledDate.getTime();
        }
        if (a.scheduledDate) return -1;
        if (b.scheduledDate) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      console.log('📋 getUserSimulations: Found immigration simulations:', {
        count: simulationsWithDates.length,
        simulations: simulationsWithDates.map((s) => ({
          id: s.id,
          country: s.country,
          immigrationType: s.immigrationType,
          status: s.status,
          scheduledDate: s.scheduledDate,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
          finalScore: s.finalScore
        }))
      });

      // Transform simulations to match frontend expectations with dynamic status correction
      const now = new Date();
      return simulationsWithDates.map((sim) => {
        // Dynamic status correction: SCHEDULED + past scheduledDate → EXPIRED
        // EXPIRED + future scheduledDate → SCHEDULED
        let displayStatus = sim.status;
        const scheduledDate = sim.scheduledDate ? new Date(sim.scheduledDate) : null;
        
        if (scheduledDate) {
          if (sim.status === 'SCHEDULED' && scheduledDate < now) {
            displayStatus = 'EXPIRED';
          } else if (sim.status === 'EXPIRED' && scheduledDate >= now) {
            displayStatus = 'SCHEDULED';
          }
        }
        
        return {
        id: sim.id,
        country: sim.country,
        category: sim.immigrationType,
          status: displayStatus,
          originalStatus: sim.status, // Keep original for reference
        score: sim.finalScore,
        duration: sim.duration || 300, // Default 5 minutes in seconds
        createdAt: sim.createdAt,
        scheduledDate: sim.scheduledDate ? sim.scheduledDate.toISOString() : null,
        completedAt: sim.completedAt
        };
      });
    } catch (error) {
      logger.error('Failed to get user immigration simulations', { userId, error });
      throw error;
    }
  }

  /**
   * Get immigration session details
   */
  static async getSession(sessionId, userId) {
    try {
      const session = await prisma.immigrationSimulation.findFirst({
        where: { id: sessionId, userId }
      });

      if (!session) {
        throw new NotFoundError('Immigration session not found');
      }

      // Extract scheduledDate and other metadata from personalInfo JSON
      let personalInfoParsed = {};
      let scheduledDate = null;
      let voicePreference = null;
      let bookingType = null;
      let questionsData = null;
      
      try {
        personalInfoParsed = typeof session.personalInfo === 'string' 
          ? JSON.parse(session.personalInfo) 
          : (session.personalInfo || {});
        
        scheduledDate = personalInfoParsed.scheduledDate ? new Date(personalInfoParsed.scheduledDate) : null;
        voicePreference = personalInfoParsed.voicePreference || null;
        bookingType = personalInfoParsed.bookingType || null;
        questionsData = personalInfoParsed.questionsData || null;
      } catch (e) {
        console.warn('Failed to parse personalInfo for getSession:', e);
      }

      // Return session with extracted metadata
      return {
        ...session,
        scheduledDate,
        voicePreference,
        bookingType,
        questionsData,
        personalInfoParsed
      };
    } catch (error) {
      logger.error('Failed to get immigration session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Helper methods
   */
  static calculateFinalResults(questions, responses) {
    let totalScore = 0;
    let maxScore = 0;
    const categoryResults = {};

    questions.forEach(question => {
      maxScore += question.points;
      
      if (!categoryResults[question.category]) {
        categoryResults[question.category] = {
          score: 0,
          maxScore: 0,
          questions: 0
        };
      }

      categoryResults[question.category].maxScore += question.points;
      categoryResults[question.category].questions += 1;

      const response = responses[question.id];
      if (response && response.analysis) {
        const score = (response.analysis.score / 100) * question.points;
        totalScore += score;
        categoryResults[question.category].score += score;
      }
    });

    const percentage = Math.round((totalScore / maxScore) * 100);

    return {
      totalScore: Math.round(totalScore),
      maxScore,
      percentage,
      categoryResults,
      recommendation: this.getRecommendation(percentage)
    };
  }

  static getRecommendation(percentage) {
    if (percentage >= 85) return 'EXCELLENT';
    if (percentage >= 70) return 'GOOD';
    if (percentage >= 55) return 'SATISFACTORY';
    return 'NEEDS_IMPROVEMENT';
  }

  static async generateImmigrationReport(session, results) {
    // This would generate a detailed immigration report
    // For now, return a structured report
    return {
      recommendation: results.recommendation,
      strengths: ['Communication claire', 'Motivation évidente'],
      improvements: ['Améliorer les détails techniques', 'Préparer plus de documents'],
      nextSteps: ['Préparer les documents requis', 'Améliorer le niveau de français'],
      likelihood: results.percentage >= 70 ? 'HIGH' : results.percentage >= 55 ? 'MEDIUM' : 'LOW'
    };
  }

  static generateWelcomeMessage(country, immigrationType, level) {
    const messages = {
      'canada': {
        'skilled_worker': 'Bonjour et bienvenue à cet entretien pour le Programme des travailleurs qualifiés du Québec. Je vais vous poser quelques questions sur votre profil et vos motivations.',
        'student': 'Bonjour, nous allons procéder à l\'entretien pour votre demande de permis d\'études au Canada.',
        'family_reunification': 'Bonjour, cet entretien concerne votre demande de parrainage familial.'
      },
      'france': {
        'work_permit': 'Bonjour, nous allons examiner votre demande d\'autorisation de travail en France.',
        'student': 'Bonjour, cet entretien concerne votre demande de visa étudiant pour la France.',
        'family': 'Bonjour, nous allons discuter de votre demande de regroupement familial.'
      }
    };

    return messages[country]?.[immigrationType] || 'Bonjour et bienvenue à cet entretien d\'immigration.';
  }

  static getDefaultQuestions(country, immigrationType) {
    return [
      {
        id: 'default_q1',
        category: 'personal_info',
        question: 'Bonjour, pouvez-vous vous présenter et me dire votre nom complet?',
        expectedElements: ['nom', 'prénom', 'politesse'],
        difficulty: 'easy',
        points: 5
      },
      {
        id: 'default_q2',
        category: 'motivation',
        question: `Pourquoi souhaitez-vous immigrer au ${country}?`,
        expectedElements: ['motivation', 'projets', 'connaissance du pays'],
        difficulty: 'medium',
        points: 10
      }
    ];
  }

  /**
   * FALLBACK ONLY: Default analysis when AI completely fails
   * This should rarely be used - AI should always evaluate
   * TODO: Consider throwing an error instead of returning mock data
   */
  static getDefaultAnalysis() {
    logger.warn('⚠️ WARNING: Using fallback analysis - AI evaluation failed');
    return {
      score: 0, // Set to 0 to indicate AI failure
      maxScore: 100,
      criteria: {
        relevance: { score: 0, comment: '⚠️ Évaluation AI non disponible - veuillez réessayer' },
        completeness: { score: 0, comment: '⚠️ Évaluation AI non disponible - veuillez réessayer' },
        clarity: { score: 0, comment: '⚠️ Évaluation AI non disponible - veuillez réessayer' },
        language: { score: 0, comment: '⚠️ Évaluation AI non disponible - veuillez réessayer' },
        credibility: { score: 0, comment: '⚠️ Évaluation AI non disponible - veuillez réessayer' }
      },
      strengths: [],
      improvements: ['⚠️ L\'évaluation AI n\'a pas pu être effectuée. Veuillez réessayer.'],
      followUpNeeded: false,
      aiFailed: true // Flag to indicate this is fallback data
    };
  }

  /**
   * Get monthly immigration simulation count for user
   */
  static async getMonthlySimulationCount(userId) {
    try {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      // Count COMPLETED simulations for the current month
      // Removed aiFeedbacks check as it may not always be populated
      return await prisma.immigrationSimulation.count({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: currentMonth
          }
        }
      });
    } catch (error) {
      console.error('Error getting monthly simulation count:', error);
      throw error;
    }
  }


  /**
   * Cancel an immigration simulation
   */
  static async cancelSimulation(simulationId, userId, language = 'fr') {
    try {
      console.log('🗑️ cancelImmigrationSimulation called:', {
        simulationId,
        userId,
        simulationIdType: typeof simulationId,
        userIdType: typeof userId
      });

      // Clean IDs (remove whitespace if any)
      const cleanSimulationId = simulationId?.trim();
      const cleanUserId = userId?.trim();

      // Find the simulation - try with cleaned IDs
      let simulation = await prisma.immigrationSimulation.findFirst({
        where: { 
          id: cleanSimulationId, 
          userId: cleanUserId 
        }
      });

      // If not found, try original IDs
      if (!simulation) {
        simulation = await prisma.immigrationSimulation.findFirst({
          where: { id: simulationId, userId }
        });
      }

      if (!simulation) {
        console.error('❌ Immigration simulation not found for cancel:', {
          simulationId: cleanSimulationId,
          userId: cleanUserId,
          triedOriginal: true
        });
        throw new NotFoundError(
          language === 'fr' 
            ? 'Simulation d\'immigration introuvable' 
            : 'Immigration simulation not found'
        );
      }

      // Update simulation status to CANCELLED
      const cancelledSimulation = await prisma.immigrationSimulation.update({
        where: { id: simulation.id },
        data: { status: 'CANCELLED' }
      });

      logger.info('Immigration simulation cancelled', {
        simulationId: simulation.id,
        userId
      });

      return cancelledSimulation;
    } catch (error) {
      logger.error('Failed to cancel immigration simulation', { simulationId, userId, error });
      throw error;
    }
  }

  /**
   * Reschedule an immigration simulation
   */
  static async rescheduleSimulation(simulationId, userId, newDate, voicePreference, language = 'fr') {
    try {
      console.log('📅 rescheduleImmigrationSimulation called:', {
        simulationId,
        userId,
        newDate: newDate.toISOString(),
        voicePreference
      });

      // Clean IDs
      const cleanSimulationId = simulationId?.trim();
      const cleanUserId = userId?.trim();

      // Find the simulation
      let simulation = await prisma.immigrationSimulation.findFirst({
        where: { 
          id: cleanSimulationId, 
          userId: cleanUserId 
        }
      });

      if (!simulation) {
        simulation = await prisma.immigrationSimulation.findFirst({
          where: { id: simulationId, userId }
        });
      }

      if (!simulation) {
        console.error('❌ Immigration simulation not found for reschedule:', {
          simulationId: cleanSimulationId,
          userId: cleanUserId
        });
        throw new NotFoundError(
          language === 'fr' 
            ? 'Simulation d\'immigration introuvable' 
            : 'Immigration simulation not found'
        );
      }

      // Allow rescheduling for SCHEDULED, ACTIVE, and EXPIRED sessions
      // Only block COMPLETED and CANCELLED
      if (simulation.status === 'COMPLETED' || simulation.status === 'CANCELLED') {
        throw new ValidationError(
          language === 'fr'
            ? 'Cette simulation ne peut pas être reprogrammée'
            : 'This simulation cannot be rescheduled'
        );
      }

      // Update simulation - if it was EXPIRED, change status to SCHEDULED
      const updateData = {
        scheduledDate: newDate,
        updatedAt: new Date()
      };

      // If simulation was EXPIRED, change status to SCHEDULED
      if (simulation.status === 'EXPIRED') {
        updateData.status = 'SCHEDULED';
      }

      // Update simulation with new scheduledDate
      const rescheduledSimulation = await prisma.immigrationSimulation.update({
        where: { id: simulation.id },
        data: updateData
      });

      // Send rescheduling confirmation email
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true, email: true }
        });

        if (user) {
          // Use email service for rescheduling confirmation
          const { EmailService } = await import('./emailService');
          
          // Generate temporary token for access link
          const { default: TemporaryTokenService } = await import('./temporaryTokenService');
          const token = await TemporaryTokenService.generateToken(
            userId,
            rescheduledSimulation.id,
            'immigration',
            new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
          );
          
          const simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/immigration-simulations/${rescheduledSimulation.id}?token=${token}`;
          
          const emailData = {
            to: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            country: rescheduledSimulation.country,
            immigrationType: rescheduledSimulation.immigrationType,
            scheduledDate: newDate,
            duration: `${Math.floor((rescheduledSimulation.duration || 300) / 60)} minutes`,
            simulationId: rescheduledSimulation.id,
            accessUrl: simulationUrl
          };

          await EmailService.sendImmigrationSimulationReschedulingEmail(emailData);
          console.log('✅ Rescheduling confirmation email sent');
        }
      } catch (emailError) {
        console.error('❌ Error sending rescheduling email:', emailError);
        // Don't fail reschedule if email fails
      }

      logger.info('Immigration simulation rescheduled', {
        simulationId: simulation.id,
        userId,
        newDate: newDate.toISOString()
      });

      return rescheduledSimulation;
    } catch (error) {
      logger.error('Failed to reschedule immigration simulation', { simulationId, userId, error });
      throw error;
    }
  }

  /**
   * Send booking confirmation email with secure access link
   */
  static async sendBookingConfirmation(session) {
    try {
      console.log('📧 Preparing to send immigration booking confirmation email...', {
        sessionId: session.id,
        userEmail: session.user?.email
      });

      // Generate temporary token for secure access
      // Token expires 2 minutes after simulation ends (when student/AI hangs up)
      const { default: TemporaryTokenService } = await import('./temporaryTokenService');
      
      // Extract scheduledDate from session (stored in personalInfo JSON or passed directly)
      let scheduledDate = null;
      if (session.scheduledDate) {
        // If scheduledDate is passed directly in session object
        scheduledDate = new Date(session.scheduledDate);
      } else if (session.personalInfo) {
        // Extract from personalInfo JSON
        try {
          const personalInfoParsed = typeof session.personalInfo === 'string' 
            ? JSON.parse(session.personalInfo) 
            : session.personalInfo;
          if (personalInfoParsed && personalInfoParsed.scheduledDate) {
            scheduledDate = new Date(personalInfoParsed.scheduledDate);
          }
        } catch (e) {
          console.warn('Failed to parse personalInfo for scheduledDate:', e);
        }
      }
      
      if (!scheduledDate) {
        console.warn('⚠️ No scheduledDate found for booking confirmation email:', {
          sessionId: session.id,
          hasScheduledDate: !!session.scheduledDate,
          hasPersonalInfo: !!session.personalInfo
        });
        // For AUTO bookings, use createdAt + 5 minutes as fallback
        scheduledDate = session.createdAt ? new Date(new Date(session.createdAt).getTime() + 5 * 60 * 1000) : new Date();
      }
      
      // Calculate estimated simulation end time (scheduledDate + duration)
      const durationInSeconds = session.duration || 300; // 5 minutes default
      const estimatedEndTime = new Date(scheduledDate.getTime() + durationInSeconds * 1000);
      
      // Token should be valid until 2 minutes after simulation ends
      // We'll use a longer expiration window and validate at access time based on actual end time
      const now = new Date();
      const hoursUntilEstimatedEnd = Math.max(1, (estimatedEndTime.getTime() - now.getTime()) / (1000 * 60 * 60) + (2 / 60)); // Add 2 minutes buffer
      
      const temporaryToken = await TemporaryTokenService.generateToken(
        session.userId,
        session.id,
        'immigration',
        hoursUntilEstimatedEnd // Valid until estimated end + 2 minutes (actual validation happens at access time)
      );

      // Create secure access link
      const simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/immigration-simulations/${session.id}?token=${temporaryToken}`;

      // Get voice name from questionsData or personalInfo
      let voiceDisplayName = 'Voix par défaut';
      let questionsData = null;
      
      if (session.questionsData) {
        questionsData = typeof session.questionsData === 'string' ? JSON.parse(session.questionsData) : session.questionsData;
      } else if (session.personalInfo) {
        try {
          const personalInfoParsed = typeof session.personalInfo === 'string' 
            ? JSON.parse(session.personalInfo) 
            : session.personalInfo;
          questionsData = personalInfoParsed.questionsData || {};
        } catch (e) {
          console.warn('Failed to parse personalInfo for questionsData:', e);
        }
      }
      
      if (questionsData) {
        const voiceId = questionsData.voiceId || session.voicePreference;
        if (voiceId) {
          const { default: vapiService } = await import('./vapiService');
          const availableVoices = vapiService.getVoiceOptions();
          const voice = availableVoices.find(v => v.id === voiceId);
          if (voice) {
            voiceDisplayName = voice.name;
          }
        }
      } else if (session.voicePreference) {
        // Fallback to voicePreference if directly available
        const { default: vapiService } = await import('./vapiService');
        const availableVoices = vapiService.getVoiceOptions();
        const voice = availableVoices.find(v => v.id === session.voicePreference);
        if (voice) {
          voiceDisplayName = voice.name;
        }
      }

      // Get country name
      const countryNames = {
        'CANADA': 'Canada',
        'FRANCE': 'France',
        'BELGIUM': 'Belgique'
      };
      const countryName = countryNames[session.country] || session.country;

      // Get topic name
      const topicNames = {
        'skilled_worker': 'Travailleur qualifié',
        'student': 'Étudiant international',
        'work_permit': 'Permis de travail',
        'family_reunification': 'Réunification familiale',
        'immigration': 'Immigration générale',
        'school': 'École / Études',
        'work': 'Travail / Professionnel',
        'relocation': 'Déménagement / Famille'
      };
      const topicName = topicNames[session.immigrationType] || session.immigrationType;

      const { EmailService } = require('./emailService');
      const emailData = {
        firstName: session.user.firstName,
        email: session.user.email,
        scheduledDate: scheduledDate,
        country: countryName,
        immigrationType: topicName,
        voicePreference: voiceDisplayName,
        duration: '5 minutes',
        simulationId: session.id,
        accessUrl: simulationUrl
      };

      console.log('📧 Sending immigration booking confirmation email...', {
        to: emailData.email,
        simulationId: emailData.simulationId,
        hasAccessUrl: !!emailData.accessUrl
      });

      await EmailService.sendImmigrationSimulationConfirmationEmail(emailData);

      console.log('✅ Immigration booking confirmation email sent successfully');
    } catch (error) {
      console.error('❌ Error sending immigration booking confirmation email:', {
        error: error?.message,
        sessionId: session?.id,
        userEmail: session?.user?.email
      });
      throw error;
    }
  }

  /**
   * Mark all expired immigration sessions (SCHEDULED sessions where scheduledDate has passed)
   */
  static async markExpiredImmigrationSessions() {
    try {
      const now = new Date();
      
      // Find SCHEDULED sessions where scheduledDate has passed
      const scheduledExpiredCount = await prisma.immigrationSimulation.updateMany({
        where: {
          status: 'SCHEDULED',
          scheduledDate: {
            lt: now // scheduledDate is in the past
          }
        },
        data: { 
          status: 'EXPIRED'
        }
      });

      // Also mark ACTIVE sessions that started more than 30 minutes ago and scheduledDate is past
      const activeExpiredCount = await prisma.immigrationSimulation.updateMany({
        where: {
          status: 'ACTIVE',
          scheduledDate: {
            lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
          }
        },
        data: { 
          status: 'EXPIRED'
        }
      });

      logger.info('Marked expired immigration sessions', {
        scheduled: scheduledExpiredCount.count,
        active: activeExpiredCount.count
      });

      return {
        scheduled: scheduledExpiredCount.count,
        active: activeExpiredCount.count
      };
    } catch (error) {
      logger.error('Error marking expired immigration sessions', { error });
      throw error;
    }
  }

  /**
   * Delete an immigration simulation (only CANCELLED simulations can be deleted)
   */
  static async deleteImmigrationSimulation(simulationId, userId, language = 'fr') {
    try {
      const simulation = await prisma.immigrationSimulation.findFirst({
        where: { id: simulationId, userId }
      });

      if (!simulation) {
        throw new NotFoundError(
          language === 'fr'
            ? 'Simulation d\'immigration introuvable'
            : 'Immigration simulation not found'
        );
      }

      if (simulation.status !== 'CANCELLED') {
        throw new ValidationError(
          language === 'fr'
            ? 'Seules les simulations annulées peuvent être supprimées'
            : 'Only cancelled simulations can be deleted'
        );
      }

      await prisma.immigrationSimulation.delete({
        where: { id: simulationId }
      });

      logger.info('Immigration simulation deleted', { simulationId, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete immigration simulation', { simulationId, userId, error });
      throw error;
    }
  }
}

module.exports = ImmigrationSimulationService;
