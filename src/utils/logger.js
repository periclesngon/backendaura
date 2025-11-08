const winston = require('winston');

/**
 * Logger configuration for the TCF/TEF platform
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tcf-tef-platform' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// If we're not in production, log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
      })
    )
  }));
}

/**
 * Create logs directory if it doesn't exist
 */
const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Enhanced logging methods with context
 */
const enhancedLogger = {
  info: (message, meta = {}) => {
    logger.info(message, { ...meta, timestamp: new Date().toISOString() });
  },
  
  error: (message, meta = {}) => {
    logger.error(message, { ...meta, timestamp: new Date().toISOString() });
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
  },
  
  // API request logging
  apiRequest: (req, res, responseTime) => {
    const logData = {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      logger.error('API Request Error', logData);
    } else {
      logger.info('API Request', logData);
    }
  },
  
  // Authentication logging
  authEvent: (event, userId, details = {}) => {
    logger.info('Authentication Event', {
      event,
      userId,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Database operation logging
  dbOperation: (operation, table, details = {}) => {
    logger.debug('Database Operation', {
      operation,
      table,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Socket.IO event logging
  socketEvent: (event, socketId, userId, details = {}) => {
    logger.info('Socket Event', {
      event,
      socketId,
      userId,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Performance logging
  performance: (operation, duration, details = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger[level]('Performance Metric', {
      operation,
      duration: `${duration}ms`,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  // Security event logging
  security: (event, details = {}) => {
    logger.warn('Security Event', {
      event,
      ...details,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  logger: enhancedLogger,
  winston: logger // Export raw winston logger if needed
};
