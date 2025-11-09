import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { MessagingService } from './messagingService';
import { logger } from '../utils/logger';
import { redisPubClient, redisSubClient, messageQueueRedis } from '../config/redis';

// Extend Socket interface to include custom properties
declare module 'socket.io' {
  interface Socket {
    userId?: string;
    userRole?: string;
    userName?: string;
  }
}

export class RealTimeMessagingService {
  private io: SocketIOServer;
  private messagingService: MessagingService;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set<roomIds>
  private typingUsers: Map<string, Map<string, number>> = new Map(); // roomId -> Map<userId, timestamp>
  private messageQueue: Redis | null;

  constructor(server: any) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      // Performance optimizations
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true,
    });

        // Set up Redis adapter for horizontal scaling (if Redis is available)
        // Use shared Redis clients from config/redis.ts to avoid duplicate connections
        if (redisPubClient && redisSubClient) {
        try {
          this.io.adapter(createAdapter(redisPubClient, redisSubClient));
          logger.info('Redis adapter configured for Socket.IO clustering');
        } catch (error) {
          logger.warn('Redis adapter setup failed - using default adapter', error);
          }
        } else {
          logger.info('Socket.IO using default adapter (Redis not configured)');
        }

    this.messagingService = new MessagingService(this.io);
    this.messageQueue = messageQueueRedis; // Use shared messageQueueRedis instead of creating new client

    this.initializeSocketHandlers();
    this.initializeCleanupTasks();
    
    logger.info('Real-time messaging service initialized with Redis clustering');
  }

  /**
   * Initialize socket event handlers
   */
  private initializeSocketHandlers() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        socket.userName = `${decoded.firstName} ${decoded.lastName}`;
        
        next();
      } catch (error) {
        logger.error('Socket authentication failed', { error: error.message });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: any) {
    const userId = socket.userId;
    const socketId = socket.id;

    // Store user connection
    this.connectedUsers.set(userId, socketId);
    this.userRooms.set(userId, new Set());

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Set user online
    this.messagingService.setUserOnline(userId, socketId);

    logger.info('User connected to messaging', { 
      userId, 
      socketId,
      totalConnected: this.connectedUsers.size 
    });

    // Handle messaging events
    this.handleMessagingEvents(socket);
    this.handlePresenceEvents(socket);
    this.handleTypingEvents(socket);
    this.handleRoomEvents(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  /**
   * Handle messaging events
   */
  private handleMessagingEvents(socket: any) {
    const userId = socket.userId;

    // Send message
    socket.on('message:send', async (data) => {
      try {
        const { receiverId, content, type = 'text', metadata } = data;
        
        // Validate input
        if (!receiverId || !content) {
          socket.emit('message:error', { message: 'Invalid message data' });
          return;
        }

        // Send message through messaging service
        const message = await this.messagingService.sendMessage(
          userId, 
          receiverId, 
          content, 
          type, 
          metadata
        );

        // Emit confirmation
        socket.emit('message:sent', message);

        logger.info('Message sent via socket', { 
          messageId: message.id, 
          senderId: userId, 
          receiverId 
        });
      } catch (error) {
        logger.error('Failed to send message via socket', { error, userId });
        socket.emit('message:error', { message: error.message });
      }
    });

    // Mark message as read
    socket.on('message:read', async (data) => {
      try {
        const { messageId } = data;
        await this.messagingService.markAsRead(messageId, userId);
        
        socket.emit('message:read_confirmed', { messageId });
      } catch (error) {
        logger.error('Failed to mark message as read', { error, userId, messageId: data.messageId });
      }
    });

    // Get recent messages
    socket.on('message:get_recent', async (data) => {
      try {
        const { otherUserId, limit = 50 } = data;
        const messages = await this.messagingService.getRecentMessages(userId, otherUserId, limit);
        
        socket.emit('message:recent', { messages, otherUserId });
      } catch (error) {
        logger.error('Failed to get recent messages', { error, userId });
        socket.emit('message:error', { message: 'Failed to load messages' });
      }
    });

    // Message delivery confirmation
    socket.on('message:delivered', (data) => {
      const { messageId } = data;
      // Broadcast delivery confirmation to sender
      socket.broadcast.emit('message:delivery_confirmed', { messageId, deliveredTo: userId });
    });
  }

  /**
   * Handle presence events
   */
  private handlePresenceEvents(socket: any) {
    const userId = socket.userId;

    // Update presence status
    socket.on('presence:update', (data) => {
      const { status } = data; // online, away, busy, offline
      
      // Broadcast presence update
      socket.broadcast.emit('presence:updated', { 
        userId, 
        status, 
        timestamp: new Date() 
      });

      logger.debug('Presence updated', { userId, status });
    });

    // Request presence of contacts
    socket.on('presence:request', (data) => {
      const { contactIds } = data;
      const presenceData = contactIds.map((contactId: string) => ({
        userId: contactId,
        isOnline: this.connectedUsers.has(contactId),
        lastSeen: new Date() // TODO: Get actual last seen from database
      }));

      socket.emit('presence:response', { presence: presenceData });
    });
  }

  /**
   * Handle typing indicators
   */
  private handleTypingEvents(socket: any) {
    const userId = socket.userId;

    // Start typing
    socket.on('typing:start', (data) => {
      const { roomId } = data;
      
      if (!this.typingUsers.has(roomId)) {
        this.typingUsers.set(roomId, new Map());
      }
      
      this.typingUsers.get(roomId)!.set(userId, Date.now());
      
      // Broadcast typing start
      socket.to(roomId).emit('typing:started', { 
        roomId, 
        userId, 
        timestamp: new Date() 
      });

      // Set timeout to stop typing indicator
      setTimeout(() => {
        this.stopTyping(roomId, userId);
      }, 3000);
    });

    // Stop typing
    socket.on('typing:stop', (data) => {
      const { roomId } = data;
      this.stopTyping(roomId, userId);
    });
  }

  /**
   * Stop typing indicator
   */
  private stopTyping(roomId: string, userId: string) {
    if (this.typingUsers.has(roomId)) {
      this.typingUsers.get(roomId)!.delete(userId);
      
      // Broadcast typing stop
      this.io.to(roomId).emit('typing:stopped', { 
        roomId, 
        userId, 
        timestamp: new Date() 
      });
    }
  }

  /**
   * Handle room events
   */
  private handleRoomEvents(socket: any) {
    const userId = socket.userId;

    // Join chat room
    socket.on('room:join', (data) => {
      const { roomId } = data;
      
      socket.join(roomId);
      
      // Track user rooms
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      this.userRooms.get(userId)!.add(roomId);
      
      // Notify others in room
      socket.to(roomId).emit('room:user_joined', { 
        roomId, 
        userId, 
        timestamp: new Date() 
      });

      logger.debug('User joined room', { userId, roomId });
    });

    // Leave chat room
    socket.on('room:leave', (data) => {
      const { roomId } = data;
      
      socket.leave(roomId);
      
      // Remove from user rooms
      this.userRooms.get(userId)?.delete(roomId);
      
      // Notify others in room
      socket.to(roomId).emit('room:user_left', { 
        roomId, 
        userId, 
        timestamp: new Date() 
      });

      logger.debug('User left room', { userId, roomId });
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: any) {
    const userId = socket.userId;
    const socketId = socket.id;

    // Remove user connection
    this.connectedUsers.delete(userId);
    
    // Leave all rooms
    const userRooms = this.userRooms.get(userId);
    if (userRooms) {
      userRooms.forEach(roomId => {
        socket.to(roomId).emit('room:user_left', { 
          roomId, 
          userId, 
          timestamp: new Date() 
        });
      });
      this.userRooms.delete(userId);
    }

    // Set user offline
    this.messagingService.setUserOffline(userId);

    // Clean up typing indicators
    this.typingUsers.forEach((users, roomId) => {
      if (users.has(userId)) {
        users.delete(userId);
        this.io.to(roomId).emit('typing:stopped', { 
          roomId, 
          userId, 
          timestamp: new Date() 
        });
      }
    });

    logger.info('User disconnected from messaging', { 
      userId, 
      socketId,
      totalConnected: this.connectedUsers.size 
    });
  }

  /**
   * Initialize cleanup tasks
   */
  private initializeCleanupTasks() {
    // Clean up stale typing indicators every 30 seconds
    setInterval(() => {
      const now = Date.now();
      this.typingUsers.forEach((users, roomId) => {
        users.forEach((timestamp, userId) => {
          if (now - timestamp > 5000) { // 5 seconds timeout
            users.delete(userId);
            this.io.to(roomId).emit('typing:stopped', { 
              roomId, 
              userId, 
              timestamp: new Date() 
            });
          }
        });
      });
    }, 30000);

    // Log statistics every minute
    setInterval(() => {
      const stats = this.getStats();
      logger.info('Messaging service stats', stats);
    }, 60000);
  }

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId: string, notification: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
      return true;
    }
    return false;
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeRooms: this.userRooms.size,
      typingUsers: Array.from(this.typingUsers.values()).reduce((total, users) => total + users.size, 0),
      uptime: process.uptime(),
      messagingStats: this.messagingService.getStats()
    };
  }

  /**
   * Get Socket.IO instance
   */
  getIO() {
    return this.io;
  }
}

export default RealTimeMessagingService;
