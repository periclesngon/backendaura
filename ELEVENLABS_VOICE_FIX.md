# ElevenLabs Voice Preview Fix

## Issue
Voices are not changing - all voices sound the same because ElevenLabs API is not being used.

## Root Cause
The `ELEVENLABS_API_KEY` environment variable is not set on the backend (local or Render), causing the system to fall back to browser TTS which makes all voices sound similar.

## Solution

### 1. **Local Development**
Add to your `.env` file in the backend directory:
```env
ELEVENLABS_API_KEY=sk_b70047ecc93a0a98ebc8e21800722ea482b020e1de984a3a
```

### 2. **Render Deployment**
1. Go to your Render dashboard
2. Navigate to your backend service
3. Go to "Environment" tab
4. Add environment variable:
   - **Key**: `ELEVENLABS_API_KEY`
   - **Value**: `sk_b70047ecc93a0a98ebc8e21800722ea482b020e1de984a3a`
5. Save and redeploy

## Voice Configuration

The system has **8 unique voices** properly configured:

### France (3 voices)
- **Pierre (France)** - Male - `pNInz6obpgDQGcFmaJgB` (Adam)
- **Antoine (France)** - Male - `VR6AewLTigWG4xSOukaG` (Roger)
- **Marie (France)** - Female - `EXAVITQu4vr4xnSDxMaL` (Sarah)

### Québec (3 voices)
- **Jean-Baptiste (Québec)** - Male - `cjVigY5qzO86Huf0OWal` (Eric)
- **François (Québec)** - Male - `JBFqnCBsd6RMkjVDRZzb` (George)
- **Céline (Québec)** - Female - `FGY2WhTYpPnrIDTdsKH5` (Laura)

### Belgium (2 voices)
- **Thomas (Belgique)** - Male - `CwhRBWXzGAHq8TQ4Fs17`
- **Sophie (Belgique)** - Female - `XB0fDUnXU5powFXDhCwa` (Charlotte)

## How It Works

1. **Frontend** calls `/api/voice-simulation/preview` with `voiceId`
2. **Backend** checks for `ELEVENLABS_API_KEY`:
   - ✅ **If set**: Calls ElevenLabs API with the unique `voiceId` for that voice
   - ❌ **If not set**: Returns `useBrowserTTS: true` and falls back to browser TTS

3. **ElevenLabs API** generates unique audio for each voice using:
   - Model: `eleven_multilingual_v2`
   - Voice settings: stability 0.75, similarity_boost 0.75
   - Returns MP3 audio as base64

4. **Frontend** plays the audio:
   - If `audioBase64` exists and `useBrowserTTS: false` → Plays ElevenLabs audio
   - Otherwise → Uses browser SpeechSynthesis (sounds similar)

## Testing

After setting the API key:

1. **Check backend logs** for:
   - `🎵 Calling 11labs API with voice ID: ...`
   - `✅ Successfully generated audio preview`

2. **Check browser console** for:
   - `🎵 Playing ElevenLabs audio for voice: ...`
   - Should NOT see: `⚠️ Using browser TTS fallback`

3. **Test each voice** - they should sound distinctly different:
   - Male voices should sound masculine
   - Female voices should sound feminine
   - Different accents (France, Québec, Belgium) should be noticeable

## Troubleshooting

### Voices still sound the same?
1. ✅ Check `ELEVENLABS_API_KEY` is set in Render environment variables
2. ✅ Restart backend service after adding the key
3. ✅ Check backend logs for ElevenLabs API errors
4. ✅ Verify API key is valid (check ElevenLabs dashboard)
5. ✅ Check browser console for `useBrowserTTS: true` - if true, API key is not working

### API Key Invalid?
- Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
- Generate a new API key
- Update in Render environment variables
- Redeploy backend

### Rate Limits?
- ElevenLabs free tier has rate limits
- Check ElevenLabs dashboard for usage
- Upgrade plan if needed


