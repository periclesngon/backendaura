import { Request, Response } from 'express';
import { SearchService, SearchFilters, SearchOptions } from '../services/searchService';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class SearchController {
  /**
   * Global search endpoint
   */
  static async globalSearch(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      if (query.length < 2) {
        throw new ValidationError('Search query must be at least 2 characters long');
      }

      // Parse filters from query parameters
      const filters: SearchFilters = {
        contentType: req.query.contentType as any,
        category: req.query.category as string,
        level: req.query.level as string,
        author: req.query.author as string,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined
      };

      // Parse options from query parameters
      const options: SearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as any || 'relevance',
        sortOrder: req.query.sortOrder as any || 'desc'
      };

      // Validate pagination
      if (options.page! < 1) options.page = 1;
      if (options.limit! < 1 || options.limit! > 100) options.limit = 20;

      logger.info('Global search request', { 
        query, 
        filters, 
        options, 
        userId: req.user?.userId 
      });

      const results = await SearchService.globalSearch(query, filters, options);

      res.json({
        success: true,
        data: results,
        message: `Found ${results.results.length} results for "${query}"`
      });
    } catch (error) {
      logger.error('Global search failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'VALIDATION_ERROR'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Search failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            code: 'SEARCH_ERROR'
          }
        });
      }
    }
  }

  /**
   * Search courses
   */
  static async searchCourses(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      const filters: SearchFilters = {
        category: req.query.category as string,
        level: req.query.level as string,
        author: req.query.author as string,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
      };

      const options: SearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as any || 'relevance',
        sortOrder: req.query.sortOrder as any || 'desc'
      };

      const results = await SearchService.searchCourses(query, filters, options);

      res.json({
        success: true,
        data: results,
        message: `Found ${results.results.length} courses for "${query}"`
      });
    } catch (error) {
      logger.error('Course search failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Course search failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'COURSE_SEARCH_ERROR'
        }
      });
    }
  }

  /**
   * Search posts
   */
  static async searchPosts(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      const filters: SearchFilters = {
        author: req.query.author as string,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
      };

      const options: SearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as any || 'relevance',
        sortOrder: req.query.sortOrder as any || 'desc'
      };

      const results = await SearchService.searchPosts(query, filters, options);

      res.json({
        success: true,
        data: results,
        message: `Found ${results.results.length} posts for "${query}"`
      });
    } catch (error) {
      logger.error('Post search failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Post search failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'POST_SEARCH_ERROR'
        }
      });
    }
  }

  /**
   * Search tests
   */
  static async searchTests(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      const filters: SearchFilters = {
        category: req.query.category as string,
        level: req.query.level as string,
        author: req.query.author as string
      };

      const options: SearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy as any || 'relevance',
        sortOrder: req.query.sortOrder as any || 'desc'
      };

      const results = await SearchService.searchTests(query, filters, options);

      res.json({
        success: true,
        data: results,
        message: `Found ${results.results.length} tests for "${query}"`
      });
    } catch (error) {
      logger.error('Test search failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Test search failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'TEST_SEARCH_ERROR'
        }
      });
    }
  }

  /**
   * Search users
   */
  static async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      const filters: SearchFilters = {};

      const options: SearchOptions = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: 'date',
        sortOrder: 'desc'
      };

      const results = await SearchService.searchUsers(query, filters, options);

      res.json({
        success: true,
        data: results,
        message: `Found ${results.results.length} users for "${query}"`
      });
    } catch (error) {
      logger.error('User search failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'User search failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'USER_SEARCH_ERROR'
        }
      });
    }
  }

  /**
   * Get search suggestions
   */
  static async getSearchSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        res.json({
          success: true,
          data: { suggestions: [] },
          message: 'No query provided'
        });
        return;
      }

      if (query.length < 2) {
        res.json({
          success: true,
          data: { suggestions: [] },
          message: 'Query too short'
        });
        return;
      }

      // For now, return simple suggestions based on the search service
      const searchResults = await SearchService.globalSearch(query, {}, { limit: 5 });
      
      const suggestions = searchResults.suggestions || [];

      res.json({
        success: true,
        data: { suggestions },
        message: `Found ${suggestions.length} suggestions for "${query}"`
      });
    } catch (error) {
      logger.error('Search suggestions failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get search suggestions',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'SUGGESTIONS_ERROR'
        }
      });
    }
  }

  /**
   * Get search facets for filtering
   */
  static async getSearchFacets(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required for facets');
      }

      const searchResults = await SearchService.globalSearch(query, {}, { limit: 1 });
      
      res.json({
        success: true,
        data: { facets: searchResults.facets },
        message: 'Search facets retrieved successfully'
      });
    } catch (error) {
      logger.error('Search facets failed', { 
        query: req.query.q, 
        error,
        userId: req.user?.userId 
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get search facets',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: 'FACETS_ERROR'
        }
      });
    }
  }
}
