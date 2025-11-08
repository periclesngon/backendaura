import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

interface LoggedRequest extends Request {
  startTime?: number;
  requestId?: string;
}

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get client language preference
function getLanguagePreference(req: Request): 'fr' | 'en' {
  const acceptLanguage = req.headers['accept-language'];
  return acceptLanguage?.includes('en') ? 'en' : 'fr';
}

// Sanitize sensitive data from request body
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// Request logging middleware
export const requestLogger = (req: LoggedRequest, res: Response, next: NextFunction) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  req.requestId = requestId;
  req.startTime = startTime;
  
  // Log incoming request
  logger.info('Incoming Request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeRequestBody(req.body),
    userId: req.user?.userId,
    userRole: req.user?.role,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection?.remoteAddress,
    language: getLanguagePreference(req),
    timestamp: new Date().toISOString()
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('Outgoing Response', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.userId,
      success: body?.success,
      errorMessage: body?.success === false ? body.message : undefined,
      timestamp: new Date().toISOString()
    });

    // Log slow requests (>2 seconds)
    if (duration > 2000) {
      logger.warn('Slow Request Detected', {
        requestId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        userId: req.user?.userId
      });
    }

    return originalJson.call(this, body);
  };

  // Override res.status to capture status changes
  const originalStatus = res.status;
  res.status = function(code: number) {
    // Log error status codes
    if (code >= 400) {
      logger.warn('Error Status Code', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: code,
        userId: req.user?.userId
      });
    }
    
    return originalStatus.call(this, code);
  };

  next();
};

// Error logging middleware
export const errorLogger = (error: any, req: LoggedRequest, res: Response, next: NextFunction) => {
  const duration = req.startTime ? Date.now() - req.startTime : 0;
  
  logger.error('Request Error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    userId: req.user?.userId,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString()
  });

  next(error);
};

// Performance monitoring middleware
export const performanceMonitor = (req: LoggedRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log performance metrics
    logger.info('Performance Metrics', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
    
    // Alert on very slow requests (>5 seconds)
    if (duration > 5000) {
      logger.error('Very Slow Request Alert', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        userId: req.user?.userId
      });
    }
  });
  
  next();
};

// API usage tracking middleware
export const apiUsageTracker = (req: LoggedRequest, res: Response, next: NextFunction) => {
  const endpoint = `${req.method} ${req.path}`;
  
  res.on('finish', () => {
    logger.info('API Usage', {
      requestId: req.requestId,
      endpoint,
      userId: req.user?.userId,
      userRole: req.user?.role,
      statusCode: res.statusCode,
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

// Bilingual error response helper
export const createBilingualErrorResponse = (
  error: any,
  language: 'fr' | 'en' = 'fr'
) => {
  const errorMessages: Record<string, { fr: string; en: string }> = {
    'ValidationError': {
      fr: 'Erreur de validation des données',
      en: 'Data validation error'
    },
    'UnauthorizedError': {
      fr: 'Accès non autorisé',
      en: 'Unauthorized access'
    },
    'NotFoundError': {
      fr: 'Ressource non trouvée',
      en: 'Resource not found'
    },
    'ConflictError': {
      fr: 'Conflit de données',
      en: 'Data conflict'
    },
    'RateLimitError': {
      fr: 'Limite de requêtes dépassée',
      en: 'Rate limit exceeded'
    },
    'InternalServerError': {
      fr: 'Erreur interne du serveur',
      en: 'Internal server error'
    }
  };

  const errorType = error.constructor.name;
  const translatedMessage = errorMessages[errorType]?.[language] || error.message;

  return {
    success: false,
    message: translatedMessage,
    errorType,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: LoggedRequest, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request Timeout', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          timeout: `${timeoutMs}ms`,
          userId: req.user?.userId
        });
        
        const language = getLanguagePreference(req);
        res.status(408).json({
          success: false,
          message: language === 'fr' 
            ? 'Délai d\'attente de la requête dépassé'
            : 'Request timeout exceeded',
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};
