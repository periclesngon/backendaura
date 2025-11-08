# Frontend-Backend Connection Guide

## Deployment URLs

### Backend (Render)
- **Production URL**: `https://your-backend.onrender.com`
- **API Base URL**: `https://your-backend.onrender.com/api`

### Frontend (Vercel)
- **Production URL**: `https://your-frontend.vercel.app`
- **Preview URLs**: `https://your-frontend-*.vercel.app`

## Configuration Steps

### 1. Backend CORS Configuration (Render)

Set these environment variables in your Render dashboard:

```bash
# Frontend URL (Vercel)
FRONTEND_URL=https://your-frontend.vercel.app

# CORS Origin (can be comma-separated for multiple origins)
CORS_ORIGIN=https://your-frontend.vercel.app,https://your-frontend-*.vercel.app

# Vercel URL (for preview deployments)
VERCEL_URL=your-frontend.vercel.app
```

**Note**: The backend CORS configuration in `src/server.ts` now supports:
- Local development (`http://localhost:3000`)
- Vercel production URL (from `FRONTEND_URL` env var)
- Vercel preview deployments (from `VERCEL_URL` env var)
- Custom CORS origin (from `CORS_ORIGIN` env var)

### 2. Frontend Environment Variables (Vercel)

Set these environment variables in your Vercel project settings:

```bash
# Backend API URL (Render)
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api

# Backend Base URL (without /api)
NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com
```

**How to set in Vercel:**
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the variables above with your actual Render backend URL
4. Redeploy the frontend

### 3. Verify Deployments

#### Check Backend (Render)
1. Go to your Render dashboard
2. Check that your backend service status is **"Live"**
3. Test the health endpoint: `https://your-backend.onrender.com/api/health`
4. Should return: `{ "status": "ok", "timestamp": "..." }`

#### Check Frontend (Vercel)
1. Go to your Vercel dashboard
2. Check that your latest deployment status is **"Ready"**
3. Visit your frontend URL
4. Open browser console and check for API connection errors

### 4. Test Connection

1. **Test Backend Health:**
   ```bash
   curl https://your-backend.onrender.com/api/health
   ```

2. **Test CORS:**
   - Open your frontend in browser
   - Open Developer Tools → Network tab
   - Make an API call (e.g., login)
   - Check that the request succeeds (no CORS errors)

3. **Test API Endpoint:**
   - Try logging in through the frontend
   - Check browser console for any errors
   - Verify API calls are going to the Render backend URL

## Troubleshooting

### CORS Errors
- **Symptom**: `Access-Control-Allow-Origin` errors in browser console
- **Solution**: 
  - Verify `FRONTEND_URL` in Render matches your Vercel URL exactly
  - Check that `CORS_ORIGIN` includes your Vercel domain
  - Ensure backend is redeployed after changing CORS env vars

### API Connection Errors
- **Symptom**: `Failed to fetch` or network errors
- **Solution**:
  - Verify `NEXT_PUBLIC_API_URL` in Vercel points to your Render backend
  - Check that Render backend is live and accessible
  - Test backend health endpoint directly

### Authentication Issues
- **Symptom**: Tokens not being sent/received
- **Solution**:
  - Ensure `withCredentials: true` is set in frontend API client
  - Verify CORS allows credentials (`credentials: true` in backend)
  - Check that cookies are being set correctly

## Current Configuration

### Backend CORS (src/server.ts)
- Supports multiple origins via environment variables
- Allows credentials for authentication
- Logs blocked origins for debugging

### Frontend API Client (lib/api-client.ts)
- Uses `NEXT_PUBLIC_API_URL` environment variable
- Falls back to `http://localhost:3001/api` for local development
- Supports credentials for cookie-based auth

## Next Steps

1. ✅ Update Render environment variables with your Vercel frontend URL
2. ✅ Update Vercel environment variables with your Render backend URL
3. ✅ Redeploy both frontend and backend
4. ✅ Test the connection
5. ✅ Monitor for any CORS or connection errors


## Deployment URLs

### Backend (Render)
- **Production URL**: `https://your-backend.onrender.com`
- **API Base URL**: `https://your-backend.onrender.com/api`

### Frontend (Vercel)
- **Production URL**: `https://your-frontend.vercel.app`
- **Preview URLs**: `https://your-frontend-*.vercel.app`

## Configuration Steps

### 1. Backend CORS Configuration (Render)

Set these environment variables in your Render dashboard:

```bash
# Frontend URL (Vercel)
FRONTEND_URL=https://your-frontend.vercel.app

# CORS Origin (can be comma-separated for multiple origins)
CORS_ORIGIN=https://your-frontend.vercel.app,https://your-frontend-*.vercel.app

# Vercel URL (for preview deployments)
VERCEL_URL=your-frontend.vercel.app
```

**Note**: The backend CORS configuration in `src/server.ts` now supports:
- Local development (`http://localhost:3000`)
- Vercel production URL (from `FRONTEND_URL` env var)
- Vercel preview deployments (from `VERCEL_URL` env var)
- Custom CORS origin (from `CORS_ORIGIN` env var)

### 2. Frontend Environment Variables (Vercel)

Set these environment variables in your Vercel project settings:

```bash
# Backend API URL (Render)
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api

# Backend Base URL (without /api)
NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com
```

**How to set in Vercel:**
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the variables above with your actual Render backend URL
4. Redeploy the frontend

### 3. Verify Deployments

#### Check Backend (Render)
1. Go to your Render dashboard
2. Check that your backend service status is **"Live"**
3. Test the health endpoint: `https://your-backend.onrender.com/api/health`
4. Should return: `{ "status": "ok", "timestamp": "..." }`

#### Check Frontend (Vercel)
1. Go to your Vercel dashboard
2. Check that your latest deployment status is **"Ready"**
3. Visit your frontend URL
4. Open browser console and check for API connection errors

### 4. Test Connection

1. **Test Backend Health:**
   ```bash
   curl https://your-backend.onrender.com/api/health
   ```

2. **Test CORS:**
   - Open your frontend in browser
   - Open Developer Tools → Network tab
   - Make an API call (e.g., login)
   - Check that the request succeeds (no CORS errors)

3. **Test API Endpoint:**
   - Try logging in through the frontend
   - Check browser console for any errors
   - Verify API calls are going to the Render backend URL

## Troubleshooting

### CORS Errors
- **Symptom**: `Access-Control-Allow-Origin` errors in browser console
- **Solution**: 
  - Verify `FRONTEND_URL` in Render matches your Vercel URL exactly
  - Check that `CORS_ORIGIN` includes your Vercel domain
  - Ensure backend is redeployed after changing CORS env vars

### API Connection Errors
- **Symptom**: `Failed to fetch` or network errors
- **Solution**:
  - Verify `NEXT_PUBLIC_API_URL` in Vercel points to your Render backend
  - Check that Render backend is live and accessible
  - Test backend health endpoint directly

### Authentication Issues
- **Symptom**: Tokens not being sent/received
- **Solution**:
  - Ensure `withCredentials: true` is set in frontend API client
  - Verify CORS allows credentials (`credentials: true` in backend)
  - Check that cookies are being set correctly

## Current Configuration

### Backend CORS (src/server.ts)
- Supports multiple origins via environment variables
- Allows credentials for authentication
- Logs blocked origins for debugging

### Frontend API Client (lib/api-client.ts)
- Uses `NEXT_PUBLIC_API_URL` environment variable
- Falls back to `http://localhost:3001/api` for local development
- Supports credentials for cookie-based auth

## Next Steps

1. ✅ Update Render environment variables with your Vercel frontend URL
2. ✅ Update Vercel environment variables with your Render backend URL
3. ✅ Redeploy both frontend and backend
4. ✅ Test the connection
5. ✅ Monitor for any CORS or connection errors

