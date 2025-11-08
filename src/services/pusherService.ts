import Pusher from 'pusher';
import { logger } from '../utils/logger';

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || '',
  useTLS: true
});

// Test Pusher connection (non-blocking - don't fail app if Pusher is unavailable)
setTimeout(() => {
  pusher.trigger('test-channel', 'test-event', {
    message: 'Pusher connection test'
  }).then(() => {
    logger.info('✅ Pusher connection successful');
  }).catch((error) => {
    logger.error('❌ Pusher connection failed (non-critical):', error?.message || error);
    // Don't throw - Pusher is optional for basic functionality
  });
}, 2000); // Delay to allow app to start first

export { pusher };

// Helper functions for messaging
export const pusherService = {
  // Send message to specific user
  sendMessage: async (receiverId: string, message: any) => {
    try {
      await pusher.trigger(`private-${receiverId}`, 'new-message', {
        message,
        timestamp: new Date().toISOString()
      });
      logger.info(`Message sent to user ${receiverId}`);
    } catch (error) {
      logger.error('Failed to send message via Pusher:', error);
      throw error;
    }
  },

  // Send typing indicator
  sendTypingIndicator: async (receiverId: string, senderId: string, isTyping: boolean) => {
    try {
      await pusher.trigger(`private-${receiverId}`, 'typing', {
        senderId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to send typing indicator:', error);
    }
  },

  // Send message status update
  sendMessageStatus: async (receiverId: string, messageId: string, status: 'delivered' | 'read') => {
    try {
      await pusher.trigger(`private-${receiverId}`, 'message-status', {
        messageId,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to send message status:', error);
    }
  },

  // Send presence update
  sendPresenceUpdate: async (userId: string, isOnline: boolean) => {
    try {
      console.log(`🟢 Sending presence update: ${userId} is ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      // Use presence channel for presence updates (not private channel)
      // Presence channels handle member_added/member_removed automatically
      // We also trigger to a presence channel for custom events
      await pusher.trigger('presence-presence-channel', 'presence-update', {
        userId,
        isOnline,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ Presence update sent successfully for ${userId}`);
    } catch (error: any) {
      // Don't fail if Pusher is unavailable - presence is optional
      logger.error('Failed to send presence update (non-critical):', error?.message || error);
      console.warn('⚠️ Pusher unavailable for presence update - continuing without it');
    }
  },

  // Send video call notification
  sendVideoCallNotification: async (receiverId: string, notificationData: any) => {
    try {
      console.log(`📞 Sending video call notification to: ${receiverId}`);
      await pusher.trigger(`private-${receiverId}`, 'video-call-incoming', notificationData);
      console.log(`✅ Video call notification sent successfully to ${receiverId}`);
    } catch (error) {
      logger.error('Failed to send video call notification:', error);
      throw error;
    }
  }
};
