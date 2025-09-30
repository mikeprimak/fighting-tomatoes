# Prediction System Integration Log

## Current Issue
**Problem**: PredictionModal alerts "invalid prediction data" when user selects only winner, round, or method without selecting a hype level.

**Expected Behavior**: Modal should accept submission if user selects one/many/all/none of: winner, round, method, hype.

## Investigation Log

### 2025-09-29 - Initial Debugging

#### 1. Frontend Validation Check (PredictionModal.tsx)
- **File**: `packages/mobile/components/PredictionModal.tsx`
- **Lines 368-387**: `handleSubmitPrediction` function
- **Finding**: Frontend validation looks correct:
  ```typescript
  const hasAnyPrediction = hypeLevel > 0 || predictedWinner || predictedMethod || predictedRound > 0;
  ```
  - Properly checks for at least one field
  - Creates `predictionData` object with `undefined` for empty values:
    ```typescript
    hypeLevel: hypeLevel > 0 ? hypeLevel : undefined,
    predictedWinner: predictedWinner || undefined,
    predictedMethod: predictedMethod || undefined,
    predictedRound: predictedRound > 0 ? predictedRound : undefined,
    ```

#### 2. API Service Check (api.ts)
- **File**: `packages/mobile/services/api.ts`
- **Lines 369-378**: `createFightPrediction` method
- **Finding**: API call structure looks correct
  - All fields are optional: `predictedRating?`, `predictedWinner?`, `predictedMethod?`, `predictedRound?`
  - Sends data via POST to `/fights/${fightId}/prediction`

#### 3. Backend Validation Check (fights.ts)
- **File**: `packages/backend/src/routes/fights.ts`
- **Lines 90-95**: `CreatePredictionSchema` (Zod schema)
  ```typescript
  const CreatePredictionSchema = z.object({
    predictedRating: z.number().int().min(1).max(10).optional(), // hype level (optional)
    predictedWinner: z.string().uuid().optional(), // fighter1Id or fighter2Id
    predictedMethod: z.nativeEnum(PredictionMethod).optional(),
    predictedRound: z.number().int().min(1).max(12).optional(), // up to 12 rounds for boxing
  });
  ```
  - **Finding**: Schema correctly marks all fields as `.optional()`

- **Lines 1162-1192**: POST `/fights/:id/prediction` endpoint
  - **Line 1186 - POTENTIAL BUG FOUND**:
    ```typescript
    const hasAnyPrediction = predictedRating || predictedWinner || predictedMethod || predictedRound;
    ```
  - **Issue**: This check uses falsy evaluation
  - **Problem**: When `predictedRound` is `0` (deselected state), it's treated as falsy
  - **Impact**: If user sends `{ predictedWinner: "uuid", predictedRound: 0 }`, the backend rejects it

## Fixes Applied

### Fix #1: Backend Validation Logic
- **File**: `packages/backend/src/routes/fights.ts`
- **Lines**: 1185-1196
- **Change**: Updated `hasAnyPrediction` check from falsy evaluation to explicit undefined check
- **Before**:
  ```typescript
  const hasAnyPrediction = predictedRating || predictedWinner || predictedMethod || predictedRound;
  ```
- **After**:
  ```typescript
  const hasAnyPrediction =
    predictedRating !== undefined ||
    predictedWinner !== undefined ||
    predictedMethod !== undefined ||
    predictedRound !== undefined;
  ```
- **Reason**: Original code treated `0` as falsy, rejecting valid predictions where round wasn't selected

## Issues Encountered

### Issue #1: TypeScript Compilation Errors in crews.ts
- **Error Location**: `src/routes/crews.ts`
- **Errors**:
  1. Line 654: `Type 'number | undefined' is not assignable to type 'number'`
  2. Lines 730-731: Property 'user' does not exist on prediction type
- **Root Cause**:
  - Prisma schema had `hypeLevel Int` (required) for CrewPrediction
  - But validation schema allowed optional hypeLevel
  - Mismatch between schema and TypeScript types
- **Resolution**: ✅ Fixed
  1. Updated Prisma schema to make `hypeLevel Int?` (optional)
  2. Fixed validation logic in crews.ts (line 556) to use `!== undefined` instead of falsy check
  3. Ran `prisma db push` to sync database and regenerate Prisma client

## Summary of Changes

### ✅ Completed Fixes
1. **Backend validation in fights.ts** (Line 1185-1196)
   - Changed from falsy check to `!== undefined` check
2. **Backend validation in crews.ts** (Line 555-565)
   - Changed from falsy check to `!== undefined` check
3. **Prisma schema update** (Line 883)
   - Changed `hypeLevel Int` to `hypeLevel Int?` (optional)
4. **Database sync**
   - Ran `prisma db push` to sync schema and regenerate Prisma client
5. **Backend server**
   - ✅ Running successfully on port 3008 (http://10.0.0.53:3008)

### Ready for Testing
The prediction modal should now accept submissions with any combination of:
- ✅ Only winner selected (no hype, no round, no method)
- ✅ Only round selected
- ✅ Only method selected
- ✅ Only hype selected
- ✅ Multiple fields selected
- ✅ All fields selected
- ❌ No fields selected (should still be rejected)

## Server URLs

### Backend API
- **Local**: http://localhost:3008/api
- **Network (Mobile)**: http://10.0.0.53:3008/api
- **Status**: ✅ Running on port 3008

### Expo Development Server
- **Local**: http://localhost:8083
- **Network (Mobile)**: exp://10.0.0.53:8083
- **Status**: ✅ Running on port 8083 with LAN access
- **Web Interface**: http://localhost:8083

### Mobile App Configuration
- The mobile app is configured to automatically use the correct endpoint:
  - Web: `http://localhost:3008/api`
  - Mobile devices: `http://10.0.0.53:3008/api`

**Ready to test the prediction modal on your mobile device using Expo Go!**

## New Issue: "Invalid Predicted Winner" Error

### Issue #2: Prediction submission fails with "invalid predicted winner" when fighter is selected
- **Symptom**: Submissions work without hype level, but fail when a fighter is selected
- **Error**: "Invalid predicted winner"
- **Status**: Investigating...

### Critical Architecture Issue Discovered

**The Problem**: The system has TWO separate prediction tables:
1. **FightPrediction** - Individual user predictions (schema.prisma:313)
2. **CrewPrediction** - Crew-based predictions (schema.prisma:871)

**Current Behavior**:
- When opening prediction modal from crew chat → uses CrewPrediction table
- When opening from fights/events screen → should use FightPrediction table
- These are completely separate database tables with different endpoints

**User's Expected Behavior**:
- ALL predictions should be the same regardless of where the modal is opened
- There should be ONE prediction per user per fight, not separate crew/individual predictions

**Solution Implemented**: Route all predictions to FightPrediction table

### Fix #2: Unified Prediction System
- **File**: `packages/mobile/components/PredictionModal.tsx`
- **Changes Made**:
  1. **Line 111-133**: Updated query to ALWAYS use `apiService.getFightPrediction()` (removed crew-specific logic)
  2. **Line 135-148**: Updated mutation to ALWAYS use `apiService.createFightPrediction()` (removed crew API call)
  3. **Line 149-159**: Updated query invalidation to always invalidate individual prediction queries
  4. **Line 174-190**: Simplified `getCurrentUserPrediction()` to only check individual predictions

- **Result**:
  - All predictions now use the same `FightPrediction` table
  - Opening modal from crew chat, fights screen, or events screen = same prediction system
  - One prediction per user per fight, regardless of context
  - Crew context now just provides a way to view/share predictions, not store separate ones

### Fix #3: UUID Validation Error for predictedWinner
- **Issue**: "Invalid UUID" error when submitting with fighter selected
- **Root Cause**: App wasn't reloading with updated PredictionModal code changes
- **Debugging Process**:
  - Added `|| undefined` checks in mutation function (Line 143-145)
  - Changed console log to "v2" to trigger hot reload
  - Backend logs showed app still calling crew API (`/api/crews/.../predictions/...`)
  - Realized app needed complete cache clear and restart
- **Fix Applied**:
  - Killed old Expo process (PID 1940 on port 8083)
  - Restarted Expo with full cache clear: `npx expo start --port 8083 --lan --clear`
  - Metro bundler rebuilt with empty cache (991 modules)
  - App now has updated PredictionModal code with unified API
- **Status**: ✅ Ready for testing

## App Reload Completed

### Expo Server Status
- **Port**: 8083
- **Mode**: Development with LAN access
- **Cache**: Cleared and rebuilt
- **Bundle Time**: 15.4s (Lambda) + 17.2s (Web)
- **Modules**: 980-991 modules loaded
- **Access URL**: `exp://10.0.0.53:8083`

### Testing Instructions
Now that the app has fully reloaded with the updated code:

1. **Reload the app on your mobile device**:
   - Shake device or press 'r' in Expo Go
   - Or close and reopen the app

2. **Test prediction submission from crew chat**:
   - Open prediction modal from crew chat
   - Select a fighter (with or without hype/round/method)
   - Submit and verify success

3. **What to look for**:
   - Console should show: "🔥 PredictionModal RENDER v2"
   - Console should show: "📤 Sending prediction data to API"
   - Backend should log: `POST /api/fights/:id/prediction` (NOT `/api/crews/...`)
   - Success message: "Your prediction has been recorded!"

4. **Test all combinations**:
   - ✅ Only fighter selected
   - ✅ Only hype selected
   - ✅ Only round selected
   - ✅ Only method selected
   - ✅ Fighter + any other fields
   - ✅ All fields selected
   - ❌ No fields selected (should reject)