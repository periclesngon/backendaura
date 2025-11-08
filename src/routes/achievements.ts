import { Router } from 'express'
import { AchievementController } from '../controllers/achievementController'
import { authenticate, authorize } from '@/middleware/auth'
import { UserRole } from '@prisma/client'

const router = Router()

// Get recent achievements for user
router.get('/recent', authenticate, authorize(UserRole.STUDENT), AchievementController.getRecentAchievements)

// Get all achievements for user
router.get('/', authenticate, authorize(UserRole.STUDENT), AchievementController.getAllAchievements)

// Get achievement progress
router.get('/progress', authenticate, authorize(UserRole.STUDENT), AchievementController.getAchievementProgress)

export default router
