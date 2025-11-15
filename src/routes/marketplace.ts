import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route GET /api/marketplace/tutors
 * @desc Get available tutors for Pro+ students
 * @access Private (Pro+ only)
 */
router.get('/tutors', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Check if user has Pro+ subscription
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !['PRO', 'PREMIUM'].includes(user.subscriptionTier)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Pro+ subscription required for marketplace access' }
      });
    }

    // Get tutor profiles (managers and admins) - fetch ALL regardless of status
    // Status filter removed: we want to show all activated profiles, then display their actual status
    const tutors = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'] }
        // Removed status filter - fetch all and filter by marketplaceProfile.isActive only
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        profileImage: true, // Include profileImage field
        preferences: true, // CRITICAL: Must select preferences to check marketplaceProfile.isActive
        status: true, // Include status to display correct online/offline status
        createdAt: true,
        // Add tutor-specific fields if they exist
      }
    });

    // Filter tutors to only show those with activated marketplace profiles
    const activeTutors = tutors.filter(tutor => {
      // Only show ADMIN and SENIOR_MANAGER (not JUNIOR_MANAGER for general marketplace)
      if (tutor.role !== 'ADMIN' && tutor.role !== 'SENIOR_MANAGER') {
        return false;
      }

      // Check if marketplace profile is activated - parse preferences properly
      let preferences = {};
      try {
        if (tutor.preferences) {
          if (typeof tutor.preferences === 'string') {
            preferences = JSON.parse(tutor.preferences);
          } else if (typeof tutor.preferences === 'object') {
            preferences = tutor.preferences;
          }
        }
      } catch (parseError) {
        console.error(`❌ Error parsing preferences for ${tutor.email}:`, parseError);
        preferences = {};
      }
      
      const marketplaceProfile = (preferences as any).marketplaceProfile || {};
      const isActive = marketplaceProfile.isActive === true;
      
      console.log(`🔍 Marketplace filter: ${tutor.email} (${tutor.role}): isActive=${isActive}`);
      
      return isActive;
    });

    console.log(`✅ Filtered ${activeTutors.length} active tutors from ${tutors.length} total`);

    const tutorProfiles = activeTutors.map(tutor => {
      // Parse preferences to get marketplace profile data
      let preferences = {};
      try {
        if (tutor.preferences) {
          if (typeof tutor.preferences === 'string') {
            preferences = JSON.parse(tutor.preferences);
          } else if (typeof tutor.preferences === 'object') {
            preferences = tutor.preferences;
          }
        }
      } catch (parseError) {
        preferences = {};
      }
      
      const marketplaceProfile = (preferences as any).marketplaceProfile || {};
      
      // Determine online status: ONLY ONLINE status means user is currently online
      // ACTIVE = user has account (not necessarily online)
      // ONLINE = user is currently logged in/online on platform
      // OFFLINE = user has account but not online
      const displayStatus = tutor.status || 'OFFLINE'; // Use actual status from DB
      
      // Get all marketplace profile data
      const tutorLocation = marketplaceProfile.location || null;
      const tutorTitle = marketplaceProfile.title || undefined;
      const tutorPhone = marketplaceProfile.phone || undefined;
      const tutorWebsite = marketplaceProfile.website || undefined;
      const acceptsMessages = marketplaceProfile.acceptsMessages !== false; // Default to true
      const tutorSubjects = Array.isArray(marketplaceProfile.subjects) 
        ? marketplaceProfile.subjects 
        : marketplaceProfile.subjects 
        ? [marketplaceProfile.subjects] 
        : [];
      const tutorWorkingHours = Array.isArray(marketplaceProfile.workingHours)
        ? marketplaceProfile.workingHours
        : marketplaceProfile.workingHours
        ? [marketplaceProfile.workingHours]
        : [];
      
      return {
        id: tutor.id,
        userId: tutor.id,
        firstName: tutor.firstName || '',
        lastName: tutor.lastName || '',
        fullName: `${tutor.firstName || ''} ${tutor.lastName || ''}`.trim() || 'Formateur',
        name: `${tutor.firstName || ''} ${tutor.lastName || ''}`.trim() || 'Formateur',
        email: tutor.email,
        role: tutor.role,
        profilePicture: tutor.profileImage || tutor.profilePicture, // Prioritize profileImage, fallback to profilePicture
        profileImage: tutor.profileImage || tutor.profilePicture,
        bio: marketplaceProfile.bio || `Expert formateur en français langue étrangère`,
        title: tutorTitle,
        phone: tutorPhone,
        website: tutorWebsite,
        specialties: Array.isArray(marketplaceProfile.specialties) 
          ? marketplaceProfile.specialties 
          : marketplaceProfile.specialties 
          ? [marketplaceProfile.specialties] 
          : [],
        subjects: tutorSubjects,
        languages: Array.isArray(marketplaceProfile.languages) 
          ? marketplaceProfile.languages 
          : marketplaceProfile.languages 
          ? [marketplaceProfile.languages] 
          : ['Français', 'English'],
        availability: Array.isArray(marketplaceProfile.availability) 
          ? marketplaceProfile.availability 
          : marketplaceProfile.availability 
          ? [marketplaceProfile.availability] 
          : ['Lun-Ven'],
        workingHours: tutorWorkingHours,
        location: tutorLocation,
        experience: tutor.role === 'ADMIN' ? 'Expert' : 'Senior',
        rating: 4.5 + Math.random() * 0.5, // Mock rating
        reviewCount: Math.floor(Math.random() * 100) + 10,
        responseTime: '< 24h',
        isAvailable: true,
        status: displayStatus, // CRITICAL: Include status for frontend online/offline check
        isActive: marketplaceProfile.isActive === true,
        acceptsMessages: acceptsMessages
      };
    });

    res.json({
      success: true,
      data: tutorProfiles
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/marketplace/requests
 * @desc Get all pending review requests for tutors
 * @access Private (Tutors only)
 */
router.get('/requests', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Check if user is a tutor (admin, senior manager, or junior manager)
    const tutor = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!tutor || !['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(tutor.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only tutors can view review requests' }
      });
    }

    // Get all pending review requests
    const pendingRequests = await prisma.aIFeedback.findMany({
      where: {
        status: 'PENDING_HUMAN'
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            subscriptionTier: true
          }
        },
        // simulationResult: {
        //   include: {
        //     testAttempt: {
        //       include: {
        //         test: {
        //           select: {
        //             title: true,
        //             type: true
        //           }
        //         }
        //       }
        //     }
        //   }
        // }
      },
      orderBy: { createdAt: 'desc' }
    });

    const requests = pendingRequests.map(request => ({
      id: request.id,
      studentId: request.userId,
      studentName: `${(request as any).user?.firstName || ''} ${(request as any).user?.lastName || ''}`,
      studentEmail: (request as any).user?.email || '',
      subscriptionPlan: (request as any).user?.subscriptionTier || 'FREE',
      simulationTitle: 'Unknown', // request.simulationResult?.testAttempt?.test?.title || 'Unknown',
      simulationType: 'Unknown', // request.simulationResult?.testAttempt?.test?.type || 'Unknown',
      submissionType: request.submissionType,
      submissionContent: request.submissionContent,
      submissionFileUrl: request.submissionFileUrl,
      aiScore: request.aiScore,
      aiConfidence: request.aiConfidence,
      overallFeedback: request.overallFeedback,
      strengths: request.strengths,
      weaknesses: request.weaknesses,
      recommendations: request.recommendations,
      submissionDate: request.createdAt,
      priority: 'normal' // Could be enhanced with actual priority field
    }));

    res.json({
      success: true,
      data: {
        requests,
        total: requests.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/marketplace/review-requests
 * @desc Submit work for human review
 * @access Private (Pro+ only)
 */
router.post('/review-requests', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { feedbackId, message, priority, tutorId } = req.body;

    // Check if user has Pro+ subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !['PRO', 'PREMIUM'].includes(user.subscriptionTier)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Pro+ subscription required for human reviews' }
      });
    }

    // Verify the feedback belongs to the user
    const feedback = await prisma.aIFeedback.findFirst({
      where: {
        id: feedbackId,
        userId
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: { message: 'Feedback not found' }
      });
    }

    // Update feedback status to pending human review
    await prisma.aIFeedback.update({
      where: { id: feedbackId },
      data: {
        status: 'PENDING_HUMAN',
        humanReviewerId: tutorId || null
      }
    });

    // Create review request record (you might want to add this model)
    const reviewRequest = {
      id: `req_${Date.now()}`,
      feedbackId,
      userId,
      tutorId,
      message,
      priority,
      status: 'PENDING',
      createdAt: new Date()
    };

    // Send notification to tutor (implement notification system)
    await sendTutorNotification(tutorId, {
      type: 'REVIEW_REQUEST',
      message: `New review request from ${user.firstName} ${user.lastName}`,
      priority,
      feedbackId
    });

    res.json({
      success: true,
      data: reviewRequest,
      message: 'Review request submitted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/marketplace/my-requests
 * @desc Get user's review requests
 * @access Private
 */
router.get('/my-requests', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const feedbacks = await prisma.aIFeedback.findMany({
      where: {
        userId,
        status: { in: ['PENDING_HUMAN', 'HUMAN_COMPLETED'] }
      },
      include: {
        // simulationResult: {
        //   include: {
        //     testAttempt: {
        //       include: {
        //         test: true
        //       }
        //     }
        //   }
        // }
      },
      orderBy: { createdAt: 'desc' }
    });

    const requests = feedbacks.map(feedback => ({
      id: feedback.id,
      simulationTitle: 'Unknown', // feedback.simulationResult?.testAttempt?.test?.title || 'Unknown',
      status: feedback.status,
      submissionDate: feedback.createdAt,
      tutorName: feedback.humanReviewerName,
      humanScore: feedback.humanScore,
      humanFeedback: feedback.humanFeedback,
      reviewDate: feedback.humanReviewDate
    }));

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/marketplace/tutor-response
 * @desc Tutor responds to review request
 * @access Private (Tutors only)
 */
router.post('/tutor-response', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tutorId = req.user!.userId;
    const { feedbackId, humanScore, humanFeedback } = req.body;

    // Verify user is a tutor
    const tutor = await prisma.user.findUnique({
      where: { id: tutorId }
    });

    if (!tutor || !['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(tutor.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only tutors can respond to review requests' }
      });
    }

    // Update feedback with human review
    const updatedFeedback = await prisma.aIFeedback.update({
      where: { id: feedbackId },
      data: {
        status: 'HUMAN_COMPLETED',
        humanReviewerId: tutorId,
        humanReviewerName: `${tutor.firstName} ${tutor.lastName}`,
        humanScore,
        humanFeedback,
        humanReviewDate: new Date()
      },
      include: {
        user: true
      }
    });

    // Send notification to student
    await sendStudentNotification(updatedFeedback.userId, {
      type: 'REVIEW_COMPLETED',
      message: `Your review has been completed by ${tutor.firstName} ${tutor.lastName}`,
      feedbackId
    });

    res.json({
      success: true,
      data: updatedFeedback,
      message: 'Review completed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/marketplace/profile
 * @desc Get marketplace profile for current user
 * @access Private
 */
router.get('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        subscriptionTier: true,
        profilePicture: true,
        createdAt: true,
        lastActivityAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    // Determine if user is a tutor
    const isTutor = ['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(user.role);
    
    // Get tutor-specific stats if user is a tutor
    let tutorStats = null;
    if (isTutor) {
      const completedReviews = await prisma.aIFeedback.count({
        where: {
          humanReviewerId: userId,
          status: 'HUMAN_COMPLETED'
        }
      });

      const pendingReviews = await prisma.aIFeedback.count({
        where: {
          humanReviewerId: userId,
          status: 'PENDING_HUMAN'
        }
      });

      tutorStats = {
        completedReviews,
        pendingReviews,
        totalReviews: completedReviews + pendingReviews
      };
    }

    // Get student-specific stats if user is a student
    let studentStats = null;
    if (user.role === 'STUDENT') {
      const myRequests = await prisma.aIFeedback.count({
        where: {
          userId,
          status: { in: ['PENDING_HUMAN', 'HUMAN_COMPLETED'] }
        }
      });

      studentStats = {
        myRequests,
        hasProSubscription: ['PRO', 'PREMIUM'].includes(user.subscriptionTier || 'FREE')
      };
    }

    const profile = {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier || 'FREE',
      profilePicture: user.profilePicture,
      memberSince: user.createdAt,
      lastActive: user.lastActivityAt,
      isTutor,
      tutorStats,
      studentStats
    };

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/marketplace/activate
 * @desc Activate marketplace features for user
 * @access Private
 */
router.post('/activate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { action, tutorId } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    if (action === 'become_tutor') {
      // Check if user can become a tutor
      if (!['ADMIN', 'SENIOR_MANAGER', 'JUNIOR_MANAGER'].includes(user.role)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Only managers and admins can become tutors' }
        });
      }

      // Update user profile for tutoring
      await prisma.user.update({
        where: { id: userId },
        data: {
          // Add any tutor-specific fields here
          updatedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Tutor profile activated successfully',
        data: {
          isTutor: true,
          tutorId: userId
        }
      });
    } else if (action === 'request_tutor') {
      // Check if user has Pro+ subscription
      if (!['PRO', 'PREMIUM'].includes(user.subscriptionTier || 'FREE')) {
        return res.status(403).json({
          success: false,
          error: { message: 'Pro+ subscription required to request tutors' }
        });
      }

      // Create tutor request (you might want to add a TutorRequest model)
      const tutorRequest = {
        id: `tutor_req_${Date.now()}`,
        studentId: userId,
        tutorId,
        status: 'PENDING',
        createdAt: new Date()
      };

      res.json({
        success: true,
        message: 'Tutor request submitted successfully',
        data: tutorRequest
      });
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid action. Use "become_tutor" or "request_tutor"' }
      });
    }
  } catch (error) {
    next(error);
  }
});

// Helper functions
async function sendTutorNotification(tutorId: string | null, notification: any) {
  if (!tutorId) return;
  
  // Implement notification system
  console.log(`Sending notification to tutor ${tutorId}:`, notification);
  
  // You can implement email notifications here
  // await sendEmail(tutorEmail, 'New Review Request', notification.message);
}

async function sendStudentNotification(studentId: string, notification: any) {
  // Implement notification system
  console.log(`Sending notification to student ${studentId}:`, notification);
  
  // You can implement email notifications here
  // await sendEmail(studentEmail, 'Review Completed', notification.message);
}

export default router;
