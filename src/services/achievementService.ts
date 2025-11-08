import { prisma } from '@/lib/prisma'
import { logger } from '@/utils/logger'

export class AchievementService {
  // Get recent achievements for user
  static async getRecentAchievements(userId: string) {
    try {
      const recentAchievements = await prisma.userAchievement.findMany({
        where: {
          userId: userId,
          isUnlocked: true, // Only get unlocked achievements
          unlockedAt: { not: null } // Ensure unlockedAt is not null for ordering
        },
        include: {
          achievement: true
        },
        orderBy: {
          unlockedAt: 'desc'
        },
        take: 5
      })

      // Return empty array if no achievements found (not an error)
      if (!recentAchievements || recentAchievements.length === 0) {
        return []
      }

      return recentAchievements.map(ua => ({
        id: ua.id,
        title: ua.achievement.name,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        category: ua.achievement.category,
        points: ua.achievement.points,
        earnedAt: ua.unlockedAt,
        progress: ua.progress,
        isCompleted: ua.isUnlocked
      }))
    } catch (error: any) {
      // If database connection error, return empty array instead of throwing
      if (error?.code === 'P1001' || error?.message?.includes('Can\'t reach database')) {
        logger.warn('Database connection error, returning empty achievements array:', error.message)
        return []
      }
      logger.error('Error getting recent achievements:', error)
      // Return empty array on any error to prevent 500 errors
      return []
    }
  }

  // Get all achievements for user
  static async getAllAchievements(userId: string) {
    try {
      const userAchievements = await prisma.userAchievement.findMany({
        where: {
          userId: userId
        },
        include: {
          achievement: true
        },
        orderBy: [
          { isUnlocked: 'desc' }, // Unlocked first
          { unlockedAt: 'desc' } // Then by unlock date
        ]
      })

      return userAchievements.map(ua => ({
        id: ua.id,
        title: ua.achievement.name,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        category: ua.achievement.category,
        points: ua.achievement.points,
        earnedAt: ua.unlockedAt,
        progress: ua.progress,
        isCompleted: ua.isUnlocked
      }))
    } catch (error) {
      logger.error('Error getting all achievements:', error)
      throw error
    }
  }

  // Get achievement progress
  static async getAchievementProgress(userId: string) {
    try {
      const totalAchievements = await prisma.achievement.count()
      const completedAchievements = await prisma.userAchievement.count({
        where: {
          userId: userId,
          isUnlocked: true
        }
      })

      const totalPoints = await prisma.userAchievement.aggregate({
        where: {
          userId: userId,
          isUnlocked: true
        },
        _sum: {
          progress: true
        }
      })

      return {
        totalAchievements,
        completedAchievements,
        totalPoints: totalPoints._sum.progress || 0,
        completionPercentage: totalAchievements > 0 ? (completedAchievements / totalAchievements) * 100 : 0
      }
    } catch (error) {
      logger.error('Error getting achievement progress:', error)
      throw error
    }
  }

  // Get user's achievement summary for dashboard
  static async getAchievementSummary(userId: string) {
    try {
      const recentAchievements = await this.getRecentAchievements(userId)
      const progress = await this.getAchievementProgress(userId)
      
      return {
        recentAchievements,
        progress,
        totalPoints: progress.totalPoints,
        completionRate: progress.completionPercentage
      }
    } catch (error) {
      logger.error('Error getting achievement summary:', error)
      throw error
    }
  }
}