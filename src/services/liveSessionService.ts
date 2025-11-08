import { prisma } from '@/database/connection';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError
} from '@/middleware/errorHandler';
import { UserRole, SubscriptionTier, LiveSessionStatus } from '@prisma/client';
import { logger } from '@/utils/logger';
import { AgoraService } from './agoraService';
import {
  CreateLiveSessionRequest,
  LiveSessionWithDetails,
  PaginationParams,
  FilterParams
} from '@/types';



export class LiveSessionService {
  /**
   * Create a new live session (Manager/Admin only)
   */
  static async createLiveSession(
    sessionData: CreateLiveSessionRequest,
    createdById: string,
    creatorRole: UserRole
  ): Promise<LiveSessionWithDetails> {
    try {
      // Check authorization
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(creatorRole as any)) {
        throw new AuthorizationError('Access denied. Manager role required.');
      }

      // Validate session date is in the future
      if (new Date(sessionData.date) <= new Date()) {
        throw new ValidationError('Session date must be in the future');
      }

      // Implement access control based on manager role and session requirements
      if (creatorRole === UserRole.JUNIOR_MANAGER) {
        // Junior managers can only create sessions up to B1 level and ESSENTIAL tier
        const allowedLevels = ['A1', 'A2', 'B1'];
        const allowedTiers = ['FREE', 'ESSENTIAL'];

        if (sessionData.level && !allowedLevels.includes(sessionData.level)) {
          throw new AuthorizationError('Junior managers can only create sessions up to B1 level');
        }

        if (sessionData.requiredTier && !allowedTiers.includes(sessionData.requiredTier)) {
          throw new AuthorizationError('Junior managers can only create sessions for FREE and ESSENTIAL tiers');
        }

        // Junior managers cannot create 1-on-1 sessions (maxParticipants must be > 1)
        if (sessionData.maxParticipants <= 1) {
          throw new AuthorizationError('Junior managers cannot create 1-on-1 sessions');
        }
      }

      // Senior managers and admins can create any type of session
      if (creatorRole === UserRole.SENIOR_MANAGER || creatorRole === UserRole.ADMIN) {
        // Only senior managers and admins can create PRO tier 1-on-1 sessions
        if (sessionData.requiredTier === 'PRO' && sessionData.maxParticipants === 1) {
          // This is allowed for senior managers and admins
        }
      }

      // Create live session
      const liveSession = await prisma.liveSession.create({
        data: {
          ...sessionData,
          createdById,
          status: LiveSessionStatus.SCHEDULED
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          participants: true
        }
      });

      logger.info('Live session created successfully', { 
        sessionId: liveSession.id, 
        title: liveSession.title,
        createdById 
      });

      return liveSession;
    } catch (error) {
      logger.error('Failed to create live session', { sessionData, createdById, error });
      throw error;
    }
  }

  /**
   * Get live session by ID
   */
  static async getLiveSessionById(
    sessionId: string, 
    userId?: string
  ): Promise<LiveSessionWithDetails> {
    try {
      const liveSession = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true
            }
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          _count: {
            select: {
              participants: true
            }
          }
        }
      });

      if (!liveSession) {
        throw new NotFoundError('Live session not found');
      }

      // Check if user has access to this session
      if (liveSession.requiredTier !== SubscriptionTier.FREE && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true, role: true }
        });

        // Admins and managers (content providers) have full access to all sessions
        if (user && [UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(user.role as any)) {
          // Content providers have full access - no subscription check needed
        } else if (user && !this.hasAccessToTier(user.subscriptionTier, liveSession.requiredTier)) {
          throw new AuthorizationError('Subscription upgrade required to access this session');
        }
      }

      // Add computed fields
      const sessionWithDetails: LiveSessionWithDetails = {
        ...liveSession,
        participantCount: liveSession.participants.length,
        isRegistered: userId ? liveSession.participants.some(p => p.userId === userId) : false,
        isFavorited: false // Will be calculated separately if needed
      };

      return sessionWithDetails;
    } catch (error) {
      logger.error('Failed to get live session by ID', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Get all live sessions with pagination and filtering
   */
  static async getAllLiveSessions(
    pagination: PaginationParams,
    filters: FilterParams,
    userId?: string
  ): Promise<{
    sessions: LiveSessionWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'date', sortOrder = 'asc' } = pagination;
      const { search, level, category, tier, status } = filters;

      // Build where clause
      const where: any = {
        // Filter out one-on-one sessions from public listing
        isOneOnOne: false
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { titleEn: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { instructor: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } }
        ];
      }

      if (level) {
        where.level = level;
      }

      if (category) {
        where.category = category;
      }

      if (tier) {
        where.requiredTier = tier;
      }

      if (status) {
        // Handle comma-separated status values
        if (typeof status === 'string' && status.includes(',')) {
          const statusArray = status.split(',').map(s => s.trim()) as LiveSessionStatus[];
          where.status = { in: statusArray };
        } else {
          where.status = status as LiveSessionStatus;
        }
      }

      // Get total count
      const total = await prisma.liveSession.count({ where });

      // Get live sessions
      const sessions = await prisma.liveSession.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          participants: userId ? {
            where: { userId }
          } : {
            take: 0
          },
          _count: {
            select: {
              participants: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      // Add computed fields
      const sessionsWithDetails: LiveSessionWithDetails[] = sessions.map(session => ({
        ...session,
        participantCount: session._count.participants,
        isRegistered: session.participants.length > 0,
        isFavorited: false // Will be calculated separately if needed
      }));

      return {
        sessions: sessionsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get all live sessions', { error });
      throw error;
    }
  }

  /**
   * Register for live session
   */
  static async registerForSession(sessionId: string, userId: string): Promise<void> {
    try {
      // Check if session exists
      const session = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: {
          participants: true
        }
      });

      if (!session) {
        throw new NotFoundError('Live session not found');
      }

      if (session.status !== LiveSessionStatus.SCHEDULED && session.status !== LiveSessionStatus.LIVE) {
        throw new ValidationError('Cannot register for this session');
      }

      // Check if session is in the future (only for SCHEDULED sessions)
      if (session.status === LiveSessionStatus.SCHEDULED && session.date <= new Date()) {
        throw new ValidationError('Cannot register for past sessions');
      }

      // Check user subscription tier
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true, role: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Admins and managers (content providers) have full access to all sessions
      if (![UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(user.role as any)) {
        if (!this.hasAccessToTier(user.subscriptionTier, session.requiredTier)) {
          throw new AuthorizationError('Subscription upgrade required to register for this session');
        }
      }

      // Check if already registered
      const existingParticipant = await prisma.liveSessionParticipant.findUnique({
        where: {
          userId_liveSessionId: {
            userId,
            liveSessionId: sessionId
          }
        }
      });

      if (existingParticipant) {
        throw new ConflictError('Already registered for this session');
      }

      // Check if session is full
      if (session.participants.length >= session.maxParticipants) {
        throw new ValidationError('Session is full');
      }

      // Create participant record
      await prisma.liveSessionParticipant.create({
        data: {
          userId,
          liveSessionId: sessionId,
          joinedAt: new Date()
        }
      });

      logger.info('User registered for live session successfully', { sessionId, userId });
    } catch (error) {
      logger.error('Failed to register for live session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Unregister from live session
   */
  static async unregisterFromSession(sessionId: string, userId: string): Promise<void> {
    try {
      // Check if registration exists
      const participant = await prisma.liveSessionParticipant.findUnique({
        where: {
          userId_liveSessionId: {
            userId,
            liveSessionId: sessionId
          }
        }
      });

      if (!participant) {
        throw new NotFoundError('Not registered for this session');
      }

      // Check if session hasn't started yet
      const session = await prisma.liveSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new NotFoundError('Live session not found');
      }

      if (session.status === LiveSessionStatus.LIVE) {
        throw new ValidationError('Cannot unregister from a live session');
      }

      // Delete participant record
      await prisma.liveSessionParticipant.delete({
        where: {
          userId_liveSessionId: {
            userId,
            liveSessionId: sessionId
          }
        }
      });

      logger.info('User unregistered from live session successfully', { sessionId, userId });
    } catch (error) {
      logger.error('Failed to unregister from live session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Update session status (Creator/Admin only)
   */
  static async updateSessionStatus(
    sessionId: string,
    newStatus: LiveSessionStatus,
    userId: string,
    userRole: UserRole
  ): Promise<LiveSessionWithDetails> {
    try {
      console.log('🔍 LiveSessionService.updateSessionStatus called:', {
        sessionId,
        newStatus,
        userId,
        userRole
      });

      // Get existing session
      const existingSession = await prisma.liveSession.findUnique({
        where: { id: sessionId }
      });

      console.log('📋 Existing session found:', {
        id: existingSession?.id,
        status: existingSession?.status,
        createdById: existingSession?.createdById
      });

      if (!existingSession) {
        throw new NotFoundError('Live session not found');
      }

      // Check authorization - Allow admins, managers, and session creators
      const isAdminOrManager = userRole !== 'STUDENT' && [UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER].includes(userRole as any);
      const isCreator = existingSession.createdById === userId;
      
      console.log('🔐 Authorization check:', {
        isAdminOrManager,
        isCreator,
        userRole,
        sessionCreatorId: existingSession.createdById,
        requestingUserId: userId
      });
      
      if (!isAdminOrManager && !isCreator) {
        throw new AuthorizationError('Access denied. Only admins, managers, or session creators can update session status.');
      }

      // Update session status
      console.log('🔄 Updating session status in database...');
      const updatedSession = await prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          status: newStatus,
          updatedAt: new Date()
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      console.log('✅ Session status updated successfully in database:', {
        sessionId,
        oldStatus: existingSession.status,
        newStatus,
        updatedBy: userId
      });

      logger.info('Live session status updated successfully', { 
        sessionId, 
        oldStatus: existingSession.status,
        newStatus,
        updatedBy: userId 
      });

      return {
        ...updatedSession,
        participantCount: updatedSession.participants.length,
        isRegistered: false,
        isFavorited: false
      };
    } catch (error) {
      logger.error('Failed to update session status', { sessionId, newStatus, userId, error });
      throw error;
    }
  }

  /**
   * Get user's registered sessions
   */
  static async getUserRegisteredSessions(
    userId: string,
    pagination: PaginationParams
  ): Promise<{
    sessions: LiveSessionWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, sortBy = 'date', sortOrder = 'asc' } = pagination;

      // Get total count
      const total = await prisma.liveSessionParticipant.count({
        where: { userId }
      });

      // Get registered sessions
      const participants = await prisma.liveSessionParticipant.findMany({
        where: { userId },
        include: {
          liveSession: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              },
              _count: {
                select: {
                  participants: true
                }
              }
            }
          }
        },
        orderBy: {
          liveSession: { [sortBy]: sortOrder }
        },
        skip: (page - 1) * limit,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      // Transform to LiveSessionWithDetails
      const sessions: LiveSessionWithDetails[] = participants.map(participant => ({
        ...participant.liveSession,
        participantCount: participant.liveSession._count.participants,
        isRegistered: true,
        isFavorited: false
      }));

      return {
        sessions,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Failed to get user registered sessions', { userId, error });
      throw error;
    }
  }

  /**
   * Update live session (Creator/Admin only)
   */
  static async updateLiveSession(
    sessionId: string,
    userId: string,
    userRole: UserRole | undefined,
    updateData: any
  ): Promise<LiveSessionWithDetails> {
    try {
      // Get the session
      const session = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          _count: {
            select: {
              participants: true
            }
          }
        }
      });

      if (!session) {
        throw new NotFoundError('Live session not found');
      }

      // Check authorization - only creator or admin can update
      if (session.createdById !== userId && userRole !== UserRole.ADMIN) {
        throw new AuthorizationError('You do not have permission to update this session');
      }

      // Update the session
      const updated = await prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          title: updateData.title || session.title,
          description: updateData.description || session.description,
          date: updateData.date || session.date,
          duration: updateData.duration || session.duration,
          maxParticipants: updateData.maxParticipants || session.maxParticipants,
          category: updateData.category || session.category,
          level: updateData.level || session.level,
          tags: updateData.tags || session.tags,
          updatedAt: new Date()
        }
      });

      logger.info('Live session updated', { sessionId, updatedBy: userId });

      return {
        ...updated,
        createdBy: session.createdBy,
        participantCount: session._count.participants,
        isRegistered: false,
        isFavorited: false
      };
    } catch (error) {
      logger.error('Failed to update live session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Delete live session (Creator/Admin only)
   */
  static async deleteLiveSession(
    sessionId: string,
    userId: string,
    userRole: UserRole | undefined
  ): Promise<void> {
    try {
      // Get the session
      const session = await prisma.liveSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new NotFoundError('Live session not found');
      }

      // Check authorization - only creator or admin can delete
      if (session.createdById !== userId && userRole !== UserRole.ADMIN) {
        throw new AuthorizationError('You do not have permission to delete this session');
      }

      // Delete the session
      await prisma.liveSession.delete({
        where: { id: sessionId }
      });

      logger.info('Live session deleted', { sessionId, deletedBy: userId });
    } catch (error) {
      logger.error('Failed to delete live session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Check if user has access to subscription tier
   */
  private static hasAccessToTier(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
    const tierHierarchy = {
      [SubscriptionTier.FREE]: 0,
      [SubscriptionTier.ESSENTIAL]: 1,
      [SubscriptionTier.PREMIUM]: 2,
      [SubscriptionTier.PRO]: 3
    };

    return tierHierarchy[userTier] >= tierHierarchy[requiredTier];
  }
}
