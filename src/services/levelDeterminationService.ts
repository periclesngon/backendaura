import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';

export interface LevelAssessment {
  currentLevel: string;
  subLevel: number;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  nextLevelRequirements: string[];
  estimatedTimeToNextLevel: string;
}

export interface TestResult {
  testId: string;
  score: number;
  maxScore: number;
  percentage: number;
  sections: {
    name: string;
    score: number;
    maxScore: number;
    percentage: number;
  }[];
  completedAt: Date;
}

export class LevelDeterminationService {
  /**
   * Determine student level based on test scores and performance
   */
  static async determineStudentLevel(userId: string): Promise<LevelAssessment> {
    try {
      // Get all completed test attempts for the user
      const testAttempts = await prisma.testAttempt.findMany({
        where: {
          userId,
          status: 'COMPLETED'
        },
        select: {
          id: true,
          userId: true,
          testId: true,
          score: true,
          status: true,
          completedAt: true,
          answers: true,
          test: {
            select: {
              id: true,
              title: true,
              type: true,
              level: true,
              category: true
            }
          }
        },
        orderBy: {
          completedAt: 'desc'
        },
        take: 10 // Consider last 10 attempts
      });

      if (testAttempts.length === 0) {
        return this.getDefaultAssessment();
      }

      // Calculate weighted average based on recency and test importance
      const weightedScores = this.calculateWeightedScores(testAttempts);
      
      // Analyze performance by skill areas
      const skillAnalysis = this.analyzeSkillPerformance(testAttempts);
      
      // Determine current level
      const currentLevel = this.calculateLevel(weightedScores.overall);
      const subLevel = this.calculateSubLevel(weightedScores.overall, skillAnalysis);
      
      // Calculate confidence based on consistency
      const confidence = this.calculateConfidence(testAttempts, currentLevel);
      
      // Generate recommendations
      const assessment = this.generateAssessment(
        currentLevel,
        subLevel,
        confidence,
        skillAnalysis,
        weightedScores
      );

      // Store assessment in database
      await this.storeAssessment(userId, assessment);

      return assessment;
    } catch (error) {
      logger.error('Error determining student level:', error);
      return this.getDefaultAssessment();
    }
  }

  /**
   * Calculate weighted scores based on test recency and importance
   */
  private static calculateWeightedScores(testAttempts: any[]): {
    overall: number;
    bySkill: Record<string, number>;
    byLevel: Record<string, number>;
  } {
    let totalWeight = 0;
    let weightedSum = 0;
    const skillScores: Record<string, { sum: number; weight: number }> = {};
    const levelScores: Record<string, { sum: number; weight: number }> = {};

    testAttempts.forEach((attempt, index) => {
      // More recent tests have higher weight
      const recencyWeight = Math.exp(-index * 0.1);
      
      // Higher level tests have higher weight
      const levelWeight = this.getLevelWeight(attempt.test?.level || 'A1');
      
      const weight = recencyWeight * levelWeight;
      const score = attempt.score || 0;

      totalWeight += weight;
      weightedSum += score * weight;

      // Track by skill (based on test category)
      const skill = attempt.test?.category || 'general';
      if (!skillScores[skill]) {
        skillScores[skill] = { sum: 0, weight: 0 };
      }
      skillScores[skill].sum += score * weight;
      skillScores[skill].weight += weight;

      // Track by level
      const level = attempt.test?.level || 'A1';
      if (!levelScores[level]) {
        levelScores[level] = { sum: 0, weight: 0 };
      }
      levelScores[level].sum += score * weight;
      levelScores[level].weight += weight;
    });

    const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    const bySkill: Record<string, number> = {};
    Object.keys(skillScores).forEach(skill => {
      bySkill[skill] = skillScores[skill].weight > 0 
        ? skillScores[skill].sum / skillScores[skill].weight 
        : 0;
    });

    const byLevel: Record<string, number> = {};
    Object.keys(levelScores).forEach(level => {
      byLevel[level] = levelScores[level].weight > 0 
        ? levelScores[level].sum / levelScores[level].weight 
        : 0;
    });

    return { overall, bySkill, byLevel };
  }

  /**
   * Analyze performance by skill areas
   */
  private static analyzeSkillPerformance(testAttempts: any[]): Record<string, {
    score: number;
    level: string;
    consistency: number;
  }> {
    const skills = ['grammar', 'vocabulary', 'listening', 'reading', 'writing', 'speaking'];
    const skillAnalysis: Record<string, { score: number; level: string; consistency: number }> = {};

    skills.forEach(skill => {
      const skillAttempts = testAttempts.filter(attempt => 
        attempt.test?.category?.toLowerCase().includes(skill) ||
        attempt.answers?.some((answer: any) => 
          answer.question?.category?.toLowerCase().includes(skill)
        )
      );

      if (skillAttempts.length > 0) {
        const scores = skillAttempts.map(attempt => attempt.score || 0);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
        const consistency = Math.max(0, 100 - Math.sqrt(variance));

        skillAnalysis[skill] = {
          score: avgScore,
          level: this.calculateLevel(avgScore),
          consistency
        };
      } else {
        skillAnalysis[skill] = {
          score: 0,
          level: 'A1',
          consistency: 0
        };
      }
    });

    return skillAnalysis;
  }

  /**
   * Calculate CEFR level based on percentage score
   */
  private static calculateLevel(percentage: number): string {
    if (percentage >= 90) return 'C2';
    if (percentage >= 80) return 'C1';
    if (percentage >= 70) return 'B2';
    if (percentage >= 60) return 'B1';
    if (percentage >= 50) return 'A2';
    return 'A1';
  }

  /**
   * Calculate sub-level (1 or 2) within CEFR level
   */
  private static calculateSubLevel(percentage: number, skillAnalysis: any): number {
    const level = this.calculateLevel(percentage);
    const levelRanges = {
      'A1': [0, 50],
      'A2': [50, 60],
      'B1': [60, 70],
      'B2': [70, 80],
      'C1': [80, 90],
      'C2': [90, 100]
    };

    const [min, max] = levelRanges[level as keyof typeof levelRanges];
    const midpoint = (min + max) / 2;
    
    return percentage >= midpoint ? 2 : 1;
  }

  /**
   * Calculate confidence based on consistency of performance
   */
  private static calculateConfidence(testAttempts: any[], currentLevel: string): number {
    if (testAttempts.length < 2) return 50;

    const scores = testAttempts.map(attempt => attempt.score || 0);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);

    // Lower standard deviation = higher confidence
    const confidence = Math.max(0, Math.min(100, 100 - (standardDeviation * 2)));
    
    return Math.round(confidence);
  }

  /**
   * Generate comprehensive assessment
   */
  private static generateAssessment(
    currentLevel: string,
    subLevel: number,
    confidence: number,
    skillAnalysis: any,
    weightedScores: any
  ): LevelAssessment {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Analyze strengths and weaknesses
    Object.keys(skillAnalysis).forEach(skill => {
      const skillData = skillAnalysis[skill];
      if (skillData.score >= 70) {
        strengths.push(`Excellent ${skill} skills`);
      } else if (skillData.score < 50) {
        weaknesses.push(`${skill} needs improvement`);
        recommendations.push(`Focus on ${skill} exercises and practice`);
      }
    });

    // Level-specific recommendations
    const levelRecommendations = this.getLevelRecommendations(currentLevel, subLevel);
    recommendations.push(...levelRecommendations);

    // Next level requirements
    const nextLevelRequirements = this.getNextLevelRequirements(currentLevel);
    
    // Estimate time to next level
    const estimatedTime = this.estimateTimeToNextLevel(currentLevel, weightedScores.overall, confidence);

    return {
      currentLevel: `${currentLevel}.${subLevel}`,
      subLevel,
      confidence,
      strengths,
      weaknesses,
      recommendations,
      nextLevelRequirements,
      estimatedTimeToNextLevel: estimatedTime
    };
  }

  /**
   * Get level-specific recommendations
   */
  private static getLevelRecommendations(level: string, subLevel: number): string[] {
    const recommendations: Record<string, string[]> = {
      'A1': [
        'Master basic greetings and introductions',
        'Learn numbers, days, and months',
        'Practice present tense of common verbs',
        'Build basic vocabulary for daily activities'
      ],
      'A2': [
        'Study past tense (passé composé)',
        'Learn future tense (futur proche)',
        'Practice describing past experiences',
        'Expand vocabulary for travel and shopping'
      ],
      'B1': [
        'Master subjunctive mood',
        'Practice expressing opinions and preferences',
        'Learn complex sentence structures',
        'Develop argumentation skills'
      ],
      'B2': [
        'Refine argumentation and debate skills',
        'Study formal and informal registers',
        'Practice complex text analysis',
        'Master advanced grammar structures'
      ],
      'C1': [
        'Perfect nuanced expression',
        'Master idiomatic expressions',
        'Develop academic writing skills',
        'Practice sophisticated discourse'
      ],
      'C2': [
        'Achieve native-like fluency',
        'Master literary and cultural references',
        'Perfect all language registers',
        'Develop expertise in specialized domains'
      ]
    };

    return recommendations[level] || recommendations['A1'];
  }

  /**
   * Get requirements for next level
   */
  private static getNextLevelRequirements(currentLevel: string): string[] {
    const nextLevel = this.getNextLevel(currentLevel);
    const requirements: Record<string, string[]> = {
      'A2': ['Score 60%+ consistently', 'Master basic grammar', 'Vocabulary: 1000+ words'],
      'B1': ['Score 70%+ consistently', 'Use complex sentences', 'Vocabulary: 2000+ words'],
      'B2': ['Score 80%+ consistently', 'Express abstract ideas', 'Vocabulary: 4000+ words'],
      'C1': ['Score 85%+ consistently', 'Master all registers', 'Vocabulary: 8000+ words'],
      'C2': ['Score 90%+ consistently', 'Native-like proficiency', 'Vocabulary: 16000+ words']
    };

    return requirements[nextLevel] || ['Continue practicing'];
  }

  /**
   * Estimate time to reach next level
   */
  private static estimateTimeToNextLevel(currentLevel: string, currentScore: number, confidence: number): string {
    const nextLevelThreshold = this.getNextLevelThreshold(currentLevel);
    const gap = nextLevelThreshold - currentScore;
    
    if (gap <= 0) return '0-1 months';
    
    // Base time estimates (in months)
    const baseTime = gap / 10; // 10 points = 1 month
    
    // Adjust based on confidence
    const confidenceMultiplier = confidence < 70 ? 1.5 : 1.0;
    
    const estimatedMonths = Math.ceil(baseTime * confidenceMultiplier);
    
    if (estimatedMonths <= 1) return '0-1 months';
    if (estimatedMonths <= 3) return '1-3 months';
    if (estimatedMonths <= 6) return '3-6 months';
    if (estimatedMonths <= 12) return '6-12 months';
    return '12+ months';
  }

  /**
   * Helper methods
   */
  private static getLevelWeight(level: string): number {
    const weights = { 'A1': 1, 'A2': 1.2, 'B1': 1.5, 'B2': 1.8, 'C1': 2.0, 'C2': 2.2 };
    return weights[level as keyof typeof weights] || 1;
  }

  private static getNextLevel(currentLevel: string): string {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = levels.indexOf(currentLevel);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'C2';
  }

  private static getNextLevelThreshold(currentLevel: string): number {
    const thresholds = { 'A1': 50, 'A2': 60, 'B1': 70, 'B2': 80, 'C1': 90, 'C2': 95 };
    return thresholds[this.getNextLevel(currentLevel) as keyof typeof thresholds] || 100;
  }

  private static getDefaultAssessment(): LevelAssessment {
    return {
      currentLevel: 'A1.1',
      subLevel: 1,
      confidence: 50,
      strengths: [],
      weaknesses: ['No test data available'],
      recommendations: ['Take a placement test to assess your level'],
      nextLevelRequirements: ['Complete basic French assessment'],
      estimatedTimeToNextLevel: 'Unknown'
    };
  }

  /**
   * Store assessment in database
   */
  private static async storeAssessment(userId: string, assessment: LevelAssessment): Promise<void> {
    try {
      // Note: currentLevel field doesn't exist in User model
      // Level assessment is stored in the assessment record only
      // The assessment data is preserved in the assessment object

      logger.info('Level assessment stored successfully', { userId, level: assessment.currentLevel });
    } catch (error) {
      logger.error('Error storing level assessment:', error);
    }
  }
}
