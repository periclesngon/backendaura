# Google Authentication Not Working in Production - Analysis & Fix

## ✅ What's Working
- Firebase Admin SDK is initialized correctly ✅
- Backend has Firebase credentials set in Render ✅
- Token verification code is correct ✅

## ❌ Root Causes (Why It Fails in Production)

### Issue 1: Frontend API URL Not Configured
**Problem:** Frontend is calling `http://localhost:3001/api` instead of your Render backend URL.

**Location:** `frontend/components/auth/GoogleAuthButton.tsx:43`
```typescript
const response = await fetch(`${(typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:3001/api'}/auth/social/google`, {
```

**Fix Required:**
- Set `NEXT_PUBLIC_API_URL` in Vercel environment variables
- Value should be: `https://your-backend-url.onrender.com/api`

---

### Issue 2: CORS Configuration
**Problem:** Backend might not be allowing requests from your Vercel frontend domain.

**Location:** `frontend/backend/src/server.ts:82-102`

**Current CORS Setup:**
- Uses `process.env.FRONTEND_URL` and `config.corsOrigin`
- Falls back to allowing all origins (which should work, but not secure)

**Fix Required:**
- Ensure `FRONTEND_URL` in Render is set to your Vercel domain
- Example: `https://french-learning-platform-ngonpericles-educms-projects.vercel.app`

---

### Issue 3: Firebase Authorized Domains
**Problem:** Firebase Console might not have your Vercel domain in authorized domains list.

**Fix Required:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `tcftef-68b4c`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add your Vercel domain (e.g., `french-learning-platform-ngonpericles-educms-projects.vercel.app`)
5. Also add the custom domain if you have one

---

### Issue 4: Network/Request Issues
**Problem:** The frontend might not be able to reach the backend, or the request is failing silently.

**Symptoms:**
- No error in browser console
- Request times out
- CORS errors in browser console

---

## 🔧 Complete Fix Checklist

### Step 1: Set Frontend API URL in Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://your-backend-url.onrender.com/api`
   - **Environment:** Production, Preview, Development
3. Redeploy frontend

### Step 2: Set Backend CORS in Render
1. Go to Render Dashboard → backendaura → Environment
2. Verify `FRONTEND_URL` is set:
   - **Key:** `FRONTEND_URL`
   - **Value:** `https://your-vercel-frontend-url.vercel.app`
3. Verify `CORS_ORIGIN` includes your Vercel URL
4. Redeploy backend

### Step 3: Configure Firebase Authorized Domains
1. Go to [Firebase Console](https://console.firebase.google.com/project/tcftef-68b4c/authentication/settings)
2. Scroll to **Authorized domains**
3. Click **Add domain**
4. Add your Vercel domain (without `https://`)
5. Save

### Step 4: Verify Backend Endpoint
Test the endpoint directly:
```bash
curl -X POST https://your-backend.onrender.com/api/auth/social/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"test-token"}'
```

Should return an error about invalid token (not a connection error).

---

## 🐛 Debugging Steps

### Check 1: Browser Console
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Try Google sign-in
4. Look for:
   - Network errors
   - CORS errors
   - API URL being used

### Check 2: Network Tab
1. Open browser DevTools → **Network** tab
2. Try Google sign-in
3. Look for request to `/api/auth/social/google`
4. Check:
   - Request URL (should be Render backend, not localhost)
   - Response status code
   - Response body (error message)

### Check 3: Backend Logs
1. Check Render logs for:
   - `POST /api/auth/social/google` requests
   - Firebase token verification errors
   - Any error messages

### Check 4: Frontend Environment Variables
1. In browser console, type:
   ```javascript
   console.log(process.env.NEXT_PUBLIC_API_URL)
   ```
2. Should show your Render backend URL, not `undefined` or `localhost`

---

## 📋 Environment Variables Summary

### Vercel (Frontend) - Required:
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api
```

### Render (Backend) - Required:
```
FRONTEND_URL=https://your-vercel-frontend.vercel.app
CORS_ORIGIN=https://your-vercel-frontend.vercel.app,https://your-custom-domain.com
FIREBASE_PROJECT_ID=tcftef-68b4c
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@tcftef-68b4c.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

---

## 🔍 Common Error Messages & Solutions

### Error: "Network request failed"
**Cause:** Frontend can't reach backend
**Fix:** 
- Check `NEXT_PUBLIC_API_URL` is set correctly
- Verify backend is running on Render
- Check backend URL is accessible

### Error: "CORS policy blocked"
**Cause:** Backend not allowing frontend origin
**Fix:**
- Add frontend URL to `FRONTEND_URL` in Render
- Verify CORS configuration in `server.ts`

### Error: "Invalid Google token" or "Firebase token verification failed"
**Cause:** Token format issue or Firebase config mismatch
**Fix:**
- Verify Firebase credentials in Render
- Check Firebase project ID matches
- Ensure token is being sent correctly from frontend

### Error: "auth/argument-error" - "Decoding Firebase ID token failed"
**Cause:** Token is malformed or incomplete
**Fix:**
- Check frontend is sending full token (not truncated)
- Verify `getIdToken()` is called correctly
- Check token is included in request body

---

## ✅ Verification Test

After applying fixes, test:

1. **Frontend Environment:**
   ```javascript
   // In browser console
   console.log('API URL:', process.env.NEXT_PUBLIC_API_URL)
   // Should show: https://your-backend.onrender.com/api
   ```

2. **Backend Health:**
   ```bash
   curl https://your-backend.onrender.com/health
   # Should return: {"status":"ok"}
   ```

3. **Google Auth Flow:**
   - Click "Sign in with Google"
   - Complete Google sign-in
   - Check browser console for errors
   - Check Render logs for backend processing
   - Should successfully authenticate

---

## 🎯 Most Likely Issue

Based on the code analysis, the **most likely issue** is:

**Frontend is using `localhost:3001` instead of your Render backend URL**

This happens when `NEXT_PUBLIC_API_URL` is not set in Vercel environment variables.

**Quick Fix:**
1. Go to Vercel → Settings → Environment Variables
2. Add `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com/api`
3. Redeploy

---

## 📝 Next Steps

1. ✅ Set `NEXT_PUBLIC_API_URL` in Vercel
2. ✅ Verify `FRONTEND_URL` in Render
3. ✅ Add Vercel domain to Firebase authorized domains
4. ✅ Test Google authentication
5. ✅ Check browser console and Render logs for errors

