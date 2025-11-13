import express from 'express';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { JWTService } from '../utils/jwt';
import { authenticate, requireRole } from '../middleware/auth';
import { temporaryOrRegularAuth } from '../middleware/temporaryAuth';
import voiceSimulationService from '../services/voiceSimulationService';
import questionBankService from '../services/questionBankService';
import vapiService from '../services/vapiService';
import I18nService, { Language } from '../services/i18nService';

const prisma = new PrismaClient();

const router = express.Router();

console.log('🔍 VOICE SIMULATION ROUTES: Router initialized');

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'questionbank-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 0 // No limit
  }
});

// PUBLIC ROUTES

// Get VAPI public key for frontend
router.get('/vapi-config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        publicKey: vapiService.getPublicKey()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test endpoint to create a demo simulation
router.post('/test-simulation', async (req, res) => {
  try {
    // Create a test user if not exists
    const testUser = await prisma.user.upsert({
      where: { email: 'test@vapi-demo.com' },
      update: {},
      create: {
        email: 'test@vapi-demo.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash: 'test-password'
      }
    });

    // Create a test simulation
    const simulation = await prisma.voiceSimulation.create({
      data: {
        userId: testUser.id,
        scheduledDate: new Date(Date.now() + 60000), // 1 minute from now
        voicePreference: 'MALE',
        status: 'SCHEDULED',
        duration: 300
      }
    });

    // Generate test JWT token
    const token = JWTService.generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
      subscriptionTier: testUser.subscriptionTier
    });

    res.json({
      success: true,
      data: {
        user: testUser,
        simulation,
        token,
        accessUrl: `http://localhost:3000/voice-simulation/${simulation.id}`
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test email sending
router.post('/test-email', async (req, res) => {
  try {
    const { email, type } = req.body;
    const testEmail = email || 'periclesngon01@gmail.com';

    console.log(`🧪 Testing email to: ${testEmail} (type: ${type})`);

    // Import email service
    const { EmailService } = require('../services/emailService');

    let result: any;
    switch (type) {
      case 'booking':
        result = await EmailService.sendVoiceSimulationBookingEmail({
          email: testEmail,
          userName: 'Pericles Ngon',
          simulation: {
            id: 'test-123',
            scheduledDate: new Date(Date.now() + 3600000), // 1 hour from now
            voicePreference: 'MALE'
          },
          accessUrl: 'http://localhost:3000/voice-simulation/test-123'
        });
        break;
      case 'reminder':
        result = await EmailService.sendVoiceSimulationReminderEmail({
          email: testEmail,
          userName: 'Pericles Ngon',
          simulation: {
            id: 'test-123',
            scheduledDate: new Date(Date.now() + 1800000), // 30 minutes from now
            voicePreference: 'MALE'
          },
          accessUrl: 'http://localhost:3000/voice-simulation/test-123',
          timeRemaining: '30 minutes'
        });
        break;
      case 'results':
        result = await EmailService.sendVoiceSimulationResultsEmail({
          email: testEmail,
          userName: 'Pericles Ngon',
          simulation: {
            id: 'test-123',
            scheduledDate: new Date(),
            voicePreference: 'MALE'
          },
          results: {
            overallScore: 85,
            fluencyScore: 80,
            grammarScore: 90,
            vocabularyScore: 85,
            pronunciationScore: 80,
            coherenceScore: 90,
            feedback: 'Excellent niveau de français ! Votre maîtrise de la langue est impressionnante. Continuez à pratiquer pour maintenir ce niveau élevé.'
          }
        });
        break;
      default:
        throw new Error('Invalid email type');
    }

    res.json({
      success: true,
      data: result,
      message: `Test ${type} email sent successfully`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Complete end-to-end test
router.post('/test-complete-flow', async (req, res) => {
  try {
    console.log('🚀 Starting complete VAPI voice simulation test...');

    // Step 1: Create test user and simulation
    const testUser = await prisma.user.upsert({
      where: { email: 'e2e-test@vapi-demo.com' },
      update: {},
      create: {
        email: 'e2e-test@vapi-demo.com',
        firstName: 'E2E',
        lastName: 'Test',
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash: 'test-password'
      }
    });
    console.log('✅ Step 1: Test user created/found');

    // Step 2: Create simulation
    const simulation = await prisma.voiceSimulation.create({
      data: {
        userId: testUser.id,
        scheduledDate: new Date(Date.now() + 60000), // 1 minute from now
        voicePreference: 'quebec_male_1' as any, // Use proper voice ID
        status: 'SCHEDULED',
        duration: 300
      }
    });
    console.log('✅ Step 2: Voice simulation created');

    // Step 3: Generate JWT token
    const token = JWTService.generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
      subscriptionTier: testUser.subscriptionTier
    });
    console.log('✅ Step 3: JWT token generated');

    // Step 4: Test VAPI assistant creation
    const questionsData = await vapiService.getProgressiveQuestions();
    const assistant = await vapiService.createFrenchAssistant(
      simulation.voicePreference,
      questionsData
    );
    console.log('✅ Step 4: VAPI assistant created:', assistant.id);

    // Step 5: Test email system
    const { EmailService } = require('../services/emailService');
    const emailResult = await EmailService.sendVoiceSimulationReminderEmail({
      email: testUser.email,
      userName: `${testUser.firstName} ${testUser.lastName}`,
      simulation: {
        id: simulation.id,
        scheduledDate: simulation.scheduledDate,
        voicePreference: simulation.voicePreference
      },
      accessUrl: `http://localhost:3000/voice-simulation/${simulation.id}`,
      timeRemaining: '30 minutes'
    });
    console.log('✅ Step 5: Email system tested');

    // Step 6: Update simulation with assistant info
    await prisma.voiceSimulation.update({
      where: { id: simulation.id },
      data: {
        questionsData: questionsData,
        status: 'SCHEDULED'
      }
    });
    console.log('✅ Step 6: Simulation updated with questions');

    res.json({
      success: true,
      data: {
        user: testUser,
        simulation,
        assistant,
        questions: questionsData,
        token,
        emailResult,
        accessUrl: `http://localhost:3000/voice-simulation/${simulation.id}`,
        testSteps: [
          '✅ User created/found',
          '✅ Voice simulation created',
          '✅ JWT token generated',
          '✅ VAPI assistant created',
          '✅ Email system tested',
          '✅ Simulation updated with questions'
        ]
      },
      message: '🎉 Complete end-to-end test successful!'
    });
  } catch (error: any) {
    console.error('❌ End-to-end test failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack
    });
  }
});

// STUDENT ROUTES - Voice Simulation API

// Get available voice options
router.get('/voices', async (req, res) => {
  try {
    // Ensure vapiService is initialized
    if (!vapiService) {
      throw new Error('VAPI service not initialized');
    }
    
    const voices = vapiService.getVoiceOptions();
    
    if (!voices || !Array.isArray(voices)) {
      throw new Error('Invalid voice options returned');
    }
    
    res.json({
      success: true,
      data: voices,
      message: 'Available voices retrieved successfully'
    });
  } catch (error: any) {
    console.error('Error fetching voices:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available voices',
      error: error.message
    });
  }
});

// Preview voice - Generate audio preview using 11labs API
router.post('/preview', async (req, res) => {
  try {
    const { voiceId, text } = req.body;
    
    if (!voiceId) {
      return res.status(400).json({
        success: false,
        message: 'Voice ID is required'
      });
    }

    const voice = vapiService.getVoiceById(voiceId);
    if (!voice) {
      return res.status(404).json({
        success: false,
        message: 'Voice not found'
      });
    }

    console.log('🎤 Generating preview for voice:', {
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
      accent: voice.accent,
      elevenlabsVoiceId: voice.voiceId,
      hasCustomText: !!text
    });

    // Preview text - use accent-specific text to showcase differences
    let previewText = text;
    if (!previewText) {
      // Generate accent-specific preview text
      switch (voice.accent) {
        case 'FRANCE':
          previewText = voice.gender === 'MALE'
            ? "Bonjour, je suis Pierre. Je viens de Paris et je serai votre intervieweur aujourd'hui. Écoutez attentivement ma voix française."
            : "Bonjour, je suis Marie. Je viens de France et je serai votre intervieweuse. Ma voix reflète l'élégance du français parisien.";
          break;
        case 'QUEBEC':
          previewText = voice.gender === 'MALE'
            ? "Salut ! Moi c'est Jean-Baptiste, du Québec. J'ai un accent québécois authentique. Écoutez bien ma prononciation distincte."
            : "Bonjour ! Je suis Céline du Québec. Mon accent québécois est chaleureux et unique. Écoutez la différence avec le français de France.";
          break;
        case 'BELGIUM':
          previewText = voice.gender === 'MALE'
            ? "Bonjour, je suis Thomas de Belgique. Mon accent belge est professionnel et distinct. Écoutez les nuances de ma prononciation."
            : "Bonjour, je suis Sophie de Belgique. Mon accent belge est élégant et raffiné. Remarquez les particularités de ma voix.";
          break;
        default:
          previewText = "Bonjour ! Je suis votre assistant vocal. Écoutez cette voix pour vous assurer qu'elle vous convient.";
      }
    }
    
    // Use 11labs API to generate preview audio
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('❌ ELEVENLABS_API_KEY is not set! Voices will sound the same.');
      // Fallback: Return text for browser TTS or use VAPI
      return res.json({
        success: true,
        data: {
          voiceId: voice.id,
          previewText,
          audioUrl: null, // Browser will use SpeechSynthesis
          voiceId_11labs: voice.voiceId,
          useBrowserTTS: true,
          error: 'ELEVENLABS_API_KEY not configured'
        },
        message: 'Preview ready (using browser TTS - configure ELEVENLABS_API_KEY for unique voices)'
      });
    }

    try {
      console.log('🎵 Calling 11labs API with voice ID:', voice.voiceId, 'for voice:', voice.name);
      // Call 11labs API to generate audio using the CORRECT 11labs voice ID
      const elevenLabsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}`,
        {
          text: previewText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsApiKey
          },
          responseType: 'arraybuffer',
          timeout: 30000 // 30 second timeout
        }
      );

      // Convert audio buffer to base64
      const audioBuffer = Buffer.from(elevenLabsResponse.data);
      const audioBase64 = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      
      console.log('✅ Successfully generated audio preview:', {
        voiceId: voice.id,
        voiceName: voice.name,
        gender: voice.gender,
        accent: voice.accent,
        elevenlabsVoiceId: voice.voiceId,
        audioSize: audioBuffer.length,
        audioBase64Length: audioBase64.length
      });
      
      res.json({
        success: true,
        data: {
          voiceId: voice.id,
          previewText,
          audioBase64: audioBase64,
          voiceId_11labs: voice.voiceId, // This should be DIFFERENT for each voice
          useBrowserTTS: false,
          gender: voice.gender,
          accent: voice.accent
        },
        message: 'Preview audio generated successfully'
      });
    } catch (elevenLabsError: any) {
      console.error('❌ 11labs API error:', {
        status: elevenLabsError.response?.status,
        statusText: elevenLabsError.response?.statusText,
        data: elevenLabsError.response?.data,
        message: elevenLabsError.message,
        voiceId: voice.voiceId,
        voiceName: voice.name
      });
      
      // Fallback to browser TTS
      res.json({
        success: true,
        data: {
          voiceId: voice.id,
          previewText,
          audioUrl: null,
          voiceId_11labs: voice.voiceId,
          useBrowserTTS: true,
          error: elevenLabsError.response?.data?.detail?.message || elevenLabsError.message
        },
        message: 'Preview ready (using browser TTS as fallback)'
      });
    }
  } catch (error: any) {
    console.error('Error generating voice preview:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate voice preview'
    });
  }
});

// Book a voice simulation
router.post('/book', authenticate, async (req, res) => {
  try {
    const { bookingType, preferredDates, voicePreference } = req.body;
    const userId = req.user.id;
    const language = I18nService.getLanguageFromRequest(req);

    const result = await voiceSimulationService.bookSimulation({
      userId,
      bookingType,
      preferredDates: preferredDates?.map((date: string) => new Date(date)),
      voicePreference
    }, language);

    res.json({
      success: true,
      data: result,
      message: I18nService.t('success.simulation_booked', language)
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('❌ Booking error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId: req.user?.id,
      body: req.body
    });
    
    const errorMessage = error.message && (error.message.includes('voice.') || error.message.includes('error.'))
      ? error.message
      : I18nService.t('voice.booking_failed', language);
    
    res.status(400).json({
      success: false,
      message: errorMessage,
      error: error.message || 'Unknown error'
    });
  }
});

// Delete a CANCELLED voice simulation (permanent deletion)
router.delete('/delete/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const language = I18nService.getLanguageFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Only allow deletion of CANCELLED sessions
    const simulation = await prisma.voiceSimulation.findFirst({
      where: {
        id,
        userId,
        status: 'CANCELLED'
      }
    });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        message: language === 'fr'
          ? 'Simulation annulée introuvable'
          : 'Cancelled simulation not found'
      });
    }

    // Delete the simulation permanently
    await prisma.voiceSimulation.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: language === 'fr'
        ? 'Simulation supprimée avec succès'
        : 'Simulation deleted successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr' ? 'Erreur lors de la suppression' : 'Error deleting simulation')
    });
  }
});

// Cancel a voice simulation booking
router.delete('/cancel/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    const language = I18nService.getLanguageFromRequest(req);

    if (!userId) {
      console.error('❌ No userId found in token:', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('🗑️ Cancel endpoint called:', {
      simulationId: id,
      userId,
      userObject: req.user,
      userIdType: typeof userId,
      idType: typeof id,
      hasUserId: !!req.user?.userId,
      hasId: !!req.user?.id,
      userIdFromToken: req.user?.userId,
      idFromToken: req.user?.id
    });

    const result = await voiceSimulationService.cancelSimulation(id, userId, language);

    res.json({
      success: true,
      data: result,
      message: language === 'fr'
        ? 'Simulation annulée avec succès'
        : 'Simulation cancelled successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Reschedule a voice simulation booking
router.put('/reschedule/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, voicePreference } = req.body;
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    const language = I18nService.getLanguageFromRequest(req);

    if (!userId) {
      console.error('❌ No userId found in token (reschedule):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('📅 Reschedule endpoint called:', {
      simulationId: id,
      userId,
      userObject: req.user,
      newDate,
      voicePreference,
      userIdType: typeof userId,
      idType: typeof id,
      hasUserId: !!req.user?.userId,
      hasId: !!req.user?.id,
      userIdFromToken: req.user?.userId,
      idFromToken: req.user?.id
    });

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: language === 'fr'
          ? 'Nouvelle date requise'
          : 'New date required'
      });
    }

    const result = await voiceSimulationService.rescheduleSimulation(
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
        ? 'Simulation reprogrammée avec succès'
        : 'Simulation rescheduled successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Access voice simulation via temporary token (for email links)
router.get('/access/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;
    const userId = req.user.id;

    const result = await voiceSimulationService.getSimulation(simulationId, userId);

    res.json({
      success: true,
      data: result,
      message: 'Voice simulation accessed successfully via temporary token'
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's simulation history
router.get('/history', authenticate, async (req, res) => {
  try {
    // Check both id and userId for compatibility - prioritize userId from JWT
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      console.error('❌ No userId found in token (history):', {
        user: req.user,
        hasId: !!req.user?.id,
        hasUserId: !!req.user?.userId
      });
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('📋 Fetching simulation history for user:', userId);
    const result = await voiceSimulationService.getUserSimulations(userId);

    console.log('📋 User simulations result:', {
      simulationsCount: result.simulations?.length || 0,
      bookingsCount: result.bookings?.length || 0,
      simulations: result.simulations
    });

    // Return only simulations (real bookings), filter out any invalid/mock data
    const validSimulations = (result.simulations || []).filter((sim: any) => {
      console.log('🔍 Backend checking simulation:', {
        id: sim.id,
        scheduledDate: sim.scheduledDate,
        scheduledDateType: typeof sim.scheduledDate,
        scheduledDateValue: sim.scheduledDate?.toString(),
        status: sim.status
      });
      
      // Only return simulations with valid scheduled dates
      if (!sim.scheduledDate) {
        console.log('⚠️ Simulation filtered out (no scheduledDate):', sim.id);
        return false;
      }
      
      const date = new Date(sim.scheduledDate);
      const isValid = !isNaN(date.getTime());
      
      if (!isValid) {
        console.log('⚠️ Simulation filtered out (invalid date):', {
          id: sim.id,
          scheduledDate: sim.scheduledDate,
          scheduledDateType: typeof sim.scheduledDate,
          parsedDate: date.toString()
        });
      } else {
        console.log('✅ Simulation is valid:', {
          id: sim.id,
          scheduledDate: sim.scheduledDate,
          parsedDate: date.toISOString()
        });
      }
      
      return isValid;
    });

    // Check and update EXPIRED status based on scheduledDate
    const now = new Date();
    const simulationsToUpdate: string[] = [];
    
    const processedSimulations = validSimulations.map((sim: any) => {
      const scheduledDate = sim.scheduledDate ? new Date(sim.scheduledDate) : null;
      
      // If status is SCHEDULED but scheduledDate has passed, mark as EXPIRED
      if (sim.status === 'SCHEDULED' && scheduledDate && scheduledDate < now) {
        simulationsToUpdate.push(sim.id);
        sim.status = 'EXPIRED';
      }
      
      // If status is EXPIRED but scheduledDate is in the future, mark as SCHEDULED
      if (sim.status === 'EXPIRED' && scheduledDate && scheduledDate >= now) {
        simulationsToUpdate.push(sim.id);
        sim.status = 'SCHEDULED';
      }
      
      return sim;
    });
    
    // Update database for simulations that need status correction
    if (simulationsToUpdate.length > 0) {
      console.log(`🔄 Updating ${simulationsToUpdate.length} simulation(s) with corrected status`);
      await Promise.all(simulationsToUpdate.map(async (id) => {
        const sim = processedSimulations.find(s => s.id === id);
        if (sim) {
          try {
            await prisma.voiceSimulation.update({
              where: { id },
              data: { status: sim.status as any }
            });
            console.log(`✅ Updated simulation ${id} status to ${sim.status}`);
          } catch (error) {
            console.error(`❌ Error updating simulation ${id}:`, error);
          }
        }
      }));
    }

    // Ensure scheduledDate is serialized as ISO string for JSON
    const serializedSimulations = processedSimulations.map((sim: any) => ({
      ...sim,
      scheduledDate: sim.scheduledDate instanceof Date 
        ? sim.scheduledDate.toISOString() 
        : sim.scheduledDate,
      createdAt: sim.createdAt instanceof Date 
        ? sim.createdAt.toISOString() 
        : sim.createdAt,
      updatedAt: sim.updatedAt instanceof Date 
        ? sim.updatedAt.toISOString() 
        : sim.updatedAt
    }));

    console.log('✅ Returning valid simulations:', {
      total: serializedSimulations.length,
      simulations: serializedSimulations.map((s: any) => ({
        id: s.id,
        scheduledDate: s.scheduledDate,
        scheduledDateType: typeof s.scheduledDate,
        status: s.status
      }))
    });

    res.json({
      success: true,
      data: serializedSimulations
    });
  } catch (error: any) {
    console.error('❌ Error fetching simulation history:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch simulation history',
      error: error.message || 'Unknown error'
    });
  }
});

// Get user's monthly voice simulation count
router.get('/monthly-count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const language = I18nService.getLanguageFromRequest(req);

    // Get current month's simulation count
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Count only valid sessions (sessions with AIFeedback)
    // PRO/PREMIUM users: Maximum 2 feedbacks (2 valid sessions)
    // Only count COMPLETED sessions with AI feedback - these are the only valid ones
    const monthlyCount = await prisma.voiceSimulation.count({
      where: {
        userId: userId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        },
        status: 'COMPLETED', // Only count completed simulations
        aiFeedbacks: {
          some: {} // Must have at least one AIFeedback to be valid
        }
      }
    });

    // Get user's subscription tier to determine limit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true }
    });

    // Voice simulation limits based on subscription tier
    // PRO/PREMIUM users: Maximum 2 feedbacks (2 valid sessions)
    let limit = 0;
    if (user?.subscriptionTier === 'PREMIUM' || user?.subscriptionTier === 'PRO') {
      limit = 2; // 2 valid sessions (with feedback) per month for Premium/Pro
    } else {
      limit = 0; // Free users cannot access voice simulations
    }

    const remaining = Math.max(0, limit - monthlyCount);

    res.json({
      success: true,
      data: {
        monthlyCount,
        limit,
        remaining,
        subscriptionTier: user?.subscriptionTier || 'FREE'
      }
    });
  } catch (error: any) {
    console.error('Error getting monthly count:', error);
    const language = I18nService.getLanguageFromRequest(req);
    res.status(500).json({
      success: false,
      message: language === 'fr'
        ? 'Erreur lors de la récupération du compte mensuel'
        : 'Failed to get monthly count'
    });
  }
});

// ADMIN ROUTES - Mark expired sessions (for manual trigger)
router.post('/admin/mark-expired', requireRole(['ADMIN', 'SENIOR_MANAGER']), async (req, res) => {
  try {
    const result = await voiceSimulationService.markExpiredSessions();
    res.json({
      success: true,
      message: `Marked ${result.scheduled + result.active} expired session(s)`,
      data: result
    });
  } catch (error: any) {
    console.error('Error marking expired sessions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark expired sessions'
    });
  }
});

// MANAGER ROUTES

// Upload PDF question bank
router.post('/question-bank/upload',
  authenticate,
  requireRole(['SENIOR_MANAGER', 'ADMIN']),
  upload.single('pdf'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'PDF file is required'
        });
      }

      const { title, description, level, category } = req.body;
      const managerId = req.user.id;

      const result = await questionBankService.uploadPDF({
        managerId,
        title,
        description,
        level,
        category,
        filePath: req.file.path
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get manager's question banks
router.get('/question-bank/my-banks',
  authenticate,
  requireRole(['SENIOR_MANAGER', 'ADMIN']),
  async (req, res) => {
    try {
      const managerId = req.user.id;
      
      const result = await questionBankService.getManagerQuestionBanks(managerId);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// ADMIN ROUTES

// Get all question banks
router.get('/question-bank/all',
  authenticate,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const result = await questionBankService.getAllQuestionBanks();

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Update question bank status
router.patch('/question-bank/:questionBankId/status',
  authenticate,
  requireRole(['SENIOR_MANAGER', 'ADMIN']),
  async (req, res) => {
    try {
      const { questionBankId } = req.params;
      const { isActive } = req.body;
      const userId = req.user.id;

      const result = await questionBankService.updateQuestionBankStatus(
        questionBankId, 
        isActive, 
        userId
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get question bank statistics
router.get('/question-bank/stats',
  authenticate,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const result = await questionBankService.getQuestionBankStats();

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// VAPI WEBHOOK ENDPOINTS

// Handle VAPI call status updates
router.post('/webhook/vapi/status', async (req, res) => {
  try {
    const { callId, status, message } = req.body;
    
    console.log('VAPI Status Update:', { callId, status, message });
    
    // Handle different status updates
    switch (status) {
      case 'ended':
        // Process call results
        // This would be handled by the voiceSimulationService
        break;
      case 'failed':
        // Handle failed calls
        console.error('VAPI call failed:', message);
        break;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error handling VAPI webhook:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Handle VAPI call transcripts
router.post('/webhook/vapi/transcript', async (req, res) => {
  try {
    const { callId, transcript, messages } = req.body;
    
    console.log('VAPI Transcript Update:', { callId, transcript });
    
    // Store transcript data for real-time updates
    // This could be sent to frontend via WebSocket
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error handling VAPI transcript:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Handle VAPI call analysis
router.post('/webhook/vapi/analysis', async (req, res) => {
  try {
    const { callId, analysis, summary } = req.body;
    
    console.log('VAPI Analysis Update:', { callId, analysis, summary });
    
    // Process the analysis results
    // Update simulation with final results
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error handling VAPI analysis:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// VAPI Function Call Handler - Handles all function calls from VAPI during conversation
router.post('/vapi-function-call', async (req, res) => {
  try {
    // Verify VAPI secret if needed
    const serverUrlSecret = req.headers['x-vapi-secret'] || req.headers.authorization;
    const expectedSecret = process.env.VAPI_SERVER_URL_SECRET || 'vapi-secret-key';
    
    if (serverUrlSecret && serverUrlSecret !== expectedSecret) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // VAPI sends function calls in different formats - handle both
    let functionName: string;
    let parameters: any;
    let call: any;
    let callId: string | undefined;
    let assistantId: string | undefined;

    // Format 1: Direct function call format
    if (req.body.function_call || req.body.name) {
      functionName = req.body.function_call?.name || req.body.name;
      parameters = req.body.function_call?.arguments ? JSON.parse(req.body.function_call.arguments) : req.body.arguments || req.body.parameters || {};
      call = req.body.call || {};
      callId = call.id || req.body.callId;
      assistantId = call.assistantId || req.body.assistantId;
    }
    // Format 2: Message format (VAPI standard)
    else if (req.body.message) {
      const message = req.body.message;
      if (message.function_call) {
        functionName = message.function_call.name;
        parameters = message.function_call.arguments ? JSON.parse(message.function_call.arguments) : {};
      } else {
        functionName = req.body.functionName || req.body.name;
        parameters = req.body.parameters || req.body.arguments || {};
      }
      call = req.body.call || message.call || {};
      callId = call.id || message.callId || req.body.callId;
      assistantId = call.assistantId || message.assistantId || req.body.assistantId;
    }
    // Format 3: Simplified format
    else {
      functionName = req.body.functionName || req.body.name || req.body.function;
      parameters = req.body.parameters || req.body.arguments || {};
      call = req.body.call || {};
      callId = call.id || req.body.callId;
      assistantId = call.assistantId || req.body.assistantId;
    }

    if (!functionName) {
      console.error('❌ No function name provided in request:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Function name is required'
      });
    }

    console.log(`📞 VAPI Function Call: ${functionName}`, { 
      parameters, 
      callId, 
      assistantId,
      requestFormat: req.body.function_call ? 'function_call' : req.body.message ? 'message' : 'direct'
    });

    // Extract simulationType from request or determine from context
    let simulationType = req.body.simulationType || req.body.simulation_type || 'voice';
    
    // Find simulation by callId or assistantId - check both voice and immigration
    let simulation = null;
    let isImmigration = false;
    
    if (callId) {
      // Try voice simulation first
      simulation = await prisma.voiceSimulation.findFirst({
        where: {
          OR: [
            { vapiSessionId: callId },
            { vapiSessionId: { contains: callId } }
          ]
        }
      });
      
      // If not found, try immigration simulation
      if (!simulation) {
        // Note: ImmigrationSimulation doesn't have vapiSessionId field
        // Search by other fields if needed, or skip this check for immigration
        const immigrationSim = await prisma.immigrationSimulation.findFirst({
          where: {
            id: callId // Fallback: try ID match
          }
        });
        if (immigrationSim) {
          simulation = immigrationSim as any;
          isImmigration = true;
          simulationType = 'immigration';
        }
      }
    }
    
    if (!simulation && assistantId) {
      // Try to find by assistant ID pattern - check both tables
      const voiceSims = await prisma.voiceSimulation.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 1
      });
      if (voiceSims.length > 0) {
        simulation = voiceSims[0];
      } else {
        const immigrationSims = await prisma.immigrationSimulation.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1
        });
        if (immigrationSims.length > 0) {
          simulation = immigrationSims[0] as any;
          isImmigration = true;
          simulationType = 'immigration';
        }
      }
    }

    if (!simulation) {
      console.error('❌ Simulation not found for function call:', { callId, assistantId, simulationType });
      return res.status(404).json({
        success: false,
        error: 'Simulation not found'
      });
    }

    // Get active session - handle both voice and immigration
    let session = null;
    if (isImmigration || simulationType === 'immigration') {
      // For immigration, get active session from ImmigrationSimulationService
      const ImmigrationSimulationService = require('../services/immigrationSimulationService');
      session = ImmigrationSimulationService.getActiveSession(simulation.id);
      
      // If session doesn't exist, try to create it from database
      if (!session) {
        const immigrationSim = await prisma.immigrationSimulation.findUnique({
          where: { id: simulation.id }
        });
        if (immigrationSim && immigrationSim.status === 'ACTIVE') {
          // Recreate session from database if it was lost
          const responses = JSON.parse((immigrationSim as any).responses || '{}');
          session = {
            simulationId: simulation.id,
            userId: immigrationSim.userId,
            country: immigrationSim.country,
            immigrationType: immigrationSim.immigrationType,
            askedQuestions: new Map(Object.keys(responses).map(qId => [qId, responses[qId]])),
            questionResponses: new Map(Object.keys(responses).map(qId => [qId, responses[qId]])),
            currentLevel: immigrationSim.level || 'B1',
            questionCount: Object.keys(responses).length,
            performanceScores: {
              relevance: [],
              completeness: [],
              clarity: [],
              language: [],
              credibility: []
            },
            startTime: immigrationSim.startedAt || immigrationSim.createdAt
          };
          // Store it back in the active sessions
          const activeImmigrationSessions = (ImmigrationSimulationService as any).activeImmigrationSessions;
          if (activeImmigrationSessions) {
            activeImmigrationSessions.set(simulation.id, session);
          }
        }
      }
    } else {
      session = voiceSimulationService.getActiveSession(simulation.id);
    }
    
    if (!session) {
      console.error('❌ Active session not found for simulation:', {
        simulationId: simulation.id,
        simulationType,
        isImmigration,
        status: (simulation as any).status
      });
      return res.status(404).json({
        success: false,
        error: 'Active session not found'
      });
    }

    // Handle different function calls
    let result: any = {};

    if (simulationType === 'immigration') {
      // Immigration simulation function calls
      const ImmigrationSimulationService = require('../services/immigrationSimulationService');
      
      switch (functionName) {
        case 'fetch_next_question':
          // Fetch immigration questions from question bank - TRACK QUESTIONS TO AVOID REPETITION
          const immigrationSim = isImmigration 
            ? simulation 
            : await prisma.immigrationSimulation.findUnique({
                where: { id: simulation.id },
                select: { country: true, immigrationType: true, level: true }
              });
          
          if (!immigrationSim) {
            throw new Error('Immigration simulation not found');
          }
          
          const immigrationType = (immigrationSim as any).immigrationType || parameters.topic || 'immigration';
          const immigrationCurrentLevel = session?.currentLevel || (immigrationSim as any).level || parameters.level || 'B1';
          
          // Get questions from question bank
          const questions = await vapiService.getRandomQuestions(immigrationCurrentLevel, 30);
          
          // Filter by IMMIGRATION category
          let filteredQuestions = questions.filter((q: any) => {
            const qCategory = (q.category || 'GENERAL').toString();
            return qCategory === 'IMMIGRATION' || qCategory === parameters.category || parameters.category === 'IMMIGRATION';
          });
          
          // Filter by topic if specified (immigration type)
          const topicMap: { [key: string]: string } = {
            'school': 'student',
            'work': 'work_permit',
            'relocation': 'family_reunification',
            'student': 'student',
            'skilled_worker': 'skilled_worker',
            'family_reunification': 'family_reunification',
            'work_permit': 'work_permit'
          };
          
          const topic = topicMap[immigrationType] || immigrationType;
          if (topic && topic !== 'immigration') {
            filteredQuestions = filteredQuestions.filter((q: any) => {
              const qText = (q.text || q.question || '').toLowerCase();
              const topicKeywords: { [key: string]: string[] } = {
                'student': ['école', 'études', 'étudiant', 'université', 'éducation', 'permis d\'études'],
                'skilled_worker': ['travailleur', 'qualifié', 'profession', 'emploi', 'compétences'],
                'work_permit': ['travail', 'emploi', 'profession', 'carrière', 'permis de travail'],
                'family_reunification': ['famille', 'déménagement', 'réunification', 'regroupement', 'parrainage']
              };
              const keywords = topicKeywords[topic] || [];
              return keywords.length === 0 || keywords.some(keyword => qText.includes(keyword));
            });
          }
          
          // EXCLUDE ALREADY ASKED QUESTIONS - CRITICAL FOR MEMORY
          const askedIds = session?.askedQuestions ? Array.from(session.askedQuestions.keys()) : [];
          const excludeIds = parameters.excludeQuestionIds || [];
          const allExcludedIds = [...askedIds, ...excludeIds];
          
          const availableQuestions = filteredQuestions.filter((q: any) => {
            const qId = q.id || q.questionId || JSON.stringify(q);
            return !allExcludedIds.includes(qId);
          });
          
          // If no questions available, try other levels or categories
          if (availableQuestions.length === 0) {
            console.warn('⚠️ No questions available at current level/category, trying fallback');
            // Try same level without topic filter
            const fallbackQuestions = questions.filter((q: any) => {
              const qId = q.id || q.questionId || JSON.stringify(q);
              const qCategory = (q.category || 'GENERAL').toString();
              return qCategory === 'IMMIGRATION' && !allExcludedIds.includes(qId);
            });
            
            if (fallbackQuestions.length > 0) {
              const selectedQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
              const questionId = selectedQuestion.id || selectedQuestion.questionId || `immigration_${Date.now()}`;
              
              // Mark as asked in session
              if (session && session.askedQuestions) {
                session.askedQuestions.set(questionId, {
                  question: selectedQuestion.text || selectedQuestion.question,
                  level: selectedQuestion.level || immigrationCurrentLevel,
                  category: selectedQuestion.category || 'IMMIGRATION',
                  timestamp: new Date()
                });
                session.questionCount = (session.questionCount || 0) + 1;
              }
              
              result = {
                question: selectedQuestion.text || selectedQuestion.question || selectedQuestion.questionText,
                questionId: questionId,
                level: selectedQuestion.level || immigrationCurrentLevel,
                category: selectedQuestion.category || 'IMMIGRATION',
                availableCount: fallbackQuestions.length
              };
            } else {
              // Last resort: return a default question
              result = {
                question: `Parlez-moi de votre projet d'immigration au ${(immigrationSim as any).country || 'Canada'}.`,
                questionId: `immigration_fallback_${Date.now()}`,
                level: immigrationCurrentLevel,
                category: 'IMMIGRATION',
                availableCount: 0
              };
            }
          } else {
            // Select random question from available ones
            const selectedQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
            const questionId = selectedQuestion.id || selectedQuestion.questionId || `immigration_${Date.now()}`;
            
            // CRITICAL: Mark as asked in session to avoid repetition
            if (session && session.askedQuestions) {
              session.askedQuestions.set(questionId, {
                question: selectedQuestion.text || selectedQuestion.question,
                level: selectedQuestion.level || immigrationCurrentLevel,
                category: selectedQuestion.category || 'IMMIGRATION',
                timestamp: new Date()
              });
              session.questionCount = (session.questionCount || 0) + 1;
              
              console.log('✅ Question marked as asked:', {
                questionId,
                questionCount: session.questionCount,
                totalAsked: session.askedQuestions.size
              });
            }
            
            result = {
              question: selectedQuestion.text || selectedQuestion.question || selectedQuestion.questionText,
              questionId: questionId,
              level: selectedQuestion.level || immigrationCurrentLevel,
              category: selectedQuestion.category || 'IMMIGRATION',
              availableCount: availableQuestions.length
            };
          }
          break;

        case 'store_question_response':
          // Store question-response for immigration simulation - CRITICAL FOR MEMORY
          const ImmigrationSimulationServiceStore = require('../services/immigrationSimulationService');
          const activeSessionStore = ImmigrationSimulationServiceStore.getActiveSession(simulation.id);
          
          // Store in active session for tracking
          if (activeSessionStore && activeSessionStore.questionResponses) {
            activeSessionStore.questionResponses.set(parameters.questionId, {
              questionId: parameters.questionId,
              questionText: parameters.questionText,
              questionLevel: parameters.questionLevel || activeSessionStore.currentLevel || 'B1',
              questionCategory: parameters.questionCategory || 'IMMIGRATION',
              studentResponse: parameters.studentResponse,
              timestamp: parameters.timestamp ? new Date(parameters.timestamp) : new Date()
            });
            
            console.log('✅ Stored question-response in session:', {
              questionId: parameters.questionId,
              responseLength: parameters.studentResponse?.length,
              totalResponses: activeSessionStore.questionResponses.size
            });
          }
          
          // Also store in database for persistence
          const currentResponses = JSON.parse((simulation as any).responses || '{}');
          currentResponses[parameters.questionId] = {
            questionText: parameters.questionText,
            studentResponse: parameters.studentResponse,
            timestamp: parameters.timestamp || new Date().toISOString(),
            level: parameters.questionLevel || 'B1',
            category: parameters.questionCategory || 'IMMIGRATION'
          };
          
          await prisma.immigrationSimulation.update({
            where: { id: simulation.id },
            data: {
              responses: JSON.stringify(currentResponses)
            }
          });
          
          result = { 
            success: true, 
            message: 'Response stored',
            questionId: parameters.questionId,
            totalResponses: activeSessionStore?.questionResponses?.size || Object.keys(currentResponses).length
          };
          break;

        case 'analyze_response':
          // Analyze response for immigration simulation using REAL AI
          const ImmigrationSimulationServiceAnalyze = require('../services/immigrationSimulationService');
          const activeSessionAnalyze = ImmigrationSimulationServiceAnalyze.getActiveSession(simulation.id);
          
          // Get question from session if available
          let question = null;
          if (activeSessionAnalyze?.askedQuestions) {
            const askedQuestion = activeSessionAnalyze.askedQuestions.get(parameters.questionId);
            if (askedQuestion) {
              question = {
                id: parameters.questionId,
                question: askedQuestion.question || parameters.questionText,
                expectedElements: [],
                category: askedQuestion.category || 'IMMIGRATION',
                level: askedQuestion.level || 'B1'
              };
            }
          }
          
          // If question not in session, create a basic question object
          if (!question) {
            question = {
              id: parameters.questionId,
              question: parameters.questionText || 'Question d\'immigration',
              expectedElements: [],
              category: 'IMMIGRATION',
              level: parameters.questionLevel || activeSessionAnalyze?.currentLevel || 'B1'
            };
          }
          
          // Use REAL AI analysis (not mock data)
          const analysis = await ImmigrationSimulationServiceAnalyze.analyzeResponse(
            question,
            parameters.studentResponse,
            parameters.questionLevel || activeSessionAnalyze?.currentLevel || 'B1'
          );
          
          // Update performance scores in session
          if (activeSessionAnalyze && activeSessionAnalyze.performanceScores) {
            if (analysis.criteria) {
              activeSessionAnalyze.performanceScores.relevance.push(analysis.criteria.relevance?.score || 0);
              activeSessionAnalyze.performanceScores.completeness.push(analysis.criteria.completeness?.score || 0);
              activeSessionAnalyze.performanceScores.clarity.push(analysis.criteria.clarity?.score || 0);
              activeSessionAnalyze.performanceScores.language.push(analysis.criteria.language?.score || 0);
              activeSessionAnalyze.performanceScores.credibility.push(analysis.criteria.credibility?.score || 0);
            }
          }
          
          // Store analysis in question response
          if (activeSessionAnalyze?.questionResponses) {
            const responseData = activeSessionAnalyze.questionResponses.get(parameters.questionId);
            if (responseData) {
              responseData.analysis = analysis;
              activeSessionAnalyze.questionResponses.set(parameters.questionId, responseData);
            }
          }
          
          // Map immigration analysis to VAPI format
          result = {
            relevanceScore: analysis.criteria?.relevance?.score || 0,
            completenessScore: analysis.criteria?.completeness?.score || 0,
            clarityScore: analysis.criteria?.clarity?.score || 0,
            languageScore: analysis.criteria?.language?.score || 0,
            credibilityScore: analysis.criteria?.credibility?.score || 0,
            overallScore: analysis.score || 0,
            maxScore: analysis.maxScore || 100,
            strengths: analysis.strengths || [],
            improvements: analysis.improvements || [],
            feedback: analysis.feedback || `Score: ${analysis.score}/${analysis.maxScore || 100}. ${(analysis.improvements || []).join(', ')}`,
            followUpNeeded: analysis.followUpNeeded || false,
            suggestedFollowUp: analysis.suggestedFollowUp || null
          };
          
          console.log('✅ AI Analysis completed for immigration:', {
            questionId: parameters.questionId,
            overallScore: result.overallScore,
            strengths: result.strengths.length,
            improvements: result.improvements.length
          });
          break;

        case 'get_next_difficulty_level':
          // Determine next difficulty level based on performance for immigration
          const ImmigrationSimulationServiceLevel = require('../services/immigrationSimulationService');
          const activeSessionLevel = ImmigrationSimulationServiceLevel.getActiveSession(simulation.id);
          
          if (!activeSessionLevel) {
            result = { nextLevel: parameters.currentLevel || 'B1', currentLevel: parameters.currentLevel || 'B1' };
            break;
          }
          
          const immigrationLevel = parameters.currentLevel || activeSessionLevel.currentLevel || 'B1';
          const performanceScores = parameters.performanceScores || activeSessionLevel.performanceScores || {};
          
          // Calculate average scores
          const scores = {
            relevance: performanceScores.relevance && performanceScores.relevance.length > 0 
              ? performanceScores.relevance.reduce((a: number, b: number) => a + b, 0) / performanceScores.relevance.length 
              : 0,
            completeness: performanceScores.completeness && performanceScores.completeness.length > 0
              ? performanceScores.completeness.reduce((a: number, b: number) => a + b, 0) / performanceScores.completeness.length
              : 0,
            clarity: performanceScores.clarity && performanceScores.clarity.length > 0
              ? performanceScores.clarity.reduce((a: number, b: number) => a + b, 0) / performanceScores.clarity.length
              : 0,
            language: performanceScores.language && performanceScores.language.length > 0
              ? performanceScores.language.reduce((a: number, b: number) => a + b, 0) / performanceScores.language.length
              : 0,
            credibility: performanceScores.credibility && performanceScores.credibility.length > 0
              ? performanceScores.credibility.reduce((a: number, b: number) => a + b, 0) / performanceScores.credibility.length
              : 0
          };
          
          const avgScore = (
            scores.relevance + scores.completeness + scores.clarity + scores.language + scores.credibility
          ) / 5;
          
          const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
          const currentIndex = levels.indexOf(immigrationLevel);
          let nextLevel = immigrationLevel;
          
          // Progressive difficulty adjustment
          if (avgScore >= 80 && currentIndex < levels.length - 1) {
            nextLevel = levels[currentIndex + 1]; // Increase difficulty
          } else if (avgScore < 50 && currentIndex > 0) {
            nextLevel = levels[currentIndex - 1]; // Decrease difficulty
          }
          
          // Update session level
          if (activeSessionLevel) {
            activeSessionLevel.currentLevel = nextLevel;
          }
          
          result = {
            nextLevel,
            currentLevel: immigrationLevel,
            averageScore: avgScore.toFixed(1),
            recommendation: avgScore >= 80 
              ? 'Augmenter la difficulté'
              : avgScore < 50 
              ? 'Maintenir ou diminuer la difficulté'
              : 'Maintenir la difficulté actuelle',
            scores: scores
          };
          break;

        case 'get_question_count':
          // Get question count from active session
          const ImmigrationSimulationService2 = require('../services/immigrationSimulationService');
          const activeSession2 = ImmigrationSimulationService2.getActiveSession(simulation.id);
          
          const questionCount = activeSession2?.questionCount || activeSession2?.askedQuestions?.size || 0;
          const responseCount = activeSession2?.questionResponses?.size || 0;
          const dbResponses = JSON.parse((simulation as any).responses || '{}');
          const dbResponseCount = Object.keys(dbResponses).length;
          
          result = { 
            count: Math.max(questionCount, responseCount, dbResponseCount),
            askedCount: questionCount,
            responseCount: responseCount,
            dbResponseCount: dbResponseCount
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            error: `Unknown function: ${functionName}`
          });
      }
    } else {
      // Voice simulation function calls (existing logic)
      switch (functionName) {
        case 'fetch_next_question':
          result = await voiceSimulationService.handleFetchNextQuestion(
            simulation.id,
            parameters.level || session.currentLevel,
            parameters.category,
            Array.from(session.askedQuestions.keys())
          );
          break;

        case 'store_question_response':
          result = await voiceSimulationService.handleStoreQuestionResponse(
            simulation.id,
            parameters.questionId,
            parameters.questionText,
            parameters.questionLevel || session.currentLevel,
            parameters.questionCategory,
            parameters.studentResponse,
            parameters.timestamp
          );
          break;

        case 'analyze_response':
          result = await voiceSimulationService.handleAnalyzeResponse(
            simulation.id,
            parameters.questionId,
            parameters.studentResponse,
            parameters.questionLevel || session.currentLevel,
            parameters.conversationContext
          );
          break;

        case 'get_next_difficulty_level':
          result = await voiceSimulationService.handleGetNextDifficultyLevel(
            simulation.id,
            parameters.currentLevel || session.currentLevel,
            parameters.performanceScores
          );
          break;

        case 'get_question_count':
          result = await voiceSimulationService.handleGetQuestionCount(simulation.id);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: `Unknown function: ${functionName}`
          });
      }
    }

    console.log(`✅ Function call result for ${functionName}:`, result);

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error('❌ Error handling VAPI function call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Get available time slots for booking
router.get('/available-slots', (req, res, next) => {
  console.log('🔍 ROUTE DEBUG: /available-slots route hit');
  console.log('🔍 ROUTE DEBUG: Headers:', req.headers.authorization ? 'Present' : 'Missing');
  next();
}, authenticate, async (req, res) => {
  try {
    console.log('🔍 ROUTE DEBUG: Inside available-slots handler');
    const { startDate, endDate } = req.query;
    const language = I18nService.getLanguageFromRequest(req);

    let start: Date, end: Date;

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      // Default to next 7 days
      start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(9, 0, 0, 0);

      end = new Date();
      end.setDate(end.getDate() + 7);
      end.setHours(18, 0, 0, 0);
    }

    const availableSlots = await voiceSimulationService.findAvailableSlots(start, end);

    res.json({
      success: true,
      data: {
        slots: availableSlots,
        count: availableSlots.length
      },
      message: language === 'fr'
        ? `${availableSlots.length} créneaux disponibles trouvés`
        : `${availableSlots.length} available slots found`
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('Error getting available slots:', error);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de la recherche de créneaux'
        : 'Error finding available slots')
    });
  }
});

// Create immigration-specific VAPI assistant
router.post('/create-immigration-assistant', authenticate, async (req, res) => {
  try {
    const { voiceId, country, immigrationType, questions } = req.body;
    const language = I18nService.getLanguageFromRequest(req);

    if (!voiceId || !country || !immigrationType) {
      return res.status(400).json({
        success: false,
        message: language === 'fr'
          ? 'Paramètres manquants: voiceId, country, immigrationType requis'
          : 'Missing parameters: voiceId, country, immigrationType required'
      });
    }

    // Create immigration assistant using VAPI service
    const assistant = await vapiService.createImmigrationAssistant(
      voiceId,
      country,
      immigrationType,
      questions || [],
      language
    );

    res.json({
      success: true,
      data: assistant,
      message: language === 'fr'
        ? 'Assistant d\'immigration créé avec succès'
        : 'Immigration assistant created successfully'
    });
  } catch (error: any) {
    const language = I18nService.getLanguageFromRequest(req);
    console.error('Error creating immigration assistant:', error);
    res.status(400).json({
      success: false,
      message: error.message || (language === 'fr'
        ? 'Erreur lors de la création de l\'assistant'
        : 'Error creating assistant')
    });
  }
});

// Get a specific voice simulation (supports temporary token access)
// NOTE: This catch-all route MUST be placed AFTER all specific routes
router.get('/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;
    const userId = req.user.id;

    const result = await voiceSimulationService.getSimulation(simulationId, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// Start a voice simulation (supports temporary token access)
router.post('/start/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;

    const result = await voiceSimulationService.startSimulation(simulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// End a voice simulation (supports temporary token access)
router.post('/end/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;

    const result = await voiceSimulationService.endSimulation(simulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get a specific voice simulation (supports temporary token access)
// NOTE: This catch-all route MUST be placed AFTER all specific routes
router.get('/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;
    const userId = req.user.id;

    const result = await voiceSimulationService.getSimulation(simulationId, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// Start a voice simulation (supports temporary token access)
router.post('/start/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;

    const result = await voiceSimulationService.startSimulation(simulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// End a voice simulation (supports temporary token access)
router.post('/end/:simulationId', temporaryOrRegularAuth('voice'), async (req, res) => {
  try {
    const { simulationId } = req.params;

    const result = await voiceSimulationService.endSimulation(simulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get all sujets from question bank (where AI extracted content is stored)
router.get('/question-bank/sujets', async (req, res) => {
  try {
    // Get all question banks where AI extracted content is stored
    const questionBanks = await prisma.questionBank.findMany({
      where: {
        isActive: true,
        OR: [
          { category: 'GENERAL' }, // Voice simulation questions
          { category: 'IMMIGRATION' } // Immigration simulation questions (shared access)
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

    console.log(`📚 Found ${questionBanks.length} question banks for voice simulation (shared with immigration)`);

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

console.log('🔍 VOICE SIMULATION ROUTES: Exporting router with', router.stack.length, 'routes');

export default router;
