import { MessagingService } from '../services/messagingService';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

export class MessageQueueWorker {
  private messagingService: MessagingService;
  private redis: Redis | null;
  private isRunning: boolean = false;
  private workerId: string;

  constructor() {
    this.workerId = `worker-${process.pid}-${Date.now()}`;
    
    // Only create Redis client if Redis is configured
    if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
      try {
    this.redis = new Redis({
          host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
          lazyConnect: false, // Connect immediately
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => times > 5 ? null : Math.min(times * 200, 2000),
        });
        
        this.redis.on('error', (err) => {
          logger.warn('Message queue worker Redis error:', err.message);
        });
      } catch (error) {
        logger.warn('Failed to create Redis client for message queue worker:', error);
        this.redis = null;
      }
    } else {
      logger.warn('Message queue worker initialized without Redis - worker will not process messages');
      this.redis = null;
    }

    this.messagingService = new MessagingService(null as any);
    
    logger.info('Message queue worker initialized', { workerId: this.workerId, hasRedis: !!this.redis });
  }

  /**
   * Start the worker
   */
  async start() {
    if (!this.redis) {
      logger.warn('Cannot start message queue worker - Redis not configured');
      return;
    }
    
    if (this.isRunning) {
      logger.warn('Worker is already running', { workerId: this.workerId });
      return;
    }

    this.isRunning = true;
    logger.info('Starting message queue worker', { workerId: this.workerId });

    // Start processing messages
    this.processMessages();

    // Start processing notifications
    this.processNotifications();

    // Start processing delivery confirmations
    this.processDeliveryConfirmations();

    // Start processing read receipts
    this.processReadReceipts();

    // Start cleanup tasks
    this.startCleanupTasks();
  }

  /**
   * Stop the worker
   */
  async stop() {
    this.isRunning = false;
    logger.info('Stopping message queue worker', { workerId: this.workerId });
    if (this.redis) {
      await this.redis.quit().catch(err => logger.warn('Error closing Redis:', err));
    }
  }

  /**
   * Process messages from the queue
   */
  private async processMessages() {
    if (!this.redis) return; // Exit if Redis not available
    
    while (this.isRunning) {
      try {
        // Get message from queue (blocking call)
        const message = await this.messagingService.getMessageFromQueue();
        
        if (message) {
          await this.handleMessage(message);
        }
      } catch (error) {
        logger.error('Error processing message', { 
          error: error.message, 
          workerId: this.workerId 
        });
        
        // Wait before retrying
        await this.sleep(1000);
      }
    }
  }

  /**
   * Handle individual message
   */
  private async handleMessage(messageData: any) {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing message', { 
        messageId: messageData.id, 
        workerId: this.workerId 
      });

      // Save message to database
      const savedMessage = await this.messagingService.saveMessage(messageData);

      // Send real-time notification
      await this.messagingService.sendRealTimeNotification(savedMessage);

      // Process any additional features
      await this.processMessageFeatures(savedMessage);

      const processingTime = Date.now() - startTime;
      logger.info('Message processed successfully', { 
        messageId: savedMessage.id, 
        processingTime,
        workerId: this.workerId 
      });

    } catch (error) {
      logger.error('Failed to process message', { 
        error: error.message, 
        messageId: messageData.id,
        workerId: this.workerId 
      });

      // Add to dead letter queue for manual review
      await this.addToDeadLetterQueue(messageData, error);
    }
  }

  /**
   * Process message features (encryption, indexing, etc.)
   */
  private async processMessageFeatures(message: any) {
    try {
      // Update search index
      await this.messagingService.updateSearchIndex(message);

      // Process attachments if any
      if (message.attachments && message.attachments.length > 0) {
        await this.messagingService.processAttachments(message);
      }

      // Update conversation metadata
      await this.messagingService.updateConversationMetadata(message);

      // Trigger any webhooks
      await this.messagingService.triggerWebhooks(message);

    } catch (error) {
      logger.error('Error processing message features', { 
        error: error.message, 
        messageId: message.id,
        workerId: this.workerId 
      });
    }
  }

  /**
   * Process notifications queue
   */
  private async processNotifications() {
    if (!this.redis) return; // Exit if Redis not available
    
    while (this.isRunning) {
      try {
        const notification = await this.redis.brpop('notification_queue', 1);
        
        if (notification && notification[1]) {
          const notificationData = JSON.parse(notification[1]);
          await this.handleNotification(notificationData);
        }
      } catch (error) {
        logger.error('Error processing notification', { 
          error: error.message, 
          workerId: this.workerId 
        });
        await this.sleep(1000);
      }
    }
  }

  /**
   * Handle notification
   */
  private async handleNotification(notificationData: any) {
    try {
      // Send push notification
      await this.messagingService.sendPushNotification(notificationData);

      // Send email notification if configured
      if (notificationData.emailNotification) {
        await this.messagingService.sendEmailNotification(notificationData);
      }

      // Send SMS notification if configured
      if (notificationData.smsNotification) {
        await this.messagingService.sendSMSNotification(notificationData);
      }

      logger.info('Notification processed', { 
        notificationId: notificationData.id,
        workerId: this.workerId 
      });

    } catch (error) {
      logger.error('Failed to process notification', { 
        error: error.message, 
        notificationId: notificationData.id,
        workerId: this.workerId 
      });
    }
  }

  /**
   * Process delivery confirmations
   */
  private async processDeliveryConfirmations() {
    if (!this.redis) return; // Exit if Redis not available
    
    while (this.isRunning) {
      try {
        const confirmation = await this.redis.brpop('delivery_confirmation_queue', 1);
        
        if (confirmation && confirmation[1]) {
          const confirmationData = JSON.parse(confirmation[1]);
          await this.handleDeliveryConfirmation(confirmationData);
        }
      } catch (error) {
        logger.error('Error processing delivery confirmation', { 
          error: error.message, 
          workerId: this.workerId 
        });
        await this.sleep(1000);
      }
    }
  }

  /**
   * Handle delivery confirmation
   */
  private async handleDeliveryConfirmation(confirmationData: any) {
    try {
      await this.messagingService.updateMessageDeliveryStatus(
        confirmationData.messageId, 
        confirmationData.status,
        confirmationData.timestamp
      );

      logger.debug('Delivery confirmation processed', { 
        messageId: confirmationData.messageId,
        status: confirmationData.status,
        workerId: this.workerId 
      });

    } catch (error) {
      logger.error('Failed to process delivery confirmation', { 
        error: error.message, 
        messageId: confirmationData.messageId,
        workerId: this.workerId 
      });
    }
  }

  /**
   * Process read receipts
   */
  private async processReadReceipts() {
    if (!this.redis) return; // Exit if Redis not available
    
    while (this.isRunning) {
      try {
        const receipt = await this.redis.brpop('read_receipt_queue', 1);
        
        if (receipt && receipt[1]) {
          const receiptData = JSON.parse(receipt[1]);
          await this.handleReadReceipt(receiptData);
        }
      } catch (error) {
        logger.error('Error processing read receipt', { 
          error: error.message, 
          workerId: this.workerId 
        });
        await this.sleep(1000);
      }
    }
  }

  /**
   * Handle read receipt
   */
  private async handleReadReceipt(receiptData: any) {
    try {
      await this.messagingService.updateMessageReadStatus(
        receiptData.messageId, 
        receiptData.readBy,
        receiptData.timestamp
      );

      logger.debug('Read receipt processed', { 
        messageId: receiptData.messageId,
        readBy: receiptData.readBy,
        workerId: this.workerId 
      });

    } catch (error) {
      logger.error('Failed to process read receipt', { 
        error: error.message, 
        messageId: receiptData.messageId,
        workerId: this.workerId 
      });
    }
  }

  /**
   * Add message to dead letter queue
   */
  private async addToDeadLetterQueue(messageData: any, error: any) {
    try {
      const deadLetterData = {
        originalMessage: messageData,
        error: error.message,
        timestamp: new Date(),
        workerId: this.workerId
      };

      if (this.redis) {
        await this.redis.lpush('dead_letter_queue', JSON.stringify(deadLetterData)).catch(err => 
          logger.warn('Failed to add to dead letter queue:', err)
        );
      }
      
      logger.warn('Message added to dead letter queue', { 
        messageId: messageData.id,
        error: error.message,
        workerId: this.workerId 
      });

    } catch (dlqError) {
      logger.error('Failed to add message to dead letter queue', { 
        error: dlqError.message,
        originalMessageId: messageData.id,
        workerId: this.workerId 
      });
    }
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks() {
    // Clean up old messages every hour
    setInterval(async () => {
      try {
        await this.messagingService.cleanupOldMessages();
        logger.info('Old messages cleanup completed', { workerId: this.workerId });
      } catch (error) {
        logger.error('Failed to cleanup old messages', { 
          error: error.message, 
          workerId: this.workerId 
        });
      }
    }, 3600000); // 1 hour

    // Clean up expired sessions every 30 minutes
    setInterval(async () => {
      try {
        await this.messagingService.cleanupExpiredSessions();
        logger.info('Expired sessions cleanup completed', { workerId: this.workerId });
      } catch (error) {
        logger.error('Failed to cleanup expired sessions', { 
          error: error.message, 
          workerId: this.workerId 
        });
      }
    }, 1800000); // 30 minutes

    // Log worker statistics every 5 minutes
    setInterval(() => {
      this.logWorkerStats();
    }, 300000); // 5 minutes
  }

  /**
   * Log worker statistics
   */
  private logWorkerStats() {
    const stats = {
      workerId: this.workerId,
      isRunning: this.isRunning,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      queueLength: 0, // TODO: Get actual queue length
      processedMessages: 0, // TODO: Track processed messages
      errors: 0 // TODO: Track errors
    };

    logger.info('Worker statistics', stats);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  const worker = new MessageQueueWorker();
  
  worker.start().catch(error => {
    logger.error('Failed to start message queue worker', { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down worker gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down worker gracefully...');
    await worker.stop();
    process.exit(0);
  });
}

export default MessageQueueWorker;
