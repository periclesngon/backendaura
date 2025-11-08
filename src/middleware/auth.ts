import { Request, Response, NextFunction } from 'express';
import { JWTService } from '@/utils/jwt';
import { AuthenticationError, AuthorizationError } from '@/middleware/errorHandler';
import { UserRole, SubscriptionTier } from '@prisma/client';
import { JWTPayload } from '@/types';
import { logger } from '@/utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    console.log('🔐 Authenticate middleware called:', {
      hasAuthHeader: !!authHeader,
      authHeaderLength: authHeader?.length || 0,
      authPreview: authHeader?.substring(0, 30) + '...' || 'none',
      path: req.path,
      method: req.method
    });

    if (!authHeader) {
      console.error('❌ No authorization header found');
      throw new AuthenticationError('Authorization header is required');
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!token || token === 'null' || token === 'undefined') {
      console.error('❌ Invalid token:', { token: token?.substring(0, 20) + '...' });
      throw new AuthenticationError('Token is required');
    }

    console.log('🔍 Verifying token...', {
      tokenLength: token.length,
      tokenPreview: token.substring(0, 30) + '...'
    });

    // Verify and decode the token
    const decoded = JWTService.verifyAccessToken(token);

    // Attach user info to request
    req.user = decoded;

    console.log('✅ User authenticated successfully:', {
      userId: decoded.userId,
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      hasUserId: !!decoded.userId,
      hasId: !!decoded.id
    });

    logger.debug('User authenticated', {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    });

    next();
  } catch (error) {
    console.error('❌ Authentication failed:', {
      error: error instanceof Error ? error.message : error,
      path: req.path,
      method: req.method
    });

    let message = 'Authentication required';
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        message = 'Token has expired';
      } else if (error.message.includes('invalid')) {
        message = 'Invalid token';
      } else {
        message = error.message;
      }
    }

    res.status(401).json({
      success: false,
      message: message
    });
  }
};

/**
 * Optional authentication middleware - doesn't throw error if no token
 */
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      return next();
    }

    // Verify and decode the token
    const decoded = JWTService.verifyAccessToken(token);
    req.user = decoded;
    
    next();
  } catch (error) {
    // Don't throw error for optional auth, just continue without user
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new AuthorizationError(
          `Access denied. Required roles: ${allowedRoles.join(', ')}`
        );
      }

      logger.debug('User authorized', {
        userId: req.user.userId,
        role: req.user.role,
        allowedRoles
      });

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Subscription tier authorization middleware
 */
export const requireSubscriptionTier = (...allowedTiers: SubscriptionTier[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!allowedTiers.includes(req.user.subscriptionTier)) {
        throw new AuthorizationError(
          `Subscription upgrade required. Required tiers: ${allowedTiers.join(', ')}`
        );
      }

      logger.debug('Subscription tier authorized', {
        userId: req.user.userId,
        subscriptionTier: req.user.subscriptionTier,
        allowedTiers
      });

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Resource ownership authorization middleware
 */
export const authorizeResourceOwner = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Admin and senior managers can access any resource
      if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.SENIOR_MANAGER) {
        return next();
      }

      // Get resource user ID from request params, body, or query
      const resourceUserId = req.params[resourceUserIdField] || 
                           req.body[resourceUserIdField] || 
                           req.query[resourceUserIdField];

      if (!resourceUserId) {
        throw new AuthorizationError('Resource user ID not found');
      }

      // Check if user owns the resource
      if (req.user.userId !== resourceUserId) {
        throw new AuthorizationError('Access denied. You can only access your own resources');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Manager authorization middleware (Junior, Senior, or Admin)
 */
export const requireManager = authorize(
  UserRole.JUNIOR_MANAGER, 
  UserRole.SENIOR_MANAGER, 
  UserRole.ADMIN
);

/**
 * Senior manager authorization middleware (Senior or Admin)
 */
export const requireSeniorManager = authorize(
  UserRole.SENIOR_MANAGER, 
  UserRole.ADMIN
);

/**
 * Admin authorization middleware
 */
export const requireAdmin = authorize(UserRole.ADMIN);

/**
 * Role requirement middleware - alias for authorize function
 */
export const requireRole = (roles: UserRole[]) => {
  return authorize(...roles);
};

/**
 * Premium subscription authorization middleware
 */
export const requirePremium = requireSubscriptionTier(
  SubscriptionTier.PREMIUM, 
  SubscriptionTier.PRO
);

/**
 * Any paid subscription authorization middleware
 */
export const requirePaidSubscription = requireSubscriptionTier(
  SubscriptionTier.ESSENTIAL,
  SubscriptionTier.PREMIUM, 
  SubscriptionTier.PRO
);
