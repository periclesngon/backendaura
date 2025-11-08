import { prisma } from '@/database/connection';
import crypto from 'crypto';

// Global type declaration for temporary token storage
declare global {
  var temporaryTokens: Map<string, any> | undefined;
}

interface TemporaryTokenData {
  userId: string;
  simulationId: string;
  simulationType: 'voice' | 'immigration';
  expiresAt: Date;
}

interface TokenValidationResult {
  isValid: boolean;
  userId?: string;
  simulationId?: string;
  simulationType?: 'voice' | 'immigration';
  error?: string;
}

class TemporaryTokenService {
  /**
   * Generate a temporary access token for email links
   * @param userId - User ID
   * @param simulationId - Simulation ID
   * @param simulationType - Type of simulation (voice or immigration)
   * @param expirationHours - Token expiration in hours (default: 2)
   * @returns Generated token string
   */
  static async generateToken(
    userId: string,
    simulationId: string,
    simulationType: 'voice' | 'immigration',
    expirationHours: number = 2
  ): Promise<string> {
    try {
      // Generate a secure random token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);

      // Store token in database (we'll use a simple table for this)
      // For now, we'll store it in memory or use a simple approach
      // In production, you might want to create a dedicated TemporaryToken model
      
      // Store token data in a way that can be retrieved later
      // Using a simple approach with JSON storage for now
      const tokenData: TemporaryTokenData = {
        userId,
        simulationId,
        simulationType,
        expiresAt
      };

      // Store in database using a simple approach
      // We'll use the user's profile or create a simple storage mechanism
      await this.storeTokenData(token, tokenData);

      return token;
    } catch (error) {
      console.error('Error generating temporary token:', error);
      throw new Error('Failed to generate temporary token');
    }
  }

  /**
   * Validate a temporary token
   * @param token - Token to validate
   * @returns Validation result with user and simulation info
   */
  static async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      if (!token) {
        return { isValid: false, error: 'Token is required' };
      }

      // Retrieve token data
      const tokenData = await this.getTokenData(token);
      
      if (!tokenData) {
        return { isValid: false, error: 'Invalid token' };
      }

      // Check if token has expired
      const now = new Date();
      if (now > tokenData.expiresAt) {
        // Clean up expired token
        await this.deleteToken(token);
        return { isValid: false, error: 'Token has expired' };
      }

      // Verify that the simulation still exists and belongs to the user
      const simulationExists = await this.verifySimulationExists(
        tokenData.userId,
        tokenData.simulationId,
        tokenData.simulationType
      );

      if (!simulationExists) {
        await this.deleteToken(token);
        return { isValid: false, error: 'Simulation not found or access denied' };
      }

      // NOUVELLE LOGIQUE: Vérifier les conditions d'accès basées sur la date de simulation
      if (tokenData.simulationType === 'voice') {
        const { prisma } = await import('@/database/connection');
        const simulation = await prisma.voiceSimulation.findUnique({
          where: { id: tokenData.simulationId }
        });

        if (!simulation) {
          return { isValid: false, error: 'Simulation not found' };
        }

        // Vérifier si la simulation est terminée
        if (simulation.status === 'COMPLETED' || simulation.status === 'CANCELLED') {
          return { isValid: false, error: 'Cette simulation est terminée ou annulée' };
        }

        // Calculer le temps jusqu'au début de la simulation
        const scheduledDate = new Date(simulation.scheduledDate);
        const timeUntilStart = scheduledDate.getTime() - now.getTime();
        const minutesUntilStart = timeUntilStart / (1000 * 60);

        // LOGIQUE D'ACCÈS:
        // - Accessible 5 minutes avant le début (ou moins)
        // - Si simulation à 9:00 et qu'il est 8:58, accessible directement (2 minutes avant = accessible car <= 5 minutes)
        // - Si simulation programmée pour plus de 10 minutes: accessible seulement 5 minutes avant le début
        
        // Calculer la fin de la simulation
        const simulationEnd = new Date(scheduledDate.getTime() + simulation.duration * 1000);
        
        // Vérifier si on est après la fin de la simulation
        if (now > simulationEnd) {
          // Invalider le token après la fin de la simulation
          await this.deleteToken(token);
          return { isValid: false, error: 'Cette simulation est terminée' };
        }

        // Si on est dans la fenêtre de la simulation (pendant ou après le début mais avant la fin)
        if (minutesUntilStart <= 0 && now <= simulationEnd) {
          // Accessible: pendant la simulation
          return {
            isValid: true,
            userId: tokenData.userId,
            simulationId: tokenData.simulationId,
            simulationType: tokenData.simulationType
          };
        }

        // Si 5 minutes ou moins avant le début, accessible
        if (minutesUntilStart > 0 && minutesUntilStart <= 5) {
          // Accessible: 5 minutes ou moins avant le début
          return {
            isValid: true,
            userId: tokenData.userId,
            simulationId: tokenData.simulationId,
            simulationType: tokenData.simulationType
          };
        }

        // Si plus de 5 minutes avant le début, pas encore accessible
        if (minutesUntilStart > 5) {
          return { 
            isValid: false, 
            error: `Cette simulation n'est pas encore accessible. Elle sera accessible 5 minutes avant le début (dans ${Math.ceil(minutesUntilStart - 5)} minute${Math.ceil(minutesUntilStart - 5) > 1 ? 's' : ''}).`
          };
        }
      }

      return {
        isValid: true,
        userId: tokenData.userId,
        simulationId: tokenData.simulationId,
        simulationType: tokenData.simulationType
      };
    } catch (error) {
      console.error('Error validating temporary token:', error);
      return { isValid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Invalidate a token (single use)
   * @param token - Token to invalidate
   */
  static async invalidateToken(token: string): Promise<void> {
    try {
      await this.deleteToken(token);
    } catch (error) {
      console.error('Error invalidating token:', error);
      // Don't throw error for cleanup operations
    }
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      // This would be called periodically to clean up expired tokens
      // Implementation depends on storage mechanism
      console.log('Cleaning up expired tokens...');
      // For now, we'll implement a simple cleanup
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
    }
  }

  /**
   * Store token data (private method)
   */
  private static async storeTokenData(token: string, data: TemporaryTokenData): Promise<void> {
    try {
      // Store token data in a simple way using file system or memory
      // For production, use Redis or a dedicated database table

      // Create a simple storage using the token as key
      const tokenData = {
        ...data,
        createdAt: new Date(),
        token
      };

      // Store in a global map for simplicity (in production, use Redis)
      if (!global.temporaryTokens) {
        global.temporaryTokens = new Map();
      }

      global.temporaryTokens.set(token, tokenData);

      console.log(`✅ Token stored: ${token} for user ${data.userId}`);
    } catch (error) {
      console.error('Error storing token data:', error);
      throw error;
    }
  }

  /**
   * Get token data (private method)
   */
  private static async getTokenData(token: string): Promise<TemporaryTokenData | null> {
    try {
      // Retrieve token data from global storage
      if (!global.temporaryTokens) {
        return null;
      }

      const tokenData = global.temporaryTokens.get(token);
      if (!tokenData) {
        return null;
      }

      // Return the data without the token field
      const { token: _, createdAt, ...data } = tokenData;
      return data;
    } catch (error) {
      console.error('Error getting token data:', error);
      return null;
    }
  }

  /**
   * Delete token (private method)
   */
  private static async deleteToken(token: string): Promise<void> {
    try {
      // Delete token from global storage
      if (global.temporaryTokens) {
        global.temporaryTokens.delete(token);
        console.log(`🗑️ Token deleted: ${token}`);
      }
    } catch (error) {
      console.error('Error deleting token:', error);
    }
  }

  /**
   * Verify simulation exists and belongs to user (private method)
   */
  private static async verifySimulationExists(
    userId: string,
    simulationId: string,
    simulationType: 'voice' | 'immigration'
  ): Promise<boolean> {
    try {
      if (simulationType === 'voice') {
        const simulation = await prisma.voiceSimulation.findFirst({
          where: { id: simulationId, userId }
        });
        return !!simulation;
      } else if (simulationType === 'immigration') {
        const simulation = await prisma.immigrationSimulation.findFirst({
          where: { id: simulationId, userId }
        });
        return !!simulation;
      }
      return false;
    } catch (error) {
      console.error('Error verifying simulation:', error);
      return false;
    }
  }
}

export default TemporaryTokenService;
