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

// Main Redis client for general operations (shared by multiple services)
export const redis = createSafeRedisClient({ keyPrefix: 'aura:messaging:' }, 'main') as Redis | null;

// Redis client for Socket.IO adapter (pub/sub pattern requires separate clients)
export const redisPubClient = createSafeRedisClient({ keyPrefix: 'aura:socketio:' }, 'pub') as Redis | null;
export const redisSubClient = redisPubClient ? redisPubClient.duplicate() : null;

// Redis client for message queues (uses separate DB for isolation)
export const messageQueueRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:queue:',
  db: 1,
  maxRetriesPerRequest: null,
}, 'queue') as Redis | null;

// Redis client for caching (uses separate DB for isolation)
export const cacheRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:cache:',
  db: 2,
  maxRetriesPerRequest: 1,
}, 'cache') as Redis | null;

// Redis client for rate limiting (uses separate DB for isolation)
export const rateLimitRedis = createSafeRedisClient({ 
  keyPrefix: 'aura:rate:',
  db: 3,
  maxRetriesPerRequest: 1,
}, 'ratelimit') as Redis | null;

// CONSOLIDATED: Reuse clients where possible to reduce connection count
// Note: Services using these should ensure key prefixes don't conflict
// Total connections reduced from 18+ to ~7 (main, pub, sub, queue, cache, ratelimit, monitoring)

// Reuse main client for services that can share the 'aura:messaging:' prefix
export const sessionRedis = redis;
export const presenceRedis = redis;
export const typingRedis = redis;
export const notificationRedis = redis;
export const analyticsRedis = redis;
export const searchRedis = redis;
export const uploadRedis = redis;
export const encryptionRedis = redis;
export const webhookRedis = redis;
export const deadLetterRedis = messageQueueRedis; // Reuse message queue client (same DB)

// Keep monitoringRedis separate as it needs 'aura:monitoring:' prefix for monitoring-specific keys
export const monitoringRedis = createSafeRedisClient({ keyPrefix: 'aura:monitoring:' }, 'monitoring') as Redis | null;

// Test client - reuse main in production, separate only if needed for testing
export const testRedis = redis;

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
  
  // Only shutdown unique clients (consolidated clients are references, not new connections)
  const uniqueClients = [
    redis, 
    redisPubClient, 
    redisSubClient, // subClient is a duplicate of pubClient, but needs to be closed separately
    messageQueueRedis,
    cacheRedis, 
    rateLimitRedis,
    monitoringRedis
  ].filter((client, index, self) => {
    // Remove duplicates (subClient might be duplicate of pubClient)
    return client && self.indexOf(client) === index;
  }) as Redis[];

  await Promise.allSettled(uniqueClients.map(client => client.quit().catch(err => logger.warn('Error closing Redis client:', err))));
  logger.info(`All Redis connections closed (${uniqueClients.length} unique clients)`);
};

// Process cleanup
process.on('SIGINT', shutdownRedis);
process.on('SIGTERM', shutdownRedis);
process.on('beforeExit', shutdownRedis);

export default redis;
