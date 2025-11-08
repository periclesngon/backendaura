import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, immigrationSimulationSchemas } from '../middleware/validation';
import { requestLogger, errorLogger } from '../middleware/requestLogger';
import I18nService, { Language } from '../services/i18nService';

const router = express.Router();
const prisma = new PrismaClient();

// Import the immigration simulation service
const ImmigrationSimulationService = require('../services/immigrationSimulationService');

// STUDENT ROUTES

/**
 * @route GET /api/immigration-simulation/history/user
 * @desc Get user's immigration simulation history
 * @access Private (Student)
 */
router.get('/history/user', authenticate, async (req, res) => {
  try {
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      console.error('❌ No userId found in token (immigration history):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('📋 Fetching immigration simulation history for user:', userId);
    // Get user's immigration simulations using the service
    const result = await ImmigrationSimulationService.getUserSimulations(userId);

    console.log('📋 Immigration simulations result:', {
      simulationsCount: Array.isArray(result) ? result.length : 0,
      result: result
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Error getting immigration simulation history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch immigration simulation history'
    });
  }
});

/**
 * @route GET /api/immigration-simulation/monthly-count/user
 * @desc Get user's monthly immigration simulation count
 * @access Private (Student)
 */
router.get('/monthly-count/user', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user has Pro subscription (immigration is Pro-only)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true }
    });

    if (!user || user.subscriptionTier !== 'PRO') {
      return res.status(403).json({
        success: false,
        message: 'Immigration simulations are exclusive to Pro subscribers'
      });
    }

    // Get monthly count using the service
    const monthlyCount = await ImmigrationSimulationService.getMonthlySimulationCount(userId);
    const limit = 2;
    const remaining = Math.max(0, limit - monthlyCount);

    res.json({
      success: true,
      data: {
        monthlyCount,
        limit,
        remaining,
        subscriptionTier: user.subscriptionTier
      }
    });
  } catch (error: any) {
    console.error('Error getting monthly count:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route POST /api/immigration-simulation/create
 * @desc Create new immigration simulation
 * @access Private (Student)
 */
router.post('/create',
  requestLogger,
  authenticate,
  validate(immigrationSimulationSchemas.create),
  async (req, res) => {
  try {
    const userId = req.user.id;
    const { country, immigrationType, level, personalInfo, voicePreference, bookingType, scheduledDate, questionsData } = req.body;
    const language = I18nService.getLanguageFromRequest(req);

    // Map frontend topics to backend immigration types
    const topicMap: { [key: string]: string } = {
      'immigration': 'skilled_worker',
      'school': 'student',
      'work': 'work_permit',
      'relocation': 'family_reunification'
    };

    // Map country codes (CANADA -> canada)
    const normalizedCountry = country?.toLowerCase() || '';
    const mappedImmigrationType = topicMap[immigrationType] || immigrationType || 'skilled_worker';

    // Check if user has Pro subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true }
    });

    // STRICT LIMIT ENFORCEMENT: Check simulation limit before creating
    const { checkSimulationLimit } = await import('../services/simulationLimitService');
    const limitCheck = await checkSimulationLimit(userId);
    
    // Check if user has Pro subscription OR free attempts remaining
    if (!user || (user.subscriptionTier !== 'PRO' && limitCheck.subscriptionTier !== 'FREE')) {
      return res.status(403).json({
        success: false,
        message: language === 'fr' 
          ? 'Les simulations d\'immigration sont réservées aux abonnés Pro'
          : 'Immigration simulations are exclusive to Pro subscribers'
      });
    }
    
    // Also check if limit is reached (for all users)
    if (!limitCheck.canCreate) {
      return res.status(403).json({
        success: false,
        message: language === 'fr'
          ? limitCheck.error || `Vous avez atteint votre limite de simulations (${limitCheck.maxSimulations}). Veuillez attendre le prochain cycle de facturation ou améliorer votre abonnement.`
          : limitCheck.error || `You have reached your simulation limit (${limitCheck.maxSimulations}). Please wait for the next billing cycle or upgrade your subscription.`,
        limitReached: true,
        remaining: limitCheck.remaining,
        maxSimulations: limitCheck.maxSimulations
      });
    }

    // Create immigration simulation using the service
    const sessionData = {
      country: normalizedCountry,
      immigrationType: mappedImmigrationType,
      level: level || 'B1',
      personalInfo: personalInfo || {},
      voicePreference: voicePreference || 'france_female_1',
      bookingType: bookingType || 'AUTO',
      scheduledDate: scheduledDate || null,
      questionsData: questionsData || {}
    };

    const simulation = await ImmigrationSimulationService.createImmigrationSession(userId, sessionData);

    res.json({
      success: true,
      data: simulation,
      message: language === 'fr'
        ? 'Simulation d\'immigration créée avec succès'
        : 'Immigration simulation created successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('Error creating immigration simulation:', error);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de la création de la simulation'
        : 'Error creating simulation')
    });
  }
});

/**
 * @route POST /api/immigration-simulation/start/:id
 * @desc Start an immigration simulation
 * @access Private (Student)
 */
router.post('/start/:id',
  requestLogger,
  authenticate,
  validate({ params: immigrationSimulationSchemas.params }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const language = I18nService.getLanguageFromRequest(req);

    // Verify the simulation belongs to the user
    const simulation = await prisma.immigrationSimulation.findFirst({
      where: { id, userId }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: language === 'fr'
          ? 'Simulation non trouvée'
          : 'Simulation not found'
      });
    }

    // Start the simulation using the service
    const result = await ImmigrationSimulationService.startSession(id, userId);

    res.json({
      success: true,
      data: result,
      message: language === 'fr'
        ? 'Simulation d\'immigration démarrée'
        : 'Immigration simulation started'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('Error starting immigration simulation:', error);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors du démarrage de la simulation'
        : 'Error starting simulation')
    });
  }
});

/**
 * @route POST /api/immigration-simulation/end/:id
 * @desc End an immigration simulation
 * @access Private (Student)
 */
router.post('/end/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const language = I18nService.getLanguageFromRequest(req);

    // Verify the simulation belongs to the user
    const simulation = await prisma.immigrationSimulation.findFirst({
      where: { id, userId }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: language === 'fr'
          ? 'Simulation non trouvée'
          : 'Simulation not found'
      });
    }

    // Complete the simulation using the service
    const result = await ImmigrationSimulationService.completeSession(id, userId);

    res.json({
      success: true,
      data: result,
      message: language === 'fr'
        ? 'Simulation d\'immigration terminée'
        : 'Immigration simulation completed'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('Error ending immigration simulation:', error);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de la fin de la simulation'
        : 'Error ending simulation')
    });
  }
});

/**
 * @route DELETE /api/immigration-simulation/cancel/:id
 * @desc Cancel an immigration simulation booking
 * @access Private (Student)
 */
router.delete('/cancel/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    const language = I18nService.getLanguageFromRequest(req);

    if (!userId) {
      console.error('❌ No userId found in token (immigration cancel):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('🗑️ Cancel immigration simulation endpoint called:', {
      simulationId: id,
      userId
    });

    const result = await ImmigrationSimulationService.cancelSimulation(id, userId, language);

    res.json({
      success: true,
      data: result,
      message: language === 'fr'
        ? 'Simulation d\'immigration annulée avec succès'
        : 'Immigration simulation cancelled successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de l\'annulation'
        : 'Error cancelling simulation')
    });
  }
});

/**
 * @route PUT /api/immigration-simulation/reschedule/:id
 * @desc Reschedule an immigration simulation booking
 * @access Private (Student)
 */
router.put('/reschedule/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, voicePreference } = req.body;
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    const language = I18nService.getLanguageFromRequest(req);

    if (!userId) {
      console.error('❌ No userId found in token (immigration reschedule):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: language === 'fr'
          ? 'Nouvelle date requise'
          : 'New date required'
      });
    }

    console.log('📅 Reschedule immigration simulation endpoint called:', {
      simulationId: id,
      userId,
      newDate,
      voicePreference
    });

    const result = await ImmigrationSimulationService.rescheduleSimulation(
      id,
      userId,
      new Date(newDate),
      voicePreference,
      language
    );

    res.json({
      success: true,
      data: result,
      message: language === 'fr'
        ? 'Simulation d\'immigration reprogrammée avec succès'
        : 'Immigration simulation rescheduled successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de la reprogrammation'
        : 'Error rescheduling simulation')
    });
  }
});

/**
 * @route GET /api/immigration-simulation/:id
 * @desc Get specific immigration simulation
 * @access Private (Student)
 */
/**
 * @route GET /api/immigration-simulation/question-bank/sujets
 * @desc Get all sujets from question bank (shared with voice simulation)
 * @access Private
 */
router.get('/question-bank/sujets', authenticate, async (req, res) => {
  try {
    // Get all question banks where AI extracted content is stored
    // Both voice and immigration simulations can access the same question bank
    const questionBanks = await prisma.questionBank.findMany({
      where: {
        isActive: true,
        OR: [
          { category: 'GENERAL' }, // Voice simulation questions
          { category: 'IMMIGRATION' } // Immigration simulation questions
        ]
      },
      select: {
        id: true,
        title: true,
        extractedQuestions: true,
        level: true,
        category: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📚 Found ${questionBanks.length} question banks for immigration simulation`);

    // Extract sujets from extractedQuestions field
    const allSujets = new Set<string>();
    
    questionBanks.forEach(bank => {
      if (bank.extractedQuestions && Array.isArray(bank.extractedQuestions)) {
        // Extract question text as sujets
        (bank.extractedQuestions as any[]).forEach((q: any) => {
          if (q.question) {
            allSujets.add(q.question);
          }
        });
      } else if (bank.extractedQuestions && typeof bank.extractedQuestions === 'object') {
        // Handle case where extractedQuestions is an object with questions array
        const data = bank.extractedQuestions as any;
        if (data.questions && Array.isArray(data.questions)) {
          data.questions.forEach((q: any) => {
            if (q.question) {
              allSujets.add(q.question);
            }
          });
        }
      }
    });

    const sujets = Array.from(allSujets);

    console.log(`📝 Found ${sujets.length} sujets from question banks`);

    // If no sujets found, return default ones
    if (sujets.length === 0) {
      const defaultSujets = [
        'Immigration et intégration',
        'Vie quotidienne et culture',
        'Travail et carrière',
        'Éducation et formation',
        'Santé et bien-être',
        'Voyages et tourisme',
        'Technologie et innovation',
        'Environnement et développement durable'
      ];
      return res.json({
        success: true,
        data: {
          sujets: defaultSujets,
          source: 'default',
          message: 'Aucun contenu extrait trouvé - Utilisation des sujets par défaut'
        }
      });
    }

    res.json({
      success: true,
      data: {
        sujets: sujets.sort(),
        source: 'question_banks',
        count: sujets.length,
        message: `${sujets.length} sujets trouvés dans la banque de questions`
      }
    });
  } catch (error: any) {
    console.error('Error fetching sujets:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch sujets'
    });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      console.error('❌ No userId found in token (immigration get):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Get the simulation using the service
    const simulation = await ImmigrationSimulationService.getSession(id, userId);

    res.json({
      success: true,
      data: simulation
    });
  } catch (error: any) {
    console.error('Error getting immigration simulation:', error);
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
