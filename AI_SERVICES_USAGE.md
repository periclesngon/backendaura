# AI Services Usage in AURA.CA Platform

## Summary of AI Services Used Across the Platform

### 1. **AI Chat Service** (`aiChatService.ts`)
- **Primary AI**: **Mistral AI** (`mistral-small-latest`)
- **Fallback AI**: **Gemini AI** (`gemini-pro-latest`)
- **Location**: `frontend/backend/src/services/aiChatService.ts`
- **Usage**: User conversations, Q&A, French learning assistance
- **Configuration**: 
  - Max tokens: 300
  - Temperature: 0.8
  - Uses question bank only for difficult TCF/TEF questions

---

### 2. **Question Generation** (`aiService.ts` - `generateQuestions`)
- **AI Service**: **Gemini AI** (`gemini-pro-latest`)
- **Location**: `frontend/backend/src/services/aiService.ts` (line 289-1275)
- **Usage**: Generate course questions, test questions, exercises
- **Features**:
  - Batch generation for large question counts (25 per batch)
  - Supports multiple question types (multiple-choice, true-false, short-answer)
  - Category-specific prompts (grammar, vocabulary, listening, reading, writing, oral)
  - Difficulty levels (easy, medium, hard, expert)

---

### 3. **Question Extraction** (`questionBankService.ts`)
- **AI Service**: **OpenAI** (GPT models via API)
- **Location**: `frontend/backend/src/services/questionBankService.ts` (line 113-192)
- **Usage**: Extract questions from PDF documents uploaded by managers
- **Method**: `aiExtractQuestions()` - Uses OpenAI API directly
- **Note**: Requires `OPENAI_API_KEY` environment variable

---

### 4. **Voice Simulation** (`voiceSimulationService.ts`)
- **Real-time Analysis**: **OpenAI** (GPT models via API)
- **Location**: `frontend/backend/src/services/voiceSimulationService.ts` (line 1028, 1186-1252)
- **Usage**: 
  - Real-time speech analysis during voice simulations
  - Response evaluation and feedback
- **Method**: Direct OpenAI API calls for chat completions
- **Note**: Requires `OPENAI_API_KEY` environment variable

---

### 5. **Immigration Simulation** (`immigrationSimulationService.js`)
- **AI Service**: **Gemini AI** (`gemini-pro-latest`)
- **Location**: `frontend/backend/src/services/immigrationSimulationService.js` (line 612-755)
- **Usage**: 
  - Analyze user responses during immigration interviews
  - Evaluate responses on 5 criteria (relevance, completeness, clarity, language, credibility)
  - Generate detailed feedback and scores
- **Method**: `analyzeResponse()` - Uses `geminiApiManager.makeRequest()`

---

### 6. **AI Evaluation Service** (`aiEvaluationService.ts`)
- **AI Service**: **Gemini AI** (`gemini-pro-latest`)
- **Location**: `frontend/backend/src/services/aiEvaluationService.ts`
- **Usage**: Evaluate test answers, provide feedback, scoring
- **Methods**: Multiple evaluation functions using `geminiApiManager.makeRequest()`

---

### 7. **TCF/TEF Simulation** (`tcfTefSimulationService.js`)
- **AI Service**: **Gemini AI** (`gemini-pro-latest`)
- **Location**: `frontend/backend/src/services/tcfTefSimulationService.js`
- **Usage**: TCF/TEF exam simulations and question generation

---

### 8. **VAPI Service** (`vapiService.ts`)
- **Voice Provider**: **OpenAI** (for voice synthesis and transcript analysis)
- **Location**: `frontend/backend/src/services/vapiService.ts`
- **Usage**: 
  - Voice synthesis for voice simulations
  - Transcript analysis for voice interactions
- **Note**: Uses OpenAI API for chat completions and transcript analysis

---

## AI Service Configuration Summary

| Service | Primary AI | Fallback | Model | Location |
|---------|-----------|----------|-------|----------|
| **AI Chat** | Mistral AI | Gemini AI | `mistral-small-latest` | `aiChatService.ts` |
| **Question Generation** | Gemini AI | None | `gemini-pro-latest` | `aiService.ts` |
| **Question Extraction** | OpenAI | None | GPT (via API) | `questionBankService.ts` |
| **Voice Simulation** | OpenAI | None | GPT (via API) | `voiceSimulationService.ts` |
| **Immigration Simulation** | Gemini AI | None | `gemini-pro-latest` | `immigrationSimulationService.js` |
| **AI Evaluation** | Gemini AI | None | `gemini-pro-latest` | `aiEvaluationService.ts` |
| **TCF/TEF Simulation** | Gemini AI | None | `gemini-pro-latest` | `tcfTefSimulationService.js` |
| **VAPI Service** | OpenAI | None | GPT (via API) | `vapiService.ts` |

---

## Environment Variables Required

- `MISTRAL_API_KEY` - For AI Chat (primary)
- `MISTRAL_API_KEY_2` - Optional second key for rotation
- `GEMINI_API_KEY` - For question generation, immigration simulation, evaluations
- `OPENAI_API_KEY` - For question extraction, voice simulation, VAPI service

---

## Notes

1. **AI Chat** is the only service with a fallback mechanism (Mistral → Gemini)
2. **Question Generation** uses Gemini for all question types
3. **Question Extraction** and **Voice Simulation** use OpenAI directly (no manager abstraction)
4. **Immigration Simulation** uses Gemini for response analysis
5. All services have error handling, but only AI Chat has automatic fallback

