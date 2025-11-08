import { Router } from 'express';
import { TestController } from '@/controllers/testController';
import { validate, validateParams, testSchemas, commonSchemas } from '@/middleware/validation';
import { authenticate, requireManager, optionalAuthenticate } from '@/middleware/auth';

const router = Router();

/**
 * @route   GET /api/tests/health
 * @desc    Test service health check
 * @access  Public
 */
router.get('/health', TestController.healthCheck);

/**
 * @route   GET /api/tests
 * @desc    Get all tests with pagination and filtering
 * @access  Public (with optional authentication for personalized data)
 */
router.get('/', optionalAuthenticate, TestController.getAllTests);

/**
 * @route   POST /api/tests
 * @desc    Create a new test (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.post('/', authenticate, requireManager, validate(testSchemas.create), TestController.createTest);

/**
 * @route   GET /api/tests/attempts
 * @desc    Get user's test attempts
 * @access  Private
 */
router.get('/attempts', authenticate, TestController.getUserTestAttempts);

/**
 * @route   GET /api/tests/created
 * @desc    Get tests created by user (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.get('/created', authenticate, requireManager, TestController.getUserCreatedTests);

/**
 * @route   GET /api/tests/:testId
 * @desc    Get test by ID
 * @access  Public (with optional authentication for personalized data)
 */
router.get('/:testId',
  optionalAuthenticate,
  validateParams({ testId: commonSchemas.id }),
  TestController.getTestById
);

/**
 * @route   POST /api/tests/:testId/start
 * @desc    Start a test attempt
 * @access  Private
 */
router.post('/:testId/start',
  authenticate,
  validateParams({ testId: commonSchemas.id }),
  TestController.startTest
);

/**
 * @route   POST /api/tests/submit
 * @desc    Submit test answers
 * @access  Private
 */
router.post('/submit',
  authenticate,
  validate(testSchemas.submitAnswers),
  TestController.submitTest
);

/**
 * @route   GET /api/tests/attempts/:attemptId
 * @desc    Get test attempt details
 * @access  Private
 */
router.get('/attempts/:attemptId',
  authenticate,
  validateParams({ attemptId: commonSchemas.id }),
  TestController.getTestAttemptDetails
);

/**
 * @route   POST /api/tests/:testId/questions
 * @desc    Add questions to a test (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.post('/:testId/questions',
  authenticate,
  requireManager,
  validateParams({ testId: commonSchemas.id }),
  TestController.addQuestionsToTest
);

/**
 * @route   GET /api/tests/:testId/questions
 * @desc    Get questions for a test
 * @access  Private (Manager+)
 */
router.get('/:testId/questions',
  authenticate,
  requireManager,
  validateParams({ testId: commonSchemas.id }),
  TestController.getTestQuestions
);

/**
 * @route   PUT /api/tests/:testId/questions/:questionId
 * @desc    Update a test question (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.put('/:testId/questions/:questionId',
  authenticate,
  requireManager,
  validateParams({ testId: commonSchemas.id, questionId: commonSchemas.id }),
  TestController.updateTestQuestion
);

/**
 * @route   DELETE /api/tests/:testId/questions/:questionId
 * @desc    Delete a test question (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.delete('/:testId/questions/:questionId',
  authenticate,
  requireManager,
  validateParams({ testId: commonSchemas.id, questionId: commonSchemas.id }),
  TestController.deleteTestQuestion
);

/**
 * @route   POST /api/tests/:testId/upload
 * @desc    Upload test file (Manager/Admin only)
 * @access  Private (Manager+)
 */
router.post('/:testId/upload',
  authenticate,
  requireManager,
  validateParams({ testId: commonSchemas.id }),
  TestController.uploadTestFile
);

/**
 * @route   GET /api/tests/results/:testId
 * @desc    Get test results with correct answers
 * @access  Private
 */
router.get('/results/:testId',
  authenticate,
  validateParams({ testId: commonSchemas.id }),
  TestController.getTestResults
);

export { router as testRoutes };
