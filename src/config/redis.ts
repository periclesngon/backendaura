import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Check if Redis is configured
const isRedisEnabled = !!process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost';

// Redis configuration for different use cases (Online Redis Cloud) - OPTIMIZED
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  // Enhanced retry and timeout settings
  maxRetriesPerRequest: isRedisEnabled ? 3 : null, // Stop retrying if Redis not configured
  retryDelayOnFailover: 200,
  connectTimeout: 10000, // Reduced timeout
  commandTimeout: 5000, // Reduced timeout
  lazyConnect: false, // Connect immediately when client is created
  keepAlive: 60000,
  // High availability settings
  enableOfflineQueue: false,
  enableReadyCheck: true,
  maxLoadingTimeout: 5000,
  // Connection pool settings
  family: 4,
  // Performance settings
  maxMemoryPolicy: 'allkeys-lru',
  // Enhanced error handling - stop retrying after 5 attempts if Redis not available
  retryStrategy: (times: number) => {
    if (!isRedisEnabled || times > 5) {
      logger.warn(`Redis connection disabled or max retries reached (${times}). Continuing without Redis.`);
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  // Auto reconnect only if Redis is enabled
  reconnectOnError: (err: Error) => {
    if (!isRedisEnabled) return false;
    const targetError = 'READONLY';
    return err.message.includes(targetError);
  },
};

// Create a safe Redis client factory that handles errors gracefully
const createSafeRedisClient = (config: any, name: string): Redis | null => {
  if (!isRedisEnabled) {
    logger.warn(`Redis ${name} disabled - REDIS_HOST not configured. Running without Redis.`);
    return null;
  }
  
  try {
    const client = new Redis({
      ...config,
      ...redisConfig,
    });
    
    // Add comprehensive error handlers
    client.on('error', (error) => {
      logger.error(`Redis ${name} error:`, error.message);
      // Don't crash the app - just log the error
    });
    
    client.on('connect', () => {
      logger.info(`✅ Redis ${name} connected`);
    });
    
    client.on('ready', () => {
      logger.info(`✅ Redis ${name} ready`);
    });
    
    client.on('close', () => {
      logger.warn(`Redis ${name} connection closed`);
    });
    
    client.on('reconnecting', () => {
      logger.info(`Redis ${name} reconnecting...`);
    });
    
    client.on('end', () => {
      logger.warn(`Redis ${name} connection ended`);
    });
    
    // Attempt to connect immediately
    client.connect().catch((err) => {
      logger.warn(`Redis ${name} initial connection failed (will retry):`, err.message);
    });
    
    return client;
  } catch (error) {
    logger.error(`Failed to create Redis ${name} client:`, error);
    return null;
  }
};

// Main Redis client for general operations
export const redis = createSafeRedisClient({ keyPrefix: 'aura:messaging:' }, 'main') as Redis | null;

// Redis client for Socket.IO adapter
export const redisPubClient = createSafeRedisClient({ keyPrefix: 'aura:socketio:' }, 'pub') as Redis | null;
export const redisSubClient = redisPubClient ? redisPubClient.duplicate() : null;

// Redis client for message queues (high throughput)
export const messageQueueRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:queue:',
  db: 1,
  maxRetriesPerRequest: null,
}, 'queue') as Redis | null;

// Redis client for caching (fast access)
export const cacheRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:cache:',
  db: 2,
  maxRetriesPerRequest: 1,
}, 'cache') as Redis | null;

// Redis client for rate limiting (strict)
export const rateLimitRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:rate:',
  db: 3,
  maxRetriesPerRequest: 1,
}, 'ratelimit') as Redis | null;

// Redis client for sessions
export const sessionRedis = createSafeRedisClient({ keyPrefix: 'aura:session:' }, 'session') as Redis | null;

// Redis client for presence tracking
export const presenceRedis = createSafeRedisClient({ keyPrefix: 'aura:presence:' }, 'presence') as Redis | null;

// Redis client for typing indicators
export const typingRedis = createSafeRedisClient({ keyPrefix: 'aura:typing:' }, 'typing') as Redis | null;

// Redis client for notifications
export const notificationRedis = createSafeRedisClient({ keyPrefix: 'aura:notification:' }, 'notification') as Redis | null;

// Redis client for analytics
export const analyticsRedis = createSafeRedisClient({ keyPrefix: 'aura:analytics:' }, 'analytics') as Redis | null;

// Redis client for search indexing
export const searchRedis = createSafeRedisClient({ keyPrefix: 'aura:search:' }, 'search') as Redis | null;

// Redis client for file uploads
export const uploadRedis = createSafeRedisClient({ keyPrefix: 'aura:upload:' }, 'upload') as Redis | null;

// Redis client for encryption keys
export const encryptionRedis = createSafeRedisClient({ keyPrefix: 'aura:encryption:' }, 'encryption') as Redis | null;

// Redis client for webhooks
export const webhookRedis = createSafeRedisClient({ keyPrefix: 'aura:webhook:' }, 'webhook') as Redis | null;

// Redis client for dead letter queue
export const deadLetterRedis = createSafeRedisClient({ keyPrefix: 'aura:deadletter:' }, 'deadletter') as Redis | null;

// Redis client for monitoring
export const monitoringRedis = createSafeRedisClient({ keyPrefix: 'aura:monitoring:' }, 'monitoring') as Redis | null;

// Redis client for testing
export const testRedis = createSafeRedisClient({ keyPrefix: 'aura:test:' }, 'test') as Redis | null;

// Redis cluster configuration (for production scaling)
export const createRedisCluster = () => {
  if (process.env.REDIS_CLUSTER_NODES) {
    const nodes = process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port) };
    });

    return new Redis.Cluster(nodes, {
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        keyPrefix: 'aura:messaging:',
      },
      enableOfflineQueue: false,
      enableReadyCheck: true,
      scaleReads: 'slave',
    });
  }
  return null;
};

// Redis Sentinel configuration (for high availability)
export const createRedisSentinel = () => {
  if (process.env.REDIS_SENTINEL_HOSTS) {
    const sentinels = process.env.REDIS_SENTINEL_HOSTS.split(',').map(host => {
      const [hostname, port] = host.split(':');
      return { host: hostname, port: parseInt(port) };
    });

    return new Redis({
      sentinels,
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'aura:messaging:',
    });
  }
  return null;
};

// Event handlers are now set up in createSafeRedisClient
// No need for separate setup function

// Health check function
export const checkRedisHealth = async (): Promise<boolean> => {
  if (!isRedisEnabled || !redis) {
    logger.info('Redis health check skipped - Redis not configured');
    return false;
  }
  try {
    // Wait up to 3 seconds for connection to establish
    let attempts = 0;
    while (attempts < 6 && (redis.status === 'connecting' || redis.status === 'connect' || redis.status === 'wait')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    // Try to ping - this will work if connected
    await redis.ping();
    return true;
  } catch (error) {
    // If ping fails, try to connect
    try {
      if (redis.status !== 'connecting' && redis.status !== 'connect' && redis.status !== 'wait') {
        await redis.connect().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
        await redis.ping();
        return true;
      }
    } catch (connectError) {
      logger.warn('Redis health check failed:', connectError);
    }
    return false;
  }
};

// Get Redis info
export const getRedisInfo = async () => {
  if (!isRedisEnabled || !redis) {
    return {
      status: 'disabled',
      message: 'Redis is not configured'
    };
  }
  try {
    const info = await redis.info();
    return {
      status: 'connected',
      info: info.split('\r\n').reduce((acc, line) => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>)
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error?.message || 'Unknown error'
    };
  }
};

// Graceful shutdown
export const shutdownRedis = async () => {
  if (!isRedisEnabled) {
    logger.info('Redis shutdown skipped - Redis not configured');
    return;
  }
  
  logger.info('Shutting down Redis connections...');
  
  const clients = [
    redis, redisPubClient, redisSubClient, messageQueueRedis,
    cacheRedis, sessionRedis, rateLimitRedis, presenceRedis,
    typingRedis, notificationRedis, analyticsRedis, searchRedis,
    uploadRedis, encryptionRedis, webhookRedis, deadLetterRedis,
    monitoringRedis, testRedis
  ].filter(Boolean) as Redis[]; // Filter out null clients

  await Promise.allSettled(clients.map(client => client.quit().catch(err => logger.warn('Error closing Redis client:', err))));
  logger.info('All Redis connections closed');
};

// Process cleanup
process.on('SIGINT', shutdownRedis);
process.on('SIGTERM', shutdownRedis);
process.on('beforeExit', shutdownRedis);

export default redis;
