import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import Pusher from 'pusher';

const router = express.Router();

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || '',
  useTLS: true
});

/**
 * @route POST /api/pusher/auth
 * @desc Authenticate Pusher private channel subscription
 * @access Private
 */
router.post('/auth', authenticate, async (req: Request, res: Response) => {
  try {
    const { socket_id, channel_name } = req.body;
    
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const userId = req.user.userId || req.user.id;

    if (!socket_id || !channel_name) {
      return res.status(400).json({
        error: 'Missing socket_id or channel_name'
      });
    }

    // Check if channel is private or presence (both require auth)
    const isPrivateChannel = channel_name.startsWith('private-');
    const isPresenceChannel = channel_name.startsWith('presence-');

    if (!isPrivateChannel && !isPresenceChannel) {
      return res.status(403).json({
        error: 'Channel must be private or presence'
      });
    }

    // Get user info from database if needed for presence channel
    let userInfo = {};
    if (isPresenceChannel) {
      try {
        const { prisma } = await import('@/config/database');
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        });

        if (user) {
          userInfo = {
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            email: user.email
          };
        } else {
          userInfo = {
            name: req.user.email,
            email: req.user.email
          };
        }
      } catch (dbError) {
        // Fallback to JWT payload if DB query fails
        userInfo = {
          name: req.user.email,
          email: req.user.email
        };
      }
    }

    // Generate auth response for private and presence channels
    let authResponse;
    if (isPresenceChannel) {
      // For presence channels, use authorizeChannel with presence data as 3rd parameter
      authResponse = pusher.authorizeChannel(socket_id, channel_name, {
        user_id: userId,
        user_info: userInfo
      });
    } else {
      // For private channels, use authorizeChannel without presence data
      authResponse = pusher.authorizeChannel(socket_id, channel_name);
    }

    res.json(authResponse);
  } catch (error: any) {
    console.error('Pusher auth error:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      userId: req.user?.userId,
      channelName: req.body?.channel_name
    });
    res.status(500).json({
      error: 'Authentication failed',
      message: error?.message || 'Unknown error'
    });
  }
});

export default router;
