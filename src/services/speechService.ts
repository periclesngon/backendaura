import { GoogleGenerativeAI } from '@google/generative-ai';
import speech from '@google-cloud/speech';
import textToSpeech from '@google-cloud/text-to-speech';
import { prisma } from '@/database/connection';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBIXbgZ3EE043v9RLa0Z_h93-BArAF-Hr4');

// Initialize Google Cloud clients (you'll need to set up credentials)
const speechClient = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

export interface SpeechAnalysisResult {
  transcription: string;
  confidence: number;
  pronunciation: {
    score: number;
    feedback: string[];
    mistakes: Array<{
      word: string;
      issue: string;
      correction: string;
    }>;
  };
  grammar: {
    score: number;
    errors: Array<{
      error: string;
      correction: string;
      explanation: string;
    }>;
  };
  fluency: {
    score: number;
    wordsPerMinute: number;
    pauseAnalysis: string;
  };
  vocabulary: {
    score: number;
    level: string;
    suggestions: string[];
  };
  overallScore: number;
  level: string;
  feedback: string;
  teacherResponse: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  language: 'fr-FR';
  description: string;
}

export interface SpeechExercise {
  id: string;
  title: string;
  instruction: string;
  prompt: string;
  level: string;
  expectedDuration: number; // in seconds
  criteria: string[];
}

export class SpeechService {
  /**
   * Available French voices for practice
   */
  static getAvailableVoices(): VoiceOption[] {
    return [
      {
        id: 'fr-FR-Neural2-A',
        name: 'Marie',
        gender: 'FEMALE',
        language: 'fr-FR',
        description: 'Voix féminine claire et naturelle, parfaite pour l\'apprentissage'
      },
      {
        id: 'fr-FR-Neural2-B',
        name: 'Pierre',
        gender: 'MALE',
        language: 'fr-FR',
        description: 'Voix masculine professionnelle, idéale pour les conversations formelles'
      },
      {
        id: 'fr-FR-Neural2-C',
        name: 'Sophie',
        gender: 'FEMALE',
        language: 'fr-FR',
        description: 'Voix féminine expressive, excellente pour la pratique conversationnelle'
      }
    ];
  }

  /**
   * Convert text to speech with selected voice
   */
  static async textToSpeech(
    text: string,
    voiceId: string = 'fr-FR-Neural2-A',
    speed: number = 1.0
  ): Promise<{ audioBuffer: Buffer; audioUrl: string }> {
    try {
      const request = {
        input: { text },
        voice: {
          languageCode: 'fr-FR',
          name: voiceId,
        },
        audioConfig: {
          audioEncoding: 'MP3' as const,
          speakingRate: speed,
          pitch: 0,
          volumeGainDb: 0,
        },
      };

      const [response] = await ttsClient.synthesizeSpeech(request);
      
      if (!response.audioContent) {
        throw new Error('No audio content received from TTS service');
      }

      const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
      
      // Save audio file
      const fileName = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const audioPath = path.join(process.cwd(), 'uploads', 'audio', fileName);
      
      // Ensure directory exists
      const audioDir = path.dirname(audioPath);
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      
      fs.writeFileSync(audioPath, audioBuffer);
      
      const audioUrl = `/uploads/audio/${fileName}`;

      logger.info('Text-to-speech conversion completed', {
        textLength: text.length,
        voiceId,
        speed,
        audioUrl
      });

      return { audioBuffer, audioUrl };
    } catch (error) {
      logger.error('Failed to convert text to speech', { text, voiceId, error });
      throw error;
    }
  }

  /**
   * Convert speech to text
   */
  static async speechToText(audioBuffer: Buffer): Promise<{
    transcription: string;
    confidence: number;
  }> {
    try {
      const request = {
        audio: {
          content: audioBuffer.toString('base64'),
        },
        config: {
          encoding: 'WEBM_OPUS' as const,
          sampleRateHertz: 48000,
          languageCode: 'fr-FR',
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          model: 'latest_long',
        },
      };

      const [response] = await speechClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        return {
          transcription: '',
          confidence: 0
        };
      }

      const transcription = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ');

      const confidence = response.results[0]?.alternatives?.[0]?.confidence || 0;

      logger.info('Speech-to-text conversion completed', {
        transcriptionLength: transcription.length,
        confidence
      });

      return { transcription, confidence };
    } catch (error) {
      logger.error('Failed to convert speech to text', { error });
      throw error;
    }
  }

  /**
   * Analyze speech with AI feedback
   */
  static async analyzeSpeech(
    audioBuffer: Buffer,
    exerciseId?: string,
    userId?: string
  ): Promise<SpeechAnalysisResult> {
    try {
      // Convert speech to text
      const { transcription, confidence } = await this.speechToText(audioBuffer);

      if (!transcription) {
        throw new ValidationError('Could not transcribe audio. Please try speaking more clearly.');
      }

      // Get AI analysis using Gemini
      const analysis = await this.getAIAnalysis(transcription, exerciseId);

      // Generate teacher response
      const teacherResponse = await this.generateTeacherResponse(analysis, transcription);

      const result: SpeechAnalysisResult = {
        transcription,
        confidence,
        ...analysis,
        teacherResponse
      };

      // Store analysis in database if user provided
      if (userId) {
        await prisma.speechAnalysis.create({
          data: {
            userId,
            exerciseId,
            transcription,
            confidence,
            overallScore: result.overallScore,
            level: result.level,
            feedback: result.feedback,
            teacherResponse: result.teacherResponse,
            analysisData: JSON.stringify(result)
          }
        });
      }

      logger.info('Speech analysis completed', {
        userId,
        exerciseId,
        transcriptionLength: transcription.length,
        overallScore: result.overallScore,
        level: result.level
      });

      return result;
    } catch (error) {
      logger.error('Failed to analyze speech', { exerciseId, userId, error });
      throw error;
    }
  }

  /**
   * Get AI analysis using Gemini
   */
  private static async getAIAnalysis(
    transcription: string,
    exerciseId?: string
  ): Promise<Omit<SpeechAnalysisResult, 'transcription' | 'confidence' | 'teacherResponse'>> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
      Analyse cette production orale en français comme un professeur expérimenté de FLE (Français Langue Étrangère).

      TRANSCRIPTION: "${transcription}"

      Fournis une analyse détaillée au format JSON EXACT suivant:

      {
        "pronunciation": {
          "score": 85,
          "feedback": ["Bonne articulation générale", "Attention aux liaisons"],
          "mistakes": [
            {
              "word": "exemple",
              "issue": "Prononciation du 'e' muet",
              "correction": "Évitez de prononcer le 'e' final"
            }
          ]
        },
        "grammar": {
          "score": 78,
          "errors": [
            {
              "error": "Je suis allé au magasin",
              "correction": "Je suis allé au magasin",
              "explanation": "Accord correct du participe passé"
            }
          ]
        },
        "fluency": {
          "score": 82,
          "wordsPerMinute": 120,
          "pauseAnalysis": "Débit naturel avec quelques hésitations"
        },
        "vocabulary": {
          "score": 75,
          "level": "B1",
          "suggestions": ["Enrichir avec des synonymes", "Utiliser des connecteurs logiques"]
        },
        "overallScore": 80,
        "level": "B1",
        "feedback": "Très bonne production orale. Continuez à travailler la fluidité et enrichissez votre vocabulaire."
      }

      CRITÈRES D'ÉVALUATION:
      - Pronunciation (0-100): Clarté, accent, intonation
      - Grammar (0-100): Correction grammaticale, structures
      - Fluency (0-100): Débit, fluidité, hésitations
      - Vocabulary (0-100): Richesse, précision, niveau
      - Overall Score: Moyenne pondérée
      - Level: A1, A2, B1, B2, C1, C2

      Sois constructif et encourageant dans tes commentaires.
      Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      let analysisData;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        logger.error('Failed to parse Gemini analysis response', { text, parseError });
        // Return default analysis
        return this.getDefaultAnalysis(transcription);
      }

      return analysisData;
    } catch (error) {
      logger.error('Failed to get AI analysis', { transcription, error });
      return this.getDefaultAnalysis(transcription);
    }
  }

  /**
   * Generate teacher response using Gemini
   */
  private static async generateTeacherResponse(
    analysis: any,
    transcription: string
  ): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
      Tu es un professeur de français expérimenté et bienveillant. Un étudiant vient de faire un exercice oral.

      TRANSCRIPTION DE L'ÉTUDIANT: "${transcription}"
      SCORE GLOBAL: ${analysis.overallScore}/100
      NIVEAU ÉVALUÉ: ${analysis.level}

      Réponds à l'étudiant de manière personnalisée, encourageante et pédagogique. Ton message doit:

      1. Commencer par féliciter l'étudiant pour ses efforts
      2. Souligner 2-3 points positifs spécifiques
      3. Donner 1-2 conseils constructifs pour s'améliorer
      4. Encourager à continuer la pratique
      5. Être chaleureux et motivant

      Écris en français, comme si tu parlais directement à l'étudiant.
      Maximum 150 mots.
      Ton de voix: professionnel mais chaleureux, comme un bon professeur.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const teacherResponse = response.text().trim();

      return teacherResponse;
    } catch (error) {
      logger.error('Failed to generate teacher response', { analysis, transcription, error });
      return `Bravo pour votre effort ! Votre niveau est ${analysis.level} avec un score de ${analysis.overallScore}/100. Continuez à pratiquer régulièrement pour progresser. N'hésitez pas à refaire l'exercice pour améliorer votre fluidité.`;
    }
  }

  /**
   * Get default analysis as fallback
   */
  private static getDefaultAnalysis(transcription: string): Omit<SpeechAnalysisResult, 'transcription' | 'confidence' | 'teacherResponse'> {
    const wordCount = transcription.split(' ').length;
    const estimatedWPM = Math.min(150, Math.max(80, wordCount * 2));
    
    return {
      pronunciation: {
        score: 75,
        feedback: ['Prononciation globalement correcte', 'Continuez à travailler l\'intonation'],
        mistakes: []
      },
      grammar: {
        score: 70,
        errors: []
      },
      fluency: {
        score: 72,
        wordsPerMinute: estimatedWPM,
        pauseAnalysis: 'Débit acceptable avec quelques hésitations naturelles'
      },
      vocabulary: {
        score: 68,
        level: 'B1',
        suggestions: ['Enrichir le vocabulaire', 'Utiliser plus de connecteurs']
      },
      overallScore: 71,
      level: 'B1',
      feedback: 'Bonne production orale. Continuez à pratiquer pour améliorer votre fluidité et enrichir votre vocabulaire.'
    };
  }

  /**
   * Get speech exercises
   */
  static getSpeechExercises(level: string = 'B1'): SpeechExercise[] {
    const exercises: Record<string, SpeechExercise[]> = {
      'A1': [
        {
          id: 'a1_presentation',
          title: 'Présentation personnelle',
          instruction: 'Présentez-vous en français',
          prompt: 'Dites votre nom, votre âge, votre nationalité et ce que vous aimez faire.',
          level: 'A1',
          expectedDuration: 30,
          criteria: ['Clarté', 'Informations de base', 'Prononciation']
        },
        {
          id: 'a1_family',
          title: 'Ma famille',
          instruction: 'Parlez de votre famille',
          prompt: 'Décrivez les membres de votre famille et leurs activités.',
          level: 'A1',
          expectedDuration: 45,
          criteria: ['Vocabulaire familial', 'Descriptions simples', 'Fluidité']
        }
      ],
      'A2': [
        {
          id: 'a2_routine',
          title: 'Ma routine quotidienne',
          instruction: 'Décrivez votre journée type',
          prompt: 'Racontez ce que vous faites du matin au soir un jour normal.',
          level: 'A2',
          expectedDuration: 60,
          criteria: ['Temps verbaux', 'Connecteurs temporels', 'Vocabulaire quotidien']
        },
        {
          id: 'a2_weekend',
          title: 'Mes loisirs',
          instruction: 'Parlez de vos activités de loisir',
          prompt: 'Que faites-vous pendant votre temps libre ? Quels sont vos hobbies ?',
          level: 'A2',
          expectedDuration: 60,
          criteria: ['Vocabulaire des loisirs', 'Expression des goûts', 'Justification']
        }
      ],
      'B1': [
        {
          id: 'b1_travel',
          title: 'Voyage mémorable',
          instruction: 'Racontez un voyage marquant',
          prompt: 'Décrivez un voyage que vous avez fait et qui vous a marqué. Où êtes-vous allé ? Qu\'avez-vous fait ?',
          level: 'B1',
          expectedDuration: 90,
          criteria: ['Narration au passé', 'Descriptions détaillées', 'Expression des sentiments']
        },
        {
          id: 'b1_opinion',
          title: 'Mon opinion sur...',
          instruction: 'Donnez votre avis sur un sujet',
          prompt: 'Que pensez-vous de l\'utilisation des réseaux sociaux ? Donnez votre opinion avec des arguments.',
          level: 'B1',
          expectedDuration: 90,
          criteria: ['Argumentation', 'Connecteurs logiques', 'Nuances d\'opinion']
        }
      ],
      'B2': [
        {
          id: 'b2_debate',
          title: 'Débat argumenté',
          instruction: 'Argumentez sur un sujet complexe',
          prompt: 'Faut-il interdire les voitures en centre-ville ? Présentez les arguments pour et contre.',
          level: 'B2',
          expectedDuration: 120,
          criteria: ['Argumentation complexe', 'Nuances', 'Vocabulaire spécialisé']
        }
      ]
    };

    return exercises[level] || exercises['B1'];
  }

  /**
   * Create conversation with AI teacher
   */
  static async createConversation(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    level: string = 'B1'
  ): Promise<{ response: string; audioUrl?: string }> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const conversationContext = conversationHistory
        .map(msg => `${msg.role === 'user' ? 'Étudiant' : 'Professeur'}: ${msg.content}`)
        .join('\n');

      const prompt = `
      Tu es un professeur de français expérimenté qui fait une conversation avec un étudiant de niveau ${level}.

      HISTORIQUE DE LA CONVERSATION:
      ${conversationContext}

      NOUVEAU MESSAGE DE L'ÉTUDIANT: "${userMessage}"

      Réponds de manière naturelle et pédagogique:
      1. Réponds au message de l'étudiant
      2. Corrige gentiment ses erreurs s'il y en a
      3. Pose une question de suivi pour continuer la conversation
      4. Adapte ton vocabulaire au niveau ${level}
      5. Sois encourageant et bienveillant

      Maximum 100 mots. Ton naturel et conversationnel.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const teacherResponse = response.text().trim();

      // Convert response to speech
      const { audioUrl } = await this.textToSpeech(teacherResponse, 'fr-FR-Neural2-A', 0.9);

      logger.info('Conversation response generated', {
        userMessage: userMessage.substring(0, 50),
        responseLength: teacherResponse.length,
        level
      });

      return {
        response: teacherResponse,
        audioUrl
      };
    } catch (error) {
      logger.error('Failed to create conversation', { userMessage, level, error });
      throw error;
    }
  }
}
