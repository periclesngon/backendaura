import { prisma } from '@/database/connection'
import { logger } from '@/utils/logger'

export interface DailyChallenge {
  id: string
  title: {
    fr: string
    en: string
  }
  description: {
    fr: string
    en: string
  }
  reward: {
    fr: string
    en: string
  }
  difficulty: string
  duration: string
  xpReward: number
  badgeReward?: string
  isActive: boolean
  category: string
}

export interface UserProgress {
  completedChallenges: number
  totalXp: number
  badges: string[]
  streak: number
  lastCompleted?: string
}

export class ChallengeService {
  // Get daily challenges - REAL IMPLEMENTATION - query from database
  static async getDailyChallenges(): Promise<DailyChallenge[]> {
    try {
      // Query active daily challenges from database
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Start of today
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1) // Start of tomorrow

      const challenges = await prisma.challenge.findMany({
        where: {
          isActive: true,
          isDaily: true,
          OR: [
            { availableDate: null }, // No specific date - always available
            {
              availableDate: {
                gte: today,
                lt: tomorrow
              }
            }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 10 // Limit to 10 daily challenges
      })

      // Transform database records to DailyChallenge format
      const dailyChallenges: DailyChallenge[] = challenges.map(challenge => ({
        id: challenge.id,
        title: {
          fr: challenge.titleFr,
          en: challenge.titleEn
        },
        description: {
          fr: challenge.descriptionFr,
          en: challenge.descriptionEn
        },
        reward: {
          fr: challenge.rewardFr,
          en: challenge.rewardEn
        },
        difficulty: challenge.difficulty,
        duration: challenge.duration,
        xpReward: challenge.xpReward,
        badgeReward: challenge.badgeReward || undefined,
        isActive: challenge.isActive,
        category: challenge.category
      }))

      logger.info(`Retrieved ${dailyChallenges.length} daily challenges from database`)
      
      return dailyChallenges
    } catch (error) {
      logger.error('Error getting daily challenges from database:', error)
      // Return empty array on error to prevent crashes
      return []
    }
  }

  // Get user's challenge progress
  static async getUserProgress(userId: string): Promise<UserProgress> {
    try {
      // For now, return mock progress data
      // In the future, this would query the database for actual user progress
      const progress: UserProgress = {
        completedChallenges: 0,
        totalXp: 0,
        badges: [],
        streak: 0
      }

      return progress
    } catch (error) {
      logger.error('Error getting user progress:', error)
      throw error
    }
  }

  // Start a challenge
  static async startChallenge(userId: string, challengeId: string) {
    try {
      // For now, return success
      // In the future, this would create a challenge session in the database
      return {
        challengeId,
        startedAt: new Date().toISOString(),
        message: 'Challenge started successfully'
      }
    } catch (error) {
      logger.error('Error starting challenge:', error)
      throw error
    }
  }

  // Complete a challenge
  static async completeChallenge(userId: string, challengeId: string) {
    try {
      // For now, return success with mock rewards
      // In the future, this would update user progress, award XP, etc.
      return {
        challengeId,
        completedAt: new Date().toISOString(),
        xpEarned: 50,
        badgeEarned: 'vocabulary',
        message: 'Challenge completed successfully'
      }
    } catch (error) {
      logger.error('Error completing challenge:', error)
      throw error
    }
  }
}
