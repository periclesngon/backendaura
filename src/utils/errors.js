/**
 * Custom error classes for the TCF/TEF platform
 */

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - 400 Bad Request
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Authentication error - 401 Unauthorized
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error - 403 Forbidden
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error - 404 Not Found
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

/**
 * Conflict error - 409 Conflict
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

/**
 * External service error - 502 Bad Gateway
 */
class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = 'unknown') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * Database error - 500 Internal Server Error
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', operation = 'unknown') {
    super(message, 500, 'DATABASE_ERROR');
    this.operation = operation;
  }
}

/**
 * File operation error - 500 Internal Server Error
 */
class FileError extends AppError {
  constructor(message = 'File operation failed', operation = 'unknown') {
    super(message, 500, 'FILE_ERROR');
    this.operation = operation;
  }
}

/**
 * Business logic error - 422 Unprocessable Entity
 */
class BusinessLogicError extends AppError {
  constructor(message = 'Business rule violation') {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const { logger } = require('./logger');

  // Log the error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId || 'anonymous'
  });

  // Handle known operational errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        details: err.details || null
      }
    });
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, res);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      }
    });
  }

  // Handle validation errors (Joi, etc.)
  if (err.name === 'ValidationError' && err.details) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      }
    });
  }

  // Handle multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'File too large',
        code: 'FILE_TOO_LARGE'
      }
    });
  }

  // Default to 500 server error
  res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      code: 'INTERNAL_ERROR'
    }
  });
};

/**
 * Handle Prisma database errors
 */
const handlePrismaError = (err, res) => {
  switch (err.code) {
    case 'P2002':
      return res.status(409).json({
        success: false,
        error: {
          message: 'Resource already exists',
          code: 'DUPLICATE_RESOURCE',
          details: err.meta
        }
      });

    case 'P2025':
      return res.status(404).json({
        success: false,
        error: {
          message: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND'
        }
      });

    case 'P2003':
      return res.status(400).json({
        success: false,
        error: {
          message: 'Foreign key constraint failed',
          code: 'FOREIGN_KEY_ERROR'
        }
      });

    default:
      return res.status(500).json({
        success: false,
        error: {
          message: 'Database operation failed',
          code: 'DATABASE_ERROR'
        }
      });
  }
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  FileError,
  BusinessLogicError,
  errorHandler,
  asyncHandler
};
