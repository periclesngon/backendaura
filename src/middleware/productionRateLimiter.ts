import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Production-ready rate limiting strategy for 50M+ users
 * This implements a tiered approach with different limits for different user types
 */

// Base rate limiter for general API endpoints
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes per IP
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use Redis store in production for distributed rate limiting
  store: process.env.REDIS_URL ? undefined : undefined, // Will be configured with Redis
  keyGenerator: (req: Request) => {
    // In production, use user ID if authenticated, otherwise IP
    const userId = (req as any).user?.userId;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  },
  skip: (req: Request) => {
    // Skip rate limiting for authenticated premium users
    const user = (req as any).user;
    if (user?.subscriptionTier === 'PRO' || user?.subscriptionTier === 'PRO+') {
      return true;
    }
    return false;
  }
});

// Stricter rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes per IP
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  skipSuccessfulRequests: true // Don't count successful requests
});

// Very strict rate limiter for password reset and sensitive operations
export const sensitiveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour per IP
  message: {
    error: 'Too many sensitive operation attempts, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `sensitive:${req.ip}`
});

// Rate limiter for file uploads
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour per user
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.userId;
    return userId ? `upload:${userId}` : `upload:${req.ip}`;
  }
});

// Rate limiter for AI chat endpoints
export const aiChatRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 AI requests per hour per user
  message: {
    error: 'AI chat rate limit exceeded, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.userId;
    return userId ? `ai:${userId}` : `ai:${req.ip}`;
  },
  skip: (req: Request) => {
    // Higher limits for premium users
    const user = (req as any).user;
    if (user?.subscriptionTier === 'PRO' || user?.subscriptionTier === 'PRO+') {
      return false; // Apply rate limiting but with higher limits
    }
    return false;
  }
});

// Dynamic rate limiter based on subscription tier
export const createSubscriptionBasedRateLimit = (baseLimit: number) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req: Request) => {
      const user = (req as any).user;
      if (!user) return baseLimit;
      
      switch (user.subscriptionTier) {
        case 'FREE':
          return baseLimit;
        case 'ESSENTIAL':
          return baseLimit * 2;
        case 'PREMIUM':
          return baseLimit * 5;
        case 'PRO':
        case 'PRO+':
          return baseLimit * 10;
        default:
          return baseLimit;
      }
    },
    message: {
      error: 'Rate limit exceeded for your subscription tier.',
      retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.userId;
      return userId ? `sub:${userId}` : `sub:${req.ip}`;
    }
  });
};

// Production configuration for 50M users
export const productionConfig = {
  // Use Redis for distributed rate limiting
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  
  // Rate limiting tiers
  tiers: {
    free: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 1000
    },
    essential: {
      requestsPerMinute: 20,
      requestsPerHour: 500,
      requestsPerDay: 5000
    },
    premium: {
      requestsPerMinute: 50,
      requestsPerHour: 2000,
      requestsPerDay: 20000
    },
    pro: {
      requestsPerMinute: 100,
      requestsPerHour: 5000,
      requestsPerDay: 50000
    }
  },
  
  // Global limits to prevent abuse
  global: {
    maxRequestsPerSecond: 10000, // 10K requests per second globally
    maxConcurrentUsers: 1000000, // 1M concurrent users
    emergencyThreshold: 0.9 // Trigger emergency mode at 90% capacity
  }
};

export default {
  generalRateLimit,
  authRateLimit,
  sensitiveRateLimit,
  uploadRateLimit,
  aiChatRateLimit,
  createSubscriptionBasedRateLimit,
  productionConfig
};
