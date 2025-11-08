import { Request, Response } from 'express';
import { AdminService } from '@/services/adminService';
import { UserService } from '@/services/userService';
import { AnalyticsService } from '@/services/analyticsService';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse } from '@/types';
import { logger } from '@/utils/logger';
import { UserRole } from '@prisma/client';

export class AdminController {
  /**
   * Get admin dashboard data
   */
  static getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const timeframe = req.query.timeframe as string || '30d';
    const metrics = req.query.metrics as string;

    const dashboardData = await AdminService.getDashboardData(timeframe, metrics);

    const response: ApiResponse = {
      success: true,
      data: dashboardData,
      message: 'Admin dashboard data retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get system health metrics
   */
  static getSystemHealth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const healthData = await AdminService.getSystemHealth();

    const response: ApiResponse = {
      success: true,
      data: healthData,
      message: 'System health data retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get business metrics
   */
  static getBusinessMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const period = req.query.period as string || '30d';
    const category = req.query.category as string;

    const metrics = await AdminService.getBusinessMetrics(period, category);

    const response: ApiResponse = {
      success: true,
      data: metrics,
      message: 'Business metrics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get technical metrics
   */
  static getTechnicalMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const metrics = await AdminService.getTechnicalMetrics();

    const response: ApiResponse = {
      success: true,
      data: metrics,
      message: 'Technical metrics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get all users with advanced filtering (Admin only)
   */
  static getAllUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const role = req.query.role as UserRole;
    const status = req.query.status as string;
    const subscription = req.query.subscription as string;

    const filters = {
      search,
      role,
      status,
      subscription
    };

    const result = await AdminService.getAllUsers({ page, limit }, filters);

    const response: ApiResponse = {
      success: true,
      data: result.users,
      pagination: result.pagination,
      message: 'Users retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get user analytics
   */
  static getUserAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const period = req.query.period as string || '30d';

    const analytics = await AdminService.getUserAnalytics(userId, period);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'User analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get managers list
   */
  static getManagers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const role = req.query.role as UserRole;
    const team = req.query.team as string;
    const performance = req.query.performance as string;

    const filters = { role, team, performance };
    const managers = await AdminService.getManagers(filters);

    const response: ApiResponse = {
      success: true,
      data: managers,
      message: 'Managers retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create new manager
   */
  static createManager = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerData = req.body;
    const createdById = req.user?.userId;

    if (!createdById) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const manager = await AdminService.createManager(managerData, createdById);

    const response: ApiResponse = {
      success: true,
      data: { manager },
      message: 'Manager created successfully'
    };

    logger.info('Manager created', { managerId: manager.id, createdById });

    res.status(201).json(response);
  });

  /**
   * Update manager
   */
  static updateManager = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { managerId } = req.params;
    const updateData = req.body;
    const updatedById = req.user?.userId;

    if (!updatedById) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const manager = await AdminService.updateManager(managerId, updateData, updatedById);

    const response: ApiResponse = {
      success: true,
      data: { manager },
      message: 'Manager updated successfully'
    };

    logger.info('Manager updated', { managerId, updatedById });

    res.status(200).json(response);
  });

  /**
   * Delete manager
   */
  static deleteManager = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { managerId } = req.params;
    const deletedById = req.user?.userId;

    logger.info('Delete manager request', { managerId, deletedById });

    if (!deletedById) {
      logger.warn('Delete manager: Authentication required', { managerId });
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    if (!managerId) {
      logger.warn('Delete manager: Manager ID missing', { deletedById });
      res.status(400).json({
        success: false,
        error: { message: 'Manager ID is required' }
      });
      return;
    }

    try {
      await AdminService.deleteManager(managerId, deletedById);

      const response: ApiResponse = {
        success: true,
        message: 'Manager deleted successfully'
      };

      logger.info('Manager deleted successfully via controller', { managerId, deletedById });

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Delete manager failed in controller', { managerId, deletedById, error: error.message });
      
      if (error.message === 'Manager not found') {
        res.status(404).json({
          success: false,
          error: { message: 'Manager not found' }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to delete manager' }
      });
    }
  });

  /**
   * Get manager performance analytics
   */
  static getManagerPerformance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { managerId } = req.params;
    const period = req.query.period as string || '30d';

    const performance = await AdminService.getManagerPerformance(managerId, period);

    const response: ApiResponse = {
      success: true,
      data: performance,
      message: 'Manager performance retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get admin profile statistics
   */
  static getStatistics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await AdminService.getStatistics();

    const response: ApiResponse = {
      success: true,
      data: stats,
      message: 'Admin statistics retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get analytics data
   */
  static getAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const category = req.query.category as string;
    const timeframe = req.query.timeframe as string || '30d';
    const filters = req.query.filters as string;

    const analytics = await AdminService.getAnalytics(category, timeframe, filters);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'Analytics data retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Generate custom report
   */
  static generateReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reportConfig = req.body;
    const generatedById = req.user?.userId;

    if (!generatedById) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const report = await AdminService.generateReport(reportConfig, generatedById);

    const response: ApiResponse = {
      success: true,
      data: { report },
      message: 'Report generated successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Export analytics data
   */
  static exportData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const format = req.query.format as string || 'csv';
    const filters = req.query.filters as string;
    const exportedById = req.user?.userId;

    if (!exportedById) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const exportData = await AdminService.exportData(format, filters, exportedById);

    const response: ApiResponse = {
      success: true,
      data: exportData,
      message: 'Data exported successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Health check for admin service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse = {
      success: true,
      data: {
        service: 'admin',
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      message: 'Admin service is healthy'
    };

    res.status(200).json(response);
  });

  /**
   * Get review requests for admin/senior managers
   */
  static getReviewRequests = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const reviewRequests = await AdminService.getReviewRequests(userId, userRole);

    const response: ApiResponse = {
      success: true,
      data: reviewRequests,
      message: 'Review requests retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Handle review request action (accept/reject/complete)
   */
  static handleReviewRequest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { action, response: responseMessage, humanFeedback, humanScore } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required' }
      });
      return;
    }

    const result = await AdminService.handleReviewRequest(id, action, {
      tutorId: userId,
      response: responseMessage,
      humanFeedback,
      humanScore
    });

    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Review request ${action}ed successfully`
    };

    res.status(200).json(response);
  });

  /**
   * Create subscription plan
   */
  static createSubscriptionPlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const planData = req.body;
    const plan = await AdminService.createSubscriptionPlan(planData);

    const response: ApiResponse = {
      success: true,
      data: plan,
      message: 'Subscription plan created successfully'
    };

    res.status(201).json(response);
  });

  /**
   * Get all subscription plans
   */
  static getSubscriptionPlans = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const plans = await AdminService.getSubscriptionPlans();

    const response: ApiResponse = {
      success: true,
      data: plans,
      message: 'Subscription plans retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get subscription plan by ID
   */
  static getSubscriptionPlanById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const plan = await AdminService.getSubscriptionPlanById(id);

    const response: ApiResponse = {
      success: true,
      data: plan,
      message: 'Subscription plan retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Update subscription plan
   */
  static updateSubscriptionPlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      logger.info('📥 Controller received update request', { id, updateData });
      
      const plan = await AdminService.updateSubscriptionPlan(id, updateData);

      const response: ApiResponse = {
        success: true,
        data: plan,
        message: 'Subscription plan updated successfully'
      };

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('❌ Controller error updating subscription plan', { 
        errorMessage: error?.message, 
        errorStack: error?.stack,
        errorCode: error?.code,
        errorName: error?.name
      });
      throw error; // Let asyncHandler handle it
    }
  });

  /**
   * Delete subscription plan
   */
  static deleteSubscriptionPlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await AdminService.deleteSubscriptionPlan(id);

    const response: ApiResponse = {
      success: true,
      data: null,
      message: 'Subscription plan deleted successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get subscription analytics
   */
  static getSubscriptionAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const analytics = await AdminService.getSubscriptionAnalytics();

    const response: ApiResponse = {
      success: true,
      data: analytics,
      message: 'Subscription analytics retrieved successfully'
    };

    res.status(200).json(response);
  });

  // ===== AUDIO SIMULATION MANAGEMENT =====

  /**
   * Get all audio simulations with filtering
   */
  static getAudioSimulations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page = 1, limit = 20, status, level, search } = req.query;
    
    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      level: level as string,
      search: search as string
    };

    const result = await AdminService.getAudioSimulations(filters);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Audio simulations retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get specific audio simulation details
   */
  static getAudioSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    const simulation = await AdminService.getAudioSimulation(id);

    const response: ApiResponse = {
      success: true,
      data: simulation,
      message: 'Audio simulation retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create new audio simulation template
   */
  static createAudioSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Log incoming data for debugging
      console.log('📝 Creating audio simulation with data:', {
        title: req.body.title,
        description: req.body.description?.substring(0, 50),
        descriptionLength: req.body.description?.length,
        hasSubscription: Array.isArray(req.body.subscription),
        subscriptionCount: req.body.subscription?.length,
        hasExtractedQuestions: Array.isArray(req.body.extractedQuestions),
        extractedQuestionsCount: req.body.extractedQuestions?.length
      });

      const simulationData = {
        ...req.body,
        userId: req.user?.id || req.user?.userId || 'system' // Add userId from authenticated user
      };
      
      const simulation = await AdminService.createAudioSimulation(simulationData);

      const response: ApiResponse = {
        success: true,
        data: simulation,
        message: 'Audio simulation created successfully'
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('❌ Error creating audio simulation:', error);
      throw error; // Let asyncHandler handle it
    }
  });

  /**
   * Update audio simulation template
   */
  static updateAudioSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const updateData = req.body;
    
    const simulation = await AdminService.updateAudioSimulation(id, updateData);

    const response: ApiResponse = {
      success: true,
      data: simulation,
      message: 'Audio simulation updated successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Delete audio simulation template
   */
  static deleteAudioSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    await AdminService.deleteAudioSimulation(id);

    const response: ApiResponse = {
      success: true,
      data: null,
      message: 'Audio simulation deleted successfully'
    };

    res.status(200).json(response);
  });

  // ===== IMMIGRATION SIMULATION MANAGEMENT =====

  /**
   * Get all immigration simulations with filtering
   */
  static getImmigrationSimulations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page = 1, limit = 20, status, country, immigrationType, level, search } = req.query;
    
    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      country: country as string,
      immigrationType: immigrationType as string,
      level: level as string,
      search: search as string
    };

    const result = await AdminService.getImmigrationSimulations(filters);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Immigration simulations retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Get specific immigration simulation details
   */
  static getImmigrationSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    const simulation = await AdminService.getImmigrationSimulation(id);

    const response: ApiResponse = {
      success: true,
      data: simulation,
      message: 'Immigration simulation retrieved successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Create new immigration simulation template
   */
  static createImmigrationSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const simulationData = req.body;
    
    const simulation = await AdminService.createImmigrationSimulation(simulationData);

    const response: ApiResponse = {
      success: true,
      data: simulation,
      message: 'Immigration simulation created successfully'
    };

    res.status(201).json(response);
  });

  /**
   * Update immigration simulation template
   */
  static updateImmigrationSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const updateData = req.body;
    
    const simulation = await AdminService.updateImmigrationSimulation(id, updateData);

    const response: ApiResponse = {
      success: true,
      data: simulation,
      message: 'Immigration simulation updated successfully'
    };

    res.status(200).json(response);
  });

  /**
   * Delete immigration simulation template
   */
  static deleteImmigrationSimulation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    
    await AdminService.deleteImmigrationSimulation(id);

    const response: ApiResponse = {
      success: true,
      data: null,
      message: 'Immigration simulation deleted successfully'
    };

    res.status(200).json(response);
  });
}
