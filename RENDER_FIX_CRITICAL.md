# CRITICAL: Render Root Directory Fix

## The Problem
Render error: `Service Root Directory "/opt/render/project/src/backend" is missing.`
Error: `Could not read package.json: Error: ENOENT: no such file or directory, open '/opt/render/project/src/backend/package.json'`

## Root Cause
The repository `periclesngon/backendaura` is a **standalone backend repository** where:
- `package.json` is at the **repository root** (`/`)
- NOT in a `backend/` subdirectory
- NOT in a `src/backend/` subdirectory

Render is incorrectly looking for `/opt/render/project/src/backend/package.json` instead of `/opt/render/project/package.json`.

## The Fix (MUST DO IN RENDER DASHBOARD)

### Step 1: Go to Render Dashboard
1. Log into [Render Dashboard](https://dashboard.render.com)
2. Navigate to your `backendaura` service

### Step 2: Update Root Directory Setting
1. Click on **Settings** tab
2. Scroll to **Build & Deploy** section
3. Find **Root Directory** field
4. **CLEAR** any value (set it to empty/blank) OR set it to: `.`
5. **DO NOT** set it to `backend` or `src/backend`
6. Click **Save Changes**

### Step 3: Verify render.yaml
The `render.yaml` file already has `rootDir: .` which is correct. However, **Render dashboard settings override the yaml file for existing services**.

### Step 4: Redeploy
1. Go to **Manual Deploy** section
2. Click **Clear build cache & deploy**
3. Or trigger a new deployment

## Verification
After fixing, Render should:
- ✅ Find `package.json` at `/opt/render/project/package.json`
- ✅ Run `npm install` from repository root
- ✅ Run `npm run build` successfully
- ✅ Start with `npm start`

## Why This Happens
- Render dashboard settings take precedence over `render.yaml` for existing services
- If Root Directory was previously set to `backend` or `src/backend`, it needs to be cleared
- For new services created from `render.yaml`, the yaml file will be used automatically

## Current Status
- ✅ `render.yaml` has correct `rootDir: .`
- ❌ **MUST update Render dashboard Root Directory to `.` or empty**

