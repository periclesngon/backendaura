import { monitoringRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

export class MonitoringService {
  private metrics: Map<string, number> = new Map();
  private alerts: Map<string, any> = new Map();
  private isMonitoring: boolean = false;

  constructor() {
    this.initializeMetrics();
    this.setupAlerts();
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics() {
    this.metrics.set('messages_sent_total', 0);
    this.metrics.set('messages_delivered_total', 0);
    this.metrics.set('messages_read_total', 0);
    this.metrics.set('active_connections', 0);
    this.metrics.set('active_conversations', 0);
    this.metrics.set('queue_length', 0);
    this.metrics.set('processing_time_avg', 0);
    this.metrics.set('error_rate', 0);
    this.metrics.set('memory_usage', 0);
    this.metrics.set('cpu_usage', 0);
    this.metrics.set('database_connections', 0);
    this.metrics.set('redis_connections', 0);
    this.metrics.set('websocket_connections', 0);
    this.metrics.set('api_requests_total', 0);
    this.metrics.set('api_requests_success', 0);
    this.metrics.set('api_requests_error', 0);
    this.metrics.set('cache_hits', 0);
    this.metrics.set('cache_misses', 0);
    this.metrics.set('search_queries', 0);
    this.metrics.set('file_uploads', 0);
    this.metrics.set('notifications_sent', 0);
    this.metrics.set('encryption_operations', 0);
    this.metrics.set('webhook_calls', 0);
  }

  /**
   * Setup monitoring alerts
   */
  private setupAlerts() {
    // High error rate alert
    this.alerts.set('high_error_rate', {
      threshold: 0.05, // 5%
      condition: (value: number) => value > 0.05,
      message: 'High error rate detected',
      severity: 'critical'
    });

    // High memory usage alert
    this.alerts.set('high_memory_usage', {
      threshold: 0.9, // 90%
      condition: (value: number) => value > 0.9,
      message: 'High memory usage detected',
      severity: 'warning'
    });

    // High queue length alert
    this.alerts.set('high_queue_length', {
      threshold: 1000,
      condition: (value: number) => value > 1000,
      message: 'High message queue length detected',
      severity: 'warning'
    });

    // Low active connections alert
    this.alerts.set('low_connections', {
      threshold: 10,
      condition: (value: number) => value < 10,
      message: 'Low active connections detected',
      severity: 'info'
    });

    // High processing time alert
    this.alerts.set('high_processing_time', {
      threshold: 5000, // 5 seconds
      condition: (value: number) => value > 5000,
      message: 'High message processing time detected',
      severity: 'warning'
    });
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isMonitoring) {
      logger.warn('Monitoring service is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting monitoring service');

    // Collect metrics every 30 seconds
    setInterval(() => {
      this.collectMetrics();
    }, 30000);

    // Check alerts every minute
    setInterval(() => {
      this.checkAlerts();
    }, 60000);

    // Store metrics in Redis every 5 minutes
    setInterval(() => {
      this.storeMetrics();
    }, 300000);

    // Cleanup old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    logger.info('Stopping monitoring service');
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics() {
    try {
      // Memory usage
      const memoryUsage = process.memoryUsage();
      this.metrics.set('memory_usage', memoryUsage.heapUsed / memoryUsage.heapTotal);

      // CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      this.metrics.set('cpu_usage', cpuUsage.user + cpuUsage.system);

      // Database connections
      try {
        const dbConnections = await prisma.$queryRaw`SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'`;
        this.metrics.set('database_connections', (dbConnections as any)[0].count);
      } catch (error) {
        logger.error('Failed to get database connections:', error);
      }

      // Redis connections
      try {
        const redisInfo = await monitoringRedis.info('clients');
        const connectedClients = redisInfo.match(/connected_clients:(\d+)/);
        if (connectedClients) {
          this.metrics.set('redis_connections', parseInt(connectedClients[1]));
        }
      } catch (error) {
        logger.error('Failed to get Redis connections:', error);
      }

      // Queue length
      try {
        const queueLength = await monitoringRedis.llen('message_queue');
        this.metrics.set('queue_length', queueLength);
      } catch (error) {
        logger.error('Failed to get queue length:', error);
      }

      // Active conversations
      try {
        const activeConversations = await prisma.chatSession.count({
          where: { isActive: true }
        });
        this.metrics.set('active_conversations', activeConversations);
      } catch (error) {
        logger.error('Failed to get active conversations:', error);
      }

      // Calculate error rate
      const totalRequests = this.metrics.get('api_requests_total') || 0;
      const errorRequests = this.metrics.get('api_requests_error') || 0;
      const errorRate = totalRequests > 0 ? errorRequests / totalRequests : 0;
      this.metrics.set('error_rate', errorRate);

      logger.debug('Metrics collected', {
        memoryUsage: this.metrics.get('memory_usage'),
        cpuUsage: this.metrics.get('cpu_usage'),
        databaseConnections: this.metrics.get('database_connections'),
        redisConnections: this.metrics.get('redis_connections'),
        queueLength: this.metrics.get('queue_length'),
        activeConversations: this.metrics.get('active_conversations'),
        errorRate: this.metrics.get('error_rate')
      });

    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Check alerts
   */
  private checkAlerts() {
    this.alerts.forEach((alert, alertName) => {
      const metricValue = this.metrics.get(alertName.replace('_alert', ''));
      
      if (metricValue !== undefined && alert.condition(metricValue)) {
        this.triggerAlert(alertName, alert, metricValue);
      }
    });
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alertName: string, alert: any, value: number) {
    const alertData = {
      name: alertName,
      message: alert.message,
      severity: alert.severity,
      value: value,
      threshold: alert.threshold,
      timestamp: new Date(),
      resolved: false
    };

    // Store alert in Redis
    await monitoringRedis.lpush('alerts', JSON.stringify(alertData));

    // Log alert
    logger.warn('Alert triggered', alertData);

    // Send notification if critical
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alertData);
    }
  }

  /**
   * Send critical alert notification
   */
  private async sendCriticalAlert(alertData: any) {
    try {
      // Send to monitoring system (e.g., Slack, email, etc.)
      logger.error('CRITICAL ALERT', alertData);
      
      // Store in database for persistence
      await monitoringRedis.hset('critical_alerts', alertData.name, JSON.stringify(alertData));
      
    } catch (error) {
      logger.error('Failed to send critical alert:', error);
    }
  }

  /**
   * Store metrics in Redis
   */
  private async storeMetrics() {
    try {
      const timestamp = Date.now();
      const metricsData = {
        timestamp,
        metrics: Object.fromEntries(this.metrics)
      };

      // Store in Redis with TTL of 7 days
      await monitoringRedis.setex(
        `metrics:${timestamp}`,
        604800, // 7 days
        JSON.stringify(metricsData)
      );

      // Store in time series for analytics
      const pipeline = monitoringRedis.pipeline();
      this.metrics.forEach((value, key) => {
        pipeline.zadd(`metrics:${key}`, timestamp, value);
      });
      await pipeline.exec();

      logger.debug('Metrics stored in Redis', { timestamp, count: this.metrics.size });

    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }

  /**
   * Cleanup old metrics
   */
  private async cleanupOldMetrics() {
    try {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      // Clean up old metrics from time series
      const pipeline = monitoringRedis.pipeline();
      this.metrics.forEach((_, key) => {
        pipeline.zremrangebyscore(`metrics:${key}`, 0, oneWeekAgo);
      });
      await pipeline.exec();

      // Clean up old alerts
      await monitoringRedis.ltrim('alerts', 0, 999); // Keep last 1000 alerts

      logger.info('Old metrics cleaned up');

    } catch (error) {
      logger.error('Failed to cleanup old metrics:', error);
    }
  }

  /**
   * Increment counter metric
   */
  incrementCounter(metricName: string, value: number = 1) {
    const current = this.metrics.get(metricName) || 0;
    this.metrics.set(metricName, current + value);
  }

  /**
   * Set gauge metric
   */
  setGauge(metricName: string, value: number) {
    this.metrics.set(metricName, value);
  }

  /**
   * Record timing metric
   */
  recordTiming(metricName: string, duration: number) {
    const current = this.metrics.get(metricName) || 0;
    const count = this.metrics.get(`${metricName}_count`) || 0;
    
    // Calculate running average
    const newAverage = (current * count + duration) / (count + 1);
    
    this.metrics.set(metricName, newAverage);
    this.metrics.set(`${metricName}_count`, count + 1);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Get metrics for a specific time range
   */
  async getMetricsForTimeRange(metricName: string, startTime: number, endTime: number) {
    try {
      const values = await monitoringRedis.zrangebyscore(
        `metrics:${metricName}`,
        startTime,
        endTime,
        'WITHSCORES'
      );

      return values.reduce((acc, value, index) => {
        if (index % 2 === 0) {
          acc.push({
            timestamp: parseInt(values[index + 1]),
            value: parseFloat(value)
          });
        }
        return acc;
      }, [] as Array<{ timestamp: number; value: number }>);

    } catch (error) {
      logger.error('Failed to get metrics for time range:', error);
      return [];
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit: number = 100) {
    try {
      const alerts = await monitoringRedis.lrange('alerts', 0, limit - 1);
      return alerts.map(alert => JSON.parse(alert));
    } catch (error) {
      logger.error('Failed to get recent alerts:', error);
      return [];
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        metrics: this.getMetrics(),
        alerts: await this.getRecentAlerts(10),
        services: {
          database: await this.checkDatabaseHealth(),
          redis: await this.checkRedisHealth(),
          websocket: await this.checkWebSocketHealth()
        }
      };

      // Determine overall health status
      const criticalAlerts = health.alerts.filter(alert => alert.severity === 'critical');
      if (criticalAlerts.length > 0) {
        health.status = 'critical';
      } else if (health.alerts.some(alert => alert.severity === 'warning')) {
        health.status = 'warning';
      }

      return health;

    } catch (error) {
      logger.error('Failed to get health status:', error);
      return {
        status: 'error',
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth() {
    try {
      const start = Date.now();
      await monitoringRedis.ping();
      return { status: 'healthy', responseTime: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Check WebSocket health
   */
  private async checkWebSocketHealth() {
    // This would check WebSocket server health
    // For now, return basic status
    return { status: 'healthy', activeConnections: this.metrics.get('active_connections') || 0 };
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport() {
    try {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      const oneDayAgo = now - (24 * 60 * 60 * 1000);

      const report = {
        timestamp: new Date(),
        period: '24h',
        summary: {
          totalMessages: this.metrics.get('messages_sent_total') || 0,
          totalConnections: this.metrics.get('active_connections') || 0,
          averageProcessingTime: this.metrics.get('processing_time_avg') || 0,
          errorRate: this.metrics.get('error_rate') || 0,
          memoryUsage: this.metrics.get('memory_usage') || 0,
          cpuUsage: this.metrics.get('cpu_usage') || 0
        },
        trends: {
          messagesPerHour: await this.getMetricsForTimeRange('messages_sent_total', oneHourAgo, now),
          connectionsPerHour: await this.getMetricsForTimeRange('active_connections', oneHourAgo, now),
          errorRatePerHour: await this.getMetricsForTimeRange('error_rate', oneHourAgo, now)
        },
        alerts: await this.getRecentAlerts(50),
        recommendations: this.generateRecommendations()
      };

      return report;

    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations() {
    const recommendations = [];

    const errorRate = this.metrics.get('error_rate') || 0;
    if (errorRate > 0.05) {
      recommendations.push({
        type: 'error_rate',
        message: 'High error rate detected. Consider reviewing error logs and improving error handling.',
        priority: 'high'
      });
    }

    const memoryUsage = this.metrics.get('memory_usage') || 0;
    if (memoryUsage > 0.8) {
      recommendations.push({
        type: 'memory_usage',
        message: 'High memory usage detected. Consider optimizing memory usage or scaling resources.',
        priority: 'medium'
      });
    }

    const queueLength = this.metrics.get('queue_length') || 0;
    if (queueLength > 1000) {
      recommendations.push({
        type: 'queue_length',
        message: 'High message queue length detected. Consider scaling message processing workers.',
        priority: 'medium'
      });
    }

    const processingTime = this.metrics.get('processing_time_avg') || 0;
    if (processingTime > 5000) {
      recommendations.push({
        type: 'processing_time',
        message: 'High message processing time detected. Consider optimizing message processing logic.',
        priority: 'medium'
      });
    }

    return recommendations;
  }
}

export const monitoringService = new MonitoringService();
export default monitoringService;
