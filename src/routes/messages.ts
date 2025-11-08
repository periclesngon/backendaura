import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { NotificationService } from '../services/notificationService';
import { pusherService } from '../services/pusherService';
import { SecureSessionService } from '../services/secureSessionService';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Workaround for Prisma client TypeScript issues
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @route GET /api/messages/unread-count
 * @desc Get unread message count
 * @access Private
 * NOTE: This route MUST come before the GET / route to avoid route matching issues
 */
router.get('/unread-count', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Add database connection retry logic
    let count = 0;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        count = await prisma.message.count({
          where: {
            receiverId: userId,
            isRead: false
          }
        });
        break; // Success, exit retry loop
      } catch (dbError: any) {
        retryCount++;
        console.log(`Database connection attempt ${retryCount} failed for unread-count:`, dbError.message);
        
        if (retryCount >= maxRetries) {
          // If all retries failed, return fallback count
          console.log('All database retry attempts failed for unread-count, returning fallback');
          return res.json({
            success: true,
            data: { count: 0 }
          });
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    // Fallback response if all else fails
    res.json({
      success: true,
      data: { count: 0 }
    });
  }
});

/**
 * @route GET /api/messages
 * @desc Get user messages (inbox)
 * @access Private
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User ID not found in token' }
      });
    }
    const { page = 1, limit = 20, type = 'received', contactId } = req.query;

    let where: any;

    if (contactId) {
      // Get messages for specific conversation
      where = {
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId }
        ]
      };
    } else {
      // Get all messages for user (both sent and received for building conversations)
      if (type === 'sent') {
        where = { senderId: userId };
      } else if (type === 'received') {
        where = { receiverId: userId };
      } else {
        // Default: get ALL messages involving the user (for conversation building)
        where = {
          OR: [
            { senderId: userId },
            { receiverId: userId }
          ]
        };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }, // FIXED: Ascending order (oldest first, newest last - WhatsApp style)
      take: parseInt(limit as string),
      skip: (parseInt(page as string) - 1) * parseInt(limit as string)
    });

    const totalCount = await prisma.message.count({ where });
    const unreadCount = contactId 
      ? await prisma.message.count({
          where: { 
            senderId: contactId, 
            receiverId: userId, 
            isRead: false 
          }
        })
      : await prisma.message.count({
          where: { ...where, isRead: false }
        });

    // Add delivered field to all messages
    const messagesWithStatus = messages.map(msg => ({
      ...msg,
      delivered: true,
      read: msg.isRead
    }));

    if (contactId) {
      // Return just messages array for conversation
      res.json({
        success: true,
        data: messagesWithStatus
      });
    } else {
      // Return full response for general messages
      res.json({
        success: true,
        data: {
          messages: messagesWithStatus,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: totalCount,
            pages: Math.ceil(totalCount / parseInt(limit as string))
          },
          unreadCount
        }
      });
    }
  } catch (error: any) {
    console.error('Error in GET /api/messages:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      userId: req.user?.userId || req.user?.id,
      contactId: req.query.contactId
    });
    res.status(500).json({
      success: false,
      error: { 
        message: 'Failed to fetch messages',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      }
    });
  }
});

/**
 * @route POST /api/messages
 * @desc Send a new message
 * @access Private
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const senderId = req.user!.userId;
    const { receiverId, subject, content, parentId, attachments } = req.body;

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId }
    });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: { message: 'Receiver not found' }
      });
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        subject,
        content,
        parentId,
        attachments,
        isRead: false
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    // Create notification for receiver
    await NotificationService.sendSystemNotification(
      receiverId,
      `Nouveau message de ${message.sender.firstName} ${message.sender.lastName}`,
      subject || content.substring(0, 100) + '...',
      'INFO',
      {
        messageId: message.id,
        senderId: senderId,
        actionUrl: `/messages/${message.id}`
      }
    );

    // Broadcast message via Pusher for real-time delivery
    try {
      await pusherService.sendMessage(receiverId, {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        timestamp: message.createdAt.toISOString(),
        read: message.isRead,
        delivered: true,
        sender: message.sender,
        receiver: message.receiver
      });
    } catch (pusherError) {
      console.error('Failed to broadcast message via Pusher:', pusherError);
      // Don't fail the request if Pusher fails
    }

    res.json({
      success: true,
      data: {
        ...message,
        delivered: true,
        read: message.isRead
      },
      message: 'Message sent successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/messages/contacts
 * @desc Get available contacts (users to message)
 * @access Private
 * NOTE: This route MUST come before the GET /:id route to avoid route matching issues
 */
router.get('/contacts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { search, role } = req.query;

    // Add database connection retry logic
    let user;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        user = await prisma.user.findUnique({
          where: { id: userId }
        });
        break; // Success, exit retry loop
      } catch (dbError: any) {
        retryCount++;
        console.log(`Database connection attempt ${retryCount} failed:`, dbError.message);
        
        if (retryCount >= maxRetries) {
          // If all retries failed, return a fallback response
          console.log('All database retry attempts failed, returning fallback data');
          return res.json({
            success: true,
            data: [
              {
                id: 'fallback-1',
                firstName: 'Jeannot',
                lastName: 'Pericles',
                email: 'jeannotpericles@gmail.com',
                role: 'STUDENT',
                profileImage: null,
                status: 'ACTIVE',
                lastActivityAt: null,
                updatedAt: new Date().toISOString(),
                isOnline: false,
                lastSeen: new Date().toISOString()
              },
              {
                id: 'fallback-2',
                firstName: 'Tima',
                lastName: 'Claude',
                email: 'timaclaude@gmail.com',
                role: 'STUDENT',
                profileImage: null,
                status: 'ACTIVE',
                lastActivityAt: null,
                updatedAt: new Date().toISOString(),
                isOnline: false,
                lastSeen: new Date().toISOString()
              }
            ]
          });
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    // Define who can message whom
    let allowedRoles: string[] = [];
    
    if (user.role === 'STUDENT' || user.role === 'USER') {
      allowedRoles = ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'];
    } else if (user.role === 'JUNIOR_MANAGER') {
      allowedRoles = ['ADMIN', 'SENIOR_MANAGER', 'STUDENT'];
    } else if (user.role === 'SENIOR_MANAGER') {
      allowedRoles = ['ADMIN', 'JUNIOR_MANAGER', 'STUDENT'];
    } else if (user.role === 'ADMIN') {
      allowedRoles = ['SENIOR_MANAGER', 'JUNIOR_MANAGER', 'STUDENT'];
    }

    const where: any = {
      id: { not: userId },
      role: { in: allowedRoles }
      // REMOVED status filter - show all contacts regardless of status
      // Status will be determined by checking status field + lastActivityAt
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    const contacts = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profileImage: true,
        status: true,
        lastActivityAt: true,
        updatedAt: true
      },
      orderBy: [
        { role: 'asc' },
        { firstName: 'asc' }
      ],
      take: 100
    });

    // Optimize: Get all last messages and unread counts in 2 queries instead of N queries
    const contactIds = contacts.map(c => c.id);
    
    // Get last message for each contact in one query
    const lastMessages = await prisma.$queryRaw`
      SELECT DISTINCT ON (other_user_id)
        other_user_id,
        "createdAt",
        content
      FROM (
        SELECT 
          CASE 
            WHEN "senderId" = ${userId} THEN "receiverId" 
            ELSE "senderId" 
          END as other_user_id,
          "createdAt",
          content
        FROM messages
        WHERE ("senderId" = ${userId} AND "receiverId" = ANY(${contactIds}::text[]))
           OR ("receiverId" = ${userId} AND "senderId" = ANY(${contactIds}::text[]))
      ) sub
      ORDER BY other_user_id, "createdAt" DESC
    ` as Array<{ other_user_id: string; createdAt: Date; content: string }>;
    
    // Get unread counts for all contacts in one query
    const unreadCounts = await prisma.$queryRaw`
      SELECT 
        "senderId",
        COUNT(*)::integer as unread_count
      FROM messages
      WHERE "receiverId" = ${userId}
        AND "senderId" = ANY(${contactIds}::text[])
        AND "isRead" = false
      GROUP BY "senderId"
    ` as Array<{ senderId: string; unread_count: number }>;
    
    // Create lookup maps
    const lastMessageMap = new Map(lastMessages.map(m => [m.other_user_id, m]));
    const unreadCountMap = new Map(unreadCounts.map(u => [u.senderId, u.unread_count]));
    
    // Combine data
    const contactsWithLastMessage = contacts.map((contact) => {
      const lastMessage = lastMessageMap.get(contact.id);
      const unreadCount = unreadCountMap.get(contact.id) || 0;
      
      // FIXED: Enhanced online status detection for managers/admins
      // For managers/admins: ACTIVE status = ONLINE
      // For students: Only ONLINE status = online
      const isManagerOrAdmin = contact.role === 'ADMIN' || contact.role === 'SENIOR_MANAGER' || contact.role === 'JUNIOR_MANAGER';
      
      const recentlyActive = contact.lastActivityAt ? 
        (new Date().getTime() - new Date(contact.lastActivityAt).getTime()) < 5 * 60 * 1000 : 
        false;
      
      // Managers/Admins: ONLINE or ACTIVE = online
      // Students: Only ONLINE = online
      const statusOnline = isManagerOrAdmin 
        ? (contact.status === 'ONLINE' || contact.status === 'ACTIVE')
        : (contact.status === 'ONLINE');
      
      const isOnline = statusOnline || recentlyActive;
      
      // Ensure status is always set (default to OFFLINE if null/undefined)
      const finalStatus = contact.status || (isManagerOrAdmin ? 'ACTIVE' : 'OFFLINE');
      
      return {
        ...contact,
        status: finalStatus, // Ensure status is always included
        isOnline,
        lastSeen: contact.lastActivityAt || contact.updatedAt,
        lastMessageTime: lastMessage?.createdAt?.toISOString() || null,
        lastMessageContent: lastMessage?.content || null,
        unreadCount
      };
    });

    res.json({
      success: true,
      data: contactsWithLastMessage
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @route GET /api/messages/:id
 * @desc Get a specific message
 * @access Private
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const message = await prisma.message.findFirst({
      where: {
        id,
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profilePicture: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profilePicture: true
          }
        },
        replies: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                profilePicture: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: { message: 'Message not found' }
      });
    }

    // Mark as read if user is the receiver
    if (message.receiverId === userId && !message.isRead) {
      await prisma.message.update({
        where: { id },
        data: { isRead: true }
      });
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/messages/:id/reply
 * @desc Reply to a message
 * @access Private
 */
router.post('/:id/reply', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const senderId = req.user!.userId;
    const { content, attachments } = req.body;

    // Get original message
    const originalMessage = await prisma.message.findFirst({
      where: {
        id,
        OR: [
          { senderId: senderId },
          { receiverId: senderId }
        ]
      },
      include: {
        sender: true,
        receiver: true
      }
    });

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        error: { message: 'Original message not found' }
      });
    }

    // Determine receiver (opposite of sender)
    const receiverId = originalMessage.senderId === senderId 
      ? originalMessage.receiverId 
      : originalMessage.senderId;

    const reply = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        subject: `Re: ${originalMessage.subject || 'Message'}`,
        content,
        parentId: originalMessage.parentId || id,
        attachments
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    // Create notification for receiver
    await NotificationService.sendSystemNotification(
      receiverId,
      `Réponse de ${reply.sender.firstName} ${reply.sender.lastName}`,
      content.substring(0, 100) + '...',
      'INFO',
      {
        messageId: reply.id,
        senderId: senderId,
        actionUrl: `/messages/${originalMessage.parentId || id}`,
        isReply: true
      }
    );

    res.json({
      success: true,
      data: reply,
      message: 'Reply sent successfully'
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @route PUT /api/messages/:id/read
 * @desc Mark message as read
 * @access Private
 */
router.put('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const message = await prisma.message.updateMany({
      where: {
        id,
        receiverId: userId
      },
      data: {
        isRead: true
      }
    });

    if (message.count === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Message not found' }
      });
    }

    // Get the message details to broadcast read status
    const messageDetails = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (messageDetails) {
      // Broadcast read status to sender
      try {
        await pusherService.sendMessageStatus(messageDetails.senderId, id, 'read');
      } catch (pusherError) {
        console.error('Failed to broadcast read status via Pusher:', pusherError);
      }
    }

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/messages/:id/reply
 * @desc Reply to a specific message
 * @access Private
 */
router.post('/:id/reply', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { content, type = 'text', attachments = [] } = req.body;
    const userId = req.user!.userId;

    // Get the original message
    const originalMessage = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        }
      }
    });

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        error: { message: 'Original message not found' }
      });
    }

    // Determine the receiver (opposite of current user)
    const receiverId = originalMessage.senderId === userId 
      ? originalMessage.receiverId 
      : originalMessage.senderId;

    // Create the reply message
    const replyMessage = await prisma.message.create({
      data: {
        content,
        type,
        attachments,
        senderId: userId,
        receiverId,
        replyToId: id,
        conversationId: originalMessage.conversationId
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true
          }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    // Send real-time notification via Pusher
    try {
      await pusherService.sendMessage(receiverId, {
        ...replyMessage,
        timestamp: replyMessage.createdAt.toISOString()
      });
    } catch (pusherError) {
      console.error('Failed to send Pusher notification:', pusherError);
    }

    res.status(201).json({
      success: true,
      data: replyMessage
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/messages/:id
 * @desc Delete a message (soft delete)
 * @access Private
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User ID not found in token' }
      });
    }
    const { deleteForEveryone = false } = req.body;

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true }
        }
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: { message: 'Message not found' }
      });
    }

    // Check if user can delete this message
    if (message.senderId !== userId && !deleteForEveryone) {
      return res.status(403).json({
        success: false,
        error: { message: 'You can only delete your own messages' }
      });
    }

    if (deleteForEveryone && message.senderId !== userId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the sender can delete for everyone' }
      });
    }

    // Soft delete the message
    const deletedMessage = await prisma.message.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        content: deleteForEveryone ? '[Message deleted]' : '[Message deleted for you]',
        isDeleted: true
      }
    });

    // Send real-time notification via Pusher
    try {
      const receiverId = message.senderId === userId ? message.receiverId : message.senderId;
      await pusherService.sendMessage(receiverId, {
        ...deletedMessage,
        timestamp: deletedMessage.updatedAt.toISOString()
      });
    } catch (pusherError) {
      console.error('Failed to send Pusher notification:', pusherError);
    }

    res.json({
      success: true,
      data: deletedMessage,
      message: deleteForEveryone ? 'Message deleted for everyone' : 'Message deleted for you'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/messages/typing
 * @desc Send typing indicator
 * @access Private
 */
router.post('/typing', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const senderId = req.user!.userId;
    const { receiverId, isTyping } = req.body;

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Receiver ID is required' }
      });
    }

    // Send typing indicator via Pusher
    await pusherService.sendTypingIndicator(receiverId, senderId, isTyping);

    res.json({
      success: true,
      message: 'Typing indicator sent'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/messages/presence
 * @desc Update user presence status
 * @access Private
 */
router.post('/presence', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { isOnline } = req.body;

    // Update user's last activity in database
    try {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        lastActivityAt: new Date(),
        status: isOnline ? 'ONLINE' : 'OFFLINE'
      }
    });
    } catch (dbError) {
      console.error('Database update failed, continuing with presence broadcast:', dbError);
      // Continue with presence broadcast even if DB update fails
    }

    // Broadcast presence update via Pusher
    await pusherService.sendPresenceUpdate(userId, isOnline);

    res.json({
      success: true,
      message: 'Presence updated'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/messages/presence-offline
 * @desc Public endpoint to mark a user as OFFLINE when the tab/window closes (sendBeacon has no auth headers)
 * @access Public (minimal validation)
 */
router.post('/presence-offline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body || {};

    // Minimal validation: require a plausible userId
    if (!userId || typeof userId !== 'string' || userId.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }

    // Best-effort DB update; ignore failures to avoid blocking beacon
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastActivityAt: new Date(),
          status: 'OFFLINE'
        }
      });
    } catch (dbErr) {
      console.warn('presence-offline DB update failed:', dbErr);
    }

    // Broadcast presence update to listeners
    try {
      await pusherService.sendPresenceUpdate(userId, false);
    } catch (pushErr) {
      console.warn('presence-offline pusher broadcast failed:', pushErr);
    }

    // Always return success to allow the browser to finalize the beacon
    return res.json({ success: true, message: 'User set OFFLINE' });
  } catch (error) {
    // Never throw for beacon path; return success to avoid retries
    console.error('presence-offline error:', error);
    return res.json({ success: true });
  }
});

/**
 * @route POST /api/messages/upload
 * @desc Upload file attachment
 * @access Private
 */
router.post('/upload', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');
    
    // Create uploads directory if it doesn't exist
    const uploadDir = 'uploads/messages';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Configure multer
    const storage = multer.diskStorage({
      destination: (req: any, file: any, cb: any) => {
        cb(null, uploadDir);
      },
      filename: (req: any, file: any, cb: any) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });
    
    const upload = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req: any, file: any, cb: any) => {
        // Allow images, videos, audio, and documents
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mp3|wav|pdf|doc|docx|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Invalid file type'));
        }
      }
    }).single('file');
    
    // Upload file
    upload(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: { message: err.message }
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file uploaded' }
        });
      }
      
      const senderId = req.user!.userId;
      const { receiverId, type = 'file' } = req.body;
      
      // Create message with file attachment
      const fileUrl = `/uploads/messages/${req.file.filename}`;
      const message = await prisma.message.create({
        data: {
          senderId,
          receiverId,
          content: `📎 ${req.file.originalname}`,
          type,
          attachments: {
            fileUrl,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
          }
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              profileImage: true
            }
          },
          receiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              profileImage: true
            }
          }
        }
      });
      
      // Send notification
      await NotificationService.sendSystemNotification(
        receiverId,
        `Fichier de ${message.sender.firstName} ${message.sender.lastName}`,
        req.file.originalname,
        'INFO',
        {
          messageId: message.id,
          senderId: senderId,
          actionUrl: `/messages/${message.id}`
        }
      );
      
      // Broadcast via Pusher
      try {
        await pusherService.sendMessage(receiverId, {
          ...message,
          fileUrl,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          timestamp: message.createdAt.toISOString()
        });
      } catch (pusherError) {
        console.error('Failed to send Pusher notification:', pusherError);
      }
      
      res.status(201).json({
        success: true,
        data: {
          ...message,
          fileUrl,
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/messages/conversation/:userId/:contactId
 * @desc Delete entire conversation with a contact
 * @access Private
 */
router.delete('/conversation/:userId/:contactId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, contactId } = req.params;
    const currentUserId = req.user!.userId;
    
    // Verify user can only delete their own conversations
    if (userId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: { message: 'You can only delete your own conversations' }
      });
    }
    
    // Soft delete all messages in conversation
    await prisma.message.updateMany({
      where: {
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId }
        ]
      },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Send video call notification
router.post('/video-call-notification', async (req, res) => {
  try {
    const { receiverId, callerId, callerName, callerRole } = req.body

    if (!receiverId || !callerId || !callerName || !callerRole) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Send notification via Pusher
    await pusherService.sendVideoCallNotification(receiverId, {
      callerId,
      callerName,
      callerRole,
      timestamp: new Date().toISOString()
    })

    res.json({ success: true, message: 'Video call notification sent' })
  } catch (error) {
    console.error('Error sending video call notification:', error)
    res.status(500).json({ error: 'Failed to send video call notification' })
  }
})

/**
 * @route POST /api/messages/create-secure-session
 * @desc Create a secure one-on-one session and send invitation
 * @access Private (Admin/Manager)
 */
router.post('/create-secure-session', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, title, description, duration = 30 } = req.body
    const instructorId = req.user!.userId

    if (!studentId || !title) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID and title are required' 
      })
    }

    // Get instructor details
    const instructor = await prisma.user.findUnique({
      where: { id: instructorId },
      select: { firstName: true, lastName: true, email: true }
    })

    if (!instructor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Instructor not found' 
      })
    }

    // Get student details
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, email: true, phone: true, role: true }
    })

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      })
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ 
        success: false, 
        error: 'User is not a student' 
      })
    }

    // Create one-on-one session
    const session = await prisma.liveSession.create({
      data: {
        title,
        description: description || `Session privée avec ${instructor.firstName} ${instructor.lastName}`,
        instructor: `${instructor.firstName} ${instructor.lastName}`,
        date: new Date(),
        duration,
        maxParticipants: 1,
        requiredTier: 'PRO',
        status: 'SCHEDULED',
        tags: ['one-on-one', 'private'],
        category: 'ORAL',
        level: 'A1',
        notifyFollowers: false,
        createdById: instructorId,
        isOneOnOne: true,
        invitedStudentId: studentId,
        expiresAt: new Date(Date.now() + 90 * 60 * 1000) // 1.5 hours (90 minutes)
      }
    })

    // Generate secure token and link
    const secureToken = SecureSessionService.generateSecureToken(session.id, studentId)
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    const secureLink = `${baseUrl}/session/${secureToken}`

    // Update session with secure token
    await prisma.liveSession.update({
      where: { id: session.id },
      data: { secureToken }
    })

    // Send message to student
    const messageContent = `🎥 **Session Privée Invitation**

**${instructor.firstName} ${instructor.lastName}** vous a invité à une session privée de préparation TCF/TEF.

**Détails:**
• **Titre:** ${title}
• **Durée:** ${duration} minutes
• **Type:** Session individuelle privée

Cliquez sur le lien ci-dessous pour rejoindre la session :
${secureLink}

*Ce lien est personnel et sécurisé. Ne le partagez pas avec d'autres personnes.*`

    await prisma.message.create({
      data: {
        senderId: instructorId,
        receiverId: studentId,
        subject: 'Invitation à une session privée',
        content: messageContent,
        type: 'system'
      }
    })

    // Send email notification
    try {
      await EmailService.sendOneOnOneSessionEmail({
        firstName: student.firstName,
        email: student.email,
        sessionTitle: title,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        sessionDate: new Date().toLocaleDateString('fr-FR'),
        sessionTime: new Date().toLocaleTimeString('fr-FR'),
        secureLink,
        duration
      })
    } catch (emailError) {
      console.warn('Failed to send email notification:', emailError)
      // Continue even if email fails
    }

    // Send Twilio SMS and email notification
    // TODO: Implement TwilioService.sendSecureSessionNotification
    // try {
    //   if (student.phone) {
    //     await TwilioService.sendSecureSessionNotification(
    //       student.phone,
    //       student.email,
    //       title,
    //       `${instructor.firstName} ${instructor.lastName}`,
    //       secureLink
    //     )
    //   }
    // } catch (twilioError) {
    //   console.warn('Failed to send Twilio notification:', twilioError)
    //   // Continue even if Twilio fails
    // }

    // Send Pusher notification
    try {
      await pusherService.sendVideoCallNotification(studentId, {
        callerId: instructorId,
        callerName: `${instructor.firstName} ${instructor.lastName}`,
        callerRole: 'INSTRUCTOR',
        sessionId: session.id,
        secureLink
      })
    } catch (pusherError) {
      console.warn('Failed to send Pusher notification:', pusherError)
      // Continue even if Pusher fails
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        secureLink,
        message: 'Secure session created and invitation sent'
      }
    })

  } catch (error) {
    console.error('Error creating secure session:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create secure session' 
    })
  }
})

/**
 * @route POST /api/messages/create-direct-session
 * @desc Create a direct one-on-one session (no secure link needed)
 * @access Private (Admin/Manager)
 */
router.post('/create-direct-session', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId } = req.body;
    const userId = req.user!.userId;

    if (!contactId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Contact ID is required' 
      });
    }

    // Get the contact (student) details
    const student = await prisma.user.findUnique({
      where: { id: contactId },
      select: { 
        id: true, 
        firstName: true, 
        lastName: true, 
        email: true, 
        phone: true, 
        role: true 
      }
    });

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ 
        success: false, 
        error: 'Contact must be a student' 
      });
    }

    // Get instructor details
    const instructor = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true }
    });

    if (!instructor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Instructor not found' 
      });
    }

    // Create one-on-one live session
    const newSession = await prisma.liveSession.create({
      data: {
        title: `Session privée avec ${instructor.firstName} ${instructor.lastName}`,
        description: `Session vidéo directe initiée par ${instructor.firstName} ${instructor.lastName}`,
        instructor: `${instructor.firstName} ${instructor.lastName}`,
        date: new Date(),
        duration: 30,
        maxParticipants: 1,
        requiredTier: 'PRO',
        status: 'SCHEDULED',
        tags: ['one-on-one', 'private'],
        category: 'ORAL',
        level: 'A1',
        notifyFollowers: false,
        createdById: userId,
        isOneOnOne: true,
        invitedStudentId: student.id,
        expiresAt: new Date(Date.now() + 90 * 60 * 1000) // 1.5 hours (90 minutes)
      }
    });

    // --- Secure Token Generation/Storage ---
    let secureToken, secureLink;
    try {
      // Use the same logic as secure session route
      secureToken = SecureSessionService.generateSecureToken(newSession.id, student.id);
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      secureLink = `${baseUrl}/session/${secureToken}`;
      await prisma.liveSession.update({
        where: { id: newSession.id },
        data: { secureToken },
      });
    } catch (err) {
      console.error('Secure token error:', err);
      secureLink = `/session/${newSession.id}`; // Fallback
    }

    // --- System message to student ---
    const messageContent = `🎥 **Session Privée Invitation**\n\n**${instructor.firstName} ${instructor.lastName}** vous a invité à une session privée de préparation TCF/TEF.\n\n**Détails:**\n• **Titre:** Session privée avec ${instructor.firstName} ${instructor.lastName}\n• **Durée:** 30 minutes\n• **Type:** Session individuelle privée\n\nCliquez sur le lien ci-dessous pour rejoindre la session :\n🔗 ${secureLink}\n\nCe lien est personnel et sécurisé. Ne le partagez pas avec d'autres personnes.`;
    try {
      await prisma.message.create({
        data: {
          senderId: userId,
          receiverId: student.id,
          subject: 'Invitation à une session privée',
          content: messageContent,
          type: 'system',
        },
      });
    } catch (msgError) {
      console.warn('Message notification failed:', msgError);
    }

    // --- Email notification ---
    try {
      await EmailService.sendOneOnOneSessionEmail({
        firstName: student.firstName,
        email: student.email,
        sessionTitle: `Session privée avec ${instructor.firstName} ${instructor.lastName}`,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        sessionDate: new Date().toLocaleDateString('fr-FR'),
        sessionTime: new Date().toLocaleTimeString('fr-FR'),
        secureLink,
        duration: 30,
      });
    } catch (emailError) {
      console.warn('Failed to send email invitation:', emailError);
    }

    // --- Pusher notification ---
    try {
      await pusherService.sendVideoCallNotification(student.id, {
        sessionId: newSession.id,
        callerId: userId,
        callerName: `${instructor.firstName} ${instructor.lastName}`,
        callerRole: 'INSTRUCTOR',
        isDirectCall: true,
        secureLink,
      });
    } catch (pusherError) {
      console.warn('Failed to send Pusher notification:', pusherError);
    }

    res.json({
      success: true,
      data: {
        sessionId: newSession.id,
        secureLink,
        message: 'Session privée créée, lien sécurisé envoyé au student par message et email.'
      },
    });
  } catch (error) {
    let debugError = error;
    let message = '';
    let stack = '';
    if (error instanceof Error) {
      message = error.message;
      stack = error.stack || '';
    } else if (typeof error === 'object' && error !== null) {
      message = JSON.stringify(error);
    } else {
      message = String(error)
    }
    console.error('Direct session creation error:', debugError);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create direct session',
      debug: { message, stack, error: debugError }
    });
  }
});

/**
 * @route GET /api/messages/session/:sessionId
 * @desc Get session details by ID
 * @access Private
 */
router.get('/session/:sessionId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.userId;

    // Use findFirst with correct OR logic for access control
    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { createdById: userId },
          { invitedStudentId: userId }
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            role: true,
          },
        },
        invitedStudent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied',
      });
    }

    // Determine the other participant
    let otherParticipant;
    if (session.createdById === userId) {
      // Admin: other is invited student
      if (session.invitedStudent) {
        otherParticipant = {
          id: session.invitedStudent.id,
          name: `${session.invitedStudent.firstName} ${session.invitedStudent.lastName}`.trim(),
          role: session.invitedStudent.role,
          profileImage: session.invitedStudent.profileImage || null,
        };
      } else {
        otherParticipant = {
          id: session.invitedStudentId || '',
          name: 'Unknown',
          role: 'STUDENT',
          profileImage: null,
        };
      }
    } else {
      // Student: other is instructor
      otherParticipant = {
        id: session.createdBy.id,
        name: `${session.createdBy.firstName} ${session.createdBy.lastName}`.trim(),
        role: session.createdBy.role,
        profileImage: session.createdBy.profileImage || null,
      };
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        title: session.title,
        description: session.description,
        instructor: session.createdBy,
        otherParticipant,
        duration: session.duration,
        status: session.status,
        isOneOnOne: session.isOneOnOne,
      },
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session details',
    });
  }
});

/**
 * @route GET /api/messages/session/:sessionId/chat
 * @desc Get chat messages for a session
 * @access Private
 */
router.get('/session/:sessionId/chat', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params
    const userId = req.user!.userId

    // Verify user has access to this session
    const session = await prisma.liveSession.findFirst({
      where: { 
        id: sessionId,
        OR: [
          { createdById: userId },
          { invitedStudentId: userId }
        ]
      }
    })

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied'
      })
    }

    // Get chat messages for this session
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { 
            content: { contains: `session-${sessionId}` },
            type: 'session-chat'
          }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    res.json({
      success: true,
      data: messages
    })

  } catch (error) {
    console.error('Error fetching session chat:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session chat'
    })
  }
})

/**
 * @route POST /api/messages/session/:sessionId/chat
 * @desc Send a chat message to a session
 * @access Private
 */
router.post('/session/:sessionId/chat', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params
    const { message } = req.body
    const userId = req.user!.userId

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      })
    }

    // Verify user has access to this session
    const session = await prisma.liveSession.findFirst({
      where: { 
        id: sessionId,
        OR: [
          { createdById: userId },
          { invitedStudentId: userId }
        ]
      }
    })

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied'
      })
    }

    // Create chat message
    const chatMessage = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId: sessionId, // Use sessionId as receiver for session chat
        content: message.trim(),
        type: 'session-chat',
        subject: `Session Chat - ${session.title}`
      },
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
    })

    res.json({
      success: true,
      data: chatMessage
    })

  } catch (error) {
    console.error('Error sending session chat message:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to send chat message'
    })
  }
})

/**
 * @route GET /api/messages/validate-secure-session/:token
 * @desc Validate secure session token and return session details
 * @access Private
 */
router.get('/validate-secure-session/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params

    // Sanitize token coming from copied links that might contain HTML (<br>) or URL encoding
    let sanitizedToken = decodeURIComponent(token || '')
      .replace(/<br\s*\/?>(?:\s*)/gi, '')  // Remove HTML <br> tags
      .replace(/%3Cbr%3E/gi, '')  // Remove URL-encoded <br>
      .replace(/%3Cbr%3E%3Cbr%3E/gi, '')  // Remove double encoded <br>
      .replace(/<[^>]*>/g, '')  // Remove any remaining HTML tags
      .trim()
    
    // Extract only the JWT token part (everything before <br> or %3Cbr%3E)
    const brIndex = sanitizedToken.indexOf('<br>')
    const encodedBrIndex = sanitizedToken.indexOf('%3Cbr%3E')
    const cutIndex = brIndex > -1 ? brIndex : (encodedBrIndex > -1 ? encodedBrIndex : sanitizedToken.length)
    sanitizedToken = sanitizedToken.substring(0, cutIndex).trim()
    
    // JWT tokens contain base64url characters: a-z, A-Z, 0-9, '-', '_', '.', '/', '='
    // The token should already be valid after removing HTML tags and <br> content

    // Validate token
    const tokenValidation = SecureSessionService.validateSecureToken(sanitizedToken)
    
    if (!tokenValidation.valid) {
      return res.status(400).json({
        success: false,
        error: tokenValidation.error || 'Invalid token'
      })
    }

    // Get session details
    const session = await prisma.liveSession.findUnique({
      where: { 
        id: tokenValidation.sessionId,
        isOneOnOne: true,
        invitedStudentId: tokenValidation.studentId
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    })

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      })
    }

    // Check if session is still valid
    if (session.expiresAt && new Date() > session.expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Session has expired'
      })
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        title: session.title,
        description: session.description,
        instructor: session.createdBy,
        duration: session.duration,
        status: session.status,
        secureToken: sanitizedToken
      }
    })

  } catch (error) {
    console.error('Error validating secure session:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to validate secure session'
    })
  }
})

export default router;

