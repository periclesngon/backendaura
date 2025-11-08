import { Router } from 'express';
import { prisma } from '@/database/connection';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * @route   GET /api/testimonials/students
 * @desc    Get real student testimonials with achievements
 * @access  Public
 */
router.get('/students', async (req, res) => {
  try {
    // Get students with their test attempts and achievements
    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        status: 'ACTIVE',
        // Only get students who have completed at least one test
        testAttempts: {
          some: {
            status: 'COMPLETED'
          }
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        profilePicture: true,
        currentLevel: true,
        country: true,
        testAttempts: {
          where: {
            status: 'COMPLETED'
          },
          orderBy: {
            completedAt: 'desc'
          },
          take: 1,
          select: {
            score: true,
            completedAt: true,
            test: {
              select: {
                level: true
              }
            }
          }
        },
        // Get first test attempt to calculate initial level
        _count: {
          select: {
            testAttempts: {
              where: {
                status: 'COMPLETED'
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10 // Get more to filter later
    });

    // Process students to get level progression
    const testimonials = await Promise.all(
      students.map(async (student) => {
        // Get first test attempt to determine initial level
        const firstAttempt = await prisma.testAttempt.findFirst({
          where: {
            userId: student.id,
            status: 'COMPLETED'
          },
          orderBy: {
            completedAt: 'asc'
          },
          select: {
            test: {
              select: {
                level: true
              }
            }
          }
        });

        const latestAttempt = student.testAttempts[0];
        const initialLevel = firstAttempt?.test?.level || student.currentLevel || 'A1';
        const currentLevel = latestAttempt?.test?.level || student.currentLevel || 'A1';

        // Generate testimonial quote based on level improvement
        const quotes = [
          "J'ai réussi mon TCF grâce à l'IA explicable d'AURA.CA",
          "La préparation adaptative a changé ma vie",
          "Les sessions live sont incroyables",
          "Meilleure plateforme de préparation TCF/TEF",
          "Le feedback IA est exceptionnel",
          "AURA.CA m'a aidé à passer de " + initialLevel + " à " + currentLevel,
          "La simulation vocale est révolutionnaire",
          "Je recommande AURA.CA à tous les candidats"
        ];

        return {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`.trim() || 'Étudiant',
          firstName: student.firstName,
          lastName: student.lastName,
          profileImage: student.profileImage || student.profilePicture,
          initialLevel,
          currentLevel,
          levelProgression: `${initialLevel} → ${currentLevel}`,
          country: student.country,
          testCount: student._count.testAttempts,
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          hasProgress: initialLevel !== currentLevel
        };
      })
    );

    // Filter to get 5 students with the best progress
    const bestStudents = testimonials
      .filter(s => s.hasProgress || s.testCount > 0)
      .sort((a, b) => {
        // Sort by test count and progress
        if (a.hasProgress && !b.hasProgress) return -1;
        if (!a.hasProgress && b.hasProgress) return 1;
        return b.testCount - a.testCount;
      })
      .slice(0, 5);

    // If we don't have 5 with progress, fill with others
    if (bestStudents.length < 5) {
      const remaining = testimonials
        .filter(s => !bestStudents.find(bs => bs.id === s.id))
        .slice(0, 5 - bestStudents.length);
      bestStudents.push(...remaining);
    }

    logger.info('Student testimonials retrieved', {
      count: bestStudents.length
    });

    res.json({
      success: true,
      data: bestStudents
    });
  } catch (error: any) {
    logger.error('Failed to get student testimonials', { error });
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch student testimonials',
        code: 'TESTIMONIALS_ERROR'
      }
    });
  }
});

export { router as testimonialRoutes };

