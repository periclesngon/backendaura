import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '@/utils/logger';
import { AiChatService } from './aiChatService';

interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  isPublic: boolean;
  participants: Set<string>;
  messages: ChatMessage[];
}

interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  userRole: string;
  message: string;
  timestamp: Date;
  isAura?: boolean;
}

interface ConnectedUser {
  id: string;
  username: string;
  role: string;
  socketId: string;
}

class ChatRoomService {
  private io: SocketIOServer | null = null;
  private chatRooms: Map<string, ChatRoom> = new Map();
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  initialize(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    // Create default public chat room
    this.createRoom('general', 'General Chat', 'Main chat room for all users', 'system', true);

    this.io.on('connection', (socket) => {
      logger.info('User connected to chat', { socketId: socket.id });

      // Handle user authentication
      socket.on('authenticate', (userData: { userId: string; username: string; role: string }) => {
        this.handleUserAuthentication(socket, userData);
      });

      // Handle joining a room
      socket.on('join-room', (roomId: string) => {
        this.handleJoinRoom(socket, roomId);
      });

      // Handle leaving a room
      socket.on('leave-room', (roomId: string) => {
        this.handleLeaveRoom(socket, roomId);
      });

      // Handle sending a message
      socket.on('send-message', async (data: { roomId: string; message: string }) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle creating a room (admin only)
      socket.on('create-room', (data: { name: string; description?: string; isPublic: boolean }) => {
        this.handleCreateRoom(socket, data);
      });

      // Handle Aura.CA chat
      socket.on('aura-chat', async (data: { message: string }) => {
        await this.handleAuraChat(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });

    logger.info('Socket.IO chat service initialized');
  }

  private handleUserAuthentication(socket: any, userData: { userId: string; username: string; role: string }) {
    const user: ConnectedUser = {
      id: userData.userId,
      username: userData.username,
      role: userData.role,
      socketId: socket.id
    };

    this.connectedUsers.set(socket.id, user);
    this.userSockets.set(userData.userId, socket.id);

    socket.userId = userData.userId;
    socket.username = userData.username;
    socket.userRole = userData.role;

    // Join general room by default
    socket.join('general');
    const generalRoom = this.chatRooms.get('general');
    if (generalRoom) {
      generalRoom.participants.add(userData.userId);
    }

    // Send available rooms
    socket.emit('rooms-list', this.getAvailableRooms(userData.role));
    
    // Send room history for general room
    socket.emit('room-history', {
      roomId: 'general',
      messages: generalRoom?.messages.slice(-50) || []
    });

    logger.info('User authenticated in chat', { userId: userData.userId, username: userData.username });
  }

  private handleJoinRoom(socket: any, roomId: string) {
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const room = this.chatRooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    socket.join(roomId);
    room.participants.add(socket.userId);

    // Send room history
    socket.emit('room-history', {
      roomId,
      messages: room.messages.slice(-50)
    });

    // Notify others
    socket.to(roomId).emit('user-joined', {
      userId: socket.userId,
      username: socket.username,
      roomId
    });

    logger.info('User joined room', { userId: socket.userId, roomId });
  }

  private handleLeaveRoom(socket: any, roomId: string) {
    if (!socket.userId) return;

    const room = this.chatRooms.get(roomId);
    if (room) {
      room.participants.delete(socket.userId);
    }

    socket.leave(roomId);

    // Notify others
    socket.to(roomId).emit('user-left', {
      userId: socket.userId,
      username: socket.username,
      roomId
    });

    logger.info('User left room', { userId: socket.userId, roomId });
  }

  private async handleSendMessage(socket: any, data: { roomId: string; message: string }) {
    if (!socket.userId || !data.message.trim()) {
      socket.emit('error', { message: 'Invalid message' });
      return;
    }

    const room = this.chatRooms.get(data.roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      roomId: data.roomId,
      userId: socket.userId,
      username: socket.username,
      userRole: socket.userRole,
      message: data.message.trim(),
      timestamp: new Date()
    };

    // Add message to room
    room.messages.push(message);

    // Keep only last 1000 messages per room
    if (room.messages.length > 1000) {
      room.messages = room.messages.slice(-1000);
    }

    // Broadcast message to all users in the room
    this.io?.to(data.roomId).emit('new-message', message);

    logger.info('Message sent', { userId: socket.userId, roomId: data.roomId, messageLength: data.message.length });
  }

  private handleCreateRoom(socket: any, data: { name: string; description?: string; isPublic: boolean }) {
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Only admins and managers can create rooms
    if (!['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(socket.userRole)) {
      socket.emit('error', { message: 'Insufficient permissions' });
      return;
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    this.createRoom(roomId, data.name, data.description, socket.userId, data.isPublic);

    // Notify all users about new room if it's public
    if (data.isPublic) {
      this.io?.emit('room-created', {
        id: roomId,
        name: data.name,
        description: data.description,
        isPublic: data.isPublic,
        createdBy: socket.username
      });
    }

    socket.emit('room-created-success', { roomId, name: data.name });
    logger.info('Room created', { roomId, name: data.name, createdBy: socket.userId });
  }

  private async handleAuraChat(socket: any, data: { message: string }) {
    if (!socket.userId || !data.message.trim()) {
      socket.emit('error', { message: 'Invalid message' });
      return;
    }

    try {
      // Get response from Aura.CA
      const auraResponse = await AiChatService.sendMessage(
        socket.userId,
        data.message,
        null,
        {
          userLevel: 'B1',
          language: 'fr',
          previousMessages: []
        }
      );

      // Send Aura.CA response back to user
      socket.emit('aura-response', {
        message: auraResponse.message,
        sources: auraResponse.sources,
        confidence: auraResponse.confidence,
        timestamp: new Date()
      });

      logger.info('Aura.CA response sent', { userId: socket.userId, messageLength: data.message.length });
    } catch (error) {
      logger.error('Aura.CA chat error', { error, userId: socket.userId });
      socket.emit('error', { message: 'Aura.CA is temporarily unavailable' });
    }
  }

  private handleDisconnect(socket: any) {
    if (socket.userId) {
      // Remove from all rooms
      this.chatRooms.forEach((room) => {
        room.participants.delete(socket.userId);
      });

      this.userSockets.delete(socket.userId);
    }

    this.connectedUsers.delete(socket.id);
    logger.info('User disconnected from chat', { socketId: socket.id, userId: socket.userId });
  }

  private createRoom(id: string, name: string, description: string = '', createdBy: string, isPublic: boolean = true): ChatRoom {
    const room: ChatRoom = {
      id,
      name,
      description,
      createdBy,
      createdAt: new Date(),
      isPublic,
      participants: new Set(),
      messages: []
    };

    this.chatRooms.set(id, room);
    return room;
  }

  private getAvailableRooms(userRole: string) {
    const rooms = Array.from(this.chatRooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      description: room.description,
      isPublic: room.isPublic,
      participantCount: room.participants.size,
      createdAt: room.createdAt
    }));

    // Filter rooms based on user role if needed
    return rooms.filter(room => room.isPublic || ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(userRole));
  }

  // Public methods for external use
  public getRooms() {
    return Array.from(this.chatRooms.values());
  }

  public getConnectedUsers() {
    return Array.from(this.connectedUsers.values());
  }
}

export const chatRoomService = new ChatRoomService();
export { ChatRoom, ChatMessage, ConnectedUser };
