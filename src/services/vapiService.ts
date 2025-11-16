import axios from 'axios';
import { prisma } from '@/database/connection';
import I18nService, { Language } from './i18nService';

interface VapiConfig {
  apiKey: string;
  baseUrl: string;
}

interface VoiceSettings {
  provider: 'azure' | '11labs' | 'openai' | 'vapi';
  voiceId: string;
  speed?: number;
  pitch?: number;
  stability?: number;
  similarityBoost?: number;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  accent: 'FRANCE' | 'QUEBEC' | 'BELGIUM';
  description: string;
  voiceId: string;
  quality?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface VapiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

interface VapiAssistant {
  id?: string;
  name: string;
  model: {
    provider: 'openai' | 'mistral' | 'anthropic';
    model: string; // Flexible model names for different providers
    messages?: Array<{  // Optional - only needed for OpenAI
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    temperature?: number;
    maxTokens?: number;
    tools?: VapiTool[];
  };
  voice: VoiceSettings;
  firstMessage?: string;
  endCallMessage?: string;
  recordingEnabled?: boolean;
  hipaaEnabled?: boolean;
  clientMessages?: string[];
  serverMessages?: string[];
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  backgroundSound?: 'office' | 'none';
  backchannelingEnabled?: boolean;
  backgroundDenoisingEnabled?: boolean;
  modelOutputInMessagesEnabled?: boolean;
  // serverUrl?: string; // Removed
  // serverUrlSecret?: string; // Removed
}

interface VapiCall {
  id?: string;
  assistantId?: string;
  assistant?: VapiAssistant;
  phoneNumberId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  type?: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status?: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended' | 'active';
  endedReason?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  recordingUrl?: string;
  summary?: string;
  transcript?: string;
  analysis?: {
    successEvaluation?: string;
    userSentiment?: string;
    callSummary?: string;
  };
  costs?: {
    total?: number;
    model?: number;
    voice?: number;
    vapi?: number;
  };
  startedAt?: string;
  endedAt?: string;
  duration?: number;
}

class VapiService {
  private config: VapiConfig;
  private axiosInstance;
  private publicKey: string;
  
  // CACHE: Reuse assistants instead of creating new ones (prevents rate limiting)
  private static assistantCache: Map<string, { id: string; createdAt: number }> = new Map();
  private static readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  // Concurrency guard to prevent multiple creations in parallel for same voice
  private static assistantCreationInProgress: Set<string> = new Set();
  private static readonly MAX_CONCURRENT_CREATIONS = 2;
  private static mistralConfigured = false;
  private static mistralConfigPromise: Promise<boolean> | null = null;

  // Available French voices with proper accents (8 voices total)
  // Distribution: 3 France (2 male, 1 female), 3 Quebec (2 male, 1 female), 2 Belgium (1 male, 1 female)
  // Total: 5 male, 3 female = 8 voices
  private readonly VOICE_OPTIONS: VoiceOption[] = [
    // France voices - French accent (Parisian) - 3 voices (2 male, 1 female)
    {
      id: 'france_male_1',
      name: 'Pierre (France)',
      gender: 'MALE',
      accent: 'FRANCE',
      description: 'Voix masculine française professionnelle',
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - Male voice (French)
      quality: 'HIGH'
    },
    {
      id: 'france_male_2',
      name: 'Antoine (France)',
      gender: 'MALE',
      accent: 'FRANCE',
      description: 'Voix masculine française claire',
      voiceId: 'VR6AewLTigWG4xSOukaG', // Roger - Male voice (French)
      quality: 'HIGH'
    },
    {
      id: 'france_female_1',
      name: 'Marie (France)',
      gender: 'FEMALE',
      accent: 'FRANCE',
      description: 'Voix féminine française élégante',
      voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - Female voice (French)
      quality: 'HIGH'
    },
    // Québec voices - Canadian French accent - 3 voices (2 male, 1 female)
    {
      id: 'quebec_male_1',
      name: 'Jean-Baptiste (Québec)',
      gender: 'MALE',
      accent: 'QUEBEC',
      description: 'Voix masculine québécoise authentique',
      voiceId: 'cjVigY5qzO86Huf0OWal', // Eric - Male voice (French Canadian)
      quality: 'HIGH'
    },
    {
      id: 'quebec_male_2',
      name: 'François (Québec)',
      gender: 'MALE',
      accent: 'QUEBEC',
      description: 'Voix masculine québécoise expressive',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George - Male voice (French Canadian)
      quality: 'HIGH'
    },
    {
      id: 'quebec_female_1',
      name: 'Céline (Québec)',
      gender: 'FEMALE',
      accent: 'QUEBEC',
      description: 'Voix féminine québécoise chaleureuse',
      voiceId: 'FGY2WhTYpPnrIDTdsKH5', // Laura - Female voice (French Canadian)
      quality: 'HIGH'
    },
    // Belgium voices - Belgian French accent - 2 voices (1 male, 1 female)
    {
      id: 'belgium_male_1',
      name: 'Thomas (Belgique)',
      gender: 'MALE',
      accent: 'BELGIUM',
      description: 'Voix masculine belge professionnelle',
      voiceId: 'CwhRBWXzGAHq8TQ4Fs17', // Male voice (Belgian French)
      quality: 'HIGH'
    },
    {
      id: 'belgium_female_1',
      name: 'Sophie (Belgique)',
      gender: 'FEMALE',
      accent: 'BELGIUM',
      description: 'Voix féminine belge élégante',
      voiceId: 'XB0fDUnXU5powFXDhCwa', // Charlotte - Female voice (Belgian French)
      quality: 'HIGH'
    }
  ];

  constructor() {
    const apiKey = process.env.VAPI_API_KEY || '70ad0f00-16dd-436f-ac9c-9e8dbced71dd';
    const publicKey = process.env.VAPI_PUBLIC_KEY || 'cb1632e0-6256-45c2-93ca-798072bba18d';
    
    // Validate API key format (VAPI keys are typically UUIDs or start with specific prefixes)
    if (!apiKey || apiKey.trim() === '') {
      console.error('❌ CRITICAL: VAPI_API_KEY is missing or empty!');
      console.error('   Please set VAPI_API_KEY in your .env file with a valid VAPI secret key');
      throw new Error('VAPI_API_KEY is required but not set in environment variables');
    }
    
    // Log API key prefix for debugging (first 8 chars + last 4 chars)
    const keyPreview = apiKey.length > 12 
      ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : `${apiKey.substring(0, 4)}...`;
    console.log(`🔑 VAPI API Key loaded: ${keyPreview}`);
    
    if (!publicKey || publicKey.trim() === '') {
      console.warn('⚠️ WARNING: VAPI_PUBLIC_KEY is missing or empty!');
      console.warn('   Frontend VAPI calls may fail. Please set VAPI_PUBLIC_KEY in your .env file');
    } else {
      const publicKeyPreview = publicKey.length > 12 
        ? `${publicKey.substring(0, 8)}...${publicKey.substring(publicKey.length - 4)}`
        : `${publicKey.substring(0, 4)}...`;
      console.log(`🔑 VAPI Public Key loaded: ${publicKeyPreview}`);
    }
    
    this.config = {
      // VAPI private API key (server-side only) - MUST be a SECRET key, not public key
      apiKey: apiKey.trim(),
      baseUrl: process.env.VAPI_BASE_URL || 'https://api.vapi.ai'
    };

    // VAPI public key used by the Web SDK on the frontend
    this.publicKey = publicKey.trim();

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Auto-configure Mistral credentials on startup if MISTRAL_API_KEY is available
    this.ensureMistralCredentials().catch(err => {
      console.warn('⚠️ Failed to auto-configure Mistral credentials:', err.message);
    });
  }

  // Get public key for frontend
  getPublicKey(): string {
    return this.publicKey;
  }

  // Configure Mistral API credentials in VAPI
  // This is needed because VAPI requires provider credentials to be set in their dashboard
  // We can add it programmatically via API
  private async ensureMistralCredentials(): Promise<void> {
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey || VapiService.mistralConfigured) {
      return;
    }

    if (VapiService.mistralConfigPromise) {
      await VapiService.mistralConfigPromise;
      return;
    }

    VapiService.mistralConfigPromise = this.configureMistralCredentials(mistralApiKey)
      .then((success) => {
        if (success) {
          VapiService.mistralConfigured = true;
        }
        return success;
      })
      .finally(() => {
        VapiService.mistralConfigPromise = null;
      });

    try {
      await VapiService.mistralConfigPromise;
    } catch (error) {
      console.warn('Failed to ensure Mistral credentials:', (error as any)?.message || error);
    }
  }

  async configureMistralCredentials(mistralApiKey: string): Promise<boolean> {
    try {
      console.log('Configuring Mistral credentials in VAPI...');
      
      // VAPI API endpoint for adding provider credentials
      // Based on VAPI docs: POST /credential
      const response = await this.axiosInstance.post('/credential', {
        provider: 'mistral',
        apiKey: mistralApiKey
      });
      
      console.log('Mistral credentials configured successfully in VAPI');
      return true;
    } catch (error: any) {
      // If credential already exists, that's okay
      if (error.response?.status === 409 || error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || '';
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log('Mistral credentials already configured in VAPI');
          return true;
        }
      }
      
      console.error('Failed to configure Mistral credentials:', error.response?.data || error.message);
      console.error('You may need to add it manually in VAPI dashboard under Settings → Provider Keys');
      return false;
    }
  }

  // Get available voice options
  getVoiceOptions(): VoiceOption[] {
    return this.VOICE_OPTIONS;
  }

  // Get voice by ID
  getVoiceById(voiceId: string): VoiceOption | undefined {
    return this.VOICE_OPTIONS.find(voice => voice.id === voiceId);
  }

  // Create a French language assessment assistant with progressive difficulty
  // CACHED: Reuses existing assistants to prevent rate limiting
  async createFrenchAssistant(
    voiceId: string, 
    progressiveQuestions: {
      personalInfo: any[];
      byLevel: { A1: any[]; A2: any[]; B1: any[]; B2: any[] };
      byCategory: Record<string, any[]>;
    },
    language: Language = 'fr',
    studentName?: string
  ): Promise<VapiAssistant> {
    const selectedVoice = this.getVoiceById(voiceId);
    if (!selectedVoice) {
      throw new Error(I18nService.t('voice.voice_not_found', language));
    }

    // CHECK CACHE FIRST - Reuse existing assistant to avoid rate limits
    const cacheKey = `french_${voiceId}`;
    const cached = VapiService.assistantCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.createdAt < VapiService.CACHE_DURATION)) {
      console.log(`✅ Using CACHED assistant for voice ${voiceId}: ${cached.id}`);
      // Trust cache to avoid extra API calls that can trigger rate limits
      // BUT: We need to update the firstMessage with the student's name
      // Since we can't update an existing assistant's firstMessage via API easily,
      // we'll create a new assistant if studentName is provided and different
      // For now, return cached assistant - the firstMessage will be set when assistant is actually used
      // NOTE: VAPI will use the assistant's configured firstMessage, so we need to update it
      const cachedAssistant = {
        id: cached.id,
        name: `TCF/TEF - ${selectedVoice.name}`,
        model: { provider: 'mistral', model: 'mistral-small-latest' },
        voice: { provider: '11labs', voiceId: selectedVoice.voiceId },
        firstMessage: studentName 
          ? `Bonjour ${studentName} ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?`
          : "Bonjour ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?"
      } as VapiAssistant;
      
      // If studentName is provided, we need to update the assistant's firstMessage
      // Update the cached assistant's firstMessage via VAPI API
      if (studentName) {
        try {
          console.log(`🔄 Updating cached assistant ${cached.id} with personalized greeting for ${studentName}`);
          const personalizedFirstMessage = `Bonjour ${studentName} ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?`;
          
          // Update assistant via VAPI API
          await this.axiosInstance.patch(`/assistant/${cached.id}`, {
            firstMessage: personalizedFirstMessage
          });
          
          console.log(`✅ Updated assistant ${cached.id} with personalized greeting`);
          return {
            ...cachedAssistant,
            firstMessage: personalizedFirstMessage
          };
        } catch (updateError: any) {
          console.error(`❌ Failed to update assistant firstMessage:`, updateError.response?.data || updateError.message);
          // If update fails, create new assistant to ensure personalized greeting
          console.log(`⚠️ Creating new assistant instead due to update failure`);
          // Continue to create new assistant below
        }
      } else {
        return cachedAssistant;
      }
    }
    
    console.log(`🆕 Creating NEW assistant for voice ${voiceId} (cache miss or expired)`);
    // Concurrency guard: avoid multiple creations for same voice
    if (VapiService.assistantCreationInProgress.has(cacheKey)) {
      console.log(`⏳ Assistant creation already in progress for ${voiceId}, waiting...`);
      for (let i = 0; i < 20; i++) { // wait up to 10s
        await new Promise(resolve => setTimeout(resolve, 500));
        const ready = VapiService.assistantCache.get(cacheKey);
        if (ready && !studentName) {
          // Only use cached assistant if no studentName (to avoid hardcoded names)
          console.log(`✅ Found cached assistant while waiting: ${ready.id}`);
          return {
            id: ready.id,
            name: `TCF/TEF - ${selectedVoice.name}`,
            model: { provider: 'mistral', model: 'mistral-small-latest' },
            voice: { provider: '11labs', voiceId: selectedVoice.voiceId },
            firstMessage: "Bonjour ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?"
          } as VapiAssistant;
        }
      }
    }
    if (VapiService.assistantCreationInProgress.size >= VapiService.MAX_CONCURRENT_CREATIONS) {
      throw new Error('🚦 Too many concurrent assistant creations. Please try again in a moment.');
    }
    VapiService.assistantCreationInProgress.add(cacheKey);

    const voiceSettings: VoiceSettings = {
      provider: '11labs',
      voiceId: selectedVoice.voiceId,
      speed: 1.0,
      stability: 0.75,
      similarityBoost: 0.75
    };

    // Prepare structured question data for the system prompt
    const personalInfoQs = progressiveQuestions.personalInfo.length > 0 
      ? progressiveQuestions.personalInfo 
      : progressiveQuestions.byLevel.A1.slice(0, 5);

    const systemPrompt = `Tu es un assistant d'évaluation de français pour les tests TCF/TEF.
    Ton rôle est de conduire une simulation d'entretien oral de 5 minutes pour évaluer le niveau de français du candidat.

    ════════════════════════════════════════════════════════════════
    PROTOCOLE D'ENTRETIEN PROGRESSIF (TRÈS IMPORTANT - À SUIVRE STRICTEMENT)
    ════════════════════════════════════════════════════════════════

    ÉTAPE 1 - QUESTIONS PERSONNELLES SIMPLES (Début - 1-2 minutes):
    COMMENCE TOUJOURS par poser ces questions simples dans l'ordre suivant:
    1. "Comment vous appelez-vous ?" ou "Quel est votre nom ?"
    2. "Quel est votre âge ?"
    3. "Quelle est votre profession ?" ou "Que faites-vous comme travail ?"
    4. "Avez-vous des frères et sœurs ?" ou "Parlez-moi de votre famille."
    5. "Où habitez-vous ?"
    
    Utilise les questions personnelles fournies ci-dessous ou formule-les naturellement.
    Ces questions permettent d'évaluer le niveau de base (A1) et de mettre le candidat à l'aise.
    
    QUESTIONS PERSONNELLES DISPONIBLES:
    ${JSON.stringify(personalInfoQs, null, 2)}

    ════════════════════════════════════════════════════════════════
    ÉTAPE 2 - PROGRESSION DE DIFFICULTÉ (2-4 minutes)
    ════════════════════════════════════════════════════════════════

    Après les questions personnelles, PROGRESSE selon la performance du candidat:

    SI le candidat répond FACILEMENT (bon vocabulaire, structures correctes):
    → Passe aux questions de niveau A2, puis B1, puis B2
    
    SI le candidat a des DIFFICULTÉS (hésitations, erreurs grammaticales):
    → Reste au niveau A1-A2, pose des questions plus simples
    
    SI le candidat répond MOYENNEMENT (quelques erreurs mais communique):
    → Progresse graduellement vers A2-B1

    STRUCTURE DE PROGRESSION:
    ┌─────────────────────────────────────────────────────────────┐
    │ Niveau A1 (Simple) → Questions personnelles, hobbies, vie   │
    │ quotidienne basique                                         │
    ├─────────────────────────────────────────────────────────────┤
    │ Niveau A2 (Intermédiaire bas) → Description de situations,   │
    │ passé récent, projets simples                               │
    ├─────────────────────────────────────────────────────────────┤
    │ Niveau B1 (Intermédiaire) → Expression d'opinions, projets  │
    │ futurs, expériences, catégories WORK et GENERAL             │
    ├─────────────────────────────────────────────────────────────┤
    │ Niveau B2 (Avancé) → Questions complexes, réflexion,         │
    │ catégories IMMIGRATION et WORK avancées                     │
    └─────────────────────────────────────────────────────────────┘

    QUESTIONS PAR NIVEAU DISPONIBLES:
    - A1 (${progressiveQuestions.byLevel.A1.length} questions): ${JSON.stringify(progressiveQuestions.byLevel.A1.slice(0, 5), null, 2)}
    - A2 (${progressiveQuestions.byLevel.A2.length} questions): ${JSON.stringify(progressiveQuestions.byLevel.A2.slice(0, 5), null, 2)}
    - B1 (${progressiveQuestions.byLevel.B1.length} questions): ${JSON.stringify(progressiveQuestions.byLevel.B1.slice(0, 5), null, 2)}
    - B2 (${progressiveQuestions.byLevel.B2.length} questions): ${JSON.stringify(progressiveQuestions.byLevel.B2.slice(0, 5), null, 2)}

    QUESTIONS PAR CATÉGORIE DISPONIBLES:
    ${Object.keys(progressiveQuestions.byCategory).map(category => 
      `- ${category}: ${progressiveQuestions.byCategory[category].length} questions`
    ).join('\n    ')}
    
    PROGRESSION DES CATÉGORIES:
    1. GENERAL (début) → Questions sur la vie quotidienne, famille, hobbies
    2. WORK (milieu) → Questions sur la profession, expérience, carrière
    3. IMMIGRATION (fin si niveau suffisant) → Questions sur projets, intégration

    ════════════════════════════════════════════════════════════════
    INSTRUCTIONS GÉNÉRALES
    ════════════════════════════════════════════════════════════════

    1. COMMENCE TOUJOURS par les questions personnelles (nom, âge, profession, famille)
    2. Évalue le niveau initial basé sur les réponses aux questions personnelles
    3. PROGRESSE progressivement: A1 → A2 → B1 → B2 selon les performances
    4. Utilise les questions de la banque fournie, mais adapte-les naturellement
    5. Pose des questions de suivi pour approfondir et évaluer plus précisément
    6. CHANGE de catégorie (GENERAL → WORK → IMMIGRATION) au fil de l'entretien
    7. Si le candidat excelle, augmente la difficulté rapidement
    8. Si le candidat a des difficultés, reste au niveau actuel ou descends légèrement
    9. Prends des notes mentales sur: fluidité, grammaire, vocabulaire, prononciation
    10. Reste professionnel, bienveillant et encourageant

    CRITÈRES D'ÉVALUATION DÉTAILLÉS:
    - Fluidité (0-100): Capacité à parler sans hésitations excessives, rythme naturel
    - Grammaire (0-100): Correction grammaticale, structures complexes
    - Vocabulaire (0-100): Richesse, précision, registre approprié, progression observée
    - Prononciation (0-100): Clarté, accent, intonation
    - Cohérence (0-100): Logique du discours, organisation des idées
    - Progression (0-100): Capacité à gérer des questions de difficulté croissante

    ÉVALUATION FINALE:
    À la fin de l'entretien (5 minutes), tu dois fournir:
    - Score global sur 100 (moyenne des critères)
    - Niveau déterminé (A1, A2, B1, B2)
    - Scores détaillés pour chaque critère
    - Commentaires constructifs et encourageants
    - Recommandations spécifiques pour l'amélioration basées sur les difficultés observées
    - Points forts identifiés

    ════════════════════════════════════════════════════════════════
    DÉMARRAGE IMMÉDIAT (TRÈS IMPORTANT)
    ════════════════════════════════════════════════════════════════
    
    DÈS QUE L'APPEL COMMENCE:
    1. Dis immédiatement le message de bienvenue (firstMessage)
    2. IMMÉDIATEMENT après, pose la première question personnelle: "Comment vous appelez-vous ?"
    3. N'attends PAS de réponse avant de commencer - commence à parler dès que l'appel démarre
    4. Sois naturel, amical et encourageant
    5. Après la réponse du candidat, continue avec les autres questions personnelles (âge, profession, famille, lieu de résidence)
    6. PROGRESSE ensuite vers A2, B1, B2 selon les performances
    
    IMPORTANT: Ne reste pas silencieux au début - parle immédiatement pour mettre le candidat à l'aise et commencer l'évaluation.`;

    // Get server URL for function calls
    // serverUrl disabled for local development to avoid VAPI https enforcement
    // const serverUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:5000'}/api/voice-simulation/vapi-function-call`;
    // const serverUrlSecret = process.env.VAPI_SERVER_URL_SECRET || 'vapi-secret-key';

    // Define VAPI tools (functions) for dynamic question fetching and response tracking
    const tools: VapiTool[] = [
      {
        type: 'function',
        function: {
          name: 'fetch_next_question',
          description: 'Récupère la prochaine question de la banque de questions selon le niveau, la catégorie et les questions déjà posées. Utilise cette fonction pour obtenir de nouvelles questions dynamiquement pendant l\'entretien.',
          parameters: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2'],
                description: 'Niveau de difficulté souhaité (A1=simple, A2=intermédiaire bas, B1=intermédiaire, B2=avancé)'
              },
              category: {
                type: 'string',
                enum: ['GENERAL', 'WORK', 'IMMIGRATION', 'GRAMMAR', 'VOCABULARY'],
                description: 'Catégorie de question souhaitée'
              },
              excludeQuestionIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Liste des IDs de questions déjà posées à exclure'
              }
            },
            required: ['level']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'store_question_response',
          description: 'Enregistre une question posée et la réponse du candidat pour l\'analyse. Appelle cette fonction APRÈS chaque question-réponse pour tracker les questions et analyser les réponses en temps réel.',
          parameters: {
            type: 'object',
            properties: {
              questionId: {
                type: 'string',
                description: 'ID unique de la question posée'
              },
              questionText: {
                type: 'string',
                description: 'Texte de la question posée'
              },
              questionLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2'],
                description: 'Niveau de difficulté de la question'
              },
              questionCategory: {
                type: 'string',
                description: 'Catégorie de la question'
              },
              studentResponse: {
                type: 'string',
                description: 'Réponse complète du candidat à cette question'
              },
              timestamp: {
                type: 'string',
                description: 'Timestamp de quand la question a été posée'
              }
            },
            required: ['questionId', 'questionText', 'studentResponse']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'analyze_response',
          description: 'Analyse immédiatement la réponse d\'un candidat pour évaluer la performance et ajuster la difficulté. Appelle cette fonction pour chaque réponse afin d\'analyser en temps réel: fluidité, grammaire, vocabulaire, prononciation, cohérence.',
          parameters: {
            type: 'object',
            properties: {
              questionId: {
                type: 'string',
                description: 'ID de la question analysée'
              },
              questionLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2'],
                description: 'Niveau de difficulté de la question'
              },
              studentResponse: {
                type: 'string',
                description: 'Réponse du candidat à analyser'
              },
              conversationContext: {
                type: 'string',
                description: 'Contexte de la conversation jusqu\'à présent (dernières interactions)'
              }
            },
            required: ['questionId', 'studentResponse']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_next_difficulty_level',
          description: 'Détermine le prochain niveau de difficulté approprié basé sur les performances analysées. Utilise cette fonction pour décider si augmenter, maintenir ou diminuer la difficulté.',
          parameters: {
            type: 'object',
            properties: {
              currentLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2'],
                description: 'Niveau actuel de difficulté'
              },
              performanceScores: {
                type: 'object',
                description: 'Scores de performance actuels (fluency, grammar, vocabulary, pronunciation, coherence)',
                properties: {
                  fluency: { type: 'number', minimum: 0, maximum: 100 },
                  grammar: { type: 'number', minimum: 0, maximum: 100 },
                  vocabulary: { type: 'number', minimum: 0, maximum: 100 },
                  pronunciation: { type: 'number', minimum: 0, maximum: 100 },
                  coherence: { type: 'number', minimum: 0, maximum: 100 }
                }
              }
            },
            required: ['currentLevel', 'performanceScores']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_question_count',
          description: 'Récupère le nombre de questions déjà posées et le temps restant pour maximiser le nombre de questions dans les 5 minutes.',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    ];

    // Enhanced system prompt with function call instructions
    const enhancedSystemPrompt = `${systemPrompt}

    ════════════════════════════════════════════════════════════════
    OUTILS DISPONIBLES (FONCTIONS À UTILISER PENDANT L'ENTRETIEN)
    ════════════════════════════════════════════════════════════════

    IMPORTANT: Tu as accès à plusieurs fonctions pour gérer l'entretien dynamiquement:

    1. fetch_next_question(level, category, excludeQuestionIds):
       - Utilise cette fonction pour RÉCUPÉRER DE NOUVELLES QUESTIONS de la banque
       - Appelle-la quand tu as besoin de nouvelles questions selon le niveau et la catégorie
       - Exclut les questions déjà posées pour éviter les répétitions
       - Maximise le nombre de questions dans les 5 minutes (objectif: 8-12 questions)

    2. store_question_response(questionId, questionText, studentResponse):
       - ENREGISTRE chaque question posée et sa réponse IMMÉDIATEMENT
       - Appelle cette fonction APRÈS chaque question-réponse
       - Cela permet de tracker les questions et analyser les réponses

    3. analyze_response(questionId, studentResponse):
       - ANALYSE en temps réel chaque réponse du candidat
       - Fournit des scores immédiats: fluidité, grammaire, vocabulaire, prononciation, cohérence
       - Utilise ces analyses pour ajuster la difficulté progressivement

    4. get_next_difficulty_level(currentLevel, performanceScores):
       - DÉTERMINE le prochain niveau de difficulté approprié
       - Basé sur les scores de performance actuels
       - Utilise cette fonction pour décider de progresser ou maintenir la difficulté

    5. get_question_count():
       - Vérifie le nombre de questions déjà posées
       - Aide à maximiser le nombre de questions dans le temps disponible

    PROTOCOLE D'UTILISATION:
    - Commence avec les questions personnelles (utilise les données fournies)
    - Pour chaque question posée: 
      1. Pose la question naturellement
      2. Écoute la réponse du candidat
      3. Appelle IMMÉDIATEMENT store_question_response()
      4. Appelle IMMÉDIATEMENT analyze_response()
      5. Utilise les résultats pour décider du prochain niveau
      6. Appelle fetch_next_question() pour obtenir la prochaine question
      7. Répète jusqu'à la fin des 5 minutes

    OBJECTIF: Maximiser le nombre de questions posées (8-12 questions minimum) tout en maintenant une progression naturelle et adaptative.`;

    // Ensure Mistral credentials are configured before creating assistant
    await this.ensureMistralCredentials();

    // Use Mistral (user has Mistral API key configured)
    const assistant: VapiAssistant = {
      name: `TCF/TEF - ${selectedVoice.name}`,
      model: {
        provider: 'mistral',
        model: 'mistral-small-latest',
        temperature: 0.7,
        maxTokens: 1500
      },
      voice: {
        provider: '11labs',
        voiceId: selectedVoice.voiceId,
        speed: 1.0
      },
      firstMessage: studentName 
        ? `Bonjour ${studentName} ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?`
        : "Bonjour ! Je suis votre évaluateur pour cette simulation d'entretien oral en français. Je me présente : je suis un assistant d'évaluation spécialisé dans les tests TCF/TEF. Nous allons passer environ 5 minutes ensemble pour évaluer votre niveau de français. Commençons par quelques questions simples. Comment vous appelez-vous ?",
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      clientMessages: ['conversation-update', 'hang', 'speech-update'],
      serverMessages: ['conversation-update', 'end-of-call-report', 'hang']
    };

    // Retry logic with backoff for rate limits
    const maxRetries = 2;
    let lastError: any = null;
    
    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const apiKeyPreview = this.config.apiKey ? `${this.config.apiKey.substring(0, 8)}...` : 'MISSING';
          console.log(`VAPI API Key: ${apiKeyPreview} | Attempt ${attempt}/${maxRetries}`);
          console.log('Creating assistant (Mistral)');
          
          const rateLimitDelay = Number(process.env.VAPI_RATE_LIMIT_DELAY || '0');
          if (rateLimitDelay > 0) {
            await new Promise(r => setTimeout(r, rateLimitDelay));
          }
          
      const response = await this.axiosInstance.post('/assistant', assistant);
          const assistantId = response.data?.id;
          console.log('✅ VAPI assistant created successfully:', assistantId);
          
          // CACHE the assistant for reuse (prevents rate limiting)
          if (assistantId) {
            VapiService.assistantCache.set(cacheKey, {
              id: assistantId,
              createdAt: Date.now()
            });
            console.log(`💾 Cached assistant ${assistantId} for voice ${voiceId}`);
          }
          
      return response.data;
    } catch (error: any) {
          lastError = error;
          const status = error.response?.status;
          const isRateLimit = status === 429;
          console.error(`❌ Assistant creation failed (attempt ${attempt}/${maxRetries})`, {
            status,
            message: error.response?.data?.message || error.message,
            data: error.response?.data
          });
          if (status === 400 || status === 401) {
            console.error('🛑 Non-retryable error, aborting retries');
            throw error;
          }
          const isRetryable = isRateLimit || status === 500 || status === 503;
          
          if (isRetryable && attempt < maxRetries) {
            const delay = 2000 * attempt; // Linear backoff: 2s, 4s
            console.log(`⏰ Retryable error (${status}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // If not retryable or last attempt, throw error
          throw error;
        }
      }
      
      // Should never reach here, but just in case
      throw lastError;
    } catch (error: any) {
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          method: error.config?.method,
          url: error.config?.url,
          hasAuth: !!error.config?.headers?.Authorization,
          payload: error.config?.data ? JSON.parse(error.config.data) : null
        }
      };
      
      console.error('❌ VAPI Error Details (FULL):', JSON.stringify(errorDetails, null, 2));
      console.error('❌ VAPI Error Response Data:', error.response?.data);
      console.error('❌ VAPI Error Message:', error.message);
      
      // Provide specific error message based on status
      if (error.response?.status === 401) {
        throw new Error('VAPI Authentication failed - Invalid API Key');
      } else if (error.response?.status === 429) {
        throw new Error('VAPI Rate limit exceeded - Please try again in a moment');
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || JSON.stringify(error.response?.data);
        throw new Error(`Failed to create VAPI assistant: ${errorMsg}`);
      } else {
        throw new Error(`Failed to create Mistral assistant: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      VapiService.assistantCreationInProgress.delete(cacheKey);
    }
  }

  // Create an immigration interview assistant
  async createImmigrationAssistant(voiceId: string, country: string, immigrationType: string, questions: any[], language: Language = 'fr'): Promise<VapiAssistant> {
    const selectedVoice = this.getVoiceById(voiceId);
    if (!selectedVoice) {
      throw new Error(I18nService.t('voice.voice_not_found', language));
    }

    const voiceSettings: VoiceSettings = {
      provider: '11labs',
      voiceId: selectedVoice.voiceId,
      speed: 1.0,
      stability: 0.75,
      similarityBoost: 0.75
    };

    // Create country-specific system prompt
    const countryInfo = {
      'canada': {
        name: 'Canada',
        context: 'immigration au Canada et au Québec',
        procedures: 'les procédures d\'immigration canadiennes et québécoises'
      },
      'france': {
        name: 'France',
        context: 'immigration en France',
        procedures: 'les procédures d\'immigration françaises'
      },
      'belgium': {
        name: 'Belgique',
        context: 'immigration en Belgique',
        procedures: 'les procédures d\'immigration belges'
      }
    };

    const typeInfo = {
      'skilled_worker': 'travailleur qualifié',
      'student': 'étudiant international',
      'family_reunification': 'réunification familiale',
      'work_permit': 'permis de travail',
      'family': 'regroupement familial',
      'work': 'permis de travail'
    };

    const selectedCountry = countryInfo[country] || countryInfo['canada'];
    const selectedType = typeInfo[immigrationType] || 'candidat à l\'immigration';

    const systemPrompt = `Tu es un agent d'immigration expérimenté pour ${selectedCountry.name}.
    Tu conduis un entretien d'immigration officiel avec un candidat pour ${selectedType}.

    CONTEXTE:
    - Pays de destination: ${selectedCountry.name}
    - Type de demande: ${selectedType}
    - Tu représentes les autorités d'immigration de ${selectedCountry.name}
    - Cet entretien détermine l'admissibilité du candidat
    - Durée: 5 minutes maximum

    STRUCTURE DE L'ENTRETIEN:
    
    PHASE 1 - Questions personnelles (1-2 minutes):
    - Commence TOUJOURS par des questions personnelles simples et faciles
    - Exemples: "Bonjour, comment vous appelez-vous ?", "Quel est votre âge ?", "D'où venez-vous ?"
    - Ces questions permettent au candidat de se détendre et d'évaluer son niveau de base
    
    PHASE 2 - Questions sur l'immigration et le sujet spécifique (3-4 minutes):
    - Après les questions personnelles, passe aux questions sur ${selectedType}
    - Utilise les questions de la banque de questions disponibles via les function calls
    - Adapte la difficulté en fonction des réponses précédentes
    - Pose des questions de suivi pour clarifier

    INSTRUCTIONS IMPORTANTES:
    1. Commence TOUJOURS par te présenter et poser des questions personnelles SIMPLES
    2. N'utilise JAMAIS de questions complexes au début
    3. Après 1-2 questions personnelles, utilise les function calls pour récupérer des questions sur ${selectedType}
    4. Utilise fetch_next_question avec category='IMMIGRATION' et le topic spécifique
    5. Évalue progressivement: niveau de français, motivation, préparation, crédibilité
    6. Pose des questions de suivi naturelles pour clarifier
    7. Reste professionnel, bienveillant mais rigoureux
    8. Prends des notes mentales pour l'évaluation finale

    FUNCTION CALLS DISPONIBLES:
    - fetch_next_question(level, category, topic): Récupère une question de la banque
    - store_question_response(questionId, response): Enregistre la réponse
    - analyze_response(questionId, response): Analyse la réponse immédiatement

    CRITÈRES D'ÉVALUATION:
    - Clarté et cohérence des réponses
    - Niveau de français (expression orale, fluidité, vocabulaire)
    - Préparation et connaissance du pays
    - Motivation et projet réaliste
    - Crédibilité des informations fournies

    QUESTIONS DISPONIBLES (référence):
    ${JSON.stringify(questions, null, 2)}

    Commence maintenant l'entretien de manière professionnelle et bienveillante. 
    IMPORTANT: Commence par des questions personnelles simples !`;

    // Get server URL for function calls (immigration simulation uses same endpoint but different logic)
    // serverUrl disabled for local development to avoid VAPI https enforcement
    // const serverUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:5000'}/api/voice-simulation/vapi-function-call`;
    // const serverUrlSecret = process.env.VAPI_SERVER_URL_SECRET || 'vapi-secret-key';

    // Define VAPI tools (functions) for dynamic question fetching and response tracking
    const tools: VapiTool[] = [
      {
        type: 'function',
        function: {
          name: 'fetch_next_question',
          description: 'Récupère la prochaine question d\'immigration de la banque de questions selon le niveau, la catégorie, le topic et les questions déjà posées. Utilise cette fonction pour obtenir de nouvelles questions dynamiquement pendant l\'entretien d\'immigration. EXCLUT automatiquement les questions déjà posées.',
          parameters: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
                description: 'Niveau de difficulté souhaité (B1 par défaut pour immigration)'
              },
              category: {
                type: 'string',
                description: 'Catégorie de question (IMMIGRATION, PERSONAL, etc.)'
              },
              topic: {
                type: 'string',
                description: `Topic spécifique: ${immigrationType} (skilled_worker, student, family_reunification, work_permit)`
              },
              excludeQuestionIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Liste des IDs de questions déjà posées à exclure (pour éviter les répétitions)'
              }
            },
            required: ['level']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'store_question_response',
          description: 'ENREGISTRE chaque question posée et la réponse du candidat pour l\'analyse. Appelle cette fonction APRÈS chaque question-réponse pour que le système se souvienne des questions posées et analyse les réponses en temps réel. OBLIGATOIRE pour que le système puisse éviter les répétitions.',
          parameters: {
            type: 'object',
            properties: {
              questionId: {
                type: 'string',
                description: 'ID unique de la question posée'
              },
              questionText: {
                type: 'string',
                description: 'Texte de la question posée'
              },
              studentResponse: {
                type: 'string',
                description: 'Réponse complète du candidat'
              },
              questionLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
                description: 'Niveau de difficulté de la question posée'
              },
              questionCategory: {
                type: 'string',
                description: 'Catégorie de la question (IMMIGRATION, PERSONAL, etc.)'
              },
              timestamp: {
                type: 'string',
                description: 'Horodatage ISO de la réponse'
              }
            },
            required: ['questionId', 'questionText', 'studentResponse']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'analyze_response',
          description: 'ANALYSE en temps réel chaque réponse du candidat selon 5 critères (pertinence, complétude, clarté, niveau de français, crédibilité). Utilise cette fonction pour obtenir des scores et feedback immédiats, puis ajuster la difficulté progressivement.',
          parameters: {
            type: 'object',
            properties: {
              questionId: {
                type: 'string',
                description: 'ID de la question analysée'
              },
              studentResponse: {
                type: 'string',
                description: 'Réponse complète du candidat à analyser'
              },
              questionLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
                description: 'Niveau de difficulté de la question'
              },
              conversationContext: {
                type: 'string',
                description: 'Contexte de la conversation et questions précédentes (optionnel)'
              }
            },
            required: ['questionId', 'studentResponse']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_next_difficulty_level',
          description: 'DÉTERMINE le prochain niveau de difficulté approprié basé sur les scores de performance actuels. Utilise cette fonction pour décider de progresser (B1→B2→C1) ou maintenir la difficulté selon la performance du candidat.',
          parameters: {
            type: 'object',
            properties: {
              currentLevel: {
                type: 'string',
                enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
                description: 'Niveau de difficulté actuel'
              },
              performanceScores: {
                type: 'object',
                description: 'Scores de performance actuels (relevance, completeness, clarity, language, credibility)'
              }
            },
            required: ['currentLevel']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_question_count',
          description: 'Vérifie le nombre de questions déjà posées. Aide à maximiser le nombre de questions dans le temps disponible (5 minutes).',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    ];

    const assistant: VapiAssistant = {
      name: `Immigration ${selectedCountry.name} - ${selectedVoice.name}`,
      model: {
        provider: 'openai',
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ],
        temperature: 0.7,
        maxTokens: 1000,
        tools: tools
      },
      voice: voiceSettings,
      firstMessage: `Bonjour, je suis votre agent d'immigration pour ${selectedCountry.name}. Nous allons procéder à votre entretien d'immigration pour votre demande de ${selectedType}. Êtes-vous prêt à commencer ?`,
      endCallMessage: "Merci pour cet entretien. Vous recevrez une évaluation détaillée de votre performance. Bonne journée !",
      recordingEnabled: true,
      hipaaEnabled: false,
      silenceTimeoutSeconds: 30,
      clientMessages: ['conversation-update', 'function-call', 'hang', 'speech-update'],
      serverMessages: ['conversation-update', 'end-of-call-report', 'hang', 'speech-update'],
      // serverUrl/serverUrlSecret removed to avoid VAPI 400 in local (http)
    };

    try {
      const response = await this.axiosInstance.post('/assistant', assistant);
      return response.data;
    } catch (error: any) {
      console.error('Error creating immigration VAPI assistant:', error.response?.data || error.message);
      throw new Error(I18nService.t('voice.assistant_creation_failed', language));
    }
  }

  // Start a voice simulation call (Web SDK handles the actual call)
  async startVoiceSimulation(simulationId: string, assistantId: string, language: Language = 'fr'): Promise<VapiCall> {
    try {
      // For web calls, we don't create the call via API - the Web SDK handles it
      // We just return the assistant configuration for the frontend
      const call: VapiCall = {
        id: `web-call-${simulationId}`,
        assistantId,
        status: 'active',
        type: 'webCall'
      };

      // Update simulation status
      await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: {
          vapiSessionId: call.id,
          status: 'ACTIVE'
        }
      });

      return call;
    } catch (error) {
      console.error('Error starting VAPI call:', error);
      throw new Error(I18nService.t('voice.call_start_failed', language));
    }
  }

  // Get call details and analysis
  async getCallAnalysis(callId: string): Promise<VapiCall> {
    try {
      const response = await this.axiosInstance.get(`/call/${callId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting call analysis:', error);
      throw new Error('Failed to get call analysis');
    }
  }

  // End a call
  async endCall(callId: string): Promise<void> {
    try {
      await this.axiosInstance.post(`/call/${callId}/end`);
    } catch (error) {
      console.error('Error ending call:', error);
      throw new Error('Failed to end call');
    }
  }

  // Process call results and generate comprehensive scores with strengths/weaknesses
  async processCallResults(callId: string, simulationId: string): Promise<any> {
    try {
      const callData = await this.getCallAnalysis(callId);
      
      // Get session data for detailed analysis
      const { default: voiceSimulationService } = await import('./voiceSimulationService');
      const session = voiceSimulationService.getActiveSession(simulationId);
      
      // Analyze transcript for overall assessment
      const transcriptAnalysis = await this.analyzeTranscript(callData.transcript || '');
      
      // Enhanced analysis with strengths/weaknesses by category
      const enhancedAnalysis = await this.generateDetailedFeedback(
        callData.transcript || '',
        session
      );
      
      // Combine transcript analysis with detailed feedback
      const finalAnalysis = {
        ...transcriptAnalysis,
        ...enhancedAnalysis,
        questionCount: session?.questionCount || 0,
        askedQuestions: session ? Array.from(session.askedQuestions.values()) : [],
        questionResponses: session ? Array.from(session.questionResponses.values()) : [],
        progression: session ? {
          startLevel: 'A1',
          endLevel: session.currentLevel,
          levelProgression: session.currentLevel !== 'A1' ? `A1 → ${session.currentLevel}` : 'A1'
        } : null
      };
      
      // Update simulation with comprehensive results
      // updatedAt will be set automatically by Prisma, which we'll use as endedAt
      const updatedSimulation = await prisma.voiceSimulation.update({
        where: { id: simulationId },
        data: {
          status: 'COMPLETED',
          resultsData: JSON.parse(JSON.stringify({
            ...callData,
            detailedAnalysis: finalAnalysis
          })),
          overallScore: finalAnalysis.overallScore,
          fluencyScore: finalAnalysis.fluencyScore,
          grammarScore: finalAnalysis.grammarScore,
          vocabularyScore: finalAnalysis.vocabularyScore,
          pronunciationScore: finalAnalysis.pronunciationScore,
          coherenceScore: finalAnalysis.coherenceScore,
          feedback: finalAnalysis.comprehensiveFeedback || finalAnalysis.feedback
        }
      });

      // Clean up session via voiceSimulationService
      if (session) {
        voiceSimulationService.activeSessions.delete(simulationId);
      }

      return updatedSimulation;
    } catch (error) {
      console.error('Error processing call results:', error);
      throw new Error('Failed to process call results');
    }
  }

  // Generate detailed feedback with strengths/weaknesses by category
  private async generateDetailedFeedback(
    transcript: string,
    session: any
  ): Promise<any> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return {
        strengths: [],
        weaknesses: [],
        strengthsByCategory: {},
        weaknessesByCategory: {},
        comprehensiveFeedback: 'Analyse détaillée non disponible'
      };
    }

    try {
      // Collect all responses from session if available
      const responses = session?.questionResponses ? Array.from(session.questionResponses.values()) : [];
      
      const feedbackPrompt = `
Analysez cette transcription complète d'un entretien oral en français et fournissez une évaluation détaillée avec forces et faiblesses par catégorie.

TRANSCRIPTION COMPLÈTE:
${transcript}

${responses.length > 0 ? `\nRÉPONSES PAR QUESTION:\n${responses.map((r: any, i: number) => 
  `${i + 1}. Question (${r.questionLevel || 'N/A'} - ${r.questionCategory || 'GENERAL'}): ${r.questionText}\n   Réponse: ${r.studentResponse}\n   Score moyen: ${r.analysis ? ((r.analysis.fluencyScore + r.analysis.grammarScore + r.analysis.vocabularyScore + r.analysis.pronunciationScore + r.analysis.coherenceScore) / 5).toFixed(1) : 'N/A'}\n`
).join('\n')}` : ''}

Fournissez une analyse complète avec:

1. FORCES GLOBALES (liste de 3-5 points forts)
2. FAIBLESSES GLOBALES (liste de 3-5 points à améliorer)

3. ANALYSE PAR CATÉGORIE:
   - GRAMMAIRE: Forces et faiblesses spécifiques
   - VOCABULAIRE: Forces et faiblesses spécifiques
   - FLUIDITÉ: Forces et faiblesses spécifiques
   - PRONONCIATION: Forces et faiblesses spécifiques
   - COHÉRENCE: Forces et faiblesses spécifiques

4. RECOMMANDATIONS SPÉCIFIQUES par catégorie (2-3 par catégorie)

5. COMMENTAIRE CONSTRUCTIF GLOBAL avec:
   - Points forts à maintenir
   - Points à améliorer en priorité
   - Plan d'amélioration suggéré

RÉPONDEZ UNIQUEMENT avec un JSON dans ce format exact:
{
  "strengths": ["force globale 1", "force globale 2", "force globale 3", "force globale 4", "force globale 5"],
  "weaknesses": ["faiblesse globale 1", "faiblesse globale 2", "faiblesse globale 3", "faiblesse globale 4", "faiblesse globale 5"],
  "strengthsByCategory": {
    "grammar": ["force grammaire 1", "force grammaire 2"],
    "vocabulary": ["force vocabulaire 1", "force vocabulaire 2"],
    "fluency": ["force fluidité 1", "force fluidité 2"],
    "pronunciation": ["force prononciation 1"],
    "coherence": ["force cohérence 1", "force cohérence 2"]
  },
  "weaknessesByCategory": {
    "grammar": ["faiblesse grammaire 1", "faiblesse grammaire 2"],
    "vocabulary": ["faiblesse vocabulaire 1", "faiblesse vocabulaire 2"],
    "fluency": ["faiblesse fluidité 1", "faiblesse fluidité 2"],
    "pronunciation": ["faiblesse prononciation 1"],
    "coherence": ["faiblesse cohérence 1", "faiblesse cohérence 2"]
  },
  "recommendationsByCategory": {
    "grammar": ["recommandation grammaire 1", "recommandation grammaire 2"],
    "vocabulary": ["recommandation vocabulaire 1", "recommandation vocabulaire 2"],
    "fluency": ["recommandation fluidité 1", "recommandation fluidité 2"],
    "pronunciation": ["recommandation prononciation 1"],
    "coherence": ["recommandation cohérence 1", "recommandation cohérence 2"]
  },
  "comprehensiveFeedback": "Commentaire constructif et détaillé de 200-300 mots en français avec plan d'amélioration"
}`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Tu es un expert en évaluation de français pour les tests TCF/TEF/FLS/FLE. Fournis des analyses détaillées avec forces et faiblesses par catégorie.'
            },
            {
              role: 'user',
              content: feedbackPrompt
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

      const feedbackText = response.data.choices[0].message.content;
      const detailedFeedback = JSON.parse(feedbackText);

      return detailedFeedback;
    } catch (error: any) {
      console.error('Error generating detailed feedback:', error);
      return {
        strengths: [],
        weaknesses: [],
        strengthsByCategory: {},
        weaknessesByCategory: {},
        comprehensiveFeedback: 'Analyse détaillée non disponible'
      };
    }
  }

  // Analyze transcript using AI
  private async analyzeTranscript(transcript: string): Promise<any> {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('No transcript available for analysis');
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured for transcript analysis');
    }

    try {
      const analysisPrompt = `
Analysez cette transcription d'un entretien oral en français pour les tests TCF/TEF et fournissez une évaluation détaillée.

TRANSCRIPTION:
${transcript}

Évaluez selon ces 5 critères (score de 0 à 100 pour chaque):

1. FLUIDITÉ: Capacité à parler sans hésitations excessives, rythme naturel
2. GRAMMAIRE: Correction grammaticale, structures complexes
3. VOCABULAIRE: Richesse, précision, registre approprié
4. PRONONCIATION: Clarté, accent, intonation (basé sur les répétitions, corrections)
5. COHÉRENCE: Logique du discours, organisation des idées

Répondez UNIQUEMENT avec un JSON dans ce format exact:
{
  "overallScore": number,
  "fluencyScore": number,
  "grammarScore": number,
  "vocabularyScore": number,
  "pronunciationScore": number,
  "coherenceScore": number,
  "feedback": "Commentaires détaillés et constructifs en français avec recommandations spécifiques"
}`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Tu es un expert en évaluation de français pour les tests TCF/TEF/FLS/FLE. Analyse les transcriptions et fournis des évaluations précises et constructives.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const analysisText = response.data.choices[0].message.content;

      // Parse the JSON response
      try {
        const analysis = JSON.parse(analysisText);

        // Validate the response structure
        if (!analysis.overallScore || !analysis.fluencyScore || !analysis.grammarScore ||
            !analysis.vocabularyScore || !analysis.pronunciationScore || !analysis.coherenceScore) {
          throw new Error('Invalid analysis response structure');
        }

        return analysis;
      } catch (parseError) {
        console.error('Error parsing AI analysis response:', parseError);
        throw new Error('Failed to parse AI analysis response');
      }

    } catch (error: any) {
      console.error('Error analyzing transcript with AI:', error.response?.data || error.message);
      throw new Error(`Failed to analyze transcript: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Cache for progressive questions to avoid database hits on every simulation
  private static progressiveQuestionsCache: {
    data: {
      personalInfo: any[];
      byLevel: { A1: any[]; A2: any[]; B1: any[]; B2: any[] };
      byCategory: Record<string, any[]>;
    };
    timestamp: number;
  } | null = null;
  
  private static readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache

  // Get progressive questions from question bank - optimized with caching
  async getProgressiveQuestions(): Promise<{
    personalInfo: any[];
    byLevel: { A1: any[]; A2: any[]; B1: any[]; B2: any[] };
    byCategory: Record<string, any[]>;
  }> {
    try {
      // Check cache first
      const now = Date.now();
      if (VapiService.progressiveQuestionsCache && 
          (now - VapiService.progressiveQuestionsCache.timestamp) < VapiService.CACHE_TTL) {
        console.log(`⚡ Using cached progressive questions (${VapiService.progressiveQuestionsCache.data.byLevel.A1.length + VapiService.progressiveQuestionsCache.data.byLevel.A2.length + VapiService.progressiveQuestionsCache.data.byLevel.B1.length + VapiService.progressiveQuestionsCache.data.byLevel.B2.length} total questions)`);
        return VapiService.progressiveQuestionsCache.data;
      }

      console.log(`🔍 Fetching progressive questions from database (cache expired or empty)`);

      // Get question banks from database - optimized query
      const questionBanks = await prisma.questionBank.findMany({
        where: {
          isActive: true
        },
        select: {
          id: true,
          title: true,
          extractedQuestions: true,
          level: true,
          category: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 50 // Limit to prevent massive queries
      });

      console.log(`📚 Found ${questionBanks.length} question banks in database`);

      // Organize questions by level
      const questionsByLevel: { A1: any[]; A2: any[]; B1: any[]; B2: any[] } = {
        A1: [],
        A2: [],
        B1: [],
        B2: []
      };

      // Organize questions by category
      const questionsByCategory: Record<string, any[]> = {};

      // Personal info questions (A1 level, GENERAL category) - starting questions
      const personalInfoQuestions: any[] = [];

      // Extract questions from extractedQuestions field
      questionBanks.forEach(bank => {
        let bankQuestions: any[] = [];

        if (bank.extractedQuestions && Array.isArray(bank.extractedQuestions)) {
          bankQuestions = bank.extractedQuestions as any[];
        } else if (bank.extractedQuestions && typeof bank.extractedQuestions === 'object') {
          const data = bank.extractedQuestions as any;
          if (data.questions && Array.isArray(data.questions)) {
            bankQuestions = data.questions;
          }
        }

        bankQuestions.forEach((q: any) => {
          const questionLevel = (q.level || bank.level || 'B1').toString().toUpperCase();
          const questionCategory = (q.category || bank.category || 'GENERAL').toString();

          // Add to level-based organization
          if (questionLevel === 'A1' || questionLevel === 'A1-A2') {
            questionsByLevel.A1.push(q);
          } else if (questionLevel === 'A2') {
            questionsByLevel.A2.push(q);
          } else if (questionLevel === 'B1' || questionLevel === 'B1-B2') {
            questionsByLevel.B1.push(q);
          } else if (questionLevel === 'B2') {
            questionsByLevel.B2.push(q);
          }

          // Add to category-based organization
          if (!questionsByCategory[questionCategory]) {
            questionsByCategory[questionCategory] = [];
          }
          questionsByCategory[questionCategory].push(q);

          // Extract personal info questions (A1 level, about name, age, gender, profession, family)
          if (
            questionLevel === 'A1' &&
            questionCategory === 'GENERAL' &&
            (q.question || q.text || q.questionText) &&
            typeof (q.question || q.text || q.questionText) === 'string'
          ) {
            const questionText = (q.question || q.text || q.questionText).toLowerCase();
            if (
              questionText.includes('nom') ||
              questionText.includes('prénom') ||
              questionText.includes('appelle') ||
              questionText.includes('âge') ||
              questionText.includes('vie') ||
              questionText.includes('ans') ||
              questionText.includes('sexe') ||
              questionText.includes('genre') ||
              questionText.includes('profession') ||
              questionText.includes('travail') ||
              questionText.includes('métier') ||
              questionText.includes('famille') ||
              questionText.includes('frère') ||
              questionText.includes('sœur') ||
              questionText.includes('sibling') ||
              questionText.includes('présente')
            ) {
              personalInfoQuestions.push(q);
            }
          }
        });
      });

      console.log(`📊 Questions organized:`);
      console.log(`   - Personal Info (A1): ${personalInfoQuestions.length}`);
      console.log(`   - A1 Level: ${questionsByLevel.A1.length}`);
      console.log(`   - A2 Level: ${questionsByLevel.A2.length}`);
      console.log(`   - B1 Level: ${questionsByLevel.B1.length}`);
      console.log(`   - B2 Level: ${questionsByLevel.B2.length}`);
      console.log(`   - Categories: ${Object.keys(questionsByCategory).length}`);

      // If no questions found, use fallback
      const totalQuestions = questionsByLevel.A1.length + questionsByLevel.A2.length + 
                            questionsByLevel.B1.length + questionsByLevel.B2.length;

      if (totalQuestions === 0) {
        console.log('⚠️ No questions found in database, using fallback questions');
        const fallback = this.getDefaultProgressiveQuestions();
        return fallback;
      }

      const result = {
        personalInfo: personalInfoQuestions,
        byLevel: questionsByLevel,
        byCategory: questionsByCategory
      };

      // Cache the result
      VapiService.progressiveQuestionsCache = {
        data: result,
        timestamp: now
      };

      console.log(`📚 Progressive questions organized and cached successfully`);
      return result;

    } catch (error) {
      console.error('❌ Error getting progressive questions:', error);
      console.log('🔄 Falling back to default questions');
      return this.getDefaultProgressiveQuestions();
    }
  }

  // Legacy method for backward compatibility - now uses progressive system
  async getRandomQuestions(level: string = 'B1', count: number = 10): Promise<any[]> {
    const progressive = await this.getProgressiveQuestions();
    
    // Return questions from requested level
    let questions: any[] = [];
    const levelUpper = level.toUpperCase();
    
    if (levelUpper === 'A1') questions = progressive.byLevel.A1;
    else if (levelUpper === 'A2') questions = progressive.byLevel.A2;
    else if (levelUpper === 'B1') questions = progressive.byLevel.B1;
    else if (levelUpper === 'B2') questions = progressive.byLevel.B2;
    else questions = progressive.byLevel.B1; // Default to B1

    // Shuffle and return requested count
    const shuffled = questions.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  // Default progressive questions (only used when no question banks exist)
  private getDefaultProgressiveQuestions(): {
    personalInfo: any[];
    byLevel: { A1: any[]; A2: any[]; B1: any[]; B2: any[] };
    byCategory: Record<string, any[]>;
  } {
    console.log('⚠️ Using emergency fallback progressive questions - no question banks found in database');

    // Personal info questions (A1 level) - START HERE
    const personalInfoQuestions = [
      {
        id: 'personal_1',
        question: "Bonjour ! Comment vous appelez-vous ?",
        text: "Bonjour ! Comment vous appelez-vous ?",
        category: "GENERAL",
        level: "A1"
      },
      {
        id: 'personal_2',
        question: "Quel est votre âge ?",
        text: "Quel est votre âge ?",
        category: "GENERAL",
        level: "A1"
      },
      {
        id: 'personal_3',
        question: "Quelle est votre profession ?",
        text: "Quelle est votre profession ?",
        category: "GENERAL",
        level: "A1"
      },
      {
        id: 'personal_4',
        question: "Avez-vous des frères et sœurs ?",
        text: "Avez-vous des frères et sœurs ?",
        category: "GENERAL",
        level: "A1"
      },
      {
        id: 'personal_5',
        question: "Où habitez-vous ?",
        text: "Où habitez-vous ?",
        category: "GENERAL",
        level: "A1"
      }
    ];

    // A1 level questions
    const a1Questions = [
      ...personalInfoQuestions,
      {
        id: 'a1_1',
        question: "Que faites-vous pendant votre temps libre ?",
        text: "Que faites-vous pendant votre temps libre ?",
        category: "GENERAL",
        level: "A1"
      },
      {
        id: 'a1_2',
        question: "Quels sont vos hobbies ?",
        text: "Quels sont vos hobbies ?",
        category: "GENERAL",
        level: "A1"
      }
    ];

    // A2 level questions
    const a2Questions = [
      {
        id: 'a2_1',
        question: "Parlez-moi de votre famille.",
        text: "Parlez-moi de votre famille.",
        category: "GENERAL",
        level: "A2"
      },
      {
        id: 'a2_2',
        question: "Décrivez votre journée typique.",
        text: "Décrivez votre journée typique.",
        category: "GENERAL",
        level: "A2"
      },
      {
        id: 'a2_3',
        question: "Qu'est-ce que vous aimez faire le weekend ?",
        text: "Qu'est-ce que vous aimez faire le weekend ?",
        category: "GENERAL",
        level: "A2"
      }
    ];

    // B1 level questions
    const b1Questions = [
      {
        id: 'b1_1',
        question: "Parlez-moi de vos projets d'avenir.",
        text: "Parlez-moi de vos projets d'avenir.",
        category: "GENERAL",
        level: "B1"
      },
      {
        id: 'b1_2',
        question: "Quelle est votre expérience professionnelle ?",
        text: "Quelle est votre expérience professionnelle ?",
        category: "WORK",
        level: "B1"
      },
      {
        id: 'b1_3',
        question: "Pourquoi apprenez-vous le français ?",
        text: "Pourquoi apprenez-vous le français ?",
        category: "GENERAL",
        level: "B1"
      },
      {
        id: 'b1_4',
        question: "Parlez-moi de vos projets d'immigration.",
        text: "Parlez-moi de vos projets d'immigration.",
        category: "IMMIGRATION",
        level: "B1"
      }
    ];

    // B2 level questions
    const b2Questions = [
      {
        id: 'b2_1',
        question: "Comment envisagez-vous votre intégration dans la société francophone ?",
        text: "Comment envisagez-vous votre intégration dans la société francophone ?",
        category: "IMMIGRATION",
        level: "B2"
      },
      {
        id: 'b2_2',
        question: "Quels sont les défis que vous anticipez dans votre nouveau pays ?",
        text: "Quels sont les défis que vous anticipez dans votre nouveau pays ?",
        category: "IMMIGRATION",
        level: "B2"
      },
      {
        id: 'b2_3',
        question: "Décrivez votre vision de carrière à long terme.",
        text: "Décrivez votre vision de carrière à long terme.",
        category: "WORK",
        level: "B2"
      }
    ];

    const byCategory: Record<string, any[]> = {
      GENERAL: [...a1Questions.filter(q => q.category === 'GENERAL'), ...a2Questions.filter(q => q.category === 'GENERAL'), ...b1Questions.filter(q => q.category === 'GENERAL')],
      WORK: [...b1Questions.filter(q => q.category === 'WORK'), ...b2Questions.filter(q => q.category === 'WORK')],
      IMMIGRATION: [...b1Questions.filter(q => q.category === 'IMMIGRATION'), ...b2Questions.filter(q => q.category === 'IMMIGRATION')]
    };

    return {
      personalInfo: personalInfoQuestions,
      byLevel: {
        A1: a1Questions,
        A2: a2Questions,
        B1: b1Questions,
        B2: b2Questions
      },
      byCategory
    };
  }

  // Legacy method for backward compatibility
  private getDefaultQuestions(level: string = 'B1', count: number = 10): any[] {
    const progressive = this.getDefaultProgressiveQuestions();
    let questions: any[] = [];
    
    const levelUpper = level.toUpperCase();
    if (levelUpper === 'A1') questions = progressive.byLevel.A1;
    else if (levelUpper === 'A2') questions = progressive.byLevel.A2;
    else if (levelUpper === 'B1') questions = progressive.byLevel.B1;
    else if (levelUpper === 'B2') questions = progressive.byLevel.B2;
    else questions = progressive.byLevel.B1;

    return questions.slice(0, count);
  }
}

export default new VapiService();
