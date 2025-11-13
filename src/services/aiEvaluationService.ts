/**
 * Comprehensive AI Evaluation Service for TCF/TEF Test Categories
 * 
 * This service provides structured AI evaluation for:
 * - Vocabulaire (Vocabulary)
 * - Grammaire (Grammar)
 * - Compréhension Orale (Listening)
 * - Compréhension Écrite (Reading)
 * - Expression Écrite (Writing)
 * - Expression Orale (Speaking)
 */

import { geminiApiManager } from '../utils/geminiApiManager';
import { logger } from '../utils/logger';

export interface EvaluationRequest {
  question: {
    id: string;
    type: string;
    questionText: string;
    passage?: string; // Reading passage if applicable
    correctAnswer: any;
    category: string; // VOCABULARY, GRAMMAR, etc.
    level: string; // A1, A2, B1, B2, C1, C2
    points: number;
    options?: string[]; // For MCQ
  };
  userAnswer: string | number | boolean;
  studentLevel?: string; // Optional: student's current level
}

export interface EvaluationResponse {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  mistakes?: string[]; // List of specific mistakes identified
  corrections?: string[]; // Suggested corrections (not full rewrite)
  strengths?: string[]; // What the student did well
  comments?: string[]; // Short comments (max 3) for writing/speaking evaluations
}

export class AIEvaluationService {
  /**
   * Main evaluation method - routes to category-specific evaluators
   */
  static async evaluateAnswer(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    // For MCQ and True/False - simple comparison
    if (question.type === 'multiple-choice' || question.type === 'true-false') {
      return this.evaluateMultipleChoice(question, userAnswer);
    }
    
    // Route to category-specific evaluators
    switch (question.category.toUpperCase()) {
      case 'VOCABULARY':
      case 'VOCABULAIRE':
        return this.evaluateVocabulary(request);
      
      case 'GRAMMAR':
      case 'GRAMMAIRE':
        return this.evaluateGrammar(request);
      
      case 'READING':
      case 'COMPREHENSION_ECRITE':
        return this.evaluateReadingComprehension(request);
      
      case 'LISTENING':
      case 'COMPREHENSION_ORALE':
        return this.evaluateListeningComprehension(request);
      
      case 'WRITING':
      case 'EXPRESSION_ECRITE':
        return this.evaluateWriting(request);
      
      case 'ORAL':
      case 'EXPRESSION_ORALE':
        return this.evaluateSpeaking(request);
      
      default:
        return this.evaluateGeneric(request);
    }
  }

  /**
   * Evaluate Multiple Choice Questions
   */
  private static evaluateMultipleChoice(question: any, userAnswer: any): EvaluationResponse {
    const isCorrect = String(userAnswer) === String(question.correctAnswer);
    
    return {
      isCorrect,
      score: isCorrect ? question.points : 0,
      maxScore: question.points,
      feedback: isCorrect 
        ? 'Bonne réponse !' 
        : `Réponse incorrecte. La bonne réponse était: ${this.formatCorrectAnswer(question.correctAnswer, question.options)}`,
      strengths: isCorrect ? ['Bonne compréhension de la question'] : undefined,
      mistakes: !isCorrect ? ['Choix incorrect'] : undefined
    };
  }

  /**
   * Evaluate Vocabulary Questions
   * 
   * TCF/TEF Format:
   * - MCQ: Choose the correct word in context
   * - Fill-in-blank: Complete sentence with appropriate vocabulary
   * - Synonym/Antonym: Identify word relationships
   */
  static async evaluateVocabulary(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    try {
      const prompt = this.getVocabularyEvaluationPrompt(question, userAnswer);
      
      const response = await geminiApiManager.makeRequest(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseEvaluationResponse(response, question.points);
    } catch (error) {
      logger.error('Error evaluating vocabulary answer', { error, questionId: question.id });
      return this.getFallbackResponse(question, userAnswer);
    }
  }

  /**
   * Get comprehensive prompt for vocabulary evaluation
   */
  private static getVocabularyEvaluationPrompt(question: any, userAnswer: any): string {
    const levelInstructions = {
      'A1': 'Vocabulaire de base, mots courants du quotidien',
      'A2': 'Vocabulaire élémentaire, expressions simples',
      'B1': 'Vocabulaire intermédiaire, nuances contextuelles',
      'B2': 'Vocabulaire avancé, registres de langue',
      'C1': 'Vocabulaire riche et précis, subtilités',
      'C2': 'Vocabulaire très riche, maîtrise des nuances'
    };

    return `
Vous êtes un expert en évaluation de vocabulaire français pour les tests TCF/TEF.

CONTEXTE DE LA QUESTION:
- Catégorie: VOCABULAIRE
- Niveau: ${question.level} - ${levelInstructions[question.level as keyof typeof levelInstructions] || 'Niveau standard'}
- Type: ${question.type}
- Points maximum: ${question.points}

QUESTION:
"${question.questionText}"

${question.passage ? `PASSAGE DE CONTEXTE:\n"${question.passage}"\n` : ''}

RÉPONSE ATTENDUE:
${this.formatCorrectAnswer(question.correctAnswer, question.options)}

RÉPONSE DE L'ÉTUDIANT:
"${userAnswer}"

${question.options ? `OPTIONS DISPONIBLES:\n${question.options.map((opt: string, idx: number) => `${idx}: ${opt}`).join('\n')}\n` : ''}

INSTRUCTIONS D'ÉVALUATION POUR LE VOCABULAIRE:

1. VÉRIFICATION SÉMANTIQUE:
   - Le mot choisi correspond-il au sens attendu dans le contexte ?
   - Y a-t-il confusion avec un synonyme proche mais incorrect ?
   - Le registre de langue est-il approprié (formel/informel) ?

2. VÉRIFICATION CONTEXTUELLE:
   - Le mot s'intègre-t-il correctement dans la phrase ?
   - Les collocations sont-elles respectées (ex: "faire attention", pas "prendre attention") ?
   - La préposition associée est-elle correcte ?

3. VÉRIFICATION LEXICALE:
   - Confusion entre mots de la même famille (ex: "rapide" vs "rapidement") ?
   - Erreur de catégorie grammaticale (nom vs verbe vs adjectif) ?
   - Confusion entre mots similaires (ex: "savoir" vs "connaître") ?

4. CRITÈRES DE SCORING:
   - Réponse parfaitement correcte: 100% des points
   - Réponse partiellement correcte (bon sens mais mot incorrect): 30-50% des points
   - Réponse incorrecte mais compréhensible: 10-20% des points
   - Réponse totalement incorrecte: 0% des points

5. FORMAT DE FEEDBACK:
   - Maximum 3 commentaires courts (pas de correction complète)
   - Identifier le type d'erreur (sémantique, contextuelle, lexicale)
   - Mentionner un point fort si applicable
   - Ne pas réécrire la réponse de l'étudiant

EXEMPLES DE FEEDBACK:

✅ Réponse correcte:
"Excellent choix lexical. Le mot 'rapide' est parfaitement adapté au contexte."

⚠️ Réponse partiellement correcte:
"Le sens général est bon, mais 'courir' est un verbe alors qu'un adjectif est attendu. Le mot 'rapide' serait plus approprié."

❌ Réponse incorrecte:
"Confusion entre 'savoir' et 'connaître'. Dans ce contexte, 'connaître' est plus approprié pour parler d'une personne."

FORMAT DE RÉPONSE JSON (OBLIGATOIRE):
{
  "isCorrect": true/false,
  "score": nombre entre 0 et ${question.points},
  "maxScore": ${question.points},
  "feedback": "3 commentaires maximum, courts et précis",
  "mistakes": ["type d'erreur 1", "type d'erreur 2"] ou null,
  "corrections": ["suggestion 1", "suggestion 2"] ou null,
  "strengths": ["point fort 1"] ou null
}

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
`;
  }

  /**
   * Evaluate Grammar Questions
   * 
   * TCF/TEF Format:
   * - MCQ: Choose correct verb form, agreement, etc.
   * - Fill-in-blank: Complete with correct grammar
   * - Transformation: Transform sentence structure
   */
  static async evaluateGrammar(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    try {
      const prompt = this.getGrammarEvaluationPrompt(question, userAnswer);
      
      const response = await geminiApiManager.makeRequest(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseEvaluationResponse(response, question.points);
    } catch (error) {
      logger.error('Error evaluating grammar answer', { error, questionId: question.id });
      return this.getFallbackResponse(question, userAnswer);
    }
  }

  /**
   * Get comprehensive prompt for grammar evaluation
   */
  private static getGrammarEvaluationPrompt(question: any, userAnswer: any): string {
    const levelInstructions = {
      'A1': 'Temps présent, articles, accords basiques',
      'A2': 'Passé composé, futur proche, accords simples',
      'B1': 'Subjonctif, conditionnel, accords complexes',
      'B2': 'Subjonctif passé, gérondif, accords avancés',
      'C1': 'Concordance des temps, nuances grammaticales',
      'C2': 'Maîtrise complète, subtilités grammaticales'
    };

    return `
Vous êtes un expert en évaluation de grammaire française pour les tests TCF/TEF.

CONTEXTE DE LA QUESTION:
- Catégorie: GRAMMAIRE
- Niveau: ${question.level} - ${levelInstructions[question.level as keyof typeof levelInstructions] || 'Niveau standard'}
- Type: ${question.type}
- Points maximum: ${question.points}

QUESTION:
"${question.questionText}"

${question.passage ? `PASSAGE DE CONTEXTE:\n"${question.passage}"\n` : ''}

RÉPONSE ATTENDUE:
${this.formatCorrectAnswer(question.correctAnswer, question.options)}

RÉPONSE DE L'ÉTUDIANT:
"${userAnswer}"

${question.options ? `OPTIONS DISPONIBLES:\n${question.options.map((opt: string, idx: number) => `${idx}: ${opt}`).join('\n')}\n` : ''}

INSTRUCTIONS D'ÉVALUATION POUR LA GRAMMAIRE:

1. VÉRIFICATION DES TEMPS VERBAUX:
   - Le temps utilisé correspond-il au contexte temporel ?
   - La concordance des temps est-elle respectée ?
   - Les marqueurs temporels sont-ils cohérents (hier → passé, demain → futur) ?

2. VÉRIFICATION DES ACCORDS:
   - Accord sujet-verbe (singulier/pluriel)
   - Accord participe passé (avec être/avoir, COD placé avant)
   - Accord adjectif-nom (genre et nombre)
   - Accord déterminant-nom

3. VÉRIFICATION DE LA SYNTAXE:
   - Ordre des mots (SVO en français)
   - Placement des pronoms (me, te, le, la, les, lui, leur, y, en)
   - Structure des phrases complexes (subordonnées)
   - Négation (ne...pas, ne...jamais, etc.)

4. VÉRIFICATION DES MODES:
   - Indicatif vs Subjonctif (après "il faut que", "bien que", etc.)
   - Conditionnel pour la politesse ou l'hypothèse
   - Impératif pour les ordres

5. CRITÈRES DE SCORING:
   - Réponse parfaitement correcte: 100% des points
   - Réponse avec erreur mineure (orthographe, accord simple): 70-80% des points
   - Réponse avec erreur modérée (temps incorrect mais compréhensible): 40-60% des points
   - Réponse avec erreur majeure (syntaxe, mode): 10-30% des points
   - Réponse totalement incorrecte: 0% des points

6. FORMAT DE FEEDBACK:
   - Maximum 3 commentaires courts
   - Identifier le type d'erreur grammaticale (temps, accord, syntaxe, mode)
   - Mentionner la règle grammaticale concernée (sans donner la réponse complète)
   - Ne pas réécrire la réponse de l'étudiant

EXEMPLES DE FEEDBACK:

✅ Réponse correcte:
"Excellent ! Vous avez bien maîtrisé l'accord du participe passé avec 'être'."

⚠️ Réponse avec erreur mineure:
"Bonne compréhension du temps, mais attention à l'accord : 'fatigué' s'accorde avec le sujet 'je' (masculin)."

❌ Réponse avec erreur majeure:
"Le temps verbal n'est pas approprié. Avec 'hier soir', on utilise le passé composé, pas le présent."

FORMAT DE RÉPONSE JSON (OBLIGATOIRE):
{
  "isCorrect": true/false,
  "score": nombre entre 0 et ${question.points},
  "maxScore": ${question.points},
  "feedback": "3 commentaires maximum, courts et précis",
  "mistakes": ["type d'erreur grammaticale 1", "type d'erreur 2"] ou null,
  "corrections": ["suggestion de règle à revoir"] ou null,
  "strengths": ["point fort grammatical"] ou null
}

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
`;
  }

  /**
   * Evaluate Reading Comprehension (Compréhension Écrite)
   * Comprehensive MCQ evaluation based on long passages (500-2000+ words)
   */
  private static async evaluateReadingComprehension(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    try {
      // For MCQ questions, use standard evaluation
      if (question.type === 'multiple-choice' || question.type === 'true-false') {
        return this.evaluateMultipleChoice(question, userAnswer);
      }
      
      // For short-answer questions, use AI evaluation
      const prompt = this.getReadingComprehensionEvaluationPrompt(question, userAnswer);
      
      const response = await geminiApiManager.makeRequest(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseEvaluationResponse(response, question.points);
    } catch (error) {
      logger.error('Error evaluating reading comprehension answer', { error, questionId: question.id });
      return this.getFallbackResponse(question, userAnswer);
    }
  }

  /**
   * Get prompt for Reading Comprehension evaluation
   */
  private static getReadingComprehensionEvaluationPrompt(question: any, userAnswer: any): string {
    return `
Vous êtes un expert en évaluation de compréhension écrite pour les tests TCF/TEF.

CONTEXTE DE LA QUESTION:
- Catégorie: COMPRÉHENSION ÉCRITE
- Passage (long, 500-2000+ mots): "${(question.passage || 'Passage non fourni').substring(0, 1000)}${question.passage && question.passage.length > 1000 ? '...[passage tronqué]' : ''}"
- Question: "${question.questionText || question.question}"
- Réponse attendue: ${this.formatCorrectAnswer(question.correctAnswer, question.options)}
- Réponse de l'étudiant: "${userAnswer}"
- Points maximum: ${question.points || 1}
- Niveau: ${question.level || 'B1'}

INSTRUCTIONS D'ÉVALUATION:
- Évaluez la compréhension du passage long (500-2000+ mots)
- Vérifiez si la réponse démontre une compréhension approfondie du texte
- Pour les questions à réponse courte, évaluez la précision et la pertinence
- Format TCF/TEF strict: évaluation complète et robuste

FORMAT DE RÉPONSE JSON (OBLIGATOIRE):
{
  "isCorrect": true/false,
  "score": nombre entre 0 et ${question.points},
  "maxScore": ${question.points},
  "feedback": "Commentaire sur la compréhension (2-3 phrases)",
  "comments": [
    "Commentaire 1 (max 3 commentaires courts)",
    "Commentaire 2",
    "Commentaire 3"
  ]
}

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
`;
  }

  /**
   * Evaluate Listening Comprehension (placeholder - to be implemented)
   */
  private static async evaluateListeningComprehension(request: EvaluationRequest): Promise<EvaluationResponse> {
    // TODO: Implement listening comprehension evaluation
    return this.evaluateGeneric(request);
  }

  /**
   * Evaluate Writing (Expression Écrite) - Expert-level evaluation like master class university teacher
   * 
   * TCF/TEF Format:
   * - Students write articles, essays, or letters based on passages
   * - Evaluation criteria: Vocabulary, Grammar, Structure, Content, Coherence
   * - Expert-level feedback similar to master class university teacher
   */
  private static async evaluateWriting(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    try {
      const prompt = this.getWritingEvaluationPrompt(question, userAnswer);
      
      const response = await geminiApiManager.makeRequest(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseWritingEvaluationResponse(response, question.points);
    } catch (error) {
      logger.error('Error evaluating writing answer', { error, questionId: question.id });
      return this.getFallbackResponse(question, userAnswer);
    }
  }

  /**
   * Get comprehensive prompt for Expression Écrite evaluation (Master Class University Teacher Level)
   */
  private static getWritingEvaluationPrompt(question: any, userAnswer: any): string {
    const levelInstructions = {
      'A1': 'Vocabulaire basique, structures simples, phrases courtes',
      'A2': 'Vocabulaire courant, structures de base, cohérence simple',
      'B1': 'Vocabulaire varié, structures complexes, argumentation basique',
      'B2': 'Vocabulaire riche, structures avancées, argumentation développée',
      'C1': 'Vocabulaire précis et nuancé, maîtrise syntaxique, argumentation sophistiquée',
      'C2': 'Maîtrise complète, expression nuancée, créativité et originalité'
    };

    const writingTypeNames: Record<string, string> = {
      'article': 'article',
      'essay': 'essai',
      'letter': 'lettre'
    };
    const writingType = writingTypeNames[question.writingType || 'essay'] || 'texte';

    return `
Vous êtes un professeur expert de niveau master class universitaire spécialisé en Expression Écrite française pour les tests TCF/TEF.

CONTEXTE DE L'ÉVALUATION:
- Type d'écriture: ${writingType}
- Sujet/Prompt: "${question.questionText || question.question || 'Expression écrite'}"
- Passage de référence: "${question.passage || 'Aucun passage fourni'}"
- Réponse de l'étudiant: "${userAnswer}"
- Niveau attendu: ${question.level || 'B1'} - ${levelInstructions[question.level as keyof typeof levelInstructions] || 'Niveau standard'}
- Points maximum: ${question.points || 10}
- Limites de mots: ${question.minWords || 0}-${question.maxWords || Infinity} mots

CRITÈRES D'ÉVALUATION TCF/TEF (selon les standards officiels):

1. VOCABULAIRE (0-100):
   - Richesse et variété du vocabulaire
   - Choix approprié des mots selon le contexte
   - Registre de langue (formel/informel) adapté
   - Précision et nuances sémantiques
   - Absence de répétitions excessives

2. GRAMMAIRE (0-100):
   - Correction grammaticale (conjugaison, accords)
   - Utilisation appropriée des temps verbaux
   - Accords (genre, nombre, participe passé)
   - Structures syntaxiques variées et correctes
   - Maîtrise des modes (indicatif, subjonctif, conditionnel)

3. STRUCTURE (0-100):
   - Organisation claire (introduction, développement, conclusion)
   - Paragraphes bien structurés et cohérents
   - Utilisation appropriée des connecteurs logiques
   - Progression logique des idées
   - Longueur appropriée selon le type d'écriture

4. CONTENU (0-100):
   - Pertinence par rapport au prompt/sujet
   - Développement des idées
   - Utilisation du passage de référence (si fourni)
   - Originalité et créativité
   - Respect des consignes (type d'écriture, longueur)

5. COHÉRENCE (0-100):
   - Enchaînement logique des idées
   - Cohérence globale du texte
   - Fluidité de la lecture
   - Respect de la structure attendue pour le type d'écriture
   - Clarté du message

CALCUL DU SCORE GLOBAL:
- Score global = (Vocabulaire × 0.25) + (Grammaire × 0.25) + (Structure × 0.20) + (Contenu × 0.15) + (Cohérence × 0.15)
- Convertir en points sur ${question.points}: Score = (Score global / 100) × ${question.points}

FORMAT DE RÉPONSE JSON (OBLIGATOIRE):
{
  "isCorrect": true/false,
  "score": nombre entre 0 et ${question.points},
  "maxScore": ${question.points},
  "feedback": "Commentaire global constructif (2-3 phrases)",
  "comments": [
    "Commentaire 1: Point fort ou amélioration (max 3 commentaires courts)",
    "Commentaire 2: Point fort ou amélioration",
    "Commentaire 3: Point fort ou amélioration"
  ],
  "detailedEvaluation": {
    "vocabulary": {
      "score": 0-100,
      "feedback": "Commentaire sur le vocabulaire",
      "strengths": ["Point fort 1", "Point fort 2"] ou null,
      "improvements": ["Amélioration 1", "Amélioration 2"] ou null
    },
    "grammar": {
      "score": 0-100,
      "feedback": "Commentaire sur la grammaire",
      "errors": ["Type d'erreur 1", "Type d'erreur 2"] ou null,
      "corrections": ["Suggestion 1", "Suggestion 2"] ou null
    },
    "structure": {
      "score": 0-100,
      "feedback": "Commentaire sur la structure",
      "strengths": ["Point fort structurel"] ou null,
      "improvements": ["Amélioration structurelle"] ou null
    },
    "content": {
      "score": 0-100,
      "feedback": "Commentaire sur le contenu",
      "relevance": "Pertinence par rapport au sujet",
      "development": "Qualité du développement des idées"
    },
    "coherence": {
      "score": 0-100,
      "feedback": "Commentaire sur la cohérence",
      "flow": "Fluidité et enchaînement des idées"
    }
  },
  "overallLevel": "A1/A2/B1/B2/C1/C2",
  "strengths": ["Point fort global 1", "Point fort global 2"] ou null,
  "improvements": ["Amélioration globale 1", "Amélioration globale 2"] ou null
}

EXEMPLES D'ÉVALUATION:

✅ Texte de niveau B2 (excellent):
- Vocabulaire: 85/100 (Riche et varié, quelques nuances à améliorer)
- Grammaire: 90/100 (Très bonne maîtrise, erreurs mineures)
- Structure: 80/100 (Bien organisé, transitions à renforcer)
- Contenu: 85/100 (Pertinent et bien développé)
- Cohérence: 85/100 (Fluide et logique)
Score global: 85/100

⚠️ Texte de niveau B1 (correct mais à améliorer):
- Vocabulaire: 70/100 (Correct mais répétitif, manque de variété)
- Grammaire: 65/100 (Erreurs fréquentes mais compréhensible)
- Structure: 70/100 (Organisation basique, manque de connecteurs)
- Contenu: 75/100 (Pertinent mais développement limité)
- Cohérence: 70/100 (Idées liées mais transitions simples)
Score global: 70/100

❌ Texte de niveau A2 (à améliorer):
- Vocabulaire: 55/100 (Vocabulaire basique, répétitions nombreuses)
- Grammaire: 50/100 (Erreurs fréquentes, structures simples)
- Structure: 60/100 (Organisation minimale)
- Contenu: 65/100 (Répond partiellement au sujet)
- Cohérence: 55/100 (Enchaînement des idées à améliorer)
Score global: 57/100

INSTRUCTIONS IMPORTANTES:
- Sois constructif et encourageant
- Identifie les points forts ET les améliorations
- Utilise un langage professionnel mais accessible
- Respecte les standards TCF/TEF officiels
- Les commentaires doivent être courts (max 50 mots chacun)
- Ne réécris PAS le texte de l'étudiant, donne seulement des commentaires
- Fournis des exemples concrets quand utile
- Évalue comme un professeur expert de niveau master class universitaire

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
`;
  }

  /**
   * Parse Expression Écrite evaluation response
   */
  private static parseWritingEvaluationResponse(response: string, maxPoints: number): EvaluationResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Extract detailed scores
      const detailed = parsed.detailedEvaluation || {};
      const vocabulary = detailed.vocabulary?.score || 0;
      const grammar = detailed.grammar?.score || 0;
      const structure = detailed.structure?.score || 0;
      const content = detailed.content?.score || 0;
      const coherence = detailed.coherence?.score || 0;

      // Calculate overall score (weighted average)
      const overallScore = (
        vocabulary * 0.25 +
        grammar * 0.25 +
        structure * 0.20 +
        content * 0.15 +
        coherence * 0.15
      );

      // Convert to points
      const score = Math.round((overallScore / 100) * maxPoints);

      // Build comments array
      const comments: string[] = [];
      if (parsed.comments && Array.isArray(parsed.comments)) {
        comments.push(...parsed.comments.slice(0, 3));
      }
      if (parsed.strengths && Array.isArray(parsed.strengths)) {
        parsed.strengths.forEach((s: string) => {
          if (comments.length < 3) comments.push(`✅ ${s}`);
        });
      }
      if (parsed.improvements && Array.isArray(parsed.improvements)) {
        parsed.improvements.forEach((i: string) => {
          if (comments.length < 3) comments.push(`💡 ${i}`);
        });
      }

      return {
        isCorrect: score >= maxPoints * 0.5, // 50% threshold
        score,
        maxScore: maxPoints,
        feedback: parsed.feedback || 'Évaluation complétée',
        comments: comments.slice(0, 3) // Max 3 comments
      };
    } catch (error) {
      logger.error('Failed to parse writing evaluation response', { response, error });
      return {
        isCorrect: false,
        score: 0,
        maxScore: maxPoints,
        feedback: 'Erreur lors de l\'évaluation. Veuillez réessayer.',
        comments: []
      };
    }
  }

  /**
   * Evaluate Speaking (Expression Orale) - TCF/TEF Expert Evaluation
   * 
   * TCF/TEF Format:
   * - Students record audio responses to topics (sujets)
   * - Evaluation criteria: Pronunciation, Grammar, Fluency, Vocabulary, Relevance
   * - Expert-level feedback similar to TCF/TEF examiners
   */
  private static async evaluateSpeaking(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    
    try {
      // userAnswer format: "transcription|AUDIO_URL:url" or just "transcription"
      let transcription = '';
      let audioUrl = '';
      
      if (typeof userAnswer === 'string') {
        // Check if answer contains audio URL
        if (userAnswer.includes('|AUDIO_URL:')) {
          const parts = userAnswer.split('|AUDIO_URL:');
          transcription = parts[0] || '';
          audioUrl = parts[1] || '';
        } else if (userAnswer.startsWith('http') || userAnswer.startsWith('data:')) {
          // If it's just a URL, we'll need to transcribe it
          audioUrl = userAnswer;
          transcription = ''; // Will be transcribed if needed
        } else {
          transcription = userAnswer;
        }
      } else {
        transcription = String(userAnswer);
      }
      
      // If we have audio URL but no transcription, try to get transcription
      // For now, we'll use the transcription if available, otherwise use a placeholder
      if (audioUrl && !transcription) {
        // TODO: Implement audio transcription from URL
        // For now, we'll evaluate based on what we have
        transcription = '[Audio enregistré - transcription en cours]';
      }

      const prompt = this.getSpeakingEvaluationPrompt(question, transcription);
      
      const response = await geminiApiManager.makeRequest(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      return this.parseSpeakingEvaluationResponse(response, question.points);
    } catch (error) {
      logger.error('Error evaluating speaking answer', { error, questionId: question.id });
      return this.getFallbackResponse(question, userAnswer);
    }
  }

  /**
   * Get comprehensive prompt for Expression Orale evaluation (TCF/TEF standards)
   */
  private static getSpeakingEvaluationPrompt(question: any, transcription: string): string {
    return `
Vous êtes un examinateur expert TCF/TEF spécialisé en Expression Orale (Speaking).

CONTEXTE DE L'ÉVALUATION:
- Sujet/Question: "${question.questionText || question.question || 'Expression orale'}"
- Transcription de la réponse: "${transcription}"
- Niveau attendu: ${question.level || 'B1'}
- Points maximum: ${question.points || 10}

CRITÈRES D'ÉVALUATION TCF/TEF (selon les standards officiels):

1. PRONONCIATION (0-100):
   - Clarté de l'articulation
   - Accent et intonation
   - Respect des règles phonétiques françaises
   - Compréhensibilité globale

2. GRAMMAIRE (0-100):
   - Correction grammaticale
   - Utilisation appropriée des temps verbaux
   - Accords (genre, nombre)
   - Structures syntaxiques

3. FLUIDITÉ (0-100):
   - Débit de parole naturel
   - Absence d'hésitations excessives
   - Utilisation de connecteurs logiques
   - Cohérence du discours

4. VOCABULAIRE (0-100):
   - Richesse lexicale
   - Précision du vocabulaire
   - Registre de langue approprié
   - Variété des expressions

5. PERTINENCE (0-100):
   - Réponse à la question posée
   - Respect du sujet
   - Développement des idées
   - Communication efficace

CALCUL DU SCORE GLOBAL:
- Score global = (Prononciation × 0.25) + (Grammaire × 0.25) + (Fluidité × 0.20) + (Vocabulaire × 0.15) + (Pertinence × 0.15)
- Convertir en points sur ${question.points}: Score = (Score global / 100) × ${question.points}

FORMAT DE RÉPONSE JSON (OBLIGATOIRE):
{
  "isCorrect": true/false,
  "score": nombre entre 0 et ${question.points},
  "maxScore": ${question.points},
  "feedback": "Commentaire global constructif (2-3 phrases)",
  "comments": [
    "Commentaire 1: Point fort ou amélioration (max 3 commentaires)",
    "Commentaire 2: Point fort ou amélioration",
    "Commentaire 3: Point fort ou amélioration"
  ],
  "detailedEvaluation": {
    "pronunciation": {
      "score": 0-100,
      "feedback": "Commentaire sur la prononciation"
    },
    "grammar": {
      "score": 0-100,
      "feedback": "Commentaire sur la grammaire",
      "errors": ["Erreur 1", "Erreur 2"] ou null
    },
    "fluency": {
      "score": 0-100,
      "feedback": "Commentaire sur la fluidité",
      "wordsPerMinute": nombre estimé
    },
    "vocabulary": {
      "score": 0-100,
      "feedback": "Commentaire sur le vocabulaire",
      "level": "A1/A2/B1/B2/C1/C2"
    },
    "relevance": {
      "score": 0-100,
      "feedback": "Commentaire sur la pertinence"
    }
  },
  "overallLevel": "A1/A2/B1/B2/C1/C2",
  "strengths": ["Point fort 1", "Point fort 2"] ou null,
  "improvements": ["Amélioration 1", "Amélioration 2"] ou null
}

EXEMPLES D'ÉVALUATION:

✅ Réponse de niveau B1 (bonne):
- Prononciation: 75/100 (Claire, quelques accents à améliorer)
- Grammaire: 80/100 (Bonnes structures, quelques erreurs mineures)
- Fluidité: 70/100 (Débit naturel, quelques hésitations)
- Vocabulaire: 75/100 (Vocabulaire approprié, pourrait être plus riche)
- Pertinence: 85/100 (Répond bien au sujet, idées développées)
Score global: 76/100

❌ Réponse de niveau A2 (à améliorer):
- Prononciation: 60/100 (Compréhensible mais accent marqué)
- Grammaire: 55/100 (Erreurs fréquentes, structures simples)
- Fluidité: 50/100 (Hésitations nombreuses, débit lent)
- Vocabulaire: 60/100 (Vocabulaire basique, répétitions)
- Pertinence: 65/100 (Répond partiellement au sujet)
Score global: 58/100

INSTRUCTIONS IMPORTANTES:
- Sois constructif et encourageant
- Identifie les points forts ET les améliorations
- Utilise un langage professionnel mais accessible
- Respecte les standards TCF/TEF officiels
- Les commentaires doivent être courts (max 50 mots chacun)

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.
`;
  }

  /**
   * Parse speaking evaluation response from AI
   */
  private static parseSpeakingEvaluationResponse(response: string, maxPoints: number): EvaluationResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Extract detailed scores
      const detailed = parsed.detailedEvaluation || {};
      const pronunciation = detailed.pronunciation?.score || 0;
      const grammar = detailed.grammar?.score || 0;
      const fluency = detailed.fluency?.score || 0;
      const vocabulary = detailed.vocabulary?.score || 0;
      const relevance = detailed.relevance?.score || 0;

      // Calculate overall score (weighted average)
      const overallScore = (
        pronunciation * 0.25 +
        grammar * 0.25 +
        fluency * 0.20 +
        vocabulary * 0.15 +
        relevance * 0.15
      );

      // Convert to points
      const score = Math.round((overallScore / 100) * maxPoints);

      // Build comments array
      const comments: string[] = [];
      if (parsed.comments && Array.isArray(parsed.comments)) {
        comments.push(...parsed.comments.slice(0, 3));
      }
      if (parsed.strengths && Array.isArray(parsed.strengths)) {
        parsed.strengths.forEach((s: string) => {
          if (comments.length < 3) comments.push(`✅ ${s}`);
        });
      }
      if (parsed.improvements && Array.isArray(parsed.improvements)) {
        parsed.improvements.forEach((i: string) => {
          if (comments.length < 3) comments.push(`💡 ${i}`);
        });
      }

      return {
        isCorrect: score >= maxPoints * 0.5, // 50% threshold
        score,
        maxScore: maxPoints,
        feedback: parsed.feedback || 'Évaluation complétée',
        comments: comments.slice(0, 3) // Max 3 comments
      };
    } catch (error) {
      logger.error('Failed to parse speaking evaluation response', { response, error });
      return {
        isCorrect: false,
        score: 0,
        maxScore: maxPoints,
        feedback: 'Erreur lors de l\'évaluation. Veuillez réessayer.',
        comments: []
      };
    }
  }

  /**
   * Generic evaluation fallback
   */
  private static async evaluateGeneric(request: EvaluationRequest): Promise<EvaluationResponse> {
    const { question, userAnswer } = request;
    return this.getFallbackResponse(question, userAnswer);
  }

  /**
   * Parse AI response into EvaluationResponse
   */
  private static parseEvaluationResponse(response: string, maxPoints: number): EvaluationResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isCorrect: parsed.isCorrect || false,
          score: Math.min(Math.max(0, parsed.score || 0), maxPoints),
          maxScore: maxPoints,
          feedback: parsed.feedback || 'Évaluation effectuée.',
          mistakes: parsed.mistakes || undefined,
          corrections: parsed.corrections || undefined,
          strengths: parsed.strengths || undefined
        };
      }
    } catch (error) {
      logger.warn('Failed to parse evaluation response', { error, response });
    }
    
    return {
      isCorrect: false,
      score: 0,
      maxScore: maxPoints,
      feedback: 'Erreur lors de l\'évaluation automatique.'
    };
  }

  /**
   * Fallback response when AI evaluation fails
   */
  private static getFallbackResponse(question: any, userAnswer: any): EvaluationResponse {
    const isCorrect = String(userAnswer).toLowerCase().trim() === String(question.correctAnswer).toLowerCase().trim();
    
    return {
      isCorrect,
      score: isCorrect ? question.points : 0,
      maxScore: question.points,
      feedback: isCorrect ? 'Réponse correcte.' : 'Réponse incorrecte.'
    };
  }

  /**
   * Format correct answer for display
   */
  private static formatCorrectAnswer(correctAnswer: any, options?: string[]): string {
    if (options && typeof correctAnswer === 'number') {
      return options[correctAnswer] || String(correctAnswer);
    }
    return String(correctAnswer);
  }
}

