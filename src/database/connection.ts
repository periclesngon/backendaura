import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

// Global variable to store Prisma client instance
declare global {
  var __prisma: PrismaClient | undefined;
}

// Handle SSL certificate issues for Aiven cloud database
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Create Prisma client instance
const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  });
};

// Use global variable in development to prevent multiple instances
const prisma = globalThis.__prisma || createPrismaClient();

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

// Event listeners for logging (commented out due to TypeScript issues)
// prisma.$on('query', (e) => {
//   logger.debug('Database Query', {
//     query: e.query,
//     params: e.params,
//     duration: `${e.duration}ms`,
//     timestamp: e.timestamp
//   });
// });

// prisma.$on('error', (e) => {
//   logger.error('Database Error', {
//     message: e.message,
//     target: e.target,
//     timestamp: e.timestamp
//   });
// });

// prisma.$on('info', (e) => {
//   logger.info('Database Info', {
//     message: e.message,
//     target: e.target,
//     timestamp: e.timestamp
//   });
// });

// prisma.$on('warn', (e) => {
//   logger.warn('Database Warning', {
//     message: e.message,
//     target: e.target,
//     timestamp: e.timestamp
//   });
// });

// Connection test function
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', error);
    return false;
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from database', error);
  }
};

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

export { prisma };
export default prisma;
