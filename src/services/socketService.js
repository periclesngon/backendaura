const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const ImmigrationSimulationService = require('./immigrationSimulationService');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.activeImmigrationSessions = new Map();
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        
        logger.info('Socket authenticated', { 
          socketId: socket.id, 
          userId: decoded.userId,
          role: decoded.role 
        });
        
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

    logger.info('Socket.IO server initialized');
    return this.io;
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;
    
    // Store connected user
    this.connectedUsers.set(userId, {
      socketId: socket.id,
      connectedAt: new Date(),
      role: socket.userRole
    });

    logger.info('User connected via socket', { 
      userId, 
      socketId: socket.id,
      totalConnected: this.connectedUsers.size 
    });

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Handle immigration simulation events
    this.handleImmigrationSimulation(socket);

    // Handle live session events
    this.handleLiveSession(socket);

    // Handle general events
    this.handleGeneralEvents(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  /**
   * Handle immigration simulation events
   */
  handleImmigrationSimulation(socket) {
    const userId = socket.userId;

    // Join immigration session
    socket.on('immigration:join', async (data) => {
      try {
        const { sessionId } = data;
        
        // Validate session belongs to user
        const session = await ImmigrationSimulationService.getSession(sessionId, userId);
        if (!session) {
          socket.emit('immigration:error', { message: 'Session not found' });
          return;
        }

        socket.join(`immigration:${sessionId}`);
        this.activeImmigrationSessions.set(sessionId, {
          userId,
          socketId: socket.id,
          joinedAt: new Date()
        });

        socket.emit('immigration:joined', { sessionId });
        logger.info('User joined immigration session', { userId, sessionId });
      } catch (error) {
        logger.error('Failed to join immigration session', { userId, error });
        socket.emit('immigration:error', { message: 'Failed to join session' });
      }
    });

    // Start immigration interview
    socket.on('immigration:start', async (data) => {
      try {
        const { sessionId } = data;
        const result = await ImmigrationSimulationService.startSession(sessionId, userId);
        
        socket.emit('immigration:started', result);
        
        // Send first question after a brief delay
        setTimeout(() => {
          socket.emit('immigration:question', {
            question: result.currentQuestion,
            isFirst: true
          });
        }, 2000);

        logger.info('Immigration interview started', { userId, sessionId });
      } catch (error) {
        logger.error('Failed to start immigration interview', { userId, error });
        socket.emit('immigration:error', { message: error.message });
      }
    });

    // Handle user response
    socket.on('immigration:response', async (data) => {
      try {
        const { sessionId, questionId, response, timeSpent } = data;
        
        const result = await ImmigrationSimulationService.processResponse(sessionId, userId, {
          questionId,
          response,
          timeSpent
        });

        // Send immediate feedback
        socket.emit('immigration:feedback', {
          analysis: result.analysis,
          feedback: result.feedback
        });

        // Send next question or follow-up after delay
        setTimeout(() => {
          if (result.nextQuestion) {
            socket.emit('immigration:question', {
              question: result.nextQuestion,
              isFollowUp: result.isFollowUp,
              progress: result.progress
            });
          } else {
            // Interview completed
            socket.emit('immigration:completed', {
              message: 'Entretien terminé. Calcul des résultats en cours...'
            });
            
            // Complete session and send results
            this.completeImmigrationSession(socket, sessionId);
          }
        }, result.isFollowUp ? 1000 : 3000);

        logger.info('Immigration response processed', { 
          userId, 
          sessionId, 
          score: result.analysis.score 
        });
      } catch (error) {
        logger.error('Failed to process immigration response', { userId, error });
        socket.emit('immigration:error', { message: error.message });
      }
    });

    // Leave immigration session
    socket.on('immigration:leave', (data) => {
      const { sessionId } = data;
      socket.leave(`immigration:${sessionId}`);
      this.activeImmigrationSessions.delete(sessionId);
      
      socket.emit('immigration:left', { sessionId });
      logger.info('User left immigration session', { userId, sessionId });
    });
  }

  /**
   * Complete immigration session
   */
  async completeImmigrationSession(socket, sessionId) {
    try {
      const userId = socket.userId;
      const results = await ImmigrationSimulationService.completeSession(sessionId, userId);
      
      socket.emit('immigration:results', results);
      
      // Clean up session
      socket.leave(`immigration:${sessionId}`);
      this.activeImmigrationSessions.delete(sessionId);
      
      logger.info('Immigration session completed', { 
        userId, 
        sessionId, 
        finalScore: results.totalScore 
      });
    } catch (error) {
      logger.error('Failed to complete immigration session', { error });
      socket.emit('immigration:error', { message: 'Failed to complete session' });
    }
  }

  /**
   * Handle live session events
   */
  handleLiveSession(socket) {
    const userId = socket.userId;

    // Join live session
    socket.on('live:join', (data) => {
      const { sessionId } = data;
      socket.join(`live:${sessionId}`);
      
      // Notify others in the session
      socket.to(`live:${sessionId}`).emit('live:user_joined', {
        userId,
        joinedAt: new Date()
      });

      socket.emit('live:joined', { sessionId });
      logger.info('User joined live session', { userId, sessionId });
    });

    // Handle live session chat
    socket.on('live:message', (data) => {
      const { sessionId, message } = data;
      
      const messageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        message,
        timestamp: new Date()
      };

      // Broadcast to all users in the session
      this.io.to(`live:${sessionId}`).emit('live:message', messageData);
      
      logger.info('Live session message sent', { userId, sessionId });
    });

    // Leave live session
    socket.on('live:leave', (data) => {
      const { sessionId } = data;
      socket.leave(`live:${sessionId}`);
      
      // Notify others
      socket.to(`live:${sessionId}`).emit('live:user_left', {
        userId,
        leftAt: new Date()
      });

      socket.emit('live:left', { sessionId });
      logger.info('User left live session', { userId, sessionId });
    });
  }

  /**
   * Handle general events
   */
  handleGeneralEvents(socket) {
    const userId = socket.userId;

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('typing:start', { userId });
    });

    socket.on('typing:stop', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('typing:stop', { userId });
    });

    // Handle presence updates
    socket.on('presence:update', (data) => {
      const { status } = data; // online, away, busy
      
      // Update user presence
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection) {
        userConnection.status = status;
        userConnection.lastSeen = new Date();
      }

      // Broadcast to user's contacts/sessions
      socket.broadcast.emit('presence:updated', { userId, status });
    });
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection(socket) {
    const userId = socket.userId;
    
    // Remove from connected users
    this.connectedUsers.delete(userId);
    
    // Clean up active sessions
    for (const [sessionId, sessionData] of this.activeImmigrationSessions.entries()) {
      if (sessionData.socketId === socket.id) {
        this.activeImmigrationSessions.delete(sessionId);
        break;
      }
    }

    logger.info('User disconnected from socket', { 
      userId, 
      socketId: socket.id,
      totalConnected: this.connectedUsers.size 
    });
  }

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId, notification) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      this.io.to(`user:${userId}`).emit('notification', notification);
      logger.info('Notification sent to user', { userId, type: notification.type });
      return true;
    }
    return false;
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event, data) {
    this.io.emit(event, data);
    logger.info('Broadcast sent', { event, connectedUsers: this.connectedUsers.size });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Get active immigration sessions count
   */
  getActiveImmigrationSessionsCount() {
    return this.activeImmigrationSessions.size;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeImmigrationSessions: this.activeImmigrationSessions.size,
      uptime: process.uptime()
    };
  }
}

// Export singleton instance
module.exports = new SocketService();
