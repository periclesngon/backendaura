import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../utils/errors';

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema | { body?: Joi.ObjectSchema; query?: Joi.ObjectSchema; params?: Joi.ObjectSchema }) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Handle object schema with body/query/params properties
      if (schema && typeof schema === 'object' && !(schema as any).validate) {
        const schemaObj = schema as { body?: Joi.ObjectSchema; query?: Joi.ObjectSchema; params?: Joi.ObjectSchema };

        // Validate body if schema provided
        if (schemaObj.body) {
          // Log incoming request for debugging
          console.log('🔍 Validation - Request body:', JSON.stringify(req.body, null, 2));
          
          const { error, value } = schemaObj.body.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
          });

          if (error) {
          // Log detailed validation errors
          console.error('❌ Validation errors:', {
            url: req.url,
            method: req.method,
            errors: error.details.map(d => ({
              path: d.path.join('.'),
              message: d.message,
              type: d.type,
              context: d.context
            })),
            receivedBody: JSON.stringify(req.body, null, 2)
          });
            
            const errorMessage = error.details
              .map(detail => `${detail.path.join('.')}: ${detail.message}`)
              .join(', ');
            throw new ValidationError(errorMessage);
          }

          req.body = value;
        }

        // Validate query if schema provided
        if (schemaObj.query) {
          const { error, value } = schemaObj.query.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
          });

          if (error) {
            const errorMessage = error.details
              .map(detail => detail.message)
              .join(', ');
            throw new ValidationError(errorMessage);
          }

          req.query = value;
        }

        // Validate params if schema provided
        if (schemaObj.params) {
          const { error, value } = schemaObj.params.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
          });

          if (error) {
            const errorMessage = error.details
              .map(detail => detail.message)
              .join(', ');
            throw new ValidationError(errorMessage);
          }

          req.params = value;
        }
      } else {
        // Handle simple Joi schema (validate body)
        const joiSchema = schema as Joi.ObjectSchema;
        const { error, value } = joiSchema.validate(req.body, {
          abortEarly: false,
          stripUnknown: true
        });

        if (error) {
          const errorMessage = error.details
            .map(detail => detail.message)
            .join(', ');

          throw new ValidationError(errorMessage);
        }

        // Replace req.body with validated and sanitized data
        req.body = value;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Query validation middleware factory
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new ValidationError(errorMessage);
    }

    req.query = value;
    next();
  };
};

// Params validation middleware factory
export const validateParams = (schemaObject: Record<string, Joi.Schema>) => {
  const schema = Joi.object(schemaObject);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');

      throw new ValidationError(errorMessage);
    }

    req.params = value;
    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  // ID validation
  id: Joi.string().required().messages({
    'string.empty': 'ID is required',
    'any.required': 'ID is required'
  }),

  // Email validation
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required'
  }),

  // Password validation
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.empty': 'Password is required',
    'any.required': 'Password is required'
  }),

  // Name validation
  name: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name must not exceed 50 characters',
    'string.empty': 'Name is required',
    'any.required': 'Name is required'
  }),

  // Phone validation
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).messages({
    'string.pattern.base': 'Please provide a valid phone number'
  }),

  // Role validation
  role: Joi.string().valid('STUDENT', 'JUNIOR_MANAGER', 'SENIOR_MANAGER', 'ADMIN').messages({
    'any.only': 'Role must be one of: STUDENT, JUNIOR_MANAGER, SENIOR_MANAGER, ADMIN'
  }),

  // Subscription tier validation
  subscriptionTier: Joi.string().valid('FREE', 'ESSENTIAL', 'PREMIUM', 'PRO').messages({
    'any.only': 'Subscription tier must be one of: FREE, ESSENTIAL, PREMIUM, PRO'
  }),

  // Course level validation
  courseLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').messages({
    'any.only': 'Course level must be one of: A1, A2, B1, B2, C1, C2'
  }),

  // Course category validation
  courseCategory: Joi.string().valid('GRAMMAR', 'LISTENING', 'READING', 'VOCABULARY', 'WRITING', 'ORAL', 'TCF_TEF').messages({
    'any.only': 'Course category must be one of: GRAMMAR, LISTENING, READING, VOCABULARY, WRITING, ORAL, TCF_TEF'
  }),

  // Test type validation
  testType: Joi.string().valid('TCF', 'TEF', 'PRACTICE', 'MOCK', 'DIAGNOSTIC').messages({
    'any.only': 'Test type must be one of: TCF, TEF, PRACTICE, MOCK, DIAGNOSTIC'
  }),

  // Pagination validation
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }
};

// Authentication schemas
export const authSchemas = {
  register: Joi.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    phone: commonSchemas.phone.optional().allow(''),
    country: Joi.string().max(100).optional().allow('')
  }),

  login: Joi.object({
    email: commonSchemas.email,
    password: Joi.string().required().messages({
      'string.empty': 'Password is required',
      'any.required': 'Password is required'
    })
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      'string.empty': 'Refresh token is required',
      'any.required': 'Refresh token is required'
    })
  }),

  forgotPassword: Joi.object({
    method: Joi.string().valid('email', 'phone').required().messages({
      'any.only': 'Method must be either email or phone',
      'any.required': 'Recovery method is required'
    }),
    email: Joi.string().email().when('method', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    }),
    phone: Joi.string().when('method', {
      is: 'phone',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    }),
    lang: Joi.string().valid('fr', 'en').optional()
  }),

  verifyResetCode: Joi.object({
    code: Joi.string().length(6).pattern(/^[0-9]+$/).required().messages({
      'string.length': 'Code must be exactly 6 digits',
      'string.pattern.base': 'Code must contain only numbers'
    }),
    method: Joi.string().valid('email', 'phone').required(),
    email: Joi.string().email().when('method', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    }),
    phone: Joi.string().when('method', {
      is: 'phone',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    })
  }),

  resetPassword: Joi.object({
    tokenId: Joi.string().required().messages({
      'string.empty': 'Token ID is required',
      'any.required': 'Token ID is required'
    }),
    newPassword: commonSchemas.password
  }),

  resendResetCode: Joi.object({
    method: Joi.string().valid('email', 'phone').required(),
    email: Joi.string().email().when('method', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    }),
    phone: Joi.string().when('method', {
      is: 'phone',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null)
    }),
    lang: Joi.string().valid('fr', 'en').optional()
  }),

  socialAuth: Joi.object({
    idToken: Joi.string().required().messages({
      'string.empty': 'ID token is required',
      'any.required': 'ID token is required'
    }),
    provider: Joi.string().valid('google', 'apple', 'facebook').optional()
  }),

  googleAuth: Joi.object({
    idToken: Joi.string().required().messages({
      'string.empty': 'Google ID token is required',
      'any.required': 'Google ID token is required'
    }),
    email: commonSchemas.email,
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    profileImage: Joi.string().uri().optional()
  })
};

// User schemas
export const userSchemas = {
  updateProfile: Joi.object({
    firstName: commonSchemas.name.optional(),
    lastName: commonSchemas.name.optional(),
    phone: commonSchemas.phone.optional(),
    country: Joi.string().max(100).optional(),
    city: Joi.string().max(100).optional(),
    bio: Joi.string().max(500).optional(),
    profileImage: Joi.string().uri().optional(),
    preferences: Joi.object().optional()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password
  })
};

// Course schemas
export const courseSchemas = {
  create: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    titleEn: Joi.string().min(3).max(200).optional(),
    description: Joi.string().min(10).max(1000).required(),
    descriptionEn: Joi.string().min(10).max(1000).optional(),
    level: commonSchemas.courseLevel.required(),
    category: commonSchemas.courseCategory.required(),
    requiredTier: commonSchemas.subscriptionTier.required(),
    duration: Joi.number().integer().min(1).required(),
    lessons: Joi.number().integer().min(1).required(),
    difficulty: Joi.number().integer().min(1).max(5).required(),
    image: Joi.string().uri().optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).required()
  }),

  update: Joi.object({
    title: Joi.string().min(3).max(200).optional(),
    titleEn: Joi.string().min(3).max(200).optional(),
    description: Joi.string().min(10).max(1000).optional(),
    descriptionEn: Joi.string().min(10).max(1000).optional(),
    level: commonSchemas.courseLevel.optional(),
    category: commonSchemas.courseCategory.optional(),
    requiredTier: commonSchemas.subscriptionTier.optional(),
    duration: Joi.number().integer().min(1).optional(),
    lessons: Joi.number().integer().min(1).optional(),
    difficulty: Joi.number().integer().min(1).max(5).optional(),
    image: Joi.string().uri().optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    isPublished: Joi.boolean().optional()
  }),

  query: Joi.object({
    page: commonSchemas.pagination.page,
    limit: commonSchemas.pagination.limit,
    sortBy: commonSchemas.pagination.sortBy,
    sortOrder: commonSchemas.pagination.sortOrder,
    search: Joi.string().max(100).optional(),
    level: commonSchemas.courseLevel.optional(),
    category: commonSchemas.courseCategory.optional(),
    tier: commonSchemas.subscriptionTier.optional(),
    isPublished: Joi.boolean().optional()
  })
};

// Test schemas
export const testSchemas = {
  create: Joi.object({
    test: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      titleEn: Joi.string().min(3).max(200).optional(),
      description: Joi.string().min(10).max(1000).required(),
      descriptionEn: Joi.string().min(10).max(1000).optional(),
      type: commonSchemas.testType.required(),
      level: commonSchemas.courseLevel.required(),
      category: commonSchemas.courseCategory.required(),
      requiredTier: commonSchemas.subscriptionTier.required(),
      duration: Joi.number().integer().min(1).required(),
      questionCount: Joi.number().integer().min(1).required(),
      difficulty: Joi.number().integer().min(1).max(5).required(),
      passingScore: Joi.number().integer().min(0).max(100).required(),
      maxAttempts: Joi.number().integer().min(1).optional(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).required(),
      aiPowered: Joi.boolean().optional(),
      hasAIFeedback: Joi.boolean().optional(),
      isOfficial: Joi.boolean().optional(),
      image: Joi.string().uri().optional(),
            // instructions: Joi.string().max(2000).optional(),
      levels: Joi.array().items(commonSchemas.courseLevel).optional(),
      subscriptions: Joi.array().items(commonSchemas.subscriptionTier).optional()
    }).required(),
    questions: Joi.array().items(
      Joi.object({
        questionText: Joi.string().min(5).max(1000).required(),
        type: Joi.string().valid('multiple-choice', 'true-false', 'short-answer', 'essay').required(),
        options: Joi.array().items(Joi.string().max(500)).max(10).optional(),
        correctAnswer: Joi.alternatives().try(
          Joi.number().integer().min(0),
          Joi.string().max(1000),
          Joi.boolean()
        ).required(),
        points: Joi.number().integer().min(1).max(10).required(),
        explanation: Joi.string().max(1000).optional(),
        order: Joi.number().integer().min(1).required(),
        level: commonSchemas.courseLevel.required(),
        category: commonSchemas.courseCategory.required()
      })
    ).min(1).required()
  }),

  submitAnswers: Joi.object({
    attemptId: commonSchemas.id,
    answers: Joi.array().items(
      Joi.object({
        questionId: commonSchemas.id,
        answer: Joi.any().required(),
        timeSpent: Joi.number().integer().min(0).optional()
      })
    ).required()
  })
};

// Immigration simulation validation schemas
export const immigrationSimulationSchemas = {
  create: Joi.object({
    country: Joi.string().valid('canada', 'france', 'belgium', 'CANADA', 'FRANCE', 'BELGIUM').required(),
    immigrationType: Joi.string().valid('skilled_worker', 'student', 'family_reunification', 'work_permit', 'family', 'work', 'immigration', 'school', 'relocation').required(),
    level: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional().default('B1'),
    voicePreference: Joi.string().optional(),
    personalInfo: Joi.object().optional(),
    bookingType: Joi.string().valid('AUTO', 'MANUAL').optional().default('AUTO'),
    scheduledDate: Joi.date().iso().optional(),
    questionsData: Joi.object().optional()
  }),

  params: Joi.object({
    id: Joi.string().pattern(/^[a-z0-9]{25}$/).required().messages({
      'string.pattern.base': '"id" must be a valid CUID'
    })
  })
};

// Voice simulation validation schemas
export const voiceSimulationSchemas = {
  booking: Joi.object({
    scheduledDate: Joi.date().iso().required(),
    voicePreference: Joi.string().valid('france_female_1', 'france_male_1', 'quebec_female_1', 'quebec_male_1').required(),
    language: Joi.string().valid('fr', 'en').optional().default('fr')
  }),

  reschedule: Joi.object({
    newDate: Joi.date().iso().required(),
    voicePreference: Joi.string().valid('france_female_1', 'france_male_1', 'quebec_female_1', 'quebec_male_1').optional()
  }),

  params: Joi.object({
    id: Joi.string().pattern(/^[a-z0-9]{25}$/).required().messages({
      'string.pattern.base': '"id" must be a valid CUID'
    })
  })
};

// AI Assistant validation schemas
export const aiAssistantSchemas = {
  chat: Joi.object({
    message: Joi.string().min(1).max(1000).required(),
    context: Joi.object({
      page: Joi.string().valid('voice-simulation', 'immigration-simulation', 'tcf-tef-simulation', 'general').required(),
      language: Joi.string().valid('fr', 'en').optional().default('fr'),
      simulationType: Joi.string().valid('voice', 'immigration').optional(),
      country: Joi.string().valid('canada', 'france', 'belgium').optional(),
      immigrationType: Joi.string().valid('skilled_worker', 'student', 'family_reunification', 'work_permit', 'family', 'work').optional(),
      userLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').optional()
    }).required()
  }),

  suggestions: Joi.object({
    page: Joi.string().valid('voice-simulation', 'immigration-simulation', 'tcf-tef-simulation', 'general').optional(),
    language: Joi.string().valid('fr', 'en').optional().default('fr')
  })
};

// VAPI assistant validation schema
export const vapiAssistantSchemas = {
  create: Joi.object({
    voiceId: Joi.string().valid('france_female_1', 'france_male_1', 'quebec_female_1', 'quebec_male_1').required(),
    country: Joi.string().valid('canada', 'france', 'belgium').optional(),
    immigrationType: Joi.string().valid('skilled_worker', 'student', 'family_reunification', 'work_permit', 'family', 'work').optional(),
    questions: Joi.array().items(Joi.object()).min(1).required(),
    language: Joi.string().valid('fr', 'en').optional().default('fr')
  })
};
