import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: any;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export const rateLimiter = (options: RateLimiterOptions = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  };

  return rateLimit(defaultOptions);
};

// Specific rate limiters for different endpoints
export const authRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth endpoints
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    }
  }
});

export const apiRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for general API
  message: {
    success: false,
    error: {
      message: 'Too many API requests, please try again later.',
      code: 'API_RATE_LIMIT_EXCEEDED'
    }
  }
});

export const uploadRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 upload requests per windowMs
  message: {
    success: false,
    error: {
      message: 'Too many upload requests, please try again later.',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    }
  }
});
