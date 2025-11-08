import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { HomeController } from '../controllers/homeController'

const router = Router()

// Get user dashboard data
router.get('/dashboard', authenticate, HomeController.getDashboardData)

// Get AI-generated messages (greeting, motivation, weather)
router.get('/ai-messages', authenticate, HomeController.getAIMessages)

// Get user study session data
router.get('/study-session', authenticate, HomeController.getStudySession)

// Start study session
router.post('/study-session/start', authenticate, HomeController.startStudySession)

// Stop study session
router.post('/study-session/stop', authenticate, HomeController.stopStudySession)

// Reset study session
router.post('/study-session/reset', authenticate, HomeController.resetStudySession)

// Get user's days on platform
router.get('/days-on-platform', authenticate, HomeController.getDaysOnPlatform)

// Get regional time for user
router.get('/regional-time', authenticate, HomeController.getRegionalTime)

export default router
