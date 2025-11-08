import { prisma } from '@/database/connection'
import { logger } from '@/utils/logger'
import { NotFoundError, ValidationError } from '@/middleware/errorHandler'

export interface DailyGoal {
  id: string
  userId: string
  title: string
  description?: string
  targetValue: number
  currentValue: number
  unit: string
  xpReward: number
  isCompleted: boolean
  completedAt?: Date
  targetDate: Date
  progress: number // Percentage (0-100)
}

export class DailyGoalService {
  /**
   * Get user's daily goal for today
   */
  static async getTodayGoal(userId: string): Promise<DailyGoal | null> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const goal = await prisma.userDailyGoal.findUnique({
        where: {
          userId_targetDate: {
            userId,
            targetDate: today
          }
        }
      })

      if (!goal) {
        return null
      }

      const progress = goal.targetValue > 0 
        ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
        : 0

      return {
        ...goal,
        progress
      }
    } catch (error) {
      logger.error('Error getting today goal:', error)
      throw error
    }
  }

  /**
   * Create or update daily goal
   */
  static async setDailyGoal(
    userId: string,
    data: {
      title: string
      description?: string
      targetValue: number
      unit?: string
      xpReward?: number
    }
  ): Promise<DailyGoal> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (data.targetValue <= 0) {
        throw new ValidationError('Target value must be greater than 0')
      }

      const goal = await prisma.userDailyGoal.upsert({
        where: {
          userId_targetDate: {
            userId,
            targetDate: today
          }
        },
        create: {
          userId,
          title: data.title,
          description: data.description,
          targetValue: data.targetValue,
          unit: data.unit || 'minutes',
          xpReward: data.xpReward || 30, // Minimum 30 XP if not provided
          targetDate: today,
          currentValue: 0,
          isCompleted: false
        },
        update: {
          title: data.title,
          description: data.description,
          targetValue: data.targetValue,
          unit: data.unit || 'minutes',
          xpReward: data.xpReward || 30, // Minimum 30 XP if not provided
          currentValue: 0, // Reset progress when goal is updated
          isCompleted: false
        }
      })

      const progress = goal.targetValue > 0 
        ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
        : 0

      logger.info('Daily goal created/updated', { userId, goalId: goal.id })

      return {
        ...goal,
        progress
      }
    } catch (error) {
      logger.error('Error setting daily goal:', error)
      throw error
    }
  }

  /**
   * Update goal progress
   */
  static async updateProgress(
    userId: string,
    progressValue: number
  ): Promise<DailyGoal | null> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const goal = await prisma.userDailyGoal.findUnique({
        where: {
          userId_targetDate: {
            userId,
            targetDate: today
          }
        }
      })

      if (!goal) {
        return null
      }

      const newCurrentValue = Math.max(0, progressValue)
      const isCompleted = newCurrentValue >= goal.targetValue && !goal.isCompleted

      const updatedGoal = await prisma.userDailyGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: newCurrentValue,
          isCompleted: isCompleted || goal.isCompleted,
          completedAt: isCompleted && !goal.completedAt ? new Date() : goal.completedAt
        }
      })

      // Award XP if goal was just completed
      if (isCompleted) {
        await this.awardXP(userId, goal.xpReward, `Completed daily goal: ${goal.title}`)
      }

      const progress = updatedGoal.targetValue > 0 
        ? Math.min(100, Math.round((updatedGoal.currentValue / updatedGoal.targetValue) * 100))
        : 0

      return {
        ...updatedGoal,
        progress
      }
    } catch (error) {
      logger.error('Error updating goal progress:', error)
      throw error
    }
  }

  /**
   * Award XP to user
   */
  private static async awardXP(userId: string, xpAmount: number, reason: string): Promise<void> {
    try {
      // Get user's current XP from preferences or create/update XP tracking
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true }
      })

      const currentXP = (user?.preferences as any)?.totalXP || 0
      const newXP = currentXP + xpAmount

      // Update user preferences with new XP
      await prisma.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...((user?.preferences as any) || {}),
            totalXP: newXP,
            xpHistory: [
              ...(((user?.preferences as any)?.xpHistory || []) as any[]),
              {
                amount: xpAmount,
                reason,
                timestamp: new Date().toISOString()
              }
            ]
          }
        }
      })

      logger.info('XP awarded', { userId, xpAmount, reason, newXP })
    } catch (error) {
      logger.error('Error awarding XP:', error)
      // Don't throw - XP is not critical
    }
  }

  /**
   * Complete daily goal manually
   */
  static async completeGoal(userId: string): Promise<DailyGoal | null> {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const goal = await prisma.userDailyGoal.findUnique({
        where: {
          userId_targetDate: {
            userId,
            targetDate: today
          }
        }
      })

      if (!goal) {
        throw new NotFoundError('No daily goal found for today')
      }

      if (goal.isCompleted) {
        return {
          ...goal,
          progress: 100
        }
      }

      const updatedGoal = await prisma.userDailyGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: goal.targetValue,
          isCompleted: true,
          completedAt: new Date()
        }
      })

      // Award XP
      await this.awardXP(userId, goal.xpReward, `Completed daily goal: ${goal.title}`)

      return {
        ...updatedGoal,
        progress: 100
      }
    } catch (error) {
      logger.error('Error completing goal:', error)
      throw error
    }
  }
}

