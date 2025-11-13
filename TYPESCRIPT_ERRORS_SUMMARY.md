# TypeScript Errors Summary

## Total Errors: **833**

## Error Types Breakdown:
- **TS2551**: 814 errors - Property does not exist (should use snake_case)
- **TS2724**: 14 errors - No exported member (should use snake_case)  
- **TS2339**: 5 errors - Property does not exist on type

## Root Cause:
The Prisma schema uses **snake_case** table names (e.g., `users`, `courses`, `tests`, `live_sessions`) but the code is using **camelCase** (e.g., `user`, `course`, `test`, `liveSession`).

## Main Issues:

### 1. Prisma Model Name Mismatch (TS2551 & TS2724)
The database schema uses snake_case but code expects camelCase:

**Examples:**
- `prisma.user` → should be `prisma.users`
- `prisma.course` → should be `prisma.courses`
- `prisma.test` → should be `prisma.tests`
- `prisma.liveSession` → should be `prisma.live_sessions`
- `prisma.testAttempt` → should be `prisma.test_attempts`
- `prisma.courseEnrollment` → should be `prisma.course_enrollments`
- `prisma.voiceSimulation` → should be `prisma.voice_simulations`
- `prisma.immigrationSimulation` → should be `prisma.immigration_simulations`
- `prisma.sessionReminder` → should be `prisma.session_reminders`
- `prisma.liveSessionParticipant` → should be `prisma.live_session_participants`
- `prisma.aIFeedback` → should be `prisma.ai_feedbacks`
- `prisma.questionBank` → should be `prisma.question_banks`

### 2. Type Import Errors (TS2724)
In `src/types/index.ts`, importing camelCase types that don't exist:
- `User` → should be `users` (but Prisma doesn't export model types this way)
- `Course` → should be `courses`
- `Test` → should be `tests`
- etc.

### 3. Interface Property Errors (TS2339)
Custom interfaces missing properties:
- `LiveSessionWithDetails` missing: `id`, `date`, `title`, `duration`
- `TestWithDetails` missing: `id`

## Files with Most Errors:
1. **Services** (all service files have Prisma model name issues)
2. **Controllers** (`liveSessionController.ts`, `testController.ts`)
3. **Routes** (`voiceSimulation.ts`, `marketplace.ts`, `simulations.ts`)
4. **Types** (`src/types/index.ts`)

## Solution:
All Prisma model references need to be updated from camelCase to snake_case to match the actual database schema.

