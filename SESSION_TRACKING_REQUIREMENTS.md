# Session Tracking & Management Requirements

## Current Implementation Analysis

### Database Schema
- **VoiceSimulation Model**: Has status field (SCHEDULED, ACTIVE, COMPLETED, CANCELLED)
- **AIFeedback Model**: Linked to VoiceSimulation via `voiceSimulationId`
- **No EXPIRED status** currently exists
- **No automatic expiration logic** when scheduledDate passes

### Current Session Validation
- Sessions are tracked by status only
- No validation that AIFeedback exists for a session to be "valid"
- Session counting doesn't check for feedback existence

### Current Limitations
1. No EXPIRED status for past-due sessions
2. No automatic status update when scheduledDate passes
3. Session validity not tied to AIFeedback existence
4. No reschedule functionality for expired sessions
5. No delete functionality for cancelled sessions
6. Session counting doesn't respect feedback requirement

## New Requirements

### 1. Session Validity Logic
- **A session is only valid if AIFeedback exists**
- Even if user schedules multiple sessions, they don't count until AI provides feedback
- PRO/PREMIUM users: Maximum 2 feedbacks per user (2 valid sessions)

### 2. Expired Sessions
- When `scheduledDate` passes, status should automatically change to `EXPIRED`
- Users should be able to reschedule expired sessions
- Expired sessions should not count toward session limits

### 3. Cancelled Sessions
- Users should be able to delete cancelled sessions
- Cancelled sessions should not count toward session limits

## Implementation Plan

### Phase 1: Database Schema Updates
1. Add `EXPIRED` to `VoiceSimulationStatus` enum
2. Run Prisma migration

### Phase 2: Backend Logic
1. Create cron job/service to mark sessions as EXPIRED when scheduledDate passes
2. Update session validation: Check for AIFeedback existence
3. Update session counting: Only count sessions with AIFeedback
4. Add reschedule endpoint for EXPIRED sessions
5. Add delete endpoint for CANCELLED sessions

### Phase 3: Frontend Updates
1. Update booking page to show reschedule option for EXPIRED
2. Update booking page to show delete option for CANCELLED
3. Update session counting logic to filter by AIFeedback
4. Update status display to include EXPIRED


