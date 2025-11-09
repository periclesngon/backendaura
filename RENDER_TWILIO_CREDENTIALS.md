# Complete Twilio Credentials for Render Deployment

## 📋 All Environment Variables to Set in Render Dashboard

Go to: **Render Dashboard** → **backendaura service** → **Environment** → **Add Environment Variable**

---

## ✅ REQUIRED: Twilio SendGrid Email Configuration

These are **REQUIRED** for email password reset and all email notifications.

### 1. TWILIO_SMTP_HOST
```
smtp.sendgrid.net
```

### 2. TWILIO_SMTP_PORT
```
587
```

### 3. TWILIO_SMTP_USER
```
apikey
```
**Note**: This is always `apikey` for SendGrid - do not change this.

### 4. TWILIO_SMTP_PASS
```
SG.xBbN4OeFSiKS7OhqiBqIRw.imJdUVURVz3pIZF_3jIixNZ52xbfY45lWbUojgNapE8WE
```
**This is your SendGrid API Key** - Keep it secure!

### 5. TWILIO_SMTP_SECURE
```
false
```

### 6. EMAIL_FROM_NAME
```
AURA.CA
```

### 7. EMAIL_FROM_ADDRESS
```
periclesngon01@gmail.com
```

### 8. EMAIL_REPLY_TO
```
periclesngon01@gmail.com
```

---

## ⏳ OPTIONAL: Twilio SMS Configuration

These are **OPTIONAL** - only needed if you want SMS password reset functionality.

### 9. TWILIO_ACCOUNT_SID
```
(Leave empty for now - to be configured later)
```
**To get this:**
1. Go to https://console.twilio.com/
2. Login to your Twilio account
3. Copy the **Account SID** from the dashboard
4. Format: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 10. TWILIO_AUTH_TOKEN
```
(Leave empty for now - to be configured later)
```
**To get this:**
1. Go to https://console.twilio.com/
2. Login to your Twilio account
3. Go to **Settings** → **General** → **Auth Token**
4. Copy the auth token (32 characters)

### 11. TWILIO_PHONE_NUMBER
```
(Leave empty for now - to be configured later)
```
**To get this:**
1. Go to https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Purchase a phone number with SMS capability
3. Format: `+237612345678` (include country code with +)

---

## 🚀 Quick Setup Steps in Render

### Step 1: Go to Render Dashboard
1. Login to https://dashboard.render.com
2. Navigate to your **backendaura** service
3. Click on **Environment** tab

### Step 2: Add Email Configuration (REQUIRED)
Add these 8 environment variables:

| Key | Value |
|-----|-------|
| `TWILIO_SMTP_HOST` | `smtp.sendgrid.net` |
| `TWILIO_SMTP_PORT` | `587` |
| `TWILIO_SMTP_USER` | `apikey` |
| `TWILIO_SMTP_PASS` | `SG.xBbN4OeFSiKS7OhqiBqIRw.imJdUVURVz3pIZF_3jIixNZ52xbfY45lWbUojgNapE8WE` |
| `TWILIO_SMTP_SECURE` | `false` |
| `EMAIL_FROM_NAME` | `AURA.CA` |
| `EMAIL_FROM_ADDRESS` | `periclesngon01@gmail.com` |
| `EMAIL_REPLY_TO` | `periclesngon01@gmail.com` |

### Step 3: Add SMS Configuration (OPTIONAL - Later)
When ready, add these 3 variables:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

### Step 4: Save and Redeploy
1. Click **Save Changes**
2. Go to **Manual Deploy**
3. Click **Clear build cache & deploy**

---

## ✅ Verification Checklist

After setting up, verify:

- [ ] All 8 email variables are set in Render
- [ ] `TWILIO_SMTP_PASS` starts with `SG.`
- [ ] `TWILIO_SMTP_USER` is exactly `apikey`
- [ ] `EMAIL_FROM_ADDRESS` matches your verified SendGrid sender email
- [ ] Service has been redeployed after adding variables

---

## 🔒 Security Notes

- ✅ All credentials are stored securely in Render (encrypted)
- ⚠️ Never commit API keys to Git
- ✅ SendGrid API key is already configured and working
- ⚠️ Keep your SendGrid API key private

---

## 📧 What Each Configuration Enables

### Email Configuration (REQUIRED):
- ✅ Password reset codes via Email
- ✅ All email notifications from the platform
- ✅ Welcome emails
- ✅ Course enrollment emails
- ✅ Test result emails
- ✅ Live session notifications

### SMS Configuration (OPTIONAL):
- ⏳ Password reset codes via SMS (when configured)
- ⏳ SMS notifications (when configured)

---

## 🆘 Troubleshooting

### Email Not Sending?
1. Verify `TWILIO_SMTP_PASS` is correct (starts with `SG.`)
2. Check SendGrid dashboard for delivery status
3. Verify sender email is verified in SendGrid
4. Check Render logs for SMTP errors

### SMS Not Working?
- SMS is optional - system will work without it
- If configured, verify all 3 SMS variables are set
- Check Twilio console for SMS logs

---

## 📚 Related Documentation

- **Full Twilio Setup Guide**: `TWILIO_SETUP_GUIDE.md`
- **SendGrid API Key Fix**: `SENDGRID_API_KEY_FIX.md`
- **Email Setup Status**: `EMAIL_SETUP_STATUS.md`

---

**Last Updated**: All email credentials ready for Render deployment.

