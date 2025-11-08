# Twilio SMS Setup Guide for Password Reset

This guide explains what information you need to configure Twilio for SMS password reset functionality.

## 📋 Required Environment Variables

For **SMS functionality** (password reset codes via SMS), you need **3 environment variables**:

### 1. `TWILIO_ACCOUNT_SID`
- **What it is**: Your Twilio Account SID (unique identifier for your Twilio account)
- **Where to find it**: 
  - Go to https://console.twilio.com/
  - Login to your Twilio account
  - On the dashboard, you'll see "Account SID" - it starts with `AC` (e.g., `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
- **Example**: `TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2. `TWILIO_AUTH_TOKEN`
- **What it is**: Your Twilio Auth Token (secret key for API authentication)
- **Where to find it**:
  - Go to https://console.twilio.com/
  - Login to your Twilio account
  - On the dashboard, click "Show" next to "Auth Token"
  - Copy the token (it's a long string of characters)
- **Example**: `TWILIO_AUTH_TOKEN=your_auth_token_here_32_characters_long`

### 3. `TWILIO_PHONE_NUMBER`
- **What it is**: Your Twilio phone number (the number that will send SMS messages)
- **Where to get it**:
  - Go to https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
  - If you don't have a phone number:
    1. Click "Buy a number"
    2. Select your country (e.g., Cameroon: +237)
    3. Choose a number with SMS capabilities
    4. Purchase the number (Twilio offers free trial credits)
  - Copy the phone number in E.164 format (e.g., `+237612345678`)
- **Example**: `TWILIO_PHONE_NUMBER=+237612345678`

---

## 🔧 Step-by-Step Setup

### Step 1: Create/Login to Twilio Account

1. Go to **https://www.twilio.com/try-twilio**
2. Sign up for a free account (or login if you already have one)
3. Verify your email and phone number
4. Twilio provides **free trial credits** for testing

### Step 2: Get Your Account SID and Auth Token

1. After logging in, you'll be on the **Twilio Console Dashboard**
2. You'll see:
   - **Account SID** (starts with `AC`) - Copy this
   - **Auth Token** - Click "Show" to reveal it, then copy it

⚠️ **Important**: Keep your Auth Token secret! Never commit it to version control.

### Step 3: Get a Twilio Phone Number

1. In the Twilio Console, go to: **Phone Numbers** → **Manage** → **Buy a number**
2. Select:
   - **Country**: Choose the country where you want to send SMS (e.g., Cameroon)
   - **Capabilities**: Make sure **SMS** is checked
   - **Type**: Choose "Local" or "Mobile" (usually cheaper)
3. Click **Search** and select an available number
4. Click **Buy** (uses your trial credits or account balance)
5. Copy the phone number in **E.164 format** (e.g., `+237612345678`)

### Step 4: Update Your .env File

Edit `/home/gotti/Desktop/final defense./frontend/backend/.env` and add/update these variables:

```bash
# Twilio SMS Configuration for Password Reset
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+237612345678
```

**Replace the values with your actual Twilio credentials.**

### Step 5: Restart Your Backend Server

```bash
cd "/home/gotti/Desktop/final defense./frontend/backend"
# Stop the current server (Ctrl+C or kill the process)
npm run dev
```

---

## 🧪 Testing Twilio Configuration

### Test 1: Check if Twilio is Configured

The service automatically checks if Twilio is configured. You can verify by:

1. **Check backend logs** when starting the server
2. **Test the password reset endpoint** with phone method:
   ```bash
   curl -X POST http://localhost:3001/api/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{
       "method": "phone",
       "phone": "+237612345678",
       "lang": "fr"
     }'
   ```

### Test 2: Verify SMS Sending

If Twilio is properly configured:
- ✅ SMS will be sent to the phone number
- ✅ You'll see a success message in the API response
- ✅ You can check the SMS in the Twilio Console under **Monitor** → **Logs** → **Messaging**

If Twilio is NOT configured:
- ⚠️ The API will still return success (for security - doesn't reveal if user exists)
- ⚠️ But no SMS will be sent
- ⚠️ Backend logs will show: `Twilio not configured, SMS sending skipped`

---

## 💰 Twilio Pricing

### Free Trial
- Twilio offers **free trial credits** (usually $15-20 USD)
- Enough for testing and development
- Trial numbers can only send SMS to **verified phone numbers**

### Production Pricing
- **SMS costs vary by country**:
  - Cameroon: ~$0.05-0.10 per SMS
  - Other countries: Check https://www.twilio.com/sms/pricing
- **Phone number rental**: ~$1-2 USD/month per number

### Cost Optimization Tips
1. Use **trial credits** for development/testing
2. Verify phone numbers in Twilio Console for testing
3. Monitor usage in Twilio Console dashboard
4. Set up billing alerts to avoid unexpected charges

---

## 🔒 Security Best Practices

1. **Never commit credentials to Git**:
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Rotate Auth Token regularly**:
   - Go to Twilio Console → Settings → General
   - Click "Regenerate" next to Auth Token
   - Update your `.env` file

3. **Use different credentials for development/production**:
   - Development: Use trial account
   - Production: Use paid account with billing alerts

4. **Monitor usage**:
   - Set up alerts in Twilio Console
   - Monitor SMS logs for suspicious activity

---

## 📝 Complete .env Example

Here's what your Twilio section should look like in `.env`:

```bash
# ============================================
# TWILIO SMS CONFIGURATION
# ============================================
# For SMS password reset codes
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_32_character_auth_token_here
TWILIO_PHONE_NUMBER=+237612345678

# ============================================
# TWILIO SENDGRID EMAIL CONFIGURATION
# ============================================
# For email password reset codes (separate from SMS)
TWILIO_SMTP_HOST=smtp.sendgrid.net
TWILIO_SMTP_PORT=587
TWILIO_SMTP_USER=apikey
TWILIO_SMTP_PASS=SG.your_sendgrid_api_key_here
TWILIO_SMTP_SECURE=false
```

**Note**: 
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are for **SMS**
- `TWILIO_SMTP_*` variables are for **Email** (SendGrid, owned by Twilio)
- These are **separate services** with **separate credentials**

---

## 🚨 Common Issues and Solutions

### Issue 1: "Twilio not configured" in logs
**Solution**: 
- Check that all 3 variables are set in `.env`
- Restart the backend server
- Verify variable names are correct (case-sensitive)

### Issue 2: SMS not received
**Possible causes**:
- Phone number not verified (trial accounts can only send to verified numbers)
- Wrong phone number format (must be E.164: `+237612345678`)
- Insufficient Twilio credits
- Phone number doesn't support SMS

**Solution**:
- Verify the recipient phone number in Twilio Console
- Check Twilio Console → Monitor → Logs for error messages
- Ensure you have credits in your Twilio account

### Issue 3: "Authentication failed" error
**Solution**:
- Double-check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Make sure there are no extra spaces or quotes in `.env`
- Regenerate Auth Token in Twilio Console if needed

### Issue 4: Phone number format error
**Solution**:
- Use E.164 format: `+[country code][number]`
- Example: `+237612345678` (Cameroon)
- No spaces, dashes, or parentheses

---

## ✅ Verification Checklist

Before testing password reset via SMS, verify:

- [ ] Twilio account created and verified
- [ ] Account SID copied to `.env` as `TWILIO_ACCOUNT_SID`
- [ ] Auth Token copied to `.env` as `TWILIO_AUTH_TOKEN`
- [ ] Phone number purchased and copied to `.env` as `TWILIO_PHONE_NUMBER`
- [ ] Phone number format is E.164 (`+237612345678`)
- [ ] `.env` file updated and saved
- [ ] Backend server restarted
- [ ] Test phone number verified in Twilio Console (for trial accounts)
- [ ] Twilio account has credits/balance

---

## 📞 Need Help?

- **Twilio Documentation**: https://www.twilio.com/docs
- **Twilio Console**: https://console.twilio.com/
- **Twilio Support**: Available in the console dashboard

---

## 🎯 Quick Start Summary

1. **Sign up** at https://www.twilio.com/try-twilio
2. **Copy** Account SID and Auth Token from dashboard
3. **Buy** a phone number with SMS capability
4. **Add** 3 variables to `.env`:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
5. **Restart** backend server
6. **Test** password reset with phone method

That's it! Your SMS password reset functionality should now work. 🎉

