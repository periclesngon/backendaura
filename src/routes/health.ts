import { Router, Request, Response } from 'express';
import { prisma, checkDatabaseHealth } from '@/config/database';
import { checkRedisHealth } from '@/config/redis';
import { logger } from '@/utils/logger';

const router = Router();

// Enhanced health check endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check database and Redis health
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);
    
    const isHealthy = dbHealth.healthy && redisHealth;
    
    const healthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbHealth.details,
        redis: redisHealth ? 'connected' : 'disconnected',
        server: 'running'
      }
    };

    res.status(isHealthy ? 200 : 503).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', error);
    
    const healthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'error',
        redis: 'error',
        server: 'running'
      },
      error: 'Health check failed'
    };

    res.status(503).json(healthStatus);
  }
});

// Detailed health check
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Test database query
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - startTime;

    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: {
          status: 'connected',
          responseTime: `${dbResponseTime}ms`
        },
        server: {
          status: 'running',
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB'
          },
          cpu: {
            usage: process.cpuUsage()
          }
        }
      }
    };

    res.status(200).json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable'
    });
  }
});

export { router as healthRoutes };
