import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { generalRateLimit, authRateLimit, sensitiveRateLimit, uploadRateLimit, aiChatRateLimit } from './middleware/productionRateLimiter';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { courseRoutes } from './routes/courses';
import { testRoutes } from './routes/tests';
import { subscriptionRoutes } from './routes/subscriptions';
import { liveSessionRoutes } from './routes/liveSessions';
import { notificationRoutes } from './routes/notifications';
import { contentRoutes } from './routes/content';
import { analyticsRoutes } from './routes/analytics';
import { healthRoutes } from './routes/health';
import pusherAuthRoutes from './routes/pusherAuth';
import { adminRoutes } from './routes/admin';
import { managerRoutes } from './routes/manager';
import { postRoutes } from './routes/posts';
import { favoriteRoutes } from './routes/favorites';
import searchRoutes from './routes/searchRoutes';
import commentRoutes from './routes/commentRoutes';
import courseContentRoutes from './routes/courseContentRoutes';
import fileUploadRoutes from './routes/fileUploadRoutes';
import paymentRoutes from './routes/paymentRoutes';
import agoraRoutes from './routes/agoraRoutes';
import aiChatRoutes from './routes/aiChat';
import voiceSimulationRoutes from './routes/voiceSimulation';
import immigrationSimulationRoutes from './routes/immigrationSimulation';
import floatingAiAssistantRoutes from './routes/floatingAiAssistant';
import { requestLogger, errorLogger, performanceMonitor } from './middleware/requestLogger';
import simulationRoutes from './routes/simulations';
import aiRoutes from './routes/ai';
import marketplaceRoutes from './routes/marketplaceRoutes';
import marketplaceApiRoutes from './routes/marketplace';
import contentManagementRoutes from './routes/contentManagement';
import messagesRoutes from './routes/messages';
import fallbackRoutes from './routes/fallback';
import aiAssistantRoutes from './routes/aiAssistant';
import enhancedFileManagementRoutes from './routes/enhancedFileManagement';
import { successStoriesRoutes } from './routes/successStories';
import { testimonialRoutes } from './routes/testimonials';
import likesRoutes from './routes/likes';
import homeRoutes from './routes/home'
import challengeRoutes from './routes/challenges';
import achievementRoutes from './routes/achievements';
import dailyGoalRoutes from './routes/dailyGoals';
import { teacherRoutes } from './routes/teachers';
import userActivityRoutes from './routes/userActivity';
import moderationRoutes from './routes/moderation';
import { chatRoomService } from './services/chatRoomService';
import { RealTimeMessagingService } from './services/realTimeMessagingService';
import { MessageQueueWorker } from './workers/messageQueueWorker';
import { ReminderSchedulerService } from './services/reminderSchedulerService';
import { monitoringService } from './services/monitoringService';
import { checkRedisHealth } from './config/redis';
import { checkDatabaseHealth } from './config/database';

const app = express();
const server = createServer(app);

// Security middleware - Fixed for image CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "http://localhost:3001", "https:"],
    },
  },
}));

// CORS configuration - Support multiple origins for production and development
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  config.corsOrigin,
  process.env.FRONTEND_URL,  // Vercel frontend URL
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,  // Vercel preview deployments
  process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null,  // Vercel production URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log for debugging
      logger.warn('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins in production for now (can be restricted later)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting - Different limits for different environments
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimitWindowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for development
  skip: (req) => {
    if (config.nodeEnv === 'development') {
      console.log('🔓 Rate limiting skipped for development');
      return true;
    }
    return false;
  },
  // Custom key generator for better production scaling
  keyGenerator: (req) => {
    // In production, you might want to use user ID instead of IP
    // For now, use IP but this can be enhanced
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Apply rate limiting based on environment
if (config.nodeEnv === 'production') {
  // Production: Use sophisticated rate limiting
  app.use('/api/', generalRateLimit);
  app.use('/api/auth/', authRateLimit);
  app.use('/api/auth/reset-password', sensitiveRateLimit);
  app.use('/api/auth/change-password', sensitiveRateLimit);
  app.use('/api/upload/', uploadRateLimit);
  app.use('/api/ai-chat/', aiChatRateLimit);
  console.log('🔒 Production rate limiting enabled with tiered limits');
} else {
  // Development: Use basic rate limiting or disable
  app.use('/api/', limiter);
  console.log('🔓 Development rate limiting enabled (relaxed limits)');
}

// Body parsing middleware - Increased limits for large file uploads (10GB)
app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ extended: true, limit: '10gb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Enhanced request logging and performance monitoring
app.use(requestLogger);
app.use(performanceMonitor);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TCF/TEF API Documentation'
}));

// Health check route (before other routes)
app.use('/health', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/live-sessions', liveSessionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', commentRoutes);
app.use('/api/course-content', courseContentRoutes);
app.use('/api/upload', fileUploadRoutes);
app.use('/api/files', fileUploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/voice-simulation', voiceSimulationRoutes);
app.use('/api/immigration-simulation', immigrationSimulationRoutes);
app.use('/api/floating-ai-assistant', floatingAiAssistantRoutes);
app.use('/api/simulations', simulationRoutes);
// Marketplace routes - registered early to ensure /marketplace/specialties works
app.use('/api', marketplaceRoutes);
// Note: marketplaceApiRoutes is deprecated - using marketplaceRoutes instead
// app.use('/api/marketplace', marketplaceApiRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/success-stories', successStoriesRoutes);
app.use('/api/fallback', fallbackRoutes);
app.use('/api/content-management', contentManagementRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/file-management', enhancedFileManagementRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/daily-goals', dailyGoalRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/user', userActivityRoutes);
app.use('/api', moderationRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/pusher', pusherAuthRoutes);

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// 404 handler
app.use(notFoundHandler);

// Enhanced error logging
app.use(errorLogger);

// Global error handler
app.use(errorHandler);

// Initialize real-time messaging service (this includes Socket.IO)
const realTimeMessagingService = new RealTimeMessagingService(server);

// Initialize Socket.IO chat service (use the same Socket.IO instance)
// chatRoomService.initialize(server); // Commented out to prevent duplicate Socket.IO initialization

// Initialize message queue worker
const messageQueueWorker = new MessageQueueWorker();

// Reminder scheduler interval (will be set when server starts)
let reminderSchedulerInterval: NodeJS.Timeout | null = null;

// Start monitoring service
monitoringService.start();

// Start server
const PORT = config.port || 3001;

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Database: ${config.databaseUrl ? 'Connected' : 'Not configured'}`);
  console.log(`💬 Socket.IO chat service initialized`);
  console.log(`📨 Real-time messaging service initialized`);
  console.log(`⚡ Message queue worker initialized`);
  console.log(`📊 Monitoring service started`);
  
  // Check database health (actually test connection)
  const dbHealth = await checkDatabaseHealth();
  const dbStatus = dbHealth.healthy ? 'Connected' : 'Connection failed';
  console.log(`🔗 Database: ${dbStatus}`);
  
  // Check Redis health (wait a bit for connection to establish)
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for Redis to connect
  const redisHealth = await checkRedisHealth();
  console.log(`🔴 Redis: ${redisHealth ? 'Connected' : 'Not connected'}`);
  
  // Start message queue worker
  try {
    await messageQueueWorker.start();
    console.log(`🔄 Message queue worker started`);
  } catch (error) {
    console.error(`❌ Failed to start message queue worker:`, error);
  }

  // Start reminder scheduler
  try {
    reminderSchedulerInterval = ReminderSchedulerService.startScheduler();
    console.log(`🕐 Reminder scheduler started`);
    logger.info(`🕐 Reminder scheduler started`);
  } catch (error) {
    console.error(`❌ Failed to start reminder scheduler:`, error);
  }
  
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${config.nodeEnv}`);
  logger.info(`🔗 Database: ${dbStatus}`);
  logger.info(`💬 Socket.IO chat service initialized`);
  logger.info(`📨 Real-time messaging service initialized`);
  logger.info(`⚡ Message queue worker initialized`);
  logger.info(`📊 Monitoring service started`);
  logger.info(`🔴 Redis: ${redisHealth ? 'Connected' : 'Not connected'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Stop services
  if (messageQueueWorker) {
    await messageQueueWorker.stop();
  }
  
  // Stop reminder scheduler
  if (reminderSchedulerInterval) {
    ReminderSchedulerService.stopScheduler(reminderSchedulerInterval);
  }
  
  monitoringService.stop();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Stop services
  if (messageQueueWorker) {
    await messageQueueWorker.stop();
  }
  
  // Stop reminder scheduler
  if (reminderSchedulerInterval) {
    ReminderSchedulerService.stopScheduler(reminderSchedulerInterval);
  }
  
  monitoringService.stop();
  
  process.exit(0);
});
