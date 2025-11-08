# Render Deployment Issues - Fixed

## Issues Found

### 1. "Cannot find module 'express'" Error
**Problem**: Dependencies weren't being installed reliably during build
**Solution**: Changed build command from `npm install` to `npm ci` for consistent, reliable dependency installation

### 2. Wrong Database URL
**Problem**: Render is trying to connect to old Aiven database:
- `pg-10020076-aura-237.k.aivencloud.com:11012`

**Solution**: Update `DATABASE_URL` in Render dashboard to use Neon database:
```
postgresql://neondb_owner:npg_0leHEbgU8vLI@ep-orange-salad-ag0aric0-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

## What Was Fixed

1. ✅ **render.yaml**: 
   - Removed duplicate entries
   - Changed `buildCommand` to `npm ci && npm run build`
   - `npm ci` installs dependencies from `package-lock.json` for consistent builds

2. ✅ **package.json**:
   - Added `npm` version requirement to engines
   - `postinstall` script already generates Prisma client

## Action Required in Render Dashboard

### Update Environment Variables:

1. Go to your Render service dashboard
2. Navigate to **Environment** tab
3. Update `DATABASE_URL` to:
   ```
   postgresql://neondb_owner:npg_0leHEbgU8vLI@ep-orange-salad-ag0aric0-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. Verify these environment variables are set:
   - `DATABASE_URL` = (Neon database URL above)
   - `JWT_SECRET` = (your JWT secret)
   - `JWT_REFRESH_SECRET` = (your refresh secret)
   - `FRONTEND_URL` = `https://french-learning-platform-ngonpericles-educms-projects.vercel.app`
   - `CORS_ORIGIN` = `https://french-learning-platform-ngonpericles-educms-projects.vercel.app`

5. **Redeploy** the service after updating environment variables

## Why npm ci?

- `npm ci` installs dependencies directly from `package-lock.json`
- More reliable than `npm install` for production builds
- Faster and ensures exact dependency versions
- Cleans `node_modules` before installing (prevents conflicts)

## Expected Result

After updating `DATABASE_URL` and redeploying:
- ✅ Dependencies will install correctly
- ✅ Build will complete successfully
- ✅ Server will start without "Cannot find module" errors
- ✅ Database connection will use Neon instead of old Aiven
- ✅ Cron jobs will work without database connection errors

