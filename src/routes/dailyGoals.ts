import { Router } from 'express'
import { authenticate } from '@/middleware/auth'
import { asyncHandler } from '@/middleware/errorHandler'
import { DailyGoalController } from '@/controllers/dailyGoalController'

const router = Router()

// Get today's daily goal
router.get('/today', authenticate, asyncHandler(DailyGoalController.getTodayGoal))

// Create or update daily goal
router.post('/set', authenticate, asyncHandler(DailyGoalController.setDailyGoal))

// Update goal progress
router.put('/progress', authenticate, asyncHandler(DailyGoalController.updateProgress))

// Complete daily goal
router.post('/complete', authenticate, asyncHandler(DailyGoalController.completeGoal))

export default router


