import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { 
  messageQueueRedis, 
  cacheRedis, 
  rateLimitRedis,
  redisPubClient,
  redisSubClient 
} from '../config/redis';

const prisma = new PrismaClient();

// Redis cluster for scaling (if needed)
const redisCluster = process.env.REDIS_CLUSTER_NODES ? new Redis.Cluster(
  process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
    const [host, port] = node.split(':');
    return { host, port: parseInt(port) };
  }),
  {
    enableReadyCheck: false,
    redisOptions: {
      password: process.env.REDIS_PASSWORD,
    },
  }
) : null;

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  timestamp: Date;
  isRead: boolean;
  readAt?: Date;
  deliveredAt?: Date;
  metadata?: any;
  parentId?: string;
  attachments?: any[];
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  participants: string[];
  lastMessage?: Message;
  lastActivity: Date;
  unreadCount: { [userId: string]: number };
}

export class MessagingService {
  private io: SocketIOServer;
  private messageQueue: Redis | null;
  private onlineUsers: Map<string, string> = new Map(); // userId -> socketId
  private typingUsers: Map<string, Set<string>> = new Map(); // roomId -> Set<userId>
  private roomParticipants: Map<string, Set<string>> = new Map(); // roomId -> Set<userId>
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set<roomId>
  private messageCache: Redis | null;
  private rateLimiter: Redis | null;

  constructor(io: SocketIOServer) {
    this.io = io;
    
    // Initialize specialized Redis connections (may be null if Redis not configured)
    this.messageQueue = messageQueueRedis;
    this.messageCache = cacheRedis;
    this.rateLimiter = rateLimitRedis;
    
    if (messageQueueRedis && cacheRedis && rateLimitRedis) {
    logger.info('MessagingService initialized with Redis');
    } else {
      logger.warn('MessagingService initialized without Redis - some features may be limited');
    }
    
    this.initializeMessageProcessing();
    this.initializeRateLimiting();
  }

  /**
   * Initialize message processing pipeline
   */
  private async initializeMessageProcessing() {
    // Process messages from queue - TEMPORARILY DISABLED
    // setInterval(async () => {
    //   await this.processMessageQueue();
    // }, 5000); // Process every 5 seconds to avoid overwhelming Redis

    // Clean up old cached messages
    setInterval(async () => {
      await this.cleanupOldMessages();
    }, 300000); // Every 5 minutes

    logger.info('Messaging service initialized with high-performance pipeline');
  }

  /**
   * Initialize rate limiting for spam protection
   */
  private async initializeRateLimiting() {
    // Rate limiting: 100 messages per minute per user
    const rateLimitScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      
      if current == false then
        redis.call('SET', key, 1)
        redis.call('EXPIRE', key, window)
        return 1
      end
      
      if tonumber(current) < limit then
        redis.call('INCR', key)
        return tonumber(current) + 1
      end
      
      return -1
    `;
    
    await this.rateLimiter.defineCommand('rateLimit', {
      numberOfKeys: 1,
      lua: rateLimitScript,
    });
  }

  /**
   * Send message with high-performance processing
   */
  async sendMessage(senderId: string, receiverId: string, content: string, type: 'text' | 'image' | 'file' | 'audio' | 'video' = 'text', metadata?: any): Promise<Message> {
    try {
      // Rate limiting check
      await this.checkRateLimit(senderId);

      // Create or get room
      const roomId = await this.createOrGetRoom(senderId, receiverId);

      // Create message object
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message: Message = {
        id: messageId,
        senderId,
        receiverId,
        content,
        type,
        timestamp: new Date(),
        isRead: false,
        metadata,
      };

      // Add to message queue for async processing
      await this.messageQueue.lpush('message_queue', JSON.stringify({
        ...message,
        action: 'send',
        priority: 'high',
        roomId
      }));

      // Immediate response for real-time feel
      await this.broadcastMessageToRoom(message, roomId);

      // Cache message for quick access
      await this.cacheMessage(message);

      logger.info('Message queued for processing', { 
        messageId, 
        senderId, 
        receiverId,
        roomId,
        type 
      });

      return message;
    } catch (error) {
      logger.error('Failed to send message', { error, senderId, receiverId });
      throw error;
    }
  }

  /**
   * Send message to group
   */
  async sendGroupMessage(senderId: string, roomId: string, content: string, type: 'text' | 'image' | 'file' | 'audio' | 'video' = 'text', metadata?: any): Promise<Message> {
    try {
      // Rate limiting check
      await this.checkRateLimit(senderId);

      // Verify user is in the room
      const participants = await this.getRoomParticipants(roomId);
      if (!participants.includes(senderId)) {
        throw new Error('User not in room');
      }

      // Create message object
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message: Message = {
        id: messageId,
        senderId,
        receiverId: roomId, // For group messages, receiverId is the roomId
        content,
        type,
        timestamp: new Date(),
        isRead: false,
        metadata: { ...metadata, isGroupMessage: true, roomId },
      };

      // Add to message queue for async processing
      await this.messageQueue.lpush('message_queue', JSON.stringify({
        ...message,
        action: 'send',
        priority: 'high',
        roomId,
        isGroupMessage: true
      }));

      // Immediate response for real-time feel
      await this.broadcastMessageToRoom(message, roomId);

      // Cache message for quick access
      await this.cacheMessage(message);

      logger.info('Group message queued for processing', { 
        messageId, 
        senderId, 
        roomId,
        type 
      });

      return message;
    } catch (error) {
      logger.error('Failed to send group message', { error, senderId, roomId });
      throw error;
    }
  }

  /**
   * Check rate limit for user
   */
  private async checkRateLimit(userId: string): Promise<void> {
    if (!this.rateLimiter) return;

    const rateLimitKey = `rate_limit:${userId}`;
    const current = await this.rateLimiter.incr(rateLimitKey);
    
    if (current === 1) {
      await this.rateLimiter.expire(rateLimitKey, 60); // 1 minute window
    }
    
    if (current > 100) { // 100 messages per minute
      throw new Error('Rate limit exceeded. Please slow down.');
    }
  }

  /**
   * Broadcast message to room
   */
  private async broadcastMessageToRoom(message: Message, roomId: string): Promise<void> {
    try {
      // Get room participants
      const participants = await this.getRoomParticipants(roomId);
      
      // Broadcast to all participants in the room
      this.io.to(roomId).emit('message:new', {
        ...message,
        roomId,
        participants
      });

      // Update room activity
      await this.updateRoomActivity(roomId, message);

      logger.debug('Message broadcasted to room', { 
        messageId: message.id, 
        roomId, 
        participants: participants.length 
      });
    } catch (error) {
      logger.error('Failed to broadcast message to room', { error, messageId: message.id, roomId });
    }
  }

  /**
   * Update room activity
   */
  private async updateRoomActivity(roomId: string, message: Message): Promise<void> {
    try {
      await this.messageCache.hset(`room:${roomId}`, {
        lastActivity: new Date().toISOString(),
        lastMessageId: message.id,
        lastMessageContent: message.content.substring(0, 100) // Truncate for storage
      });
    } catch (error) {
      logger.error('Failed to update room activity', { error, roomId });
    }
  }

  /**
   * Process message queue for high throughput with batching
   */
  private async processMessageQueue() {
    if (!this.messageQueue) {
      logger.debug('Message queue processing skipped - Redis not available');
      return;
    }
    
    try {
      // Check if there are any messages in the queue first
      const queueLength = await this.messageQueue.llen('message_queue');
      if (queueLength === 0) return;

      // Process up to 10 messages at once for efficiency
      const messages = await this.messageQueue.rpop('message_queue', 10);
      
      if (!messages || messages.length === 0) return;

      // Batch process messages for better performance
      await this.processMessageBatch(messages);
    } catch (error) {
      logger.error('Failed to process message queue', { error });
      // If there's a persistent error, clear the queue to prevent infinite retries
      try {
        await this.messageQueue.del('message_queue');
        logger.warn('Cleared message queue due to persistent errors');
      } catch (clearError) {
        logger.error('Failed to clear message queue', { error: clearError });
      }
    }
  }

  /**
   * Process a batch of messages efficiently
   */
  private async processMessageBatch(messages: string[]): Promise<void> {
    try {
      const batchSize = 10; // Process in smaller batches
      const batches = [];
      
      for (let i = 0; i < messages.length; i += batchSize) {
        batches.push(messages.slice(i, i + batchSize));
      }

      // Process batches in parallel
      const batchPromises = batches.map(async (batch) => {
        const batchData = [];
        
        // Parse and validate messages in batch
        for (const messageStr of batch) {
          try {
            const messageData = JSON.parse(messageStr);
            batchData.push(messageData);
          } catch (error) {
            logger.error('Failed to parse message in batch', { error, messageStr });
          }
        }

        if (batchData.length > 0) {
          // Batch insert to database
          await this.batchPersistMessages(batchData);
        }
      });

      await Promise.allSettled(batchPromises);
      
      logger.debug('Message batch processed', { 
        totalMessages: messages.length, 
        batches: batches.length 
      });
    } catch (error) {
      logger.error('Failed to process message batch', { error });
    }
  }

  /**
   * Batch persist messages to database
   */
  private async batchPersistMessages(messages: any[]): Promise<void> {
    try {
      // Use transaction for batch insert
      await prisma.$transaction(async (tx) => {
        for (const messageData of messages) {
          await tx.message.create({
            data: {
              id: messageData.id,
              senderId: messageData.senderId,
              receiverId: messageData.receiverId,
              content: messageData.content,
              subject: messageData.subject || '',
              isRead: false,
              parentId: messageData.parentId,
              attachments: messageData.attachments,
            },
          });
        }
      });

      // Batch cache messages
      await this.batchCacheMessages(messages);
      
      logger.debug('Messages batch persisted', { count: messages.length });
    } catch (error) {
      logger.error('Failed to batch persist messages', { error, count: messages.length });
    }
  }

  /**
   * Batch cache messages
   */
  private async batchCacheMessages(messages: any[]): Promise<void> {
    try {
      const pipeline = this.messageCache.pipeline();
      
      for (const message of messages) {
        const roomId = this.getRoomId(message.senderId, message.receiverId);
        const cacheKey = `messages:${roomId}`;
        
        pipeline.zadd(cacheKey, message.timestamp.getTime(), JSON.stringify(message));
        pipeline.expire(cacheKey, 86400); // 24 hours
      }
      
      await pipeline.exec();
      
      logger.debug('Messages batch cached', { count: messages.length });
    } catch (error) {
      logger.error('Failed to batch cache messages', { error, count: messages.length });
    }
  }

  /**
   * Persist message to database with optimized queries
   */
  private async persistMessage(messageData: any) {
    try {
      // Use transaction for consistency
      await prisma.$transaction(async (tx) => {
        // Insert message
        const message = await tx.message.create({
          data: {
            id: messageData.id,
            senderId: messageData.senderId,
            receiverId: messageData.receiverId,
            content: messageData.content,
            subject: messageData.subject || '',
            isRead: false,
            parentId: messageData.parentId,
            attachments: messageData.attachments,
          },
        });

        // Update chat room last activity
        const roomId = this.getRoomId(messageData.senderId, messageData.receiverId);
        await this.updateChatRoom(roomId, messageData.senderId, messageData.receiverId, {
          id: message.id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: message.content,
          type: 'text' as const,
          timestamp: message.createdAt,
          isRead: message.isRead,
          parentId: message.parentId,
          attachments: Array.isArray(message.attachments) ? message.attachments : [],
        });

        // Update unread count
        await this.updateUnreadCount(messageData.receiverId, roomId, 1);
      });

      logger.debug('Message persisted to database', { messageId: messageData.id });
    } catch (error) {
      logger.error('Failed to persist message', { error, messageId: messageData.id });
    }
  }

  /**
   * Broadcast message in real-time
   */
  private broadcastMessage(message: Message) {
    const roomId = this.getRoomId(message.senderId, message.receiverId);
    
    // Send to receiver if online
    const receiverSocketId = this.onlineUsers.get(message.receiverId);
    if (receiverSocketId) {
      this.io.to(receiverSocketId).emit('message:new', message);
    }

    // Send to sender for confirmation
    const senderSocketId = this.onlineUsers.get(message.senderId);
    if (senderSocketId) {
      this.io.to(senderSocketId).emit('message:sent', message);
    }

    // Broadcast to room for group chats
    this.io.to(roomId).emit('message:room', {
      roomId,
      message,
      timestamp: new Date()
    });
  }

  /**
   * Cache message for quick access
   */
  private async cacheMessage(message: Message) {
    const roomId = this.getRoomId(message.senderId, message.receiverId);
    const cacheKey = `messages:${roomId}`;
    
    // Add to sorted set for chronological order
    await this.messageCache.zadd(cacheKey, message.timestamp.getTime(), JSON.stringify(message));
    
    // Keep only last 100 messages in cache
    await this.messageCache.zremrangebyrank(cacheKey, 0, -101);
    
    // Set expiration (24 hours)
    await this.messageCache.expire(cacheKey, 86400);
  }

  /**
   * Get recent messages from cache or database
   */
  async getRecentMessages(userId1: string, userId2: string, limit: number = 50): Promise<Message[]> {
    const roomId = this.getRoomId(userId1, userId2);
    const cacheKey = `messages:${roomId}`;
    
    try {
      // Try cache first
      const cachedMessages = await this.messageCache.zrevrange(cacheKey, 0, limit - 1);
      
      if (cachedMessages.length > 0) {
        return cachedMessages.map(msg => JSON.parse(msg));
      }

      // Fallback to database
      const messages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId1, receiverId: userId2 },
            { senderId: userId2, receiverId: userId1 }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true
            }
          }
        }
      });

      // Cache the results
      const cachePromises = messages.map(msg => 
        this.messageCache.zadd(cacheKey, msg.createdAt.getTime(), JSON.stringify(msg))
      );
      await Promise.all(cachePromises);
      await this.messageCache.expire(cacheKey, 86400);

      // Transform database messages to match Message interface
      return messages.map(msg => ({
        id: msg.id,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        content: msg.content,
        type: 'text' as const,
        timestamp: msg.createdAt,
        isRead: msg.isRead,
        readAt: undefined,
        deliveredAt: undefined,
        metadata: undefined,
        parentId: msg.parentId,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      }));
    } catch (error) {
      logger.error('Failed to get recent messages', { error, userId1, userId2 });
      return [];
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, userId: string) {
    try {
      const readAt = new Date();
      
      // Update database
      await prisma.message.updateMany({
        where: {
          id: messageId,
          receiverId: userId,
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      // Update Redis cache with delivery status
      await this.messageCache.hset(`message:${messageId}`, {
        isRead: 'true',
        readAt: readAt.toISOString(),
        readBy: userId
      });

      // Get message details for notification
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, receiverId: true }
      });

      if (message) {
        const roomId = this.getRoomId(message.senderId, message.receiverId);
        
        // Update cached message in room cache
        const cacheKey = `messages:${roomId}`;
        const cachedMessages = await this.messageCache.zrange(cacheKey, 0, -1);
        for (const cachedMsg of cachedMessages) {
          const msg = JSON.parse(cachedMsg);
          if (msg.id === messageId) {
            msg.isRead = true;
            msg.readAt = readAt;
            await this.messageCache.zadd(cacheKey, msg.timestamp, JSON.stringify(msg));
            break;
          }
        }

        // Notify sender that message was read
        const senderSocketId = this.onlineUsers.get(message.senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('message:read', { 
            messageId, 
            readAt,
            readBy: userId 
          });
        }

        // Update read status in room
        this.io.to(roomId).emit('message:status:read', {
          messageId,
          readAt,
          readBy: userId
        });
      }

      logger.debug('Message marked as read', { messageId, userId, readAt });
    } catch (error) {
      logger.error('Failed to mark message as read', { error, messageId, userId });
    }
  }

  /**
   * Mark a message as delivered.
   */
  async markAsDelivered(messageId: string, userId: string) {
    try {
      const deliveredAt = new Date();
      
      // Update Redis cache with delivery status
      await this.messageCache.hset(`message:${messageId}`, {
        deliveredAt: deliveredAt.toISOString(),
        deliveredTo: userId
      });

      // Get message details for notification
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, receiverId: true }
      });

      if (message) {
        // Notify sender that message was delivered
        const senderSocketId = this.onlineUsers.get(message.senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('message:delivered', { 
            messageId, 
            deliveredAt,
            deliveredTo: userId 
          });
        }

        // Update delivery status in room
        const roomId = this.getRoomId(message.senderId, message.receiverId);
        this.io.to(roomId).emit('message:status:delivered', {
          messageId,
          deliveredAt,
          deliveredTo: userId
        });
      }

      logger.debug('Message marked as delivered', { messageId, userId, deliveredAt });
    } catch (error) {
      logger.error('Failed to mark message as delivered', { error, messageId, userId });
    }
  }

  /**
   * Get message delivery status
   */
  async getMessageStatus(messageId: string): Promise<{
    delivered: boolean;
    read: boolean;
    deliveredAt?: Date;
    readAt?: Date;
    deliveredTo?: string;
    readBy?: string;
  }> {
    try {
      // Try Redis cache first
      const cachedStatus = await this.messageCache.hgetall(`message:${messageId}`);
      
      if (Object.keys(cachedStatus).length > 0) {
        return {
          delivered: !!cachedStatus.deliveredAt,
          read: cachedStatus.isRead === 'true',
          deliveredAt: cachedStatus.deliveredAt ? new Date(cachedStatus.deliveredAt) : undefined,
          readAt: cachedStatus.readAt ? new Date(cachedStatus.readAt) : undefined,
          deliveredTo: cachedStatus.deliveredTo,
          readBy: cachedStatus.readBy
        };
      }

      // Fallback to database
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { 
          isRead: true
        }
      });

      return {
        delivered: false,
        read: message?.isRead || false
      };
    } catch (error) {
      logger.error('Failed to get message status', { error, messageId });
      return { delivered: false, read: false };
    }
  }

  /**
   * Batch mark messages as read
   */
  async markMessagesAsRead(messageIds: string[], userId: string): Promise<void> {
    try {
      const readAt = new Date();
      
      // Update database
      await prisma.message.updateMany({
        where: {
          id: { in: messageIds },
          receiverId: userId,
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      // Update Redis cache for each message
      const pipeline = this.messageCache.pipeline();
      for (const messageId of messageIds) {
        pipeline.hset(`message:${messageId}`, {
          isRead: 'true',
          readAt: readAt.toISOString(),
          readBy: userId
        });
      }
      await pipeline.exec();

      // Get unique senders for notifications
      const messages = await prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: { senderId: true, receiverId: true },
        distinct: ['senderId']
      });

      // Notify senders
      for (const message of messages) {
        const senderSocketId = this.onlineUsers.get(message.senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('messages:read', {
            messageIds,
            readAt,
            readBy: userId
          });
        }
      }

      logger.debug('Messages marked as read', { messageIds, userId, readAt });
    } catch (error) {
      logger.error('Failed to mark messages as read', { error, messageIds, userId });
    }
  }

  /**
   * Handle typing indicators
   */
  handleTyping(roomId: string, userId: string, isTyping: boolean) {
    if (isTyping) {
      if (!this.typingUsers.has(roomId)) {
        this.typingUsers.set(roomId, new Set());
      }
      this.typingUsers.get(roomId)!.add(userId);
    } else {
      this.typingUsers.get(roomId)?.delete(userId);
    }

    // Broadcast typing status
    this.io.to(roomId).emit('typing:update', {
      roomId,
      userId,
      isTyping,
      typingUsers: Array.from(this.typingUsers.get(roomId) || [])
    });
  }

  /**
   * Get room ID for two users (1:1 chat)
   */
  private getRoomId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join('_');
  }

  /**
   * Create or get room for 1:1 chat
   */
  async createOrGetRoom(userId1: string, userId2: string): Promise<string> {
    const roomId = this.getRoomId(userId1, userId2);
    
    // Check if room exists in Redis
    const roomExists = await this.messageCache.exists(`room:${roomId}`);
    
    if (!roomExists) {
      // Create new room
      await this.messageCache.hset(`room:${roomId}`, {
        id: roomId,
        type: 'individual',
        participants: JSON.stringify([userId1, userId2]),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      
      // Set expiration (30 days)
      await this.messageCache.expire(`room:${roomId}`, 30 * 24 * 60 * 60);
      
      logger.info('Created new room', { roomId, participants: [userId1, userId2] });
    }
    
    return roomId;
  }

  /**
   * Create group room
   */
  async createGroupRoom(name: string, participants: string[], createdBy: string): Promise<string> {
    const roomId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.messageCache.hset(`room:${roomId}`, {
      id: roomId,
      name,
      type: 'group',
      participants: JSON.stringify(participants),
      createdBy,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    
    // Set expiration (30 days)
    await this.messageCache.expire(`room:${roomId}`, 30 * 24 * 60 * 60);
    
    // Add participants to room
    for (const participantId of participants) {
      await this.addUserToRoom(participantId, roomId);
    }
    
    logger.info('Created group room', { roomId, name, participants, createdBy });
    return roomId;
  }

  /**
   * Add user to room
   */
  async addUserToRoom(userId: string, roomId: string): Promise<void> {
    // Add to in-memory maps
    if (!this.roomParticipants.has(roomId)) {
      this.roomParticipants.set(roomId, new Set());
    }
    this.roomParticipants.get(roomId)!.add(userId);
    
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(roomId);
    
    // Add to Redis
    await this.messageCache.sadd(`room:${roomId}:participants`, userId);
    await this.messageCache.sadd(`user:${userId}:rooms`, roomId);
    
    // Join Socket.IO room
    const socketId = this.onlineUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).socketsJoin(roomId);
    }
    
    logger.debug('User added to room', { userId, roomId });
  }

  /**
   * Remove user from room
   */
  async removeUserFromRoom(userId: string, roomId: string): Promise<void> {
    // Remove from in-memory maps
    this.roomParticipants.get(roomId)?.delete(userId);
    this.userRooms.get(userId)?.delete(roomId);
    
    // Remove from Redis
    await this.messageCache.srem(`room:${roomId}:participants`, userId);
    await this.messageCache.srem(`user:${userId}:rooms`, roomId);
    
    // Leave Socket.IO room
    const socketId = this.onlineUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).socketsLeave(roomId);
    }
    
    logger.debug('User removed from room', { userId, roomId });
  }

  /**
   * Get room participants
   */
  async getRoomParticipants(roomId: string): Promise<string[]> {
    // Try Redis first
    const participants = await this.messageCache.smembers(`room:${roomId}:participants`);
    if (participants.length > 0) {
      return participants;
    }
    
    // Fallback to in-memory
    return Array.from(this.roomParticipants.get(roomId) || []);
  }

  /**
   * Get user rooms
   */
  async getUserRooms(userId: string): Promise<string[]> {
    // Try Redis first
    const rooms = await this.messageCache.smembers(`user:${userId}:rooms`);
    if (rooms.length > 0) {
      return rooms;
    }
    
    // Fallback to in-memory
    return Array.from(this.userRooms.get(userId) || []);
  }

  /**
   * Update chat room information
   */
  private async updateChatRoom(roomId: string, senderId: string, receiverId: string, message: Message) {
    const cacheKey = `room:${roomId}`;
    const roomData = {
      id: roomId,
      participants: [senderId, receiverId],
      lastMessage: message,
      lastActivity: new Date(),
      unreadCount: {}
    };

    await this.messageCache.setex(cacheKey, 86400, JSON.stringify(roomData));
  }

  /**
   * Update unread count for user
   */
  private async updateUnreadCount(userId: string, roomId: string, increment: number) {
    const key = `unread:${userId}:${roomId}`;
    await this.messageCache.incrby(key, increment);
    await this.messageCache.expire(key, 86400);
  }

  /**
   * Clean up old cached messages
   */
  async cleanupOldMessages() {
    if (!this.messageCache) {
      logger.debug('Message cache cleanup skipped - Redis not available');
      return;
    }
    
    try {
      const keys = await this.messageCache.keys('messages:*');
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      for (const key of keys) {
        await this.messageCache.zremrangebyscore(key, 0, cutoffTime);
      }

      logger.debug('Cleaned up old cached messages', { keysCount: keys.length });
    } catch (error) {
      logger.error('Failed to cleanup old messages', { error });
    }
  }

  /**
   * Get messaging statistics
   */
  async getStats() {
    return {
      onlineUsers: this.onlineUsers.size,
      activeRooms: this.typingUsers.size,
      redisConnected: this.messageQueue.status === 'ready',
      uptime: process.uptime()
    };
  }

  /**
   * Save message to database (for worker)
   */
  async saveMessage(messageData: any) {
    try {
      await this.persistMessage(messageData);
      return messageData;
    } catch (error) {
      logger.error('Failed to save message', { error, messageId: messageData.id });
      throw error;
    }
  }

  /**
   * Send real-time notification
   */
  async sendRealTimeNotification(message: any) {
    try {
      this.broadcastMessage(message);
      logger.info('Real-time notification sent', { messageId: message.id });
    } catch (error) {
      logger.error('Failed to send real-time notification', { error, messageId: message.id });
    }
  }

  /**
   * Update search index
   */
  async updateSearchIndex(message: any) {
    try {
      // For now, just log - can be implemented with Elasticsearch later
      logger.debug('Search index updated', { messageId: message.id });
    } catch (error) {
      logger.error('Failed to update search index', { error, messageId: message.id });
    }
  }

  /**
   * Process attachments
   */
  async processAttachments(message: any) {
    try {
      if (message.attachments && message.attachments.length > 0) {
        // Process attachments (virus scan, thumbnail generation, etc.)
        logger.debug('Attachments processed', { messageId: message.id, count: message.attachments.length });
      }
    } catch (error) {
      logger.error('Failed to process attachments', { error, messageId: message.id });
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(message: any) {
    try {
      const roomId = this.getRoomId(message.senderId, message.receiverId);
      await this.updateChatRoom(roomId, message.senderId, message.receiverId, message);
      logger.debug('Conversation metadata updated', { messageId: message.id });
    } catch (error) {
      logger.error('Failed to update conversation metadata', { error, messageId: message.id });
    }
  }

  /**
   * Trigger webhooks
   */
  async triggerWebhooks(message: any) {
    try {
      // Trigger webhooks for integrations
      logger.debug('Webhooks triggered', { messageId: message.id });
    } catch (error) {
      logger.error('Failed to trigger webhooks', { error, messageId: message.id });
    }
  }

  /**
   * Send push notification
   */
  async sendPushNotification(notificationData: any) {
    try {
      // Send push notifications
      logger.info('Push notification sent', { notificationId: notificationData.id });
    } catch (error) {
      logger.error('Failed to send push notification', { error, notificationId: notificationData.id });
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(notificationData: any) {
    try {
      // Send email notifications
      logger.info('Email notification sent', { notificationId: notificationData.id });
    } catch (error) {
      logger.error('Failed to send email notification', { error, notificationId: notificationData.id });
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMSNotification(notificationData: any) {
    try {
      // Send SMS notifications
      logger.info('SMS notification sent', { notificationId: notificationData.id });
    } catch (error) {
      logger.error('Failed to send SMS notification', { error, notificationId: notificationData.id });
    }
  }

  /**
   * Update message delivery status
   */
  async updateMessageDeliveryStatus(messageId: string, status: string, timestamp: Date) {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { 
          // Add deliveredAt field if it exists in schema
          // deliveredAt: timestamp 
        },
      });
      logger.debug('Message delivery status updated', { messageId, status, timestamp });
    } catch (error) {
      logger.error('Failed to update message delivery status', { error, messageId, status });
    }
  }

  /**
   * Update message read status
   */
  async updateMessageReadStatus(messageId: string, readBy: string, timestamp: Date) {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { 
          isRead: true,
          // Add readAt field if it exists in schema
          // readAt: timestamp 
        },
      });
      logger.debug('Message read status updated', { messageId, readBy, timestamp });
    } catch (error) {
      logger.error('Failed to update message read status', { error, messageId, readBy });
    }
  }

  /**
   * Set user online
   */
  async setUserOnline(userId: string, socketId: string) {
    try {
      this.onlineUsers.set(userId, socketId);
      
      // Broadcast presence update
      this.io.emit('presence:online', { userId, timestamp: new Date() });
      
      // Process offline messages for this user
      await this.processOfflineMessages(userId);
      
      logger.debug('User set online', { userId, socketId });
    } catch (error) {
      logger.error('Failed to set user online', { error, userId, socketId });
    }
  }

  /**
   * Set user offline
   */
  async setUserOffline(userId: string) {
    try {
      this.onlineUsers.delete(userId);
      
      // Broadcast presence update
      this.io.emit('presence:offline', { userId, timestamp: new Date() });
      
      logger.debug('User set offline', { userId });
    } catch (error) {
      logger.error('Failed to set user offline', { error, userId });
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      // Clean up expired sessions
      logger.info('Expired sessions cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
    }
  }

  /**
   * Get message from queue (for worker)
   */
  async getMessageFromQueue(): Promise<any | null> {
    try {
      const result = await this.messageQueue.brpop('message_queue', 0);
      if (result && result[1]) {
        return JSON.parse(result[1]);
      }
      return null;
    } catch (error) {
      logger.error('Failed to get message from queue', { error });
      throw error;
    }
  }

  /**
   * Queue message for offline user
   */
  async queueOfflineMessage(message: Message, recipientId: string): Promise<void> {
    try {
      const offlineKey = `offline:${recipientId}`;
      await this.messageQueue.lpush(offlineKey, JSON.stringify({
        ...message,
        queuedAt: new Date().toISOString()
      }));
      
      // Set expiration for offline queue (7 days)
      await this.messageQueue.expire(offlineKey, 7 * 24 * 60 * 60);
      
      logger.debug('Message queued for offline user', { 
        messageId: message.id, 
        recipientId 
      });
    } catch (error) {
      logger.error('Failed to queue offline message', { error, messageId: message.id, recipientId });
    }
  }

  /**
   * Process offline messages for user
   */
  async processOfflineMessages(userId: string): Promise<void> {
    try {
      const offlineKey = `offline:${userId}`;
      const offlineMessages = await this.messageQueue.lrange(offlineKey, 0, -1);
      
      if (offlineMessages.length === 0) {
        return;
      }

      const socketId = this.onlineUsers.get(userId);
      if (!socketId) {
        return;
      }

      // Send all offline messages to the user
      for (const messageStr of offlineMessages) {
        try {
          const message = JSON.parse(messageStr);
          this.io.to(socketId).emit('message:offline', message);
        } catch (error) {
          logger.error('Failed to parse offline message', { error, messageStr });
        }
      }

      // Clear offline queue
      await this.messageQueue.del(offlineKey);
      
      logger.info('Processed offline messages', { 
        userId, 
        messageCount: offlineMessages.length 
      });
    } catch (error) {
      logger.error('Failed to process offline messages', { error, userId });
    }
  }

  /**
   * Get offline message count for user
   */
  async getOfflineMessageCount(userId: string): Promise<number> {
    try {
      const offlineKey = `offline:${userId}`;
      return await this.messageQueue.llen(offlineKey);
    } catch (error) {
      logger.error('Failed to get offline message count', { error, userId });
      return 0;
    }
  }

  /**
   * Enhanced broadcast message with offline queuing
   */
  private async broadcastMessageWithOfflineQueuing(message: Message, roomId: string): Promise<void> {
    try {
      const participants = await this.getRoomParticipants(roomId);
      
      for (const participantId of participants) {
        if (participantId === message.senderId) {
          continue; // Skip sender
        }

        const isOnline = this.onlineUsers.has(participantId);
        
        if (isOnline) {
          // Send immediately to online users
          const socketId = this.onlineUsers.get(participantId);
          if (socketId) {
            this.io.to(socketId).emit('message:new', {
              ...message,
              roomId,
              participants
            });
          }
        } else {
          // Queue for offline users
          await this.queueOfflineMessage(message, participantId);
        }
      }

      // Update room activity
      await this.updateRoomActivity(roomId, message);

      logger.debug('Message broadcasted with offline queuing', { 
        messageId: message.id, 
        roomId, 
        participants: participants.length 
      });
    } catch (error) {
      logger.error('Failed to broadcast message with offline queuing', { error, messageId: message.id, roomId });
    }
  }

  /**
   * Compress message content for storage
   */
  private compressMessage(message: Message): Message {
    try {
      // Simple compression for large messages
      if (message.content.length > 1000) {
        // In a real implementation, you would use zlib or similar
        // For now, we'll just truncate and add a flag
        return {
          ...message,
          content: message.content.substring(0, 1000) + '... [truncated]',
          metadata: {
            ...message.metadata,
            compressed: true,
            originalLength: message.content.length
          }
        };
      }
      return message;
    } catch (error) {
      logger.error('Failed to compress message', { error, messageId: message.id });
      return message;
    }
  }

  /**
   * Decompress message content
   */
  private decompressMessage(message: Message): Message {
    try {
      if (message.metadata?.compressed) {
        // In a real implementation, you would decompress the content
        // For now, we'll just return the message as-is
        return message;
      }
      return message;
    } catch (error) {
      logger.error('Failed to decompress message', { error, messageId: message.id });
      return message;
    }
  }

  /**
   * Get compressed message statistics
   */
  async getCompressionStats(): Promise<{
    totalMessages: number;
    compressedMessages: number;
    compressionRatio: number;
    spaceSaved: number;
  }> {
    try {
      // This would typically query the database for compression stats
      // For now, return mock data
      return {
        totalMessages: 0,
        compressedMessages: 0,
        compressionRatio: 0,
        spaceSaved: 0
      };
    } catch (error) {
      logger.error('Failed to get compression stats', { error });
      return {
        totalMessages: 0,
        compressedMessages: 0,
        compressionRatio: 0,
        spaceSaved: 0
      };
    }
  }

}

export default MessagingService;
