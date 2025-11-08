import { Router } from 'express'
import { authenticate, authorize } from '@/middleware/auth'
import { asyncHandler } from '@/middleware/errorHandler'
import { ChallengeController } from '@/controllers/challengeController'
import { UserRole } from '@/types'

const router = Router()

// Get daily challenges
router.get('/daily', authenticate, authorize(UserRole.STUDENT), asyncHandler(ChallengeController.getDailyChallenges))

// Get user's challenge progress
router.get('/progress', authenticate, authorize(UserRole.STUDENT), asyncHandler(ChallengeController.getUserProgress))

// Start a challenge
router.post('/start/:challengeId', authenticate, authorize(UserRole.STUDENT), asyncHandler(ChallengeController.startChallenge))

// Complete a challenge
router.post('/complete/:challengeId', authenticate, authorize(UserRole.STUDENT), asyncHandler(ChallengeController.completeChallenge))

export default router
