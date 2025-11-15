import { prisma } from '@/lib/prisma';
import vapiService from './vapiService';
import { EmailService } from './emailService';
import I18nService, { Language } from './i18nService';
import cron from 'node-cron';
import axios from 'axios';
const mistralApiManager = require('../utils/mistralApiManager');

interface BookingRequest {
  userId: string;
  bookingType: 'MANUAL' | 'AUTO';
  preferredDates?: Date[];
  voicePreference?: string; // Now accepts voice IDs like 'france_male_1', 'quebec_female_1', etc.
}

interface SimulationSession {
  simulationId: string;
  userId: string;
  assistantId: string;
  callId?: string;
  askedQuestions: Map<string, any>; // Track questions asked: questionId -> question data
  questionResponses: Map<string, any>; // Track responses: questionId -> {question, response, analysis}
  currentLevel: string; // Current difficulty level (A1, A2, B1, B2)
  questionCount: number; // Number of questions asked
  performanceScores: {
    fluency: number[];
    grammar: number[];
    vocabulary: number[];
    pronunciation: number[];
    coherence: number[];
  };
  startTime: Date;
}

class VoiceSimulationService {
  activeSessions: Map<string, SimulationSession> = new Map(); // Made public for cleanup access

  constructor() {
    this.initializeCronJobs();
  }

  // Book a voice simulation
  async bookSimulation(request: BookingRequest, language: Language = 'fr'): Promise<any> {
    try {
      // STRICT LIMIT ENFORCEMENT: Check simulation limit before creating
      const { checkSimulationLimit } = await import('./simulationLimitService');
      const limitCheck = await checkSimulationLimit(request.userId);

      if (!limitCheck.canCreate) {
        throw new Error(
          language === 'fr'
            ? limitCheck.error || `Vous avez atteint votre limite de simulations (${limitCheck.maxSimulations}). Veuillez attendre le prochain cycle de facturation.`
            : limitCheck.error || `You have reached your simulation limit (${limitCheck.maxSimulations}). Please wait for the next billing cycle.`
        );
      }

      let assignedDate: Date;

      if (request.bookingType === 'AUTO') {
        // Auto-assign next available slot
        assignedDate = await this.getNextAvailableSlot();
      } else {
        // Manual booking - use first preferred date or next available
        if (request.preferredDates && request.preferredDates.length > 0) {
          assignedDate = request.preferredDates[0];
        } else {
          assignedDate = await this.getNextAvailableSlot();
        }
      }

      // Create simulation booking
      const booking = await prisma.simulationBooking.create({
        data: {
          userId: request.userId,
          bookingType: request.bookingType || 'MANUAL', // Use the requested booking type
          preferredDates: request.preferredDates || [],
          assignedDate
        }
      });

      // Determine voice preference - use selected voice, saved preference, or random
      let voicePreference = request.voicePreference;
      
      if (!voicePreference) {
        // Try to load saved voice preference from user preferences
        const user = await prisma.user.findUnique({
          where: { id: request.userId },
          select: { preferences: true }
        });

        const preferences = (user?.preferences as any) || {};
        const savedVoicePreference = preferences?.voice?.voiceId;

        if (savedVoicePreference) {
          // Verify the saved voice still exists
          const { default: vapiService } = await import('./vapiService');
          const availableVoices = vapiService.getVoiceOptions();
          const voiceExists = availableVoices.some(v => v.id === savedVoicePreference);
          
          if (voiceExists) {
            voicePreference = savedVoicePreference;
            console.log('✅ Using saved voice preference:', savedVoicePreference);
          }
        }

        // If still no preference, use random voice
        if (!voicePreference) {
          const { default: vapiService } = await import('./vapiService');
          const availableVoices = vapiService.getVoiceOptions();
          const randomVoice = availableVoices[Math.floor(Math.random() * availableVoices.length)];
          voicePreference = randomVoice.id;
          console.log('🎲 Using random voice (no preference found):', voicePreference);
        }
      }

      // Extract gender from voice ID (voicePreference in schema is VoiceType enum: MALE/FEMALE)
      // Voice IDs are like 'france_male_1', 'quebec_female_1', etc.
      let voiceType: 'MALE' | 'FEMALE' = 'FEMALE'; // Default
      if (voicePreference) {
        const gender = voicePreference.toLowerCase().includes('male') ? 'MALE' : 'FEMALE';
        voiceType = gender;
      }
      
      // Store voice ID in questionsData for later use during simulation
      const questionsData = voicePreference ? { voiceId: voicePreference } : null;

      // Create voice simulation
      const simulation = await prisma.voiceSimulation.create({
        data: {
          userId: request.userId,
          scheduledDate: assignedDate,
          voicePreference: voiceType, // Store as VoiceType enum (MALE/FEMALE)
          questionsData: questionsData as any, // Store voice ID here for VAPI to use
          status: 'SCHEDULED',
          duration: 300 // 5 minutes in seconds
        }
      });

      // Get user data for confirmation email
      const user = await prisma.user.findUnique({
        where: { id: simulation.userId },
        select: {
          firstName: true,
          lastName: true,
          email: true
        }
      });

      // Send confirmation email
      if (user) {
        try {
          console.log('📧 Attempting to send booking confirmation email...', {
            simulationId: simulation.id,
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`
          });
          
          await this.sendBookingConfirmation({ ...simulation, user });
          
          console.log('✅ Booking confirmation email sent successfully', {
            simulationId: simulation.id,
            userEmail: user.email
          });
        } catch (emailError: any) {
          console.error('❌ CRITICAL: Error sending booking confirmation email:', {
            error: emailError?.message,
            stack: emailError?.stack,
            simulationId: simulation.id,
            userEmail: user.email,
            errorName: emailError?.name,
            errorCode: emailError?.code
          });
          
          // Try to send a simple fallback email
          try {
            console.log('🔄 Attempting fallback email send...');
            const { EmailService } = await import('./emailService');
            const fallbackSent = await EmailService.sendEmail({
              to: user.email,
              subject: 'Confirmation de votre simulation vocale TCF/TEF',
              html: `
                <h2>Confirmation de réservation</h2>
                <p>Bonjour ${user.firstName},</p>
                <p>Votre simulation vocale a été réservée avec succès.</p>
                <p><strong>Date:</strong> ${new Date(simulation.scheduledDate).toLocaleString('fr-FR')}</p>
                <p><strong>ID Simulation:</strong> ${simulation.id}</p>
                <p>Vous recevrez un rappel 30 minutes avant votre simulation.</p>
              `
            });
            
            if (fallbackSent) {
              console.log('✅ Fallback email sent successfully');
            } else {
              console.error('❌ Fallback email also failed');
            }
          } catch (fallbackError: any) {
            console.error('❌ Fallback email also failed:', fallbackError?.message);
          }
          
          // Don't fail the booking if email fails - just log the error
        }
      } else {
        console.warn('⚠️ User not found, cannot send booking confirmation email', {
          simulationId: simulation.id,
          userId: simulation.userId
        });
      }

      return {
        booking,
        simulation,
        message: 'Voice simulation booked successfully',
        voiceId: voicePreference // Return voice ID for frontend
      };
    } catch (error: any) {
      console.error('❌ Error booking simulation:', {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        stack: error?.stack,
        userId: request.userId,
        bookingType: request.bookingType,
        preferredDates: request.preferredDates
      });
      
      // Provide more detailed error message
      if (error?.code === 'P2002') {
        throw new Error('Une réservation existe déjà pour cette date et cette heure');
      }
      if (error?.code === 'P2003') {
        throw new Error('Données invalides pour la réservation');
      }
      if (error?.code === 'P2025') {
        throw new Error('Enregistrement non trouvé');
      }
      
      throw error;
    }
  }

  // Start a voice simulation session
  async startSimulation(simulationId: string): Promise<any> {
    try {
      // Use transaction to prevent race conditions when 800 users click simultaneously
      const result = await prisma.$transaction(async (tx) => {
        // Lock the simulation row and check status atomically
        const simulation = await tx.voiceSimulation.findUnique({
        where: { id: simulationId }
      });

      if (!simulation) {
        throw new Error('Simulation not found');
      }

        // Check status atomically - prevents race conditions
      if (simulation.status !== 'SCHEDULED') {
          throw new Error(`Simulation is not in scheduled status. Current status: ${simulation.status}`);
        }

        // Immediately update status to ACTIVE to prevent duplicate starts
        // This acts as a distributed lock for concurrent requests
        const updatedSimulation = await tx.voiceSimulation.update({
          where: { 
            id: simulationId,
            status: 'SCHEDULED' // Only update if still SCHEDULED (optimistic locking)
          },
          data: {
            status: 'ACTIVE' // Lock the simulation
          }
        });

        if (!updatedSimulation) {
          throw new Error('Simulation was already started by another request');
      }

        return { simulation: updatedSimulation };
      }, {
        timeout: 10000, // 10 second timeout for transaction
        isolationLevel: 'Serializable' // Highest isolation level to prevent race conditions
      });

      const simulation = result.simulation;

      // Get progressive questions organized by level and category (cached for performance)
      const progressiveQuestions = await vapiService.getProgressiveQuestions();

      // Get voice ID from questionsData (where we store the actual voice ID like 'france_male_1')
      // voicePreference in DB is just MALE/FEMALE enum, but actual voice ID is in questionsData
      let voiceId: string | undefined;
      if (simulation.questionsData && typeof simulation.questionsData === 'object') {
        const questionsData = simulation.questionsData as any;
        voiceId = questionsData.voiceId;
      }
      
      // If no voice ID in questionsData, get random voice matching the gender preference
      if (!voiceId || typeof voiceId !== 'string' || !voiceId.includes('_')) {
        const availableVoices = vapiService.getVoiceOptions();
        const genderPreference = simulation.voicePreference || 'FEMALE';
        
        // Filter voices by gender preference
        const matchingVoices = availableVoices.filter(v => 
          v.gender === genderPreference
        );
        
        // Use matching voice or random if none match
        const voicesToChoose = matchingVoices.length > 0 ? matchingVoices : availableVoices;
        const randomVoice = voicesToChoose[Math.floor(Math.random() * voicesToChoose.length)];
        voiceId = randomVoice.id;
        
        console.log(`🎲 Using ${matchingVoices.length > 0 ? 'gender-matched' : 'random'} voice:`, voiceId);
      }

      // Store full progressive questions structure in simulation data
      const questionsForStorage = {
        personalInfo: progressiveQuestions.personalInfo,
        byLevel: {
          A1: progressiveQuestions.byLevel.A1.slice(0, 10), // Store sample for reference
          A2: progressiveQuestions.byLevel.A2.slice(0, 10),
          B1: progressiveQuestions.byLevel.B1.slice(0, 10),
          B2: progressiveQuestions.byLevel.B2.slice(0, 10)
        },
        byCategory: Object.keys(progressiveQuestions.byCategory).reduce((acc, cat) => {
          acc[cat] = progressiveQuestions.byCategory[cat].slice(0, 10);
          return acc;
        }, {} as Record<string, any[]>)
      };

      // Create VAPI assistant with progressive questions structure
      // Wrap in try-catch to handle VAPI rate limits gracefully
      let assistant;
      let call;
      try {
        assistant = await vapiService.createFrenchAssistant(
          voiceId,
          progressiveQuestions
        );

        // Start VAPI call with retry logic for rate limits
        call = await vapiService.startVoiceSimulation(simulationId, assistant.id!);
      } catch (vapiError: any) {
        // If VAPI fails, revert simulation status to SCHEDULED
        await prisma.voiceSimulation.update({
          where: { id: simulationId },
          data: { status: 'SCHEDULED' }
        });
        
        // Re-throw with more context
        throw new Error(
          `Failed to start VAPI call: ${vapiError.message || 'Unknown error'}. ` +
          `This may be due to rate limiting. Please try again in a moment.`
        );
      }

      // Store session info with tracking
      const session: SimulationSession = {
        simulationId,
        userId: simulation.userId,
        assistantId: assistant.id!,
        callId: call.id,
        askedQuestions: new Map(),
        questionResponses: new Map(),
        currentLevel: 'A1', // Start with A1
        questionCount: 0,
        performanceScores: {
          fluency: [],
          grammar: [],
          vocabulary: [],
          pronunciation: [],
          coherence: []
        },
        startTime: new Date()
      };

      this.activeSessions.set(simulationId, session);

      // Update simulation with progressive questions data (status already ACTIVE from transaction)
      await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: {
          questionsData: questionsForStorage
          // Status is already ACTIVE from the transaction above
        }
      });

      return {
        simulation,
        call,
        assistant,
        questions: questionsForStorage,
        message: 'Voice simulation started successfully with progressive difficulty system'
      };
    } catch (error) {
      console.error('Error starting simulation:', error);
      throw error;
    }
  }

  // End a voice simulation session
  async endSimulation(simulationId: string): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      // End VAPI call
      if (session.callId) {
        await vapiService.endCall(session.callId);
      }

      // Process results
      const results = await vapiService.processCallResults(session.callId!, simulationId);

      // Remove from active sessions
      this.activeSessions.delete(simulationId);

      // Send results email
      await this.sendResultsEmail(results);

      return {
        results,
        message: 'Voice simulation completed successfully'
      };
    } catch (error) {
      console.error('Error ending simulation:', error);
      throw error;
    }
  }

  // Get a specific simulation
  async getSimulation(simulationId: string, userId: string): Promise<any> {
    try {
      // First check if simulation exists at all (for better error messages)
      const simulationExists = await prisma.voiceSimulation.findUnique({
        where: { id: simulationId },
        select: { id: true, userId: true }
      });

      if (!simulationExists) {
        console.error('❌ Simulation not found in database:', {
          simulationId,
          userId
        });
        throw new Error('Simulation not found');
      }

      // Check if userId matches
      if (simulationExists.userId !== userId) {
        console.error('❌ User ID mismatch:', {
          simulationId,
          simulationUserId: simulationExists.userId,
          requestUserId: userId
        });
        throw new Error('Access denied: This simulation belongs to a different user');
      }

      // Now fetch the full simulation with all data
      const simulation = await prisma.voiceSimulation.findFirst({
        where: {
          id: simulationId,
          userId: userId
        },
        include: {
          aiFeedbacks: {
            orderBy: {
              createdAt: 'desc'
            },
            select: {
              id: true,
              aiScore: true,
              aiConfidence: true,
              overallFeedback: true,
              strengths: true,
              weaknesses: true,
              recommendations: true,
              status: true,
              createdAt: true,
              humanScore: true,
              humanFeedback: true
            }
          }
        }
      });

      if (!simulation) {
        throw new Error('Simulation not found or access denied');
      }

      return simulation;
    } catch (error) {
      console.error('Error getting simulation:', error);
      throw error;
    }
  }

  // Get user's simulation history
  async getUserSimulations(userId: string): Promise<any> {
    try {
      console.log('📋 getUserSimulations: Fetching simulations for user:', userId);
      
      // Fetch simulations ordered by scheduledDate, with createdAt as fallback
      const simulations = await prisma.voiceSimulation.findMany({
        where: { userId },
        orderBy: { scheduledDate: 'desc' },
        include: {
          aiFeedbacks: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1, // Only get the most recent feedback
            select: {
              id: true,
              aiScore: true,
              aiConfidence: true,
              overallFeedback: true,
              strengths: true,
              weaknesses: true,
              recommendations: true,
              status: true,
              createdAt: true,
              humanScore: true,
              humanFeedback: true
            }
          }
        }
      });

      // Sort by scheduledDate first, then by createdAt for items with null scheduledDate
      simulations.sort((a, b) => {
        const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
        const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
        
        if (dateA !== dateB) {
          return dateB - dateA; // Descending order
        }
        
        // If scheduledDate is the same or both null, sort by createdAt
        const createdA = new Date(a.createdAt).getTime();
        const createdB = new Date(b.createdAt).getTime();
        return createdB - createdA; // Descending order
      });

      console.log('📋 getUserSimulations: Found simulations:', {
        count: simulations.length,
        simulations: simulations.map((s: any) => ({
          id: s.id,
          scheduledDate: s.scheduledDate,
          status: s.status,
          createdAt: s.createdAt,
          hasFeedback: s.aiFeedbacks?.length > 0
        }))
      });

      const bookings = await prisma.simulationBooking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      console.log('📋 getUserSimulations: Found bookings:', bookings.length);

      return {
        simulations,
        bookings,
        monthlyCount: await this.getMonthlySimulationCount(userId)
      };
    } catch (error) {
      console.error('❌ Error getting user simulations:', error);
      throw error;
    }
  }

  // Get next available time slot within 7 days
  private async getNextAvailableSlot(): Promise<Date> {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Start at 9 AM

    // Set 7-day limit
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 7);
    maxDate.setHours(17, 0, 0, 0); // End at 5 PM on the 7th day

    // Find next available slot within 7 days
    let candidateDate = new Date(tomorrow);

    while (candidateDate <= maxDate) {
      // Skip weekends
      if (candidateDate.getDay() === 0 || candidateDate.getDay() === 6) {
        candidateDate.setDate(candidateDate.getDate() + 1);
        candidateDate.setHours(9, 0, 0, 0);
        continue;
      }

      // Check if slot is available (max 10 simulations per hour)
      const hourStart = new Date(candidateDate);
      const hourEnd = new Date(candidateDate);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const existingCount = await prisma.voiceSimulation.count({
        where: {
          scheduledDate: {
            gte: hourStart,
            lt: hourEnd
          },
          status: {
            in: ['SCHEDULED', 'ACTIVE'] // Only count active bookings
          }
        }
      });

      if (existingCount < 10) {
        return candidateDate;
      }

      // Move to next hour
      candidateDate.setHours(candidateDate.getHours() + 1);

      // If past business hours (6 PM), move to next day
      if (candidateDate.getHours() >= 18) {
        candidateDate.setDate(candidateDate.getDate() + 1);
        candidateDate.setHours(9, 0, 0, 0);
      }
    }

    // If no slot found within 7 days, throw error
    throw new Error('Aucun créneau disponible dans les 7 prochains jours. Veuillez réessayer plus tard.');
  }

  // Find available slots for a specific date range (enhanced method)
  async findAvailableSlots(startDate: Date, endDate: Date): Promise<Date[]> {
    const availableSlots: Date[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(9, 0, 0, 0);
        continue;
      }

      // Check each hour from 9 AM to 6 PM
      for (let hour = 9; hour < 18; hour++) {
        const slotTime = new Date(currentDate);
        slotTime.setHours(hour, 0, 0, 0);

        const hourStart = new Date(slotTime);
        const hourEnd = new Date(slotTime);
        hourEnd.setHours(hourEnd.getHours() + 1);

        const existingCount = await prisma.voiceSimulation.count({
          where: {
            scheduledDate: {
              gte: hourStart,
              lt: hourEnd
            },
            status: {
              in: ['SCHEDULED', 'ACTIVE']
            }
          }
        });

        if (existingCount < 10) {
          availableSlots.push(new Date(slotTime));
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
    }

    return availableSlots;
  }

  // Get monthly simulation count for user
  // IMPORTANT: Only count valid sessions (sessions with AIFeedback)
  // PRO/PREMIUM users: Maximum 2 feedbacks (2 valid sessions) per month
  private async getMonthlySimulationCount(userId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Count only valid sessions (sessions with AIFeedback)
    // Only count COMPLETED sessions with AI feedback - these are the only valid ones
    return await prisma.voiceSimulation.count({
      where: {
        userId,
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
  }

  // Send booking confirmation email with secure access link
  private async sendBookingConfirmation(simulation: any): Promise<void> {
    try {
      console.log('📧 Preparing to send booking confirmation email...', {
        simulationId: simulation.id,
        userEmail: simulation.user?.email,
        hasUser: !!simulation.user
      });

      if (!simulation.user || !simulation.user.email) {
        throw new Error('User email is missing - cannot send confirmation email');
      }

      // Générer un token temporaire sécurisé pour l'accès à la simulation
      // Token expires 2 minutes after simulation ends (when student/AI hangs up)
      let simulationUrl: string | undefined;
      try {
        const { default: TemporaryTokenService } = await import('./temporaryTokenService');
        
        // Calculate estimated simulation end time (scheduledDate + duration)
        const scheduledDate = new Date(simulation.scheduledDate);
        const durationInSeconds = simulation.duration || 300; // 5 minutes default
        const estimatedEndTime = new Date(scheduledDate.getTime() + durationInSeconds * 1000);
        
        // Token should be valid until 2 minutes after simulation ends
        const now = new Date();
        const hoursUntilEstimatedEnd = Math.max(1, (estimatedEndTime.getTime() - now.getTime()) / (1000 * 60 * 60) + (2 / 60)); // Add 2 minutes buffer
        
        const temporaryToken = await TemporaryTokenService.generateToken(
          simulation.userId,
          simulation.id,
          'voice',
          hoursUntilEstimatedEnd
        );

        // Créer le lien d'accès sécurisé avec token
        simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/simulation-vocale/${simulation.id}?token=${temporaryToken}`;
        console.log('✅ Temporary token generated for simulation access');
      } catch (tokenError: any) {
        console.warn('⚠️ Could not generate temporary token, using simple URL:', tokenError?.message);
        // Fallback to simple URL without token
        simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/simulation-vocale/${simulation.id}`;
      }

      // Get actual voice name from voice ID stored in questionsData
      let voiceDisplayName = simulation.voicePreference === 'MALE' ? 'Voix masculine' : 'Voix féminine';
      if (simulation.questionsData && typeof simulation.questionsData === 'object') {
        const questionsData = simulation.questionsData as any;
        const voiceId = questionsData.voiceId;
        if (voiceId) {
          try {
            // Get voice name from vapiService
            const { default: vapiService } = await import('./vapiService');
            const availableVoices = vapiService.getVoiceOptions();
            const voice = availableVoices.find((v: any) => v.id === voiceId);
            if (voice) {
              voiceDisplayName = voice.name;
            }
          } catch (voiceError) {
            console.warn('⚠️ Could not get voice name, using default:', voiceError);
          }
        }
      }

      const emailData = {
        firstName: simulation.user.firstName || 'Utilisateur',
        email: simulation.user.email,
        scheduledDate: new Date(simulation.scheduledDate),
        voicePreference: voiceDisplayName,
        duration: '5 minutes',
        simulationId: simulation.id,
        accessUrl: simulationUrl
      };

      console.log('📧 Sending booking confirmation email to:', emailData.email);
      console.log('📧 Email data prepared:', {
        email: emailData.email,
        firstName: emailData.firstName,
        scheduledDate: emailData.scheduledDate.toISOString(),
        simulationId: emailData.simulationId,
        hasAccessUrl: !!emailData.accessUrl,
        voicePreference: emailData.voicePreference
      });
      
      // Use EmailService (already imported at top of file)
      const emailSent = await EmailService.sendVoiceSimulationBookingEmail(emailData);
      
      if (emailSent) {
        console.log('✅ Booking confirmation email sent successfully to:', emailData.email);
        console.log('✅ Email sent with message ID (check logs for details)');
      } else {
        console.error('❌ CRITICAL: Email service returned false - email was NOT sent!');
        console.error('❌ Email data that failed:', JSON.stringify(emailData, null, 2));
        throw new Error('Email service returned false - email was not sent');
      }
    } catch (error: any) {
      console.error('❌ Error sending booking confirmation email:', {
        error: error?.message,
        stack: error?.stack,
        simulationId: simulation.id,
        userEmail: simulation.user?.email,
        errorName: error?.name,
        errorCode: error?.code
      });
      throw error; // Re-throw to let caller handle
    }
  }

  // Send results email
  private async sendResultsEmail(simulation: any): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: simulation.userId }
      });

      if (!user) return;

      const emailData = {
        firstName: user.firstName,
        email: user.email,
        overallScore: simulation.overallScore,
        fluencyScore: simulation.fluencyScore,
        grammarScore: simulation.grammarScore,
        vocabularyScore: simulation.vocabularyScore,
        pronunciationScore: simulation.pronunciationScore,
        coherenceScore: simulation.coherenceScore,
        feedback: simulation.feedback,
        completedAt: simulation.updatedAt
      };

      await EmailService.sendVoiceSimulationResultsEmail(emailData);
    } catch (error) {
      console.error('Error sending results email:', error);
    }
  }

  // Initialize cron jobs for notifications and cleanup
  private initializeCronJobs(): void {
    // Send reminder emails 30 minutes before simulation
    cron.schedule('*/5 * * * *', async () => {
      try {
        const thirtyMinutesFromNow = new Date();
        thirtyMinutesFromNow.setMinutes(thirtyMinutesFromNow.getMinutes() + 30);

        const upcomingSimulations = await prisma.voiceSimulation.findMany({
          where: {
            scheduledDate: {
              lte: thirtyMinutesFromNow,
              gte: new Date()
            },
            status: 'SCHEDULED',
            notificationSent: false
          }
        });

        for (const simulation of upcomingSimulations) {
          // Get user data separately
          const user = await prisma.user.findUnique({
            where: { id: simulation.userId },
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          });

          if (user) {
            await this.sendReminderEmail({ ...simulation, user });
          }

          await prisma.voiceSimulation.update({
            where: { id: simulation.id },
            data: { notificationSent: true }
          });
        }
      } catch (error) {
        console.error('Error in reminder cron job:', error);
      }
    });

    // Mark sessions as EXPIRED when scheduledDate passes (runs every hour)
    cron.schedule('0 * * * *', async () => {
      await this.markExpiredSessions();
    });

    // Also run immediately on startup to catch any expired sessions
    this.markExpiredSessions().catch(error => {
      console.error('Error marking expired sessions on startup:', error);
    });
  }

  // Mark all expired sessions (SCHEDULED sessions where scheduledDate has passed)
  async markExpiredSessions(): Promise<{ scheduled: number; active: number }> {
      try {
        const now = new Date();
        
      // Find SCHEDULED sessions where scheduledDate has passed - use batch update for better performance
      const scheduledExpiredCount = await prisma.voiceSimulation.updateMany({
          where: {
            status: 'SCHEDULED',
            scheduledDate: {
              lt: now // scheduledDate is in the past
            }
        },
        data: { 
          status: 'EXPIRED' as any 
        }
          });

      console.log(`✅ Marked ${scheduledExpiredCount.count} SCHEDULED simulation(s) as EXPIRED`);

        // Also cleanup ACTIVE sessions that are past their scheduled time + duration
      const activeExpiredCount = await prisma.voiceSimulation.updateMany({
          where: {
            status: 'ACTIVE',
            scheduledDate: {
              lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
            }
        },
        data: { 
          status: 'EXPIRED' as any 
          }
        });

      // Clean up active sessions map
      if (activeExpiredCount.count > 0) {
        const activeExpired = await prisma.voiceSimulation.findMany({
          where: {
            status: 'EXPIRED',
            scheduledDate: {
              lt: new Date(Date.now() - 30 * 60 * 1000)
            }
          },
          select: { id: true }
          });
        
        activeExpired.forEach(sim => {
          this.activeSessions.delete(sim.id);
        });
      }

      console.log(`✅ Marked ${activeExpiredCount.count} ACTIVE simulation(s) as EXPIRED`);

      return {
        scheduled: scheduledExpiredCount.count,
        active: activeExpiredCount.count
      };
      } catch (error) {
      console.error('Error marking expired sessions:', error);
      throw error;
      }
  }

  // Send reminder email
  private async sendReminderEmail(simulation: any): Promise<void> {
    try {
      const simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/voice-simulation/${simulation.id}`;

      const emailData = {
        firstName: simulation.user.firstName,
        email: simulation.user.email,
        scheduledDate: new Date(simulation.scheduledDate),
        simulationId: simulation.id,
        userId: simulation.userId
      };

      await EmailService.sendVoiceSimulationReminderEmail(emailData);
      console.log(`Reminder email sent to ${simulation.user.email} for simulation ${simulation.id}`);
    } catch (error) {
      console.error('Error sending reminder email:', error);
    }
  }

  // Get active session
  getActiveSession(simulationId: string): SimulationSession | undefined {
    return this.activeSessions.get(simulationId);
  }

  // Handle fetch_next_question function call
  async handleFetchNextQuestion(
    simulationId: string,
    level: string,
    category?: string,
    excludeQuestionIds: string[] = []
  ): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      // Fetch questions from question bank
      const questions = await vapiService.getRandomQuestions(level, 20); // Get more options

      // Filter by category if specified
      let filteredQuestions = questions;
      if (category) {
        filteredQuestions = questions.filter((q: any) => {
          const qCategory = (q.category || 'GENERAL').toString();
          return qCategory === category;
        });
      }

      // Exclude already asked questions
      const availableQuestions = filteredQuestions.filter((q: any) => {
        const qId = q.id || q.questionId || JSON.stringify(q);
        return !excludeQuestionIds.includes(qId) && !session.askedQuestions.has(qId);
      });

      if (availableQuestions.length === 0) {
        // If no questions available at this level/category, try other levels
        const allQuestions = await vapiService.getProgressiveQuestions();
        const levelQuestions = allQuestions.byLevel[level as 'A1' | 'A2' | 'B1' | 'B2'] || [];
        const fallbackQuestions = levelQuestions.filter((q: any) => {
          const qId = q.id || q.questionId || JSON.stringify(q);
          return !excludeQuestionIds.includes(qId) && !session.askedQuestions.has(qId);
        });
        
        if (fallbackQuestions.length > 0) {
          const selectedQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
          return {
            question: selectedQuestion.question || selectedQuestion.text || selectedQuestion.questionText || '',
            questionId: selectedQuestion.id || selectedQuestion.questionId || JSON.stringify(selectedQuestion),
            level: selectedQuestion.level || level,
            category: selectedQuestion.category || category || 'GENERAL',
            availableCount: fallbackQuestions.length
          };
        }
      }

      const selectedQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
      
      // Mark as asked
      const questionId = selectedQuestion.id || selectedQuestion.questionId || JSON.stringify(selectedQuestion);
      session.askedQuestions.set(questionId, {
        question: selectedQuestion.question || selectedQuestion.text || selectedQuestion.questionText,
        level: selectedQuestion.level || level,
        category: selectedQuestion.category || category || 'GENERAL',
        timestamp: new Date()
      });
      session.questionCount++;

      return {
        question: selectedQuestion.question || selectedQuestion.text || selectedQuestion.questionText || '',
        questionId: questionId,
        level: selectedQuestion.level || level,
        category: selectedQuestion.category || category || 'GENERAL',
        availableCount: availableQuestions.length
      };
    } catch (error) {
      console.error('Error fetching next question:', error);
      throw error;
    }
  }

  // Handle store_question_response function call
  async handleStoreQuestionResponse(
    simulationId: string,
    questionId: string,
    questionText: string,
    questionLevel: string,
    questionCategory: string | undefined,
    studentResponse: string,
    timestamp?: string
  ): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      // Store question-response pair
      const responseData = {
        questionId,
        questionText,
        questionLevel: questionLevel || session.currentLevel,
        questionCategory: questionCategory || 'GENERAL',
        studentResponse,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      };

      session.questionResponses.set(questionId, responseData);

      // Update simulation data in database
      const currentQuestionsData = (session as any).questionsData || {};
      if (!currentQuestionsData.responses) {
        currentQuestionsData.responses = [];
      }
      
      currentQuestionsData.responses.push(responseData);
      
      await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: {
          questionsData: currentQuestionsData
        }
      });

      console.log(`✅ Stored question-response: ${questionId}`);

      return {
        success: true,
        message: 'Question-response stored successfully',
        questionId,
        responseCount: session.questionResponses.size
      };
    } catch (error) {
      console.error('Error storing question-response:', error);
      throw error;
    }
  }

  // Handle analyze_response function call
  async handleAnalyzeResponse(
    simulationId: string,
    questionId: string,
    studentResponse: string,
    questionLevel: string,
    conversationContext?: string
  ): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      // Perform real-time analysis using Mistral AI
      const analysis = await this.analyzeResponseRealTime(
        studentResponse,
        questionLevel,
        conversationContext
      );

      // Store analysis in session
      const responseData = session.questionResponses.get(questionId);
      if (responseData) {
        responseData.analysis = analysis;
        session.questionResponses.set(questionId, responseData);
      }

      // Update performance scores
      session.performanceScores.fluency.push(analysis.fluencyScore);
      session.performanceScores.grammar.push(analysis.grammarScore);
      session.performanceScores.vocabulary.push(analysis.vocabularyScore);
      session.performanceScores.pronunciation.push(analysis.pronunciationScore);
      session.performanceScores.coherence.push(analysis.coherenceScore);

      // Update current level based on performance
      const avgScore = (
        analysis.fluencyScore +
        analysis.grammarScore +
        analysis.vocabularyScore +
        analysis.pronunciationScore +
        analysis.coherenceScore
      ) / 5;

      if (avgScore >= 75 && session.currentLevel === 'A1') {
        session.currentLevel = 'A2';
      } else if (avgScore >= 75 && session.currentLevel === 'A2') {
        session.currentLevel = 'B1';
      } else if (avgScore >= 80 && session.currentLevel === 'B1') {
        session.currentLevel = 'B2';
      } else if (avgScore < 50 && session.currentLevel !== 'A1') {
        // Downgrade if performance is poor
        const levels = ['A1', 'A2', 'B1', 'B2'];
        const currentIndex = levels.indexOf(session.currentLevel);
        if (currentIndex > 0) {
          session.currentLevel = levels[currentIndex - 1];
        }
      }

      console.log(`✅ Analyzed response: ${questionId}`, { 
        avgScore: avgScore.toFixed(1),
        newLevel: session.currentLevel 
      });

      return {
        success: true,
        analysis: {
          fluencyScore: analysis.fluencyScore,
          grammarScore: analysis.grammarScore,
          vocabularyScore: analysis.vocabularyScore,
          pronunciationScore: analysis.pronunciationScore,
          coherenceScore: analysis.coherenceScore,
          overallScore: analysis.overallScore,
          strengths: analysis.strengths || [],
          weaknesses: analysis.weaknesses || [],
          recommendations: analysis.recommendations || [],
          suggestedNextLevel: session.currentLevel
        }
      };
    } catch (error) {
      console.error('Error analyzing response:', error);
      throw error;
    }
  }

  // Handle get_next_difficulty_level function call
  async handleGetNextDifficultyLevel(
    simulationId: string,
    currentLevel: string,
    performanceScores: any
  ): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      const levels = ['A1', 'A2', 'B1', 'B2'];
      const currentIndex = levels.indexOf(currentLevel);
      
      // Calculate average score
      const avgScore = (
        (performanceScores.fluency || 0) +
        (performanceScores.grammar || 0) +
        (performanceScores.vocabulary || 0) +
        (performanceScores.pronunciation || 0) +
        (performanceScores.coherence || 0)
      ) / 5;

      let nextLevel = currentLevel;
      
      // Progressive difficulty logic
      if (avgScore >= 80 && currentIndex < levels.length - 1) {
        nextLevel = levels[currentIndex + 1]; // Increase difficulty
      } else if (avgScore >= 65 && currentIndex < levels.length - 1) {
        nextLevel = levels[currentIndex + 1]; // Moderate increase
      } else if (avgScore < 50 && currentIndex > 0) {
        nextLevel = levels[currentIndex - 1]; // Decrease difficulty
      }

      session.currentLevel = nextLevel;

      return {
        nextLevel,
        currentLevel,
        averageScore: avgScore.toFixed(1),
        recommendation: avgScore >= 75 
          ? 'Augmenter la difficulté'
          : avgScore < 50 
          ? 'Maintenir ou diminuer la difficulté'
          : 'Maintenir la difficulté actuelle'
      };
    } catch (error) {
      console.error('Error determining next difficulty level:', error);
      throw error;
    }
  }

  // Handle get_question_count function call
  async handleGetQuestionCount(simulationId: string): Promise<any> {
    try {
      const session = this.activeSessions.get(simulationId);
      if (!session) {
        throw new Error('Active session not found');
      }

      const elapsedTime = (new Date().getTime() - session.startTime.getTime()) / 1000; // seconds
      const remainingTime = 300 - elapsedTime; // 5 minutes = 300 seconds
      const timePerQuestion = elapsedTime / session.questionCount || 30;
      const estimatedQuestionsRemaining = Math.floor(remainingTime / Math.max(timePerQuestion, 15));
      const targetQuestions = 8; // Minimum target
      const maxQuestions = 12; // Maximum target

      return {
        questionCount: session.questionCount,
        elapsedTime: Math.round(elapsedTime),
        remainingTime: Math.round(remainingTime),
        estimatedQuestionsRemaining,
        shouldAskMore: session.questionCount < targetQuestions,
        isOnTrack: session.questionCount >= targetQuestions && session.questionCount <= maxQuestions,
        recommendation: session.questionCount < targetQuestions
          ? `Posez plus de questions rapidement. Objectif: ${targetQuestions} questions minimum.`
          : session.questionCount >= maxQuestions
          ? 'Vous avez atteint le nombre maximum recommandé de questions.'
          : `Continuez au rythme actuel. Objectif: ${maxQuestions} questions maximum.`
      };
    } catch (error) {
      console.error('Error getting question count:', error);
      throw error;
    }
  }

  // Real-time response analysis using Mistral AI
  private async analyzeResponseRealTime(
    studentResponse: string,
    questionLevel: string,
    conversationContext?: string
  ): Promise<any> {
    try {
      const systemPrompt = 'Tu es un expert en évaluation de français pour les tests TCF/TEF/FLS/FLE. Analyse les réponses en temps réel et fournis des évaluations précises et constructives. Réponds UNIQUEMENT avec un JSON valide, sans texte supplémentaire.';

      const analysisPrompt = `
Analysez cette réponse d'un candidat à une question de niveau ${questionLevel} en français et fournissez une évaluation détaillée en temps réel.

RÉPONSE DU CANDIDAT:
${studentResponse}

${conversationContext ? `CONTEXTE DE LA CONVERSATION:\n${conversationContext}\n` : ''}

Évaluez selon ces 5 critères (score de 0 à 100 pour chaque):

1. FLUIDITÉ: Capacité à parler sans hésitations excessives, rythme naturel, aisance
2. GRAMMAIRE: Correction grammaticale, structures complexes, accords
3. VOCABULAIRE: Richesse, précision, registre approprié, variété lexicale
4. PRONONCIATION: Clarté, accent, intonation (basé sur la transcription)
5. COHÉRENCE: Logique du discours, organisation des idées, pertinence

Fournissez également:
- Forces (points forts) - liste de 2-3 points
- Faiblesses (points à améliorer) - liste de 2-3 points
- Recommandations spécifiques - 2-3 recommandations concrètes

RÉPONDEZ UNIQUEMENT avec un JSON dans ce format exact:
{
  "overallScore": number,
  "fluencyScore": number,
  "grammarScore": number,
  "vocabularyScore": number,
  "pronunciationScore": number,
  "coherenceScore": number,
  "strengths": ["force 1", "force 2", "force 3"],
  "weaknesses": ["faiblesse 1", "faiblesse 2", "faiblesse 3"],
  "recommendations": ["recommandation 1", "recommandation 2", "recommandation 3"],
  "feedback": "Commentaire constructif et encourageant en français"
}`;

      console.log('🤖 Using Mistral AI for voice simulation analysis...');
      
      const analysisText = await mistralApiManager.generateContent(analysisPrompt, {
        systemPrompt: systemPrompt,
        model: 'mistral-small-latest',
        temperature: 0.3,
        maxTokens: 800
      });

      // Clean the response - remove markdown code blocks if present
      let cleanedText = analysisText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/```\n?/g, '');
      }

      // Parse JSON response
      const analysis = JSON.parse(cleanedText);

      // Validate required fields
      if (!analysis.overallScore || !analysis.fluencyScore || !analysis.grammarScore ||
          !analysis.vocabularyScore || !analysis.pronunciationScore || !analysis.coherenceScore) {
        throw new Error('Invalid analysis response structure from Mistral AI');
      }

      console.log('✅ Mistral AI analysis completed successfully');
      return analysis;
    } catch (error: any) {
      console.error('❌ Error in real-time analysis with Mistral AI:', error);
      
      // Try to extract JSON from error response if possible
      if (error.message && error.message.includes('JSON')) {
        try {
          const jsonMatch = error.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            console.log('✅ Extracted JSON from error response');
            return analysis;
          }
        } catch (parseError) {
          console.warn('⚠️ Could not parse JSON from error response');
        }
      }
      
      // Return default analysis if error
      return {
        overallScore: 50,
        fluencyScore: 50,
        grammarScore: 50,
        vocabularyScore: 50,
        pronunciationScore: 50,
        coherenceScore: 50,
        strengths: ['Analyse en cours...'],
        weaknesses: ['Analyse en cours...'],
        recommendations: ['Analyse en cours...'],
        feedback: 'Analyse en cours de traitement...'
      };
    }
  }

  // Cancel a voice simulation
  async cancelSimulation(simulationId: string, userId: string, language: Language = 'fr'): Promise<any> {
    try {
      console.log('🗑️ cancelSimulation called:', {
        simulationId,
        userId,
        simulationIdType: typeof simulationId,
        simulationIdLength: simulationId?.length,
        userIdType: typeof userId
      });
      
      // Clean IDs (remove whitespace if any)
      const cleanSimulationId = simulationId?.trim();
      const cleanUserId = userId?.trim();
      
      console.log('🔍 Cleaned IDs:', {
        simulationId: cleanSimulationId,
        userId: cleanUserId
      });
      
      // Find the simulation - try with cleaned IDs
      let simulation = await prisma.voiceSimulation.findFirst({
        where: { 
          id: cleanSimulationId, 
          userId: cleanUserId 
        }
      });

      // If not found, try original IDs
      if (!simulation) {
        simulation = await prisma.voiceSimulation.findFirst({
        where: { id: simulationId, userId }
        });
      }

      console.log('🔍 Simulation lookup result:', {
        found: !!simulation,
        simulationId: cleanSimulationId,
        userId: cleanUserId,
        triedOriginalIds: !simulation
      });

      if (!simulation) {
        // Try to find it without userId check to see if ID exists at all
        const anySimulation = await prisma.voiceSimulation.findUnique({
          where: { id: cleanSimulationId || simulationId },
          select: {
            id: true,
            userId: true,
            status: true
          }
        });
        
        console.log('🔍 Simulation exists (any user):', {
          found: !!anySimulation,
          simulationId: cleanSimulationId || simulationId,
          actualUserId: anySimulation?.userId,
          actualUserIdType: typeof anySimulation?.userId,
          actualUserIdLength: anySimulation?.userId?.length,
          requestedUserId: cleanUserId || userId,
          requestedUserIdType: typeof (cleanUserId || userId),
          requestedUserIdLength: (cleanUserId || userId)?.length,
          belongsToUser: anySimulation?.userId === cleanUserId || anySimulation?.userId === userId,
          userIdsMatch: anySimulation?.userId === cleanUserId || anySimulation?.userId === userId,
          exactComparison: anySimulation?.userId === (cleanUserId || userId),
          stringComparison: String(anySimulation?.userId) === String(cleanUserId || userId)
        });
        
        if (anySimulation) {
          const errorMessage = language === 'fr'
            ? `Cette simulation appartient à un autre utilisateur. Simulation: ${anySimulation.userId}, Token: ${cleanUserId || userId}`
            : `This simulation belongs to another user. Simulation: ${anySimulation.userId}, Token: ${cleanUserId || userId}`;
          console.log('❌ SIMULATION FOUND BUT USER ID MISMATCH!');
          console.log('   Simulation belongs to:', anySimulation.userId);
          console.log('   Token claims userId:', cleanUserId || userId);
          console.log('   This means the user is trying to cancel a simulation they don\'t own!');
          throw new Error(errorMessage);
        }
        
        throw new Error(I18nService.t('voice.simulation_not_found', language));
      }

      if (simulation.status === 'COMPLETED' || simulation.status === 'CANCELLED') {
        throw new Error(language === 'fr'
          ? 'Cette simulation ne peut pas être annulée'
          : 'This simulation cannot be cancelled');
      }

      // Update simulation status
      const updatedSimulation = await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date()
        }
      });

      // Send cancellation email
      await this.sendCancellationEmail(simulation, language);

      return updatedSimulation;
    } catch (error) {
      console.error('Error cancelling simulation:', error);
      throw error;
    }
  }

  // Reschedule a voice simulation
  async rescheduleSimulation(
    simulationId: string,
    userId: string,
    newDate: Date,
    voicePreference?: string,
    language: Language = 'fr'
  ): Promise<any> {
    try {
      console.log('📅 rescheduleSimulation called:', {
        simulationId,
        userId,
        newDate: newDate.toISOString(),
        simulationIdType: typeof simulationId,
        simulationIdLength: simulationId?.length,
        userIdType: typeof userId
      });
      
      // Clean IDs (remove whitespace if any)
      const cleanSimulationId = simulationId?.trim();
      const cleanUserId = userId?.trim();
      
      console.log('🔍 Cleaned IDs (reschedule):', {
        simulationId: cleanSimulationId,
        userId: cleanUserId
      });
      
      // Find the simulation - try with cleaned IDs
      let simulation = await prisma.voiceSimulation.findFirst({
        where: { 
          id: cleanSimulationId, 
          userId: cleanUserId 
        }
      });

      // If not found, try original IDs
      if (!simulation) {
        simulation = await prisma.voiceSimulation.findFirst({
        where: { id: simulationId, userId }
        });
      }

      console.log('🔍 Simulation lookup result (reschedule):', {
        found: !!simulation,
        simulationId: cleanSimulationId,
        userId: cleanUserId,
        triedOriginalIds: !simulation
      });

      if (!simulation) {
        // Try to find it without userId check to see if ID exists at all
        const anySimulation = await prisma.voiceSimulation.findUnique({
          where: { id: cleanSimulationId || simulationId }
        });
        
        console.log('🔍 Simulation exists (any user) - reschedule:', {
          found: !!anySimulation,
          belongsToUser: anySimulation?.userId === cleanUserId || anySimulation?.userId === userId,
          actualUserId: anySimulation?.userId,
          requestedUserId: cleanUserId || userId,
          userIdsMatch: anySimulation?.userId === cleanUserId || anySimulation?.userId === userId
        });
        
        throw new Error(I18nService.t('voice.simulation_not_found', language));
      }

      // Allow rescheduling for SCHEDULED, ACTIVE, and EXPIRED sessions
      // Only block COMPLETED and CANCELLED (not EXPIRED)
      if (simulation.status === 'COMPLETED' || simulation.status === 'CANCELLED') {
        throw new Error(language === 'fr'
          ? 'Cette simulation ne peut pas être reprogrammée'
          : 'This simulation cannot be rescheduled');
      }

      // Check if new date is available
      const isAvailable = await this.isSlotAvailable(newDate);
      if (!isAvailable) {
        throw new Error(language === 'fr'
          ? 'Ce créneau n\'est pas disponible'
          : 'This time slot is not available');
      }

      // Update simulation - if it was EXPIRED, change status to SCHEDULED
      const updateData: any = {
        scheduledDate: newDate,
        updatedAt: new Date()
      };

      // If simulation was EXPIRED, change status to SCHEDULED
      if (simulation.status === 'EXPIRED') {
        updateData.status = 'SCHEDULED';
      }

      if (voicePreference) {
        updateData.voicePreference = voicePreference;
      }

      const updatedSimulation = await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: updateData
      });

      // Send rescheduling confirmation email
      await this.sendReschedulingEmail(updatedSimulation, language);

      return updatedSimulation;
    } catch (error) {
      console.error('Error rescheduling simulation:', error);
      throw error;
    }
  }

  // Check if a time slot is available
  private async isSlotAvailable(date: Date): Promise<boolean> {
    const hourStart = new Date(date);
    hourStart.setMinutes(0, 0, 0);

    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const existingCount = await prisma.voiceSimulation.count({
      where: {
        scheduledDate: {
          gte: hourStart,
          lt: hourEnd
        },
        status: {
          in: ['SCHEDULED', 'ACTIVE']
        }
      }
    });

    return existingCount < 10; // Max 10 simulations per hour
  }

  // Send cancellation email
  private async sendCancellationEmail(simulation: any, language: Language): Promise<void> {
    try {
      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: simulation.userId },
        select: { firstName: true, email: true }
      });

      if (user) {
        // This would be implemented in EmailService
        console.log(`Cancellation email would be sent to ${user.email}`);
      }
    } catch (error) {
      console.error('Error sending cancellation email:', error);
    }
  }

  // Send rescheduling email
  private async sendReschedulingEmail(simulation: any, language: Language): Promise<void> {
    let user: { firstName: string; email: string } | null = null;
    try {
      // Get user info
      user = await prisma.user.findUnique({
        where: { id: simulation.userId },
        select: { firstName: true, email: true }
      });

      if (!user) {
        console.warn('⚠️ User not found, cannot send rescheduling email');
        return;
      }

      // Generate temporary token for new access link
      const { default: TemporaryTokenService } = await import('./temporaryTokenService');
      const scheduledDate = new Date(simulation.scheduledDate);
      const durationInSeconds = simulation.duration || 300;
      const estimatedEndTime = new Date(scheduledDate.getTime() + durationInSeconds * 1000);
      const now = new Date();
      const hoursUntilEstimatedEnd = Math.max(1, (estimatedEndTime.getTime() - now.getTime()) / (1000 * 60 * 60) + (2 / 60));
      
      const temporaryToken = await TemporaryTokenService.generateToken(
        simulation.userId,
        simulation.id,
        'voice',
        hoursUntilEstimatedEnd
      );

      const simulationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/simulation-vocale/${simulation.id}?token=${temporaryToken}`;

      // Get voice name
      let voiceDisplayName = simulation.voicePreference === 'MALE' ? 'Voix masculine' : 'Voix féminine';
      if (simulation.questionsData && typeof simulation.questionsData === 'object') {
        const questionsData = simulation.questionsData as any;
        const voiceId = questionsData.voiceId;
        if (voiceId) {
          const { default: vapiService } = await import('./vapiService');
          const availableVoices = vapiService.getVoiceOptions();
          const voice = availableVoices.find(v => v.id === voiceId);
          if (voice) {
            voiceDisplayName = voice.name;
          }
        }
      }

      const { EmailService } = await import('./emailService');
      const scheduledDateStr = scheduledDate.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const emailData = {
        firstName: user.firstName,
        email: user.email,
        scheduledDate: scheduledDate,
        voicePreference: voiceDisplayName,
        duration: `${Math.floor((simulation.duration || 300) / 60)} minutes`,
        simulationId: simulation.id,
        accessUrl: simulationUrl
      };

      const emailSent = await EmailService.sendVoiceSimulationReschedulingEmail(emailData);
      
      if (emailSent) {
        console.log('✅ Rescheduling confirmation email sent successfully to:', user.email);
      } else {
        console.error('❌ Failed to send rescheduling confirmation email to:', user.email);
        throw new Error('Email service returned false');
      }
    } catch (error: any) {
      console.error('❌ Error sending rescheduling email:', {
        error: error?.message,
        stack: error?.stack,
        simulationId: simulation.id,
        userEmail: user?.email
      });
      // Don't throw - rescheduling should succeed even if email fails
    }
  }
}

export default new VoiceSimulationService();
