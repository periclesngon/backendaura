import { Router } from 'express';
import { prisma } from '@/database/connection';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * @route   GET /api/success-stories
 * @desc    Get real students with their achievements for success stories
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    // Get students with test attempts and calculate their progress
    const students = await prisma.user.findMany({
      where: {
        role: {
          in: ['STUDENT', 'USER']
        },
        status: 'ACTIVE',
        testAttempts: {
          some: {
            status: 'COMPLETED',
            score: {
              not: null
            }
          }
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        profilePicture: true,
        currentLevel: true,
        testAttempts: {
          where: {
            status: 'COMPLETED',
            score: { not: null }
          },
          orderBy: {
            completedAt: 'desc'
          },
          take: 1,
          select: {
            score: true,
            percentage: true,
            completedAt: true,
            test: {
              select: {
                level: true
              }
            }
          }
        },
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20 // Get more to filter and select best ones
    });

    // Calculate initial and current levels based on test attempts
    const studentsWithProgress = students
      .map(student => {
        // Get all completed test attempts ordered by date
        const allAttempts = student.testAttempts || [];
        
        if (allAttempts.length === 0) return null;

        // Find earliest and latest test attempts
        const earliestAttempt = allAttempts[allAttempts.length - 1];
        const latestAttempt = allAttempts[0];

        // Determine initial level (from earliest test or default to A1)
        const initialLevel = earliestAttempt?.test?.level || student.currentLevel || 'A1';
        
        // Determine current level (from latest test or currentLevel)
        const currentLevel = latestAttempt?.test?.level || student.currentLevel || initialLevel;

        // Calculate progress percentage
        const progressPercentage = latestAttempt?.percentage || 0;

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          profileImage: student.profileImage || student.profilePicture,
          initialLevel,
          currentLevel,
          progressPercentage,
          latestScore: latestAttempt?.score || 0,
          completedAt: latestAttempt?.completedAt || student.createdAt
        };
      })
      .filter(student => student !== null && student.progressPercentage > 0)
      .sort((a, b) => (b?.progressPercentage || 0) - (a?.progressPercentage || 0))
      .slice(0, 5); // Get top 5 students

    logger.info('Success stories retrieved', { count: studentsWithProgress.length });

    res.json({
      success: true,
      data: studentsWithProgress
    });
  } catch (error: any) {
    logger.error('Failed to get success stories', { error });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get success stories'
    });
  }
});

export { router as successStoriesRoutes };

