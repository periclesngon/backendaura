import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import TemporaryTokenService from '../services/temporaryTokenService';

const prisma = new PrismaClient();

// Extend Request interface to include temporary auth data
declare global {
  namespace Express {
    interface Request {
      temporaryAuth?: {
        userId: string;
        simulationId: string;
        simulationType: 'voice' | 'immigration';
        isTemporary: boolean;
      };
    }
  }
}

/**
 * Middleware to handle temporary authentication for email links
 * This allows users to access simulations directly from email links without logging in
 */
export const temporaryAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if there's a temporary token in query parameters or headers
    const token = (req.query.token as string) || (req.headers['x-token'] as string) || (req.headers.authorization?.replace('Bearer ', ''));
    
    if (!token) {
      // No temporary token, proceed with normal authentication
      return next();
    }

    console.log('🔑 Temporary token detected, validating...');

    // Validate the temporary token
    const validation = await TemporaryTokenService.validateToken(token);
    
    if (!validation.isValid) {
      console.log('❌ Temporary token validation failed:', validation.error);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access link',
        error: validation.error
      });
    }

    console.log('✅ Temporary token validated successfully');

    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: validation.userId! },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        subscriptionTier: true
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      console.log('❌ User not found or inactive');
      return res.status(401).json({
        success: false,
        message: 'User account not found or inactive'
      });
    }

    // Set temporary authentication data
    req.temporaryAuth = {
      userId: validation.userId!,
      simulationId: validation.simulationId!,
      simulationType: validation.simulationType!,
      isTemporary: true
    };

    // Set user data for compatibility with existing auth middleware
    req.user = {
      ...user,
      userId: user.id, // Add userId for compatibility
      iat: Math.floor(Date.now() / 1000), // Current timestamp
      exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours from now
    };

    console.log(`🎯 Temporary access granted for ${validation.simulationType} simulation ${validation.simulationId}`);

    // NE PAS invalider le token immédiatement - il reste valide pour toute la simulation
    // Le token sera invalidé uniquement après la fin de la simulation ou expiration
    // await TemporaryTokenService.invalidateToken(token);

    next();
  } catch (error) {
    console.error('Error in temporary auth middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Middleware to check if user has access to specific simulation
 * Works with both regular auth and temporary auth
 */
export const simulationAccessMiddleware = (simulationType: 'voice' | 'immigration') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const simulationId = req.params.id || req.params.simulationId;
      
      if (!simulationId) {
        return res.status(400).json({
          success: false,
          message: 'Simulation ID is required'
        });
      }

      let userId: string;
      let hasAccess = false;

      // Check if using temporary auth
      if (req.temporaryAuth) {
        userId = req.temporaryAuth.userId;
        
        // For temporary auth, verify the simulation matches the token
        if (req.temporaryAuth.simulationId === simulationId && 
            req.temporaryAuth.simulationType === simulationType) {
          hasAccess = true;
        }
      } else if (req.user) {
        // Regular authentication
        userId = req.user.id;
        hasAccess = true; // Will be verified below
      } else {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Verify simulation exists and belongs to user
      if (hasAccess) {
        let simulation;
        
        if (simulationType === 'voice') {
          simulation = await prisma.voiceSimulation.findFirst({
            where: { id: simulationId, userId }
          });
        } else if (simulationType === 'immigration') {
          simulation = await prisma.immigrationSimulation.findFirst({
            where: { id: simulationId, userId }
          });
        }

        if (!simulation) {
          return res.status(404).json({
            success: false,
            message: 'Simulation not found or access denied'
          });
        }

        // ACCESS CONTROL LOGIC:
        // 1. Check if simulation is completed - if yes, deny access 2 minutes after end
        // 2. Check if simulation is accessible (5 minutes before start)
        const now = new Date();
        
        // Extract scheduledDate - for immigration simulations, it's stored in personalInfo JSON
        let scheduledDate: Date | null = null;
        if (simulationType === 'voice') {
          // Voice simulations have scheduledDate as a direct field
          scheduledDate = (simulation as any).scheduledDate ? new Date((simulation as any).scheduledDate) : null;
        } else if (simulationType === 'immigration') {
          // Immigration simulations store scheduledDate in personalInfo JSON
          try {
            const personalInfo = (simulation as any).personalInfo;
            const personalInfoParsed = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : (personalInfo || {});
            if (personalInfoParsed.scheduledDate) {
              scheduledDate = new Date(personalInfoParsed.scheduledDate);
            }
          } catch (e) {
            console.warn('Failed to parse personalInfo for scheduledDate in middleware:', e);
          }
        }
        
        // Fallback to createdAt + 5 minutes if no scheduledDate found
        if (!scheduledDate) {
          const createdAt = (simulation as any).createdAt ? new Date((simulation as any).createdAt) : now;
          scheduledDate = new Date(createdAt.getTime() + 5 * 60 * 1000); // 5 minutes after creation
        }
        
        const durationInSeconds = (simulation as any).duration || 300; // 5 minutes default
        const estimatedEndTime = new Date(scheduledDate.getTime() + durationInSeconds * 1000);
        
        // Check if simulation is completed
        if ((simulation as any).status === 'COMPLETED' || (simulation as any).status === 'FINISHED') {
          // For voice simulations, use updatedAt as the end time (since there's no endedAt field)
          // For immigration simulations, use completedAt
          const endedAt = simulationType === 'voice' 
            ? (simulation as any).updatedAt || (simulation as any).completedAt || estimatedEndTime
            : (simulation as any).completedAt || (simulation as any).endedAt || estimatedEndTime;
          
          if (endedAt) {
            const endTime = new Date(endedAt);
            const timeSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60); // minutes since end
            
            // If simulation ended more than 2 minutes ago, deny access
            if (timeSinceEnd > 2) {
              return res.status(403).json({
                success: false,
                message: 'This simulation has ended. Access links expire 2 minutes after completion for security reasons.',
                code: 'SIMULATION_ENDED'
              });
            }
          }
        }
        
        // Check if access is allowed (5 minutes before start)
        const timeUntilStart = (scheduledDate.getTime() - now.getTime()) / (1000 * 60); // minutes until start
        
        if (timeUntilStart > 5) {
          // Too early - deny access but return special code for waiting page
          return res.status(403).json({
            success: false,
            message: `This link will be accessible 5 minutes before the simulation starts (in ${Math.ceil(timeUntilStart - 5)} minute${Math.ceil(timeUntilStart - 5) > 1 ? 's' : ''}).`,
            code: 'TOO_EARLY',
            minutesUntilAccessible: Math.ceil(timeUntilStart - 5),
            scheduledDate: scheduledDate.toISOString()
          });
        }
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this simulation'
        });
      }

      next();
    } catch (error) {
      console.error('Error in simulation access middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Access verification error'
      });
    }
  };
};

/**
 * Combined middleware that handles both temporary auth and simulation access
 */
export const temporaryOrRegularAuth = (simulationType: 'voice' | 'immigration') => {
  return [
    temporaryAuthMiddleware,
    simulationAccessMiddleware(simulationType)
  ];
};
