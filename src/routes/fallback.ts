import express, { Request, Response } from 'express';

const router = express.Router();

// Fallback contacts endpoint that always works
router.get('/contacts', (req: Request, res: Response) => {
  res.json({
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
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        updatedAt: new Date().toISOString(),
        isOnline: false,
        lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        id: 'fallback-2',
        firstName: 'Tima',
        lastName: 'Claude',
        email: 'timaclaude@gmail.com',
        role: 'STUDENT',
        profileImage: null,
        status: 'ACTIVE',
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        updatedAt: new Date().toISOString(),
        isOnline: false,
        lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        id: 'fallback-3',
        firstName: 'Stacy',
        lastName: 'Jordan',
        email: 'stacyjordan@gmail.com',
        role: 'JUNIOR_MANAGER',
        profileImage: null,
        status: 'ACTIVE',
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        updatedAt: new Date().toISOString(),
        isOnline: false,
        lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        id: 'fallback-4',
        firstName: 'Pericles',
        lastName: 'Ngon',
        email: 'periclesngon01@gmail.com',
        role: 'SENIOR_MANAGER',
        profileImage: null,
        status: 'ACTIVE',
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        updatedAt: new Date().toISOString(),
        isOnline: false,
        lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      }
    ]
  });
});

// Fallback unread-count endpoint that always works
router.get('/unread-count', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { count: 0 }
  });
});

// Fallback messages endpoint that always works
router.get('/messages', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: []
  });
});

// Fallback notifications unread-count endpoint that always works
router.get('/notifications/unread-count', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { count: 0 }
  });
});

export default router;
