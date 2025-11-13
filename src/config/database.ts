import { PrismaClient } from '@prisma/client';

// Enhanced database URL with connection pool parameters - OPTIMIZED
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }
  
  // Add connection pool parameters if not already present
  // Increased for 800+ concurrent users
  const url = new URL(baseUrl);
  if (!url.searchParams.has('connection_limit')) {
    // Increased from 20 to 100 for better concurrency
    // Formula: (concurrent_users / 10) + buffer = (800/10) + 20 = 100
    url.searchParams.set('connection_limit', '100');
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', '60');
  }
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', '60');
  }
  if (!url.searchParams.has('statement_timeout')) {
    url.searchParams.set('statement_timeout', '30000');
  }
  if (!url.searchParams.has('idle_in_transaction_session_timeout')) {
    url.searchParams.set('idle_in_transaction_session_timeout', '30000');
  }
  if (!url.searchParams.has('tcp_keepalives_idle')) {
    url.searchParams.set('tcp_keepalives_idle', '600');
  }
  if (!url.searchParams.has('tcp_keepalives_interval')) {
    url.searchParams.set('tcp_keepalives_interval', '30');
  }
  if (!url.searchParams.has('tcp_keepalives_count')) {
    url.searchParams.set('tcp_keepalives_count', '3');
  }
  
  return url.toString();
};

// Configure Prisma client with proper connection pooling and SSL handling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Handle SSL certificate issues for cloud databases
if (process.env.NODE_ENV === 'development') {
  // Disable SSL verification for development with cloud databases
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Enhanced connection retry logic for Neon database
const connectWithRetry = async (maxRetries = 3, delay = 2000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return true;
    } catch (error: any) {
      console.error(`❌ Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      } else {
        console.error('❌ All database connection attempts failed');
        throw error;
      }
    }
  }
  return false;
};

// Initialize connection on startup
connectWithRetry().catch(err => {
  console.error('❌ Failed to connect to database:', err);
});

// Connection pool monitoring and error handling
let connectionPoolHealthy = true;

// Monitor connection pool health
const monitorConnectionPool = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!connectionPoolHealthy) {
      console.log('✅ Database connection pool recovered');
      connectionPoolHealthy = true;
    }
  } catch (error) {
    if (connectionPoolHealthy) {
      console.error('❌ Database connection pool issues detected:', error);
      connectionPoolHealthy = false;
    }
  }
};

// Monitor connection pool every 30 seconds
setInterval(monitorConnectionPool, 30000);

// Enhanced health check with detailed logging
export const checkDatabaseHealth = async (): Promise<{ healthy: boolean; details: any }> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as health_check`;
    const duration = Date.now() - start;
    
    return {
      healthy: true,
      details: {
        status: 'connected',
        responseTime: `${duration}ms`,
        timestamp: new Date().toISOString(),
        connectionPoolHealthy
      }
    };
  } catch (error: any) {
    return {
      healthy: false,
      details: {
        status: 'error',
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        connectionPoolHealthy
      }
    };
  }
};

// Enhanced error handling for connection pool exhaustion with exponential backoff
const originalQuery = prisma.$queryRaw;
(prisma as any).$queryRaw = async (query: any, ...args: any[]) => {
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
      return await originalQuery.call(prisma, query, ...args);
    } catch (error: any) {
      lastError = error;
      
      // Handle specific database errors
      if (error.code === 'P2024' || error.code === 'P1001' || error.code === 'P1008') {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.error(`🚨 Database connection issue (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`, error.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
  }
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw lastError;
};

// Graceful shutdown
process.on('beforeExit', async () => {
  console.log('🔄 Disconnecting from database...');
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

export { prisma };
export default prisma;
