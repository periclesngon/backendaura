# Firebase Environment Variables Setup

## Problem
The Firebase service account JSON file contains private keys that should NOT be committed to git.

## Solution
Use environment variables instead of the JSON file.

## Steps

1. **Extract credentials from JSON file:**
   - Open: `tcftef-68b4c-firebase-adminsdk-fbsvc-49c8267271.json`
   - Copy these values to your `.env` file:

2. **Add to `.env` file:**
```bash
# Firebase Admin SDK Credentials
FIREBASE_PROJECT_ID=tcftef-68b4c
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@tcftef-68b4c.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

3. **Important Notes:**
   - The JSON file (`tcftef-68b4c-firebase-adminsdk-fbsvc-49c8267271.json`) should remain in `.gitignore`
   - Keep the JSON file locally for development (it won't be pushed to git)
   - In production, use environment variables only
   - The code will automatically use environment variables if available, otherwise fallback to JSON file

4. **Verify it works:**
   - The code will use environment variables first
   - If env vars are not set, it will try the JSON file (for local dev)
   - Google authentication will continue to work normally
