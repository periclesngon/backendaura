# ElevenLabs API Key Setup for Render

## Why Preview Doesn't Work Online

The voice preview feature requires the **ElevenLabs API key** to generate unique audio for each voice. Without this key, the system falls back to browser TTS (Text-to-Speech), which makes all voices sound the same.

## Current Status

The backend checks for `ELEVENLABS_API_KEY` environment variable:
- ✅ **If set**: Uses ElevenLabs API to generate unique, high-quality audio for each voice
- ❌ **If not set**: Falls back to browser TTS (all voices sound similar)

## How to Add ElevenLabs API Key to Render

### Step 1: Get Your ElevenLabs API Key

1. Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Sign in or create an account
3. Navigate to **Settings** → **API Keys**
4. Click **"Create API Key"** or copy your existing key
5. Copy the API key (starts with something like `sk-...`)

### Step 2: Add to Render Environment Variables

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your backend service (the one hosting your API)
3. Click on **"Environment"** in the left sidebar
4. Click **"Add Environment Variable"**
5. Add the following:
   - **Key**: `ELEVENLABS_API_KEY`
   - **Value**: Your ElevenLabs API key (paste the key you copied)
6. Click **"Save Changes"**
7. Render will automatically redeploy your service

### Step 3: Verify It's Working

After deployment, test the preview:
1. Go to the voice settings page
2. Click "Preview" on any voice
3. You should hear unique audio for each voice (not browser TTS)

## Code Reference

The preview endpoint is in:
- **File**: `frontend/backend/src/routes/voiceSimulation.ts`
- **Line**: ~361
- **Logic**: Checks `process.env.ELEVENLABS_API_KEY`

```typescript
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenLabsApiKey) {
  // Falls back to browser TTS
  return res.json({
    success: true,
    data: {
      useBrowserTTS: true,
      previewText,
      // No unique audio
    }
  });
}
```

## Cost Considerations

ElevenLabs offers:
- **Free Tier**: Limited characters per month
- **Paid Plans**: More characters, better quality

For production, consider:
- Caching preview audio
- Limiting preview length
- Using browser TTS as fallback for free users

## Troubleshooting

If preview still doesn't work after adding the key:

1. **Check Render logs**: Look for "ELEVENLABS_API_KEY" in deployment logs
2. **Verify key format**: Should start with `sk-` or similar
3. **Check API quota**: Ensure your ElevenLabs account has available credits
4. **Test locally**: Add key to local `.env` file and test

## Local Development

To test locally, add to `frontend/backend/.env`:

```env
ELEVENLABS_API_KEY=your-api-key-here
```

Then restart your backend server.


## Why Preview Doesn't Work Online

The voice preview feature requires the **ElevenLabs API key** to generate unique audio for each voice. Without this key, the system falls back to browser TTS (Text-to-Speech), which makes all voices sound the same.

## Current Status

The backend checks for `ELEVENLABS_API_KEY` environment variable:
- ✅ **If set**: Uses ElevenLabs API to generate unique, high-quality audio for each voice
- ❌ **If not set**: Falls back to browser TTS (all voices sound similar)

## How to Add ElevenLabs API Key to Render

### Step 1: Get Your ElevenLabs API Key

1. Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Sign in or create an account
3. Navigate to **Settings** → **API Keys**
4. Click **"Create API Key"** or copy your existing key
5. Copy the API key (starts with something like `sk-...`)

### Step 2: Add to Render Environment Variables

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your backend service (the one hosting your API)
3. Click on **"Environment"** in the left sidebar
4. Click **"Add Environment Variable"**
5. Add the following:
   - **Key**: `ELEVENLABS_API_KEY`
   - **Value**: Your ElevenLabs API key (paste the key you copied)
6. Click **"Save Changes"**
7. Render will automatically redeploy your service

### Step 3: Verify It's Working

After deployment, test the preview:
1. Go to the voice settings page
2. Click "Preview" on any voice
3. You should hear unique audio for each voice (not browser TTS)

## Code Reference

The preview endpoint is in:
- **File**: `frontend/backend/src/routes/voiceSimulation.ts`
- **Line**: ~361
- **Logic**: Checks `process.env.ELEVENLABS_API_KEY`

```typescript
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenLabsApiKey) {
  // Falls back to browser TTS
  return res.json({
    success: true,
    data: {
      useBrowserTTS: true,
      previewText,
      // No unique audio
    }
  });
}
```

## Cost Considerations

ElevenLabs offers:
- **Free Tier**: Limited characters per month
- **Paid Plans**: More characters, better quality

For production, consider:
- Caching preview audio
- Limiting preview length
- Using browser TTS as fallback for free users

## Troubleshooting

If preview still doesn't work after adding the key:

1. **Check Render logs**: Look for "ELEVENLABS_API_KEY" in deployment logs
2. **Verify key format**: Should start with `sk-` or similar
3. **Check API quota**: Ensure your ElevenLabs account has available credits
4. **Test locally**: Add key to local `.env` file and test

## Local Development

To test locally, add to `frontend/backend/.env`:

```env
ELEVENLABS_API_KEY=your-api-key-here
```

Then restart your backend server.



