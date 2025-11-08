import { prisma } from '@/database/connection';
import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

interface QuestionExtraction {
  questions: ExtractedQuestion[];
  metadata: {
    totalQuestions: number;
    categories: string[];
    levels: string[];
    extractionDate: Date;
  };
}

interface ExtractedQuestion {
  id: string;
  text: string;
  category: string;
  level: string;
  type: 'open' | 'multiple_choice' | 'true_false';
  options?: string[];
  expectedAnswer?: string;
  keywords: string[];
  difficulty: number;
}

interface PDFUploadRequest {
  managerId: string;
  title: string;
  description?: string;
  level: string;
  category: string;
  filePath: string;
}

class QuestionBankService {
  
  // Upload and process PDF
  async uploadPDF(request: PDFUploadRequest): Promise<any> {
    try {
      // Verify manager permissions
      const manager = await prisma.user.findUnique({
        where: { id: request.managerId }
      });

      if (!manager || !['SENIOR_MANAGER', 'ADMIN'].includes(manager.role)) {
        throw new Error('Insufficient permissions to upload question banks');
      }

      // Read and parse PDF
      const pdfBuffer = fs.readFileSync(request.filePath);
      const pdfData = await pdfParse(pdfBuffer);

      // Extract questions using AI
      const extraction = await this.extractQuestionsFromText(pdfData.text);

      // Save PDF file to permanent storage
      const fileName = `questionbank_${Date.now()}_${path.basename(request.filePath)}`;
      const permanentPath = path.join(process.env.UPLOAD_DIR || './uploads', fileName);
      fs.copyFileSync(request.filePath, permanentPath);

      // Create question bank record
      const questionBank = await prisma.questionBank.create({
        data: {
          managerId: request.managerId,
          title: request.title,
          description: request.description,
          pdfUrl: permanentPath,
          extractedQuestions: JSON.parse(JSON.stringify(extraction.questions)),
          level: request.level as any,
          category: request.category as any,
          isActive: true
        },
        // Note: QuestionBank model doesn't have direct manager relation
        // Manager details will be fetched separately if needed
      });

      // Clean up temporary file
      if (fs.existsSync(request.filePath)) {
        fs.unlinkSync(request.filePath);
      }

      return {
        questionBank,
        extraction,
        message: 'PDF uploaded and processed successfully'
      };
    } catch (error) {
      console.error('Error uploading PDF:', error);
      throw error;
    }
  }

  // Extract questions from text using AI
  private async extractQuestionsFromText(text: string): Promise<QuestionExtraction> {
    try {
      // Clean and prepare text
      const cleanText = this.cleanText(text);
      
      // Use OpenAI to extract questions
      const extraction = await this.aiExtractQuestions(cleanText);
      
      return extraction;
    } catch (error) {
      console.error('Error extracting questions:', error);
      // Fallback to simple extraction
      return this.simpleQuestionExtraction(text);
    }
  }

  // AI-powered question extraction using OpenAI
  private async aiExtractQuestions(text: string): Promise<QuestionExtraction> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = `
    Analyze the following French language learning content and extract questions suitable for TCF/TEF oral assessment.
    
    For each question found, provide:
    1. The question text in French
    2. Category (GENERAL, IMMIGRATION, WORK, DAILY_LIFE, ACADEMIC, BUSINESS)
    3. Level (A1, A2, B1, B2, C1, C2)
    4. Type (open, multiple_choice, true_false)
    5. Keywords for the question
    6. Difficulty score (1-10)
    
    Return the result as a JSON object with this structure:
    {
      "questions": [
        {
          "id": "unique_id",
          "text": "question text",
          "category": "category",
          "level": "level",
          "type": "type",
          "keywords": ["keyword1", "keyword2"],
          "difficulty": number
        }
      ],
      "metadata": {
        "totalQuestions": number,
        "categories": ["category1", "category2"],
        "levels": ["level1", "level2"]
      }
    }
    
    Content to analyze:
    ${text.substring(0, 4000)} // Limit to avoid token limits
    `;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in French language assessment and TCF/TEF test preparation. Extract relevant questions from the provided content.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      
      // Add extraction date to metadata
      result.metadata.extractionDate = new Date();
      
      return result;
    } catch (error) {
      console.error('Error with OpenAI extraction:', error);
      throw error;
    }
  }

  // Simple fallback question extraction
  private simpleQuestionExtraction(text: string): QuestionExtraction {
    const questions: ExtractedQuestion[] = [];
    const lines = text.split('\n');
    
    let questionId = 1;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for question patterns
      if (this.isQuestionLine(trimmedLine)) {
        const question: ExtractedQuestion = {
          id: `q_${questionId++}`,
          text: trimmedLine,
          category: this.categorizeQuestion(trimmedLine),
          level: this.assessLevel(trimmedLine),
          type: this.determineQuestionType(trimmedLine),
          keywords: this.extractKeywords(trimmedLine),
          difficulty: this.assessDifficulty(trimmedLine)
        };
        
        questions.push(question);
      }
    }

    const categories = [...new Set(questions.map(q => q.category))];
    const levels = [...new Set(questions.map(q => q.level))];

    return {
      questions,
      metadata: {
        totalQuestions: questions.length,
        categories,
        levels,
        extractionDate: new Date()
      }
    };
  }

  // Helper methods for simple extraction
  private isQuestionLine(line: string): boolean {
    const questionPatterns = [
      /\?$/,
      /^(Comment|Pourquoi|Que|Quoi|Où|Quand|Qui|Combien)/i,
      /^(Décrivez|Expliquez|Parlez|Racontez)/i,
      /^(Pouvez-vous|Pourriez-vous)/i
    ];
    
    return questionPatterns.some(pattern => pattern.test(line)) && line.length > 10;
  }

  private categorizeQuestion(question: string): string {
    const categoryKeywords = {
      IMMIGRATION: ['canada', 'immigration', 'visa', 'résidence', 'citoyenneté'],
      WORK: ['travail', 'emploi', 'profession', 'métier', 'carrière', 'bureau'],
      DAILY_LIFE: ['quotidien', 'famille', 'maison', 'loisirs', 'vacances'],
      ACADEMIC: ['études', 'université', 'école', 'formation', 'diplôme'],
      BUSINESS: ['entreprise', 'affaires', 'commerce', 'économie', 'marché']
    };

    const lowerQuestion = question.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => lowerQuestion.includes(keyword))) {
        return category;
      }
    }
    
    return 'GENERAL';
  }

  private assessLevel(question: string): string {
    const complexity = this.assessComplexity(question);
    
    if (complexity <= 2) return 'A1';
    if (complexity <= 4) return 'A2';
    if (complexity <= 6) return 'B1';
    if (complexity <= 8) return 'B2';
    if (complexity <= 9) return 'C1';
    return 'C2';
  }

  private assessComplexity(question: string): number {
    let complexity = 1;
    
    // Length factor
    if (question.length > 50) complexity += 1;
    if (question.length > 100) complexity += 1;
    
    // Complex structures
    const complexPatterns = [
      /subjonctif/i,
      /conditionnel/i,
      /bien que/i,
      /afin que/i,
      /pourvu que/i
    ];
    
    complexity += complexPatterns.filter(pattern => pattern.test(question)).length;
    
    // Vocabulary complexity
    const advancedWords = ['néanmoins', 'cependant', 'toutefois', 'par conséquent'];
    complexity += advancedWords.filter(word => question.toLowerCase().includes(word)).length;
    
    return Math.min(complexity, 10);
  }

  private determineQuestionType(question: string): 'open' | 'multiple_choice' | 'true_false' {
    if (question.includes('vrai ou faux') || question.includes('true or false')) {
      return 'true_false';
    }
    
    if (question.includes('a)') || question.includes('1)') || question.includes('choix')) {
      return 'multiple_choice';
    }
    
    return 'open';
  }

  private extractKeywords(question: string): string[] {
    const words = question.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const stopWords = ['dans', 'avec', 'pour', 'vous', 'votre', 'cette', 'comment', 'pourquoi'];
    
    return words
      .filter(word => !stopWords.includes(word))
      .slice(0, 5);
  }

  private assessDifficulty(question: string): number {
    return Math.min(this.assessComplexity(question), 10);
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\?\.!,;:]/g, ' ')
      .trim();
  }

  // Get question banks for manager
  async getManagerQuestionBanks(managerId: string): Promise<any> {
    try {
      const questionBanks = await prisma.questionBank.findMany({
        where: { managerId },
        orderBy: { createdAt: 'desc' },
        // Note: QuestionBank model doesn't have direct manager relation
        // Manager details will be fetched separately if needed
      });

      return questionBanks;
    } catch (error) {
      console.error('Error getting question banks:', error);
      throw error;
    }
  }

  // Get all active question banks (for admin)
  async getAllQuestionBanks(): Promise<any> {
    try {
      const questionBanks = await prisma.questionBank.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        // Note: QuestionBank model doesn't have direct manager relation
        // Manager details will be fetched separately if needed
      });

      return questionBanks;
    } catch (error) {
      console.error('Error getting all question banks:', error);
      throw error;
    }
  }

  // Update question bank status
  async updateQuestionBankStatus(questionBankId: string, isActive: boolean, userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !['SENIOR_MANAGER', 'ADMIN'].includes(user.role)) {
        throw new Error('Insufficient permissions');
      }

      const questionBank = await prisma.questionBank.update({
        where: { id: questionBankId },
        data: { isActive }
      });

      return questionBank;
    } catch (error) {
      console.error('Error updating question bank status:', error);
      throw error;
    }
  }

  // Get question bank statistics
  async getQuestionBankStats(): Promise<any> {
    try {
      const totalBanks = await prisma.questionBank.count();
      const activeBanks = await prisma.questionBank.count({
        where: { isActive: true }
      });

      const categoryStats = await prisma.questionBank.groupBy({
        by: ['category'],
        _count: true,
        where: { isActive: true }
      });

      const levelStats = await prisma.questionBank.groupBy({
        by: ['level'],
        _count: true,
        where: { isActive: true }
      });

      return {
        totalBanks,
        activeBanks,
        categoryStats,
        levelStats
      };
    } catch (error) {
      console.error('Error getting question bank stats:', error);
      throw error;
    }
  }

  // Search questions by keywords
  async searchQuestions(query: string, limit: number = 5): Promise<any[]> {
    try {
      const questions = await prisma.questionBank.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { level: { equals: query as any } }
          ],
          isActive: true
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      return questions;
    } catch (error) {
      console.error('Error searching questions:', error);
      throw error;
    }
  }
}

export default new QuestionBankService();
