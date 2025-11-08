import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';

export interface SearchFilters {
  contentType?: 'ALL' | 'COURSES' | 'POSTS' | 'TESTS' | 'USERS';
  category?: string;
  level?: string;
  author?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'date' | 'popularity' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  id: string;
  type: 'course' | 'post' | 'test' | 'user';
  title: string;
  description?: string;
  excerpt?: string;
  author?: {
    firstName: string;
    lastName: string;
    role: string;
  };
  category?: string;
  level?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  relevanceScore?: number;
  metadata?: any;
}

export interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: SearchFilters;
  suggestions?: string[];
  facets?: {
    categories: { name: string; count: number }[];
    levels: { name: string; count: number }[];
    authors: { name: string; count: number }[];
    contentTypes: { name: string; count: number }[];
  };
}

export class SearchService {
  /**
   * Global search across all content types
   */
  static async globalSearch(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      logger.info('Global search initiated', { query, filters, options });

      let results: SearchResult[] = [];
      let total = 0;

      // Search based on content type filter
      switch (filters.contentType) {
        case 'COURSES':
          const courseResults = await this.searchCourses(query, filters, { page, limit, sortBy, sortOrder });
          results = courseResults.results;
          total = courseResults.pagination.total;
          break;
        case 'POSTS':
          const postResults = await this.searchPosts(query, filters, { page, limit, sortBy, sortOrder });
          results = postResults.results;
          total = postResults.pagination.total;
          break;
        case 'TESTS':
          const testResults = await this.searchTests(query, filters, { page, limit, sortBy, sortOrder });
          results = testResults.results;
          total = testResults.pagination.total;
          break;
        case 'USERS':
          const userResults = await this.searchUsers(query, filters, { page, limit, sortBy, sortOrder });
          results = userResults.results;
          total = userResults.pagination.total;
          break;
        default:
          // Search all content types
          const allResults = await this.searchAllContent(query, filters, options);
          results = allResults.results;
          total = allResults.pagination.total;
      }

      // Generate search suggestions
      const suggestions = await this.generateSuggestions(query);

      // Generate facets for filtering
      const facets = await this.generateFacets(query, filters);

      logger.info('Global search completed', { 
        query, 
        resultsCount: results.length, 
        total 
      });

      return {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters,
        suggestions,
        facets
      };
    } catch (error) {
      logger.error('Global search failed', { query, filters, error });
      throw error;
    }
  }

  /**
   * Search courses
   */
  static async searchCourses(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      // Build where clause for full-text search
      const whereClause: any = {
        isPublished: true,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: query.split(' ') } }
        ]
      };

      // Apply filters
      if (filters.category) {
        whereClause.category = filters.category;
      }
      if (filters.level) {
        whereClause.level = filters.level;
      }
      if (filters.author) {
        whereClause.createdBy = filters.author;
      }
      if (filters.dateFrom || filters.dateTo) {
        whereClause.createdAt = {};
        if (filters.dateFrom) whereClause.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) whereClause.createdAt.lte = filters.dateTo;
      }

      // Build order by clause
      let orderBy: any = { createdAt: 'desc' };
      switch (sortBy) {
        case 'title':
          orderBy = { title: sortOrder };
          break;
        case 'date':
          orderBy = { createdAt: sortOrder };
          break;
        case 'popularity':
          orderBy = { enrollments: { _count: sortOrder } };
          break;
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: {
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
                role: true
              }
            },
            _count: {
              select: {
                enrollments: true
              }
            }
          }
        }),
        prisma.course.count({ where: whereClause })
      ]);

      const results: SearchResult[] = courses.map(course => ({
        id: course.id,
        type: 'course' as const,
        title: course.title,
        description: course.description,
        author: (course as any).createdBy ? {
          firstName: (course as any).createdBy.firstName,
          lastName: (course as any).createdBy.lastName,
          role: (course as any).createdBy.role
        } : undefined,
        category: course.category,
        level: course.level,
        tags: course.tags,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        metadata: {
          enrollmentCount: (course as any)._count.enrollments,
          lessonCount: (course as any)._count?.lesson_items || 0,
          duration: (course as any).duration,
          price: (course as any).price
        }
      }));

      return {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters
      };
    } catch (error) {
      logger.error('Course search failed', { query, filters, error });
      throw error;
    }
  }

  /**
   * Search posts
   */
  static async searchPosts(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      const whereClause: any = {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { excerpt: { contains: query, mode: 'insensitive' } }
        ]
      };

      // Apply filters
      if (filters.author) {
        whereClause.authorId = filters.author;
      }
      if (filters.dateFrom || filters.dateTo) {
        whereClause.createdAt = {};
        if (filters.dateFrom) whereClause.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) whereClause.createdAt.lte = filters.dateTo;
      }

      let orderBy: any = { createdAt: 'desc' };
      switch (sortBy) {
        case 'title':
          orderBy = { title: sortOrder };
          break;
        case 'date':
          orderBy = { createdAt: sortOrder };
          break;
        case 'popularity':
          orderBy = { likes: { _count: sortOrder } };
          break;
      }

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: {
            author: {
              select: {
                firstName: true,
                lastName: true,
                role: true
              }
            },
            _count: {
              select: {
                likes: true,
                comments: true,
                shares: true
              }
            }
          }
        }),
        prisma.post.count({ where: whereClause })
      ]);

      const results: SearchResult[] = posts.map(post => ({
        id: post.id,
        type: 'post' as const,
        title: post.title,
        description: post.content,
        excerpt: post.excerpt,
        author: {
          firstName: post.author.firstName,
          lastName: post.author.lastName,
          role: post.author.role
        },
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        metadata: {
          likeCount: post._count.likes,
          commentCount: post._count.comments,
          shareCount: post._count.shares,
          visibility: post.visibility,
          status: post.status
        }
      }));

      return {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters
      };
    } catch (error) {
      logger.error('Post search failed', { query, filters, error });
      throw error;
    }
  }

  /**
   * Search tests
   */
  static async searchTests(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      const whereClause: any = {
        isPublished: true,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      };

      if (filters.category) {
        whereClause.category = filters.category;
      }
      if (filters.level) {
        whereClause.level = filters.level;
      }

      const [tests, total] = await Promise.all([
        prisma.test.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: sortOrder },
          include: {
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
                role: true
              }
            },
            _count: {
              select: {
                attempts: true,
                questions: true
              }
            }
          }
        }),
        prisma.test.count({ where: whereClause })
      ]);

      const results: SearchResult[] = tests.map(test => ({
        id: test.id,
        type: 'test' as const,
        title: test.title,
        description: test.description,
        author: test.createdBy ? {
          firstName: test.createdBy.firstName,
          lastName: test.createdBy.lastName,
          role: test.createdBy.role
        } : undefined,
        category: test.category,
        level: test.level,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
        metadata: {
          attemptCount: test._count.attempts,
          questionCount: test._count.questions,
          duration: test.duration,
          type: test.type
        }
      }));

      return {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters
      };
    } catch (error) {
      logger.error('Test search failed', { query, filters, error });
      throw error;
    }
  }

  /**
   * Search users
   */
  static async searchUsers(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const whereClause: any = {
        status: 'ACTIVE',
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            profileImage: true,
            bio: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        prisma.user.count({ where: whereClause })
      ]);

      const results: SearchResult[] = users.map(user => ({
        id: user.id,
        type: 'user' as const,
        title: `${user.firstName} ${user.lastName}`,
        description: user.bio || '',
        author: {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        metadata: {
          email: user.email,
          profileImage: user.profileImage,
          role: user.role
        }
      }));

      return {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters
      };
    } catch (error) {
      logger.error('User search failed', { query, filters, error });
      throw error;
    }
  }

  /**
   * Search all content types and merge results
   */
  private static async searchAllContent(
    query: string,
    filters: SearchFilters,
    options: SearchOptions
  ): Promise<SearchResponse> {
    const { page = 1, limit = 20 } = options;
    const itemsPerType = Math.ceil(limit / 4); // Distribute across 4 content types

    const [courseResults, postResults, testResults, userResults] = await Promise.all([
      this.searchCourses(query, filters, { ...options, limit: itemsPerType }),
      this.searchPosts(query, filters, { ...options, limit: itemsPerType }),
      this.searchTests(query, filters, { ...options, limit: itemsPerType }),
      this.searchUsers(query, filters, { ...options, limit: itemsPerType })
    ]);

    // Merge and sort results by relevance
    const allResults = [
      ...courseResults.results,
      ...postResults.results,
      ...testResults.results,
      ...userResults.results
    ];

    // Simple relevance scoring based on title match
    allResults.forEach(result => {
      const titleMatch = result.title.toLowerCase().includes(query.toLowerCase());
      const descriptionMatch = result.description?.toLowerCase().includes(query.toLowerCase());
      result.relevanceScore = (titleMatch ? 2 : 0) + (descriptionMatch ? 1 : 0);
    });

    // Sort by relevance score
    allResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Paginate merged results
    const skip = (page - 1) * limit;
    const paginatedResults = allResults.slice(skip, skip + limit);

    const totalResults = courseResults.pagination.total + 
                        postResults.pagination.total + 
                        testResults.pagination.total + 
                        userResults.pagination.total;

    return {
      results: paginatedResults,
      pagination: {
        page,
        limit,
        total: totalResults,
        totalPages: Math.ceil(totalResults / limit)
      },
      filters
    };
  }

  /**
   * Generate search suggestions
   */
  private static async generateSuggestions(query: string): Promise<string[]> {
    try {
      // Simple suggestion generation based on existing content
      const suggestions: string[] = [];

      // Get popular course titles
      const popularCourses = await prisma.course.findMany({
        where: { isPublished: true },
        select: { title: true },
        orderBy: { enrollments: { _count: 'desc' } },
        take: 5
      });

      // Get popular post titles
      const popularPosts = await prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        select: { title: true },
        orderBy: { likes: { _count: 'desc' } },
        take: 5
      });

      // Extract keywords and create suggestions
      const allTitles = [
        ...popularCourses.map(c => c.title),
        ...popularPosts.map(p => p.title)
      ];

      allTitles.forEach(title => {
        const words = title.toLowerCase().split(' ');
        words.forEach(word => {
          if (word.length > 3 && word.includes(query.toLowerCase()) && !suggestions.includes(word)) {
            suggestions.push(word);
          }
        });
      });

      return suggestions.slice(0, 5);
    } catch (error) {
      logger.error('Failed to generate suggestions', { query, error });
      return [];
    }
  }

  /**
   * Generate facets for filtering
   */
  private static async generateFacets(query: string, filters: SearchFilters): Promise<any> {
    try {
      const [categories, levels, authors, contentTypes] = await Promise.all([
        // Categories from courses
        prisma.course.groupBy({
          by: ['category'],
          where: { isPublished: true },
          _count: { category: true }
        }),
        // Levels from courses and tests
        prisma.course.groupBy({
          by: ['level'],
          where: { isPublished: true },
          _count: { level: true }
        }),
        // Authors from posts and courses
        prisma.user.findMany({
          where: {
            OR: [
              { role: { not: 'STUDENT' } }
            ]
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true
          },
          take: 10
        }),
        // Content type counts
        Promise.all([
          prisma.course.count({ where: { isPublished: true } }),
          prisma.post.count({ where: { status: 'PUBLISHED' } }),
          prisma.test.count({ where: { isPublished: true } }),
          prisma.user.count({ where: { status: 'ACTIVE' } })
        ])
      ]);

      return {
        categories: categories.map(c => ({ name: c.category, count: c._count.category })),
        levels: levels.map(l => ({ name: l.level, count: l._count.level })),
        authors: authors.map(a => ({
          name: `${a.firstName} ${a.lastName}`,
          count: 1
        })),
        contentTypes: [
          { name: 'COURSES', count: contentTypes[0] },
          { name: 'POSTS', count: contentTypes[1] },
          { name: 'TESTS', count: contentTypes[2] },
          { name: 'USERS', count: contentTypes[3] }
        ]
      };
    } catch (error) {
      logger.error('Failed to generate facets', { query, filters, error });
      return {
        categories: [],
        levels: [],
        authors: [],
        contentTypes: []
      };
    }
  }
}
