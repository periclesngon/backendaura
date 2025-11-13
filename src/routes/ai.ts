import express, { Request, Response, NextFunction } from 'express';
import { prisma } from '@/database/connection';
import { UserRole } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { authenticate, authorize } from '../middleware/auth';
import { LevelDeterminationService } from '../services/levelDeterminationService';
import { AIService } from '../services/aiService';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/ai-files/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, TXT, DOC, and DOCX are allowed.'));
    }
  }
});

/**
 * @route GET /api/ai/feedbacks
 * @desc Get AI feedbacks for authenticated user
 * @access Private
 */
router.get('/feedbacks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      console.error('❌ User ID not found in AI feedbacks request');
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    console.log('📋 Fetching AI feedbacks for user:', userId);

    // Fetch feedbacks with optional relations (some might not have simulationResult or voiceSimulation)
    // Note: Prisma generates camelCase accessors, so AIFeedback becomes aIFeedback
    // Only include voiceSimulation if the relation exists (optional)
    let feedbacks: any[] = [];
    try {
      feedbacks = await (prisma as any).aIFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
        // Remove include for voiceSimulation if it doesn't exist or causes errors
        // We'll handle simulation info separately if needed
      });
    } catch (prismaError: any) {
      console.error('❌ Prisma error fetching AI feedbacks:', {
        error: prismaError.message,
        code: prismaError.code,
        meta: prismaError.meta
      });
      // Return empty array if query fails
      feedbacks = [];
    }

    console.log(`✅ Found ${feedbacks.length} feedbacks for user ${userId}`);

    // Transform feedbacks with safe access to optional relations
    const transformedFeedbacks = feedbacks.map(feedback => {
      // Determine simulation title from various sources
      let simulationTitle = 'Unknown Simulation';
      
      // Check if feedback has voiceSimulationId and fetch it separately if needed
      // For now, use submissionType or default title
      if (feedback.submissionType) {
        simulationTitle = `Soumission ${feedback.submissionType}`;
      } else if (feedback.voiceSimulationId) {
        simulationTitle = `Simulation Vocale #${feedback.voiceSimulationId.substring(0, 8)}`;
      } else {
        simulationTitle = `Feedback #${feedback.id.substring(0, 8)}`;
      }

      // Calculate percentage safely
      const percentage = feedback.maxScore && feedback.maxScore > 0
        ? Math.round((feedback.aiScore / feedback.maxScore) * 100)
        : feedback.aiScore || 0;

      return {
        id: feedback.id,
        simulationTitle,
        submissionDate: feedback.createdAt.toISOString(),
        aiScore: feedback.aiScore || 0,
        maxScore: feedback.maxScore || 100,
        percentage,
        aiConfidence: feedback.aiConfidence || 0,
        status: feedback.status,
        feedback: {
          overall: feedback.overallFeedback || '',
          strengths: (feedback.strengths as string[]) || [],
          weaknesses: (feedback.weaknesses as string[]) || [],
          recommendations: (feedback.recommendations as string[]) || [],
          detailedAnalysis: (feedback.detailedAnalysis as any) || {}
        },
        originalWork: {
          type: feedback.submissionType || 'general',
          content: feedback.submissionContent || '',
          fileUrl: feedback.submissionFileUrl || null
        },
        humanReview: feedback.humanReviewerId ? {
          tutorName: feedback.humanReviewerName || 'Expert Tutor',
          tutorFeedback: feedback.humanFeedback || '',
          reviewDate: feedback.humanReviewDate?.toISOString() || '',
          finalScore: feedback.humanScore || feedback.aiScore || 0
        } : undefined
      };
    });

    res.json({
      success: true,
      data: transformedFeedbacks
    });
  } catch (error: any) {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    console.error('❌ Error fetching AI feedbacks:', {
      error: error.message,
      stack: error.stack,
      userId
    });
    res.status(500).json({
      success: false,
      error: { 
        message: error.message || 'Failed to fetch AI feedbacks', 
        statusCode: 500 
      }
    });
  }
});

/**
 * @route GET /api/ai/feedbacks/:id
 * @desc Get specific AI feedback by ID
 * @access Private
 */
router.get('/feedbacks/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    const feedback = await (prisma as any).aIFeedback.findFirst({
      where: {
        id,
        userId
      },
      include: {
        simulationResult: {
          include: {
            testAttempt: {
              include: {
                test: true
              }
            }
          }
        }
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: { message: 'Feedback not found' }
      });
    }

    const transformedFeedback = {
      id: feedback.id,
      overallScore: feedback.aiScore,
      maxScore: feedback.maxScore,
      confidence: feedback.aiConfidence,
      canGradeTo100Percent: feedback.status !== 'PENDING_HUMAN',
      overallFeedback: feedback.overallFeedback,
      strengths: feedback.strengths as string[],
      weaknesses: feedback.weaknesses as string[],
      recommendations: feedback.recommendations as string[],
      detailedAnalysis: feedback.detailedAnalysis as any,
      status: feedback.status,
      createdAt: feedback.createdAt.toISOString(),
      simulationTitle: feedback.simulationResult?.testAttempt?.test?.title || 'Unknown Simulation'
    };

    res.json({
      success: true,
      data: transformedFeedback
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai/feedbacks
 * @desc Create AI feedback for a submission
 * @access Private
 */
router.post('/feedbacks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }
    
    const {
      simulationResultId,
      submissionType,
      submissionContent,
      submissionFileUrl
    } = req.body;

    // Generate AI feedback (mock implementation)
    const aiAnalysis = await generateAIFeedback(submissionContent, submissionType);

    const feedback = await (prisma as any).aIFeedback.create({
      data: {
        userId,
        simulationResultId,
        submissionType,
        submissionContent,
        submissionFileUrl,
        aiScore: aiAnalysis.score,
        maxScore: 100,
        aiConfidence: aiAnalysis.confidence,
        overallFeedback: aiAnalysis.overall,
        strengths: aiAnalysis.strengths,
        weaknesses: aiAnalysis.weaknesses,
        recommendations: aiAnalysis.recommendations,
        detailedAnalysis: aiAnalysis.detailedAnalysis,
        status: 'AI_COMPLETED'
      }
    });

    res.json({
      success: true,
      data: feedback
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/ai/feedbacks/:id/report
 * @desc Generate and download feedback report
 * @access Private
 */
router.get('/feedbacks/:id/report', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    const feedback = await (prisma as any).aIFeedback.findFirst({
      where: {
        id,
        userId
      },
      include: {
        simulationResult: {
          include: {
            testAttempt: {
              include: {
                test: true
              }
            }
          }
        }
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: { message: 'Feedback not found' }
      });
    }

    // Generate PDF report (mock implementation)
    const reportBuffer = await generatePDFReport(feedback);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="feedback-report-${id}.pdf"`);
    res.send(reportBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai/analyze-document
 * @desc Analyze uploaded document with AI
 * @access Private
 */
router.post('/analyze-document', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentUrl, documentType, contentId } = req.body;

    // Extract text from document
    const extractedText = await extractTextFromDocument(documentUrl, documentType);

    // Analyze with AI
    const analysis = await analyzeDocumentWithAI(extractedText);

    // Store in question bank for AI assistant
    await (prisma as any).questionBank.create({
      data: {
        content: extractedText,
        contentType: documentType || 'DOCUMENT',
        level: 'B1', // Default level, can be determined by AI
        contentId,
        extractedText,
        aiAnalysis: analysis,
        documentUrl,
        documentType,
        createdAt: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        extractedText,
        analysis,
        message: 'Document analyzed and stored in question bank'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/ai/assistant/context
 * @desc Get context for AI assistant from question bank
 * @access Private
 */
router.get('/assistant/context', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, limit = 10 } = req.query;

    const contextEntries = await (prisma as any).questionBank.findMany({
      where: query ? {
        OR: [
          { extractedText: { contains: query as string, mode: 'insensitive' } },
          { aiAnalysis: { path: ['summary'], string_contains: query as string } }
        ]
      } : {},
      take: parseInt(limit as string),
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: contextEntries
    });
  } catch (error) {
    next(error);
  }
});

// Helper functions
async function generateAIFeedback(content: string, type: string) {
  // Mock AI analysis - in production, this would call actual AI service
  if (!content || typeof content !== 'string') {
    content = 'Sample content for analysis';
  }
  const wordCount = content.split(' ').length;
  const score = Math.min(100, Math.max(20, 60 + Math.random() * 30));
  
  return {
    score: Math.round(score),
    confidence: Math.random() * 0.3 + 0.7, // 70-100% confidence
    overall: `Votre travail montre une bonne compréhension du sujet. Vous avez écrit ${wordCount} mots avec une structure claire.`,
    strengths: [
      'Bonne structure générale',
      'Vocabulaire approprié',
      'Idées bien développées'
    ],
    weaknesses: [
      'Quelques erreurs grammaticales',
      'Transitions à améliorer',
      'Conclusion pourrait être renforcée'
    ],
    recommendations: [
      'Pratiquez les temps verbaux',
      'Utilisez plus de connecteurs logiques',
      'Relisez votre travail avant de soumettre'
    ],
    detailedAnalysis: {
      grammar: {
        score: Math.round(score * 0.9),
        feedback: 'Grammaire généralement correcte avec quelques erreurs mineures'
      },
      vocabulary: {
        score: Math.round(score * 1.1),
        feedback: 'Bon usage du vocabulaire avec quelques répétitions'
      },
      structure: {
        score: Math.round(score * 0.95),
        feedback: 'Structure claire et logique'
      },
      coherence: {
        score: Math.round(score * 0.85),
        feedback: 'Idées bien liées mais transitions à améliorer'
      }
    }
  };
}

async function generatePDFReport(feedback: any): Promise<Buffer> {
  // Mock PDF generation - in production, use a library like puppeteer or pdfkit
  const reportContent = `
    Rapport de Feedback IA
    
    Simulation: ${feedback.simulationResult?.testAttempt?.test?.title}
    Score: ${feedback.aiScore}/${feedback.maxScore}
    Date: ${feedback.createdAt.toLocaleDateString()}
    
    Feedback: ${feedback.overallFeedback}
    
    Points forts:
    ${(feedback.strengths as string[]).map(s => `- ${s}`).join('\n')}
    
    Points à améliorer:
    ${(feedback.weaknesses as string[]).map(w => `- ${w}`).join('\n')}
    
    Recommandations:
    ${(feedback.recommendations as string[]).map(r => `- ${r}`).join('\n')}
  `;
  
  return Buffer.from(reportContent, 'utf-8');
}

async function extractTextFromDocument(url: string, type: string): Promise<string> {
  // Mock text extraction - in production, use appropriate libraries
  return `Extracted text from ${type} document at ${url}. This would contain the actual document content.`;
}

async function analyzeDocumentWithAI(text: string) {
  // Mock AI analysis - in production, call actual AI service
  return {
    summary: `Document summary: ${text.substring(0, 100)}...`,
    keyPoints: ['Point 1', 'Point 2', 'Point 3'],
    difficulty: 'Intermediate',
    topics: ['Grammar', 'Vocabulary', 'Reading Comprehension']
  };
}

/**
 * @route POST /api/ai/feedbacks/:id/request-review
 * @desc Request human review for AI feedback
 * @access Private
 */
router.post('/feedbacks/:id/request-review', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    // Check if feedback exists and belongs to user
    const feedback = await (prisma as any).aIFeedback.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: { message: 'Feedback not found' }
      });
    }

    // Update status to request human review
    const updatedFeedback = await (prisma as any).aIFeedback.update({
      where: { id },
      data: {
        status: 'PENDING_HUMAN'
      }
    });

    res.json({
      success: true,
      data: {
        id: updatedFeedback.id,
        status: updatedFeedback.status,
        message: 'Human review requested successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/ai/level-assessment
 * @desc Get AI-powered level assessment for student
 * @access Private
 */
router.get('/level-assessment', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    // Get comprehensive level assessment
    const assessment = await LevelDeterminationService.determineStudentLevel(userId);

    res.json({
      success: true,
      data: assessment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai/assess-level
 * @desc Assess student level based on responses
 * @access Private
 */
router.post('/assess-level', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }
    const { responses } = req.body;

    // Mock level assessment - in production, this would use actual AI
    const totalQuestions = responses?.length || 1;
    const correctAnswers = Math.floor(totalQuestions * (0.6 + Math.random() * 0.3));
    const accuracy = (correctAnswers / totalQuestions) * 100;

    let level = 'A1';
    if (accuracy >= 90) level = 'C2';
    else if (accuracy >= 80) level = 'C1';
    else if (accuracy >= 70) level = 'B2';
    else if (accuracy >= 60) level = 'B1';
    else if (accuracy >= 50) level = 'A2';

    const assessment = {
      level,
      accuracy: Math.round(accuracy),
      totalQuestions,
      correctAnswers,
      recommendations: [
        `Votre niveau estimé est ${level}`,
        'Continuez à pratiquer pour améliorer vos compétences',
        'Concentrez-vous sur les domaines où vous avez des difficultés'
      ]
    };

    res.json({
      success: true,
      data: assessment,
      message: 'Level assessment completed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/ai/level-assessment/update
 * @desc Update student level based on new test results
 * @access Private
 */
router.post('/level-assessment/update', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }
    const { testAttemptId } = req.body;

    // Trigger level reassessment after new test
    const assessment = await LevelDeterminationService.determineStudentLevel(userId);

    res.json({
      success: true,
      data: {
        message: 'Level assessment updated successfully',
        assessment
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/feedback
 * @desc    Create AI feedback for student submission (single endpoint)
 * @access Private
 */
router.post('/feedback', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }
    const {
      submissionType,
      submissionContent,
      simulationResultId,
      // Also accept alternative field names for compatibility
      type,
      content
    } = req.body;

    // Use alternative field names if primary ones are not provided
    const finalSubmissionType = submissionType || type || 'general';
    const finalSubmissionContent = submissionContent || content || 'Sample content';

    // Generate AI feedback (mock implementation)
    const aiAnalysis = await generateAIFeedback(finalSubmissionContent, finalSubmissionType);

    const feedback = await (prisma as any).aIFeedback.create({
      data: {
        userId,
        simulationResultId,
        submissionType: finalSubmissionType,
        submissionContent: finalSubmissionContent,
        aiScore: Math.round(aiAnalysis.score),
        aiConfidence: aiAnalysis.confidence,
        overallFeedback: aiAnalysis.overall,
        strengths: aiAnalysis.strengths,
        weaknesses: aiAnalysis.weaknesses,
        recommendations: aiAnalysis.recommendations,
        detailedAnalysis: aiAnalysis.detailedAnalysis || {},
        status: 'AI_COMPLETED'
      }
    });

    res.json({
      success: true,
      data: feedback,
      message: 'AI feedback generated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/feedback/:id/submit-for-review
 * @desc    Submit AI feedback for human review via marketplace
 * @access Private
 */
router.post('/feedback/:id/submit-for-review', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }
    const { selectedTutorId, message } = req.body;

    // Check if feedback exists and belongs to user
    const feedback = await (prisma as any).aIFeedback.findFirst({
      where: {
        id,
        userId
      },
      include: {
        user: true
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: { message: 'Feedback not found' }
      });
    }

    // Create a marketplace request for expertise review
    const reviewRequest = await (prisma as any).marketplaceRequest.create({
      data: {
        studentId: userId,
        tutorId: selectedTutorId,
        requestType: 'EXPERTISE',
        subject: `Review AI Feedback - ${feedback.submissionType || 'Feedback'}`,
        description: message || 'Please review my AI feedback',
        feedbackId: id,
        status: 'PENDING',
        urgency: 'MEDIUM'
      }
    });

    // Update feedback status
    await (prisma as any).aIFeedback.update({
      where: { id },
      data: {
        status: 'PENDING_HUMAN'
      }
    });

    res.json({
      success: true,
      data: {
        reviewRequestId: reviewRequest.id,
        status: 'PENDING',
        message: 'Review request submitted successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/chat
 * @desc    AI chat assistant for students and course content
 * @access Private
 */
router.post('/chat', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, context } = req.body;
    // Get userId from req.user - check both id and userId properties
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated', statusCode: 401 }
      });
    }

    // If context is provided, use course-specific AI chat
    if (context && context.lessonTitle && context.courseTitle) {
      const result = await AIService.generateChatResponse(message, context);
      return res.json({
        success: true,
        data: result
      });
    }

    // Otherwise, use general AI chat
    const aiResponse = {
      message: `Bonjour! J'ai analysé votre message: "${message}". Pour améliorer votre français, je recommande de pratiquer régulièrement la lecture, l'écriture et la conversation. Voulez-vous des exercices spécifiques pour le TCF/TEF?`,
      suggestions: [
        "Exercices de grammaire",
        "Pratique de l'oral",
        "Tests de niveau",
        "Vocabulaire thématique"
      ],
      userId,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: aiResponse,
      message: 'AI chat response generated'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/generate-notes
 * @desc    Generate AI notes for course content
 * @access Private
 */
router.post('/generate-notes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, lessonTitle, courseTitle } = req.body;

    if (!content || !lessonTitle || !courseTitle) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: content, lessonTitle, courseTitle'
      });
    }

    const { transcription } = req.body;
    const result = await AIService.generateNotes(content, lessonTitle, courseTitle, transcription);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/generate-questions
 * @desc    Generate AI questions for course content
 * @access Private
 */
router.post('/generate-questions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      content,
      lessonTitle,
      courseTitle,
      questionCount = 5,
      questionTypes = ["multiple-choice", "true-false", "short-answer"],
      level,
      category,
      difficulty
    } = req.body;

    if (!content || !lessonTitle || !courseTitle) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: content, lessonTitle, courseTitle'
      });
    }

    // Validate question count
    const validQuestionCount = Math.min(Math.max(1, questionCount), 30);

    const { transcription, minWords, maxWords, writingType } = req.body;
    const result = await AIService.generateQuestions(
      content,
      lessonTitle,
      courseTitle,
      validQuestionCount,
      questionTypes,
      category,
      difficulty,
      transcription,
      undefined, // audioUrl
      undefined, // videoUrl
      minWords,
      maxWords,
      writingType
    );

    console.log('✅ AI Questions Generated:', {
      questionCount: result.questions?.length || 0,
      lessonTitle,
      courseTitle,
      validQuestionCount,
      firstQuestion: result.questions?.[0]
    });

    const responseData = {
      success: true,
      data: {
        questions: result.questions || []
      },
      message: `${result.questions?.length || 0} questions générées avec succès`
    };

    console.log('📤 Sending response:', {
      success: responseData.success,
      questionCount: responseData.data.questions.length,
      hasQuestions: responseData.data.questions.length > 0
    });

    res.json(responseData);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ai/generate-questions-from-file
 * @desc    Generate AI questions from uploaded file (PDF, TXT, DOC, DOCX)
 * @access Private
 */
router.post('/generate-questions-from-file', authenticate, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { 
      lessonTitle, 
      courseTitle, 
      questionCount = 5, 
      difficulty = 'medium',
      category = 'GENERAL',
      level = 'B1'
    } = req.body;

    console.log('📄 File upload request:', {
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      fileType: req.file?.mimetype,
      lessonTitle,
      courseTitle,
      questionCount,
      difficulty,
      category,
      level
    });

    if (!lessonTitle || !courseTitle) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lessonTitle, courseTitle'
      });
    }

    let extractedText = '';

    // Extract text based on file type
    if (req.file.mimetype === 'application/pdf') {
      console.log('📖 Extracting text from PDF...');
      const pdfBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
      console.log(`✅ Extracted ${extractedText.length} characters from PDF`);
    } else if (req.file.mimetype === 'text/plain') {
      console.log('📝 Reading text file...');
      extractedText = fs.readFileSync(req.file.path, 'utf-8');
      console.log(`✅ Read ${extractedText.length} characters from text file`);
    } else if (req.file.mimetype === 'application/msword' ||
               req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For Word documents, we would need a library like mammoth
      // For now, return an error
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Word document support coming soon. Please use PDF or TXT files.'
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Could not extract text from file'
      });
    }

    // Validate question count based on use case
    // For questionnaire page, use the requested count (1-30)
    // For audio simulations, use 80-150
    const isQuestionnaire = questionCount && questionCount <= 30;
    const validQuestionCount = isQuestionnaire 
      ? Math.min(Math.max(1, parseInt(questionCount) || 5), 30)
      : Math.min(Math.max(80, parseInt(questionCount) || 80), 150);

    console.log('🤖 Generating questions with AI:', {
      extractedTextLength: extractedText.length,
      questionCount: validQuestionCount,
      difficulty,
      category,
      level,
      isQuestionnaire
    });

    // Generate questions from extracted text using the provided difficulty and category
    const result = await AIService.generateQuestions(
      extractedText,
      lessonTitle,
      courseTitle,
      validQuestionCount,
      ["multiple-choice", "true-false", "short-answer"],
      category || 'GENERAL',
      difficulty || 'medium'
    );

    // Format questions properly for storage in QuestionBank
    // Handle passage field for vocabulary/grammar questions
    const formattedQuestions = (result.questions || []).map((q: any, index: number) => ({
      id: `q_${Date.now()}_${index}`,
      question: q.questionText || q.question || q.text || '',
      type: q.type || 'open',
      category: q.category || 'GENERAL',
      level: q.level || 'B1',
      options: q.options || [],
      correctAnswer: q.correctAnswer || '',
      points: q.points || 1,
      keywords: q.keywords || [],
      difficulty: q.difficulty || 5,
      explanation: q.explanation || '',
      passage: q.passage || null // Include passage field (from question object)
    }));

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      data: {
        questions: formattedQuestions,
        metadata: {
          totalQuestions: formattedQuestions.length,
          categories: [...new Set(formattedQuestions.map((q: any) => q.category))],
          levels: [...new Set(formattedQuestions.map((q: any) => q.level))],
          extractionDate: new Date()
        },
        extractedText: extractedText, // Return full extracted text for AI generation
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('❌ Error generating questions from file:', error);
    next(error);
  }
});

/**
 * @route   POST /api/ai/generate-questions-from-media
 * @desc    Generate questions from audio/video for listening comprehension
 * @access  Private (Admin/Manager)
 */
router.post('/generate-questions-from-media', authenticate, authorize(UserRole.ADMIN, UserRole.SENIOR_MANAGER, UserRole.JUNIOR_MANAGER), async (req, res, next) => {
  try {
    const { audioUrl, videoUrl, lessonTitle, courseTitle, level, category, difficulty, questionCount, questionTypes } = req.body;

    if (!audioUrl && !videoUrl) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Audio URL or Video URL is required'
        }
      });
    }

    if (!lessonTitle || !level || !category) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: lessonTitle, level, category'
        }
      });
    }

    console.log('🎧 Generating questions from media:', {
      audioUrl: audioUrl ? 'provided' : 'none',
      videoUrl: videoUrl ? 'provided' : 'none',
      lessonTitle,
      courseTitle,
      level,
      category,
      difficulty,
      questionCount
    });

    // Use AIService to generate questions from audio/video
    // The service will handle transcription and question generation
    const result = await AIService.generateQuestions(
      '', // No text content - will use audio/video transcription
      lessonTitle,
      courseTitle || lessonTitle,
      level,
      category,
      difficulty || 'medium',
      questionCount || 5,
      questionTypes || ['multiple-choice', 'true-false'],
      audioUrl || null,
      videoUrl || null
    );

    res.json({
      success: true,
      data: {
        questions: result.questions || [],
        metadata: {
          totalQuestions: result.questions?.length || 0,
          source: audioUrl ? 'audio' : 'video',
          sourceUrl: audioUrl || videoUrl
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error generating questions from media:', error);
    next(error);
  }
});

/**
 * @route   POST /api/ai/transcription
 * @desc    Generate transcription for video content
 * @access Private
 */
router.post('/transcription', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { videoUrl, lessonTitle, courseTitle } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: videoUrl'
      });
    }

    console.log('🎤 Generating transcription for:', videoUrl);

    // For now, generate a realistic transcription based on the lesson content
    const transcription = await AIService.generateTranscription(videoUrl, lessonTitle, courseTitle);

    res.json({
      success: true,
      data: transcription
    });
  } catch (error) {
    console.error('❌ Error generating transcription:', error);
    next(error);
  }
});

/**
 * @route   POST /api/ai/extract-sujets-from-pdf
 * @desc    Extract sujets (topics) from PDF file
 * @access Private
 */
router.post('/extract-sujets-from-pdf', authenticate, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    let extractedText = '';

    // Extract text from PDF
    if (req.file.mimetype === 'application/pdf') {
      const pdfBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Only PDF files are supported'
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Could not extract text from PDF'
      });
    }

    // Use AI to extract sujets from the text
    const sujets = await AIService.extractSujetsFromText(extractedText);

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      data: {
        sujets: sujets || [],
        extractedText: extractedText.substring(0, 500) + '...'
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('❌ Error extracting sujets from PDF:', error);
    next(error);
  }
});

/**
 * @route   POST /api/ai/extract-audio-content
 * @desc    Extract content from audio file
 * @access Private
 */
router.post('/extract-audio-content', authenticate, upload.single('audio'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file uploaded'
      });
    }

    const { title, description, level, category } = req.body;

    // For audio extraction, we would normally use speech-to-text service
    // For now, we'll generate mock content based on the audio metadata
    const audioContent = {
      title: title || req.file.originalname,
      description: description || 'Extracted from audio',
      level: level || 'B1',
      category: category || 'ORAL',
      duration: 420, // 7 minutes default
      transcription: 'Audio transcription would be generated here using speech-to-text service',
      extractedQuestions: [
        {
          id: '1',
          text: 'What is the main topic discussed?',
          type: 'open',
          difficulty: 'medium'
        },
        {
          id: '2',
          text: 'Can you summarize the key points?',
          type: 'open',
          difficulty: 'medium'
        }
      ]
    };

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      data: audioContent
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('❌ Error extracting audio content:', error);
    next(error);
  }
});

export default router;
