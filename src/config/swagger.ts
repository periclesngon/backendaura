import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './environment';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TCF/TEF Learning Platform API',
      version: '1.0.0',
      description: `
        A comprehensive API for the TCF/TEF French language learning platform.
        This platform provides role-based access control with three user types:
        Students, Managers, and Admins. Features include course management,
        test creation and taking, live sessions, AI tutoring, and comprehensive analytics.
      `,
      contact: {
        name: 'API Support',
        email: 'support@tcftef.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: config.nodeEnv === 'production' 
          ? 'https://api.tcftef.com' 
          : `http://localhost:${config.port}`,
        description: config.nodeEnv === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique user identifier' },
            email: { type: 'string', format: 'email', description: 'User email address' },
            firstName: { type: 'string', description: 'User first name' },
            lastName: { type: 'string', description: 'User last name' },
            role: { 
              type: 'string', 
              enum: ['STUDENT', 'JUNIOR_MANAGER', 'SENIOR_MANAGER', 'ADMIN'],
              description: 'User role in the system'
            },
            status: { 
              type: 'string', 
              enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
              description: 'User account status'
            },
            subscriptionTier: { 
              type: 'string', 
              enum: ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
              description: 'User subscription tier'
            },
            createdAt: { type: 'string', format: 'date-time' },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        Course: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            level: { 
              type: 'string', 
              enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] 
            },
            category: { type: 'string' },
            isPublished: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Test: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            level: { 
              type: 'string', 
              enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] 
            },
            category: { type: 'string' },
            timeLimit: { type: 'integer', description: 'Time limit in minutes' },
            isPublished: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            excerpt: { type: 'string', nullable: true },
            status: { 
              type: 'string', 
              enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'SCHEDULED'] 
            },
            visibility: { 
              type: 'string', 
              enum: ['PUBLIC', 'SUBSCRIBERS_ONLY', 'PRIVATE'] 
            },
            viewCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            publishedAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', nullable: true },
            message: { type: 'string', nullable: true },
            error: { 
              type: 'object', 
              nullable: true,
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
                details: { type: 'object' }
              }
            },
            pagination: {
              type: 'object',
              nullable: true,
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
                details: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Authentication required',
                  code: 'UNAUTHORIZED'
                }
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Insufficient permissions',
                  code: 'FORBIDDEN'
                }
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Resource not found',
                  code: 'NOT_FOUND'
                }
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Validation failed',
                  code: 'VALIDATION_ERROR',
                  details: {
                    field: 'email',
                    message: 'Invalid email format'
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints'
      },
      {
        name: 'Users',
        description: 'User management endpoints'
      },
      {
        name: 'Admin',
        description: 'Admin-only endpoints for system management'
      },
      {
        name: 'Manager',
        description: 'Manager endpoints for content and user management'
      },
      {
        name: 'Courses',
        description: 'Course management and enrollment endpoints'
      },
      {
        name: 'Tests',
        description: 'Test creation, management, and attempt endpoints'
      },
      {
        name: 'Posts',
        description: 'Social posts and feed management endpoints'
      },
      {
        name: 'Live Sessions',
        description: 'Live session management and participation endpoints'
      },
      {
        name: 'Subscriptions',
        description: 'Subscription and payment management endpoints'
      },
      {
        name: 'Notifications',
        description: 'Notification management endpoints'
      },
      {
        name: 'Analytics',
        description: 'Analytics and reporting endpoints'
      },
      {
        name: 'AI Tutor',
        description: 'AI-powered tutoring and assistance endpoints'
      },
      {
        name: 'Health',
        description: 'System health and monitoring endpoints'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
